<script setup lang="ts">
/**
 * One inventory for the stash, every character and (given `lockOwner`) an
 * encounter's loot. The GM view shows true values; the player view shows what
 * the players know, with unidentified items under their player name.
 */
import { computed, provide, ref, toRef, watch } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import type { CampaignRules, GameId } from '@/domain/game'
import { formatBulk, parseMoney } from '@/domain/rules/format'
import { characterOwner, encumbrance, parseOwner, partyTotals, STASH, type Encumbrance, type InventoryEntry as Stack, type OwnerKey } from '@/domain/rules/inventory'
import { isPartyMember } from '@/domain/rules/party'
import { augmentationWarnings } from '@/domain/rules/sf2eGear'
import type { Item } from '@/domain/rules/types'
import { lootValue } from '@/domain/rules/wealth'
import type { Character } from '@/domain/schema'
import { addEntry, adjustPurse, splitPurse, transferCoins } from '@/data/inventory'
import { awardTreasure, updateCampaignRules } from '@/data/party'
import { rulesQuery } from '@/data/rules'
import { offerCoins } from '@/services/characterLink/link'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import { createInventoryContext, INVENTORY, type OwnerInfo } from './inventoryContext'
import InventoryRow from './InventoryRow.vue'

const props = defineProps<{
  campaignId: string; game: GameId; characters: Character[]; partyLevel: number | null; rules: CampaignRules
  /** Shows only this owner (an encounter's loot), with the stash and characters as places to move things to. */
  lockOwner?: OwnerKey; lockName?: string
}>()

const AWARD_HINT = 'Treasure the party was given: counts toward the wealth readout. Leave it off for corrections, such as a forgotten item from before.'
const view = ref<'gm' | 'player'>('gm')
const selected = ref<OwnerKey>(props.lockOwner ?? STASH)
const owners = computed<OwnerInfo[]>(() => [
  ...(props.lockOwner ? [{ key: props.lockOwner, name: props.lockName ?? 'Loot', characterId: null, strMod: null }] : []),
  { key: STASH, name: 'Party stash', characterId: null, strMod: null },
  ...props.characters.map(c => ({ key: characterOwner(c.id), name: c.name, characterId: c.id, strMod: c.strMod, character: c })),
])
const ctx = createInventoryContext(props.campaignId, toRef(props, 'game'), view, owners)
provide(INVENTORY, ctx)
defineExpose({ ctx })

watch(owners, (list) => { if (!list.some(o => o.key === selected.value)) selected.value = props.lockOwner ?? STASH })
const purseList = computed(() => Object.entries(ctx.purses.value).map(([owner, cp]) => ({ owner, cp })))
const totals = computed(() => partyTotals(ctx.stacks.value, ctx.items.value, purseList.value, view.value, props.game !== 'sf2e'))
const loadOf = (o: OwnerInfo): Encumbrance | null => (o.characterId ? encumbrance(totals.value.byOwner[o.key]?.bulk ?? 0, o.strMod) : null)
const current = computed(() => owners.value.find(o => o.key === selected.value))
/** A linked character's inventory is their app's: shown here, changed there. */
const theirs = computed(() => !!current.value?.character?.link)
const currentTotal = computed(() => totals.value.byOwner[selected.value])
const unknown = computed(() => Object.values(totals.value.byOwner).reduce((a, t) => a + t.unknownPrices, 0))
const run = (what: string, work: Promise<unknown>) => work.catch(err => reportError(what, err))

/** The owner's stacks: each container followed by what is stored in it, each item by what is attached to it. */
const rows = computed(() => {
  const own = ctx.stacks.value.filter(e => e.owner === selected.value)
  const byName = (a: Stack, b: Stack) => ctx.nameOf(a).localeCompare(ctx.nameOf(b))
  const withAttached = (e: Stack) => [e, ...ctx.shownAttached(e)]
  const top = own.filter(e => !e.attachedTo)
  return top.filter(e => !ctx.inContainer(e)).sort(byName).flatMap(e => [...withAttached(e), ...top.filter(c => ctx.inContainer(c)?.id === e.id).sort(byName).flatMap(withAttached)])
})
const implantWarnings = computed(() => (props.game === 'sf2e' && current.value?.characterId ? augmentationWarnings(ctx.stacks.value.filter(x => x.owner === selected.value && x.implanted).map(x => ctx.item(x) ?? null)) : []))

// ── Add ────────────────────────────────────────────────────────────────────
const addQuery = ref('')
const addQty = ref(1)
const addUnidentified = ref(false)
const addAward = ref(false)
const results = ref<Item[]>([])
let seq = 0
watch(addQuery, async (q) => {
  const mine = ++seq
  const found = q.trim() ? (await rulesQuery({ kind: 'item', games: [props.game], text: q.trim().toLowerCase(), limit: 8 })).items as Item[] : []
  if (mine === seq) results.value = found
})
/** "Award or correction?": only ticked adds count as treasure. */
async function recordAward(item: Item | null, name: string, quantity: number) {
  if (!addAward.value || props.lockOwner) return
  const probe: Stack = { id: '', owner: selected.value, itemId: item?.id ?? null, quantity, nameOverride: item ? null : name, priceOverride: null, bulkOverride: null, notes: '', identified: true, playerName: null, playerDescription: null, runes: null, grade: null, containerId: null }
  const value = lootValue([probe], item ? new Map([[item.id, item]]) : new Map())
  const label = `${quantity > 1 ? `${quantity}× ` : ''}${name}`
  if (value.value > 0) await awardTreasure(props.campaignId, value, label)
  else notify(`${label} has no price, so it wasn't counted as treasure. Record its value under Wealth › Record award.`)
}
async function add(item: Item | null) {
  const name = item?.name ?? addQuery.value.trim()
  if (!name) return
  const quantity = Math.max(1, addQty.value || 1)
  await run('Adding the item', (async () => {
    await addEntry({ campaignId: props.campaignId, owner: selected.value, itemId: item?.id ?? null, name, quantity, identified: !addUnidentified.value })
    await recordAward(item, name, quantity)
  })())
  addQuery.value = ''
}
const addTyped = () => add(results.value.find(r => r.name.toLowerCase() === addQuery.value.trim().toLowerCase()) ?? null)

// ── Coins ──────────────────────────────────────────────────────────────────
const coinInput = ref('')
const coinAward = ref(false)
const coinCp = computed(() => { const cp = parseMoney(coinInput.value, props.game); return cp !== null && cp > 0 ? cp : null })
async function changeCoins(sign: 1 | -1) {
  const cp = coinCp.value
  if (cp === null) return
  await run('Changing the coins', adjustPurse(props.campaignId, selected.value, sign * cp))
  if (sign > 0 && coinAward.value && !props.lockOwner) await awardTreasure(props.campaignId, { value: cp, consumables: 0 }, `Coins: ${ctx.money(cp)}`)
  coinInput.value = ''
}
async function giveCoins(to: string) {
  if (!to || coinCp.value === null) return
  const target = owners.value.find(o => o.key === to)?.character
  // A linked player gets coins as an offer: they leave this purse now and come back if declined
  if (target?.link) { await run('Offering the coins', offerCoins(target, Math.min(coinCp.value, ctx.purses.value[selected.value] ?? 0), ctx.money(coinCp.value), selected.value)); notify(`Offered ${ctx.money(coinCp.value)} to ${target.name}.`, 'ok') }
  else await run('Moving the coins', transferCoins(props.campaignId, selected.value, to, coinCp.value))
  coinInput.value = ''
}
async function split() {
  const members = props.characters.filter(isPartyMember).map(c => characterOwner(c.id))
  const res = await splitPurse(props.campaignId, selected.value, members).catch((err) => { reportError('Splitting the coins', err); return null })
  if (res) notify(res.each ? `Gave ${ctx.money(res.each)} to each of ${members.length} members; ${ctx.money(res.remainder)} stays.` : 'Not enough coins to split.', res.each ? 'ok' : 'info')
}

// ── Baseline ───────────────────────────────────────────────────────────────
async function setBaseline() {
  if (props.partyLevel === null) return
  const owned = ctx.stacks.value.filter(e => parseOwner(e.owner).kind !== 'encounter')
  const coins = purseList.value.filter(p => parseOwner(p.owner).kind !== 'encounter').reduce((n, p) => n + p.cp, 0)
  const { value, consumables } = lootValue(owned, ctx.items.value, coins)
  if (props.rules.baselineAt && !await confirmDialog({ title: 'Replace the treasure baseline?', body: `The baseline of ${ctx.money(props.rules.startingTreasure)} becomes ${ctx.money(value)}. Awards up to now are then part of the baseline.`, confirmLabel: 'Replace' })) return
  await run('Setting the baseline', updateCampaignRules(props.campaignId, { startingTreasure: value, startingConsumables: consumables, startingLevel: props.partyLevel, baselineAt: new Date().toISOString() }))
  notify(`Baseline set to ${ctx.money(value)}.`, 'ok')
}
</script>

<template>
  <section class="inv">
    <div class="head">
      <h2>{{ lockOwner ? lockName ?? 'Loot' : 'Inventory' }}</h2>
      <span class="faint">{{ view === 'gm' ? 'Party owns' : 'Players know of' }} <b class="num">{{ ctx.money(totals.total) }}</b><template v-if="unknown"> · {{ unknown }} without a price</template></span>
      <span class="grow" />
      <button v-if="!lockOwner && partyLevel !== null" class="btn" title="For a running campaign: what the party owns now becomes the starting point of the wealth readout" @click="setBaseline">Set treasure baseline</button>
      <button class="btn" :title="view === 'gm' ? 'Show what the players know' : 'Back to the GM view'" data-test="inv-view" @click="view = view === 'gm' ? 'player' : 'gm'"><component :is="view === 'gm' ? Eye : EyeOff" :size="14" /> {{ view === 'gm' ? 'GM view' : 'Player view' }}</button>
    </div>
    <div class="owners" role="tablist">
      <button v-for="o in owners" :key="o.key" class="owner" :class="{ on: o.key === selected }" role="tab" @click="selected = o.key">
        <span>{{ o.name }}</span><span v-if="o.character?.link" class="load app" title="Read from their Play Buddy">app</span>
        <span class="num faint">{{ ctx.money(totals.byOwner[o.key]?.total ?? 0) }}</span>
        <span v-if="loadOf(o) && loadOf(o) !== 'ok'" class="load" :title="loadOf(o) === 'overloaded' ? 'Over the Bulk limit' : 'Encumbered'">{{ loadOf(o) === 'overloaded' ? 'over' : 'enc.' }}</span>
      </button>
    </div>

    <div class="bar">
      <span class="num purse">{{ ctx.money(ctx.purses.value[selected] ?? 0) }}</span>
      <span v-if="theirs" class="faint">As their Play Buddy reports it. Give them things from the stash: they arrive as offers.</span>
      <template v-else-if="view === 'gm'">
        <input v-model="coinInput" class="input coin" :placeholder="game === 'sf2e' ? '250 cr' : '12 gp 5 sp'" aria-label="Coins" @keydown.enter="changeCoins(1)" />
        <button class="btn" :disabled="coinCp === null" title="Add coins" @click="changeCoins(1)">+</button>
        <button class="btn" :disabled="coinCp === null" title="Take coins away" @click="changeCoins(-1)">−</button>
        <select class="input give" :disabled="coinCp === null" aria-label="Give coins to" @change="giveCoins(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
          <option value="">give to…</option><option v-for="o in owners.filter(x => x.key !== selected)" :key="o.key" :value="o.key">{{ o.name }}</option>
        </select>
        <label v-if="!lockOwner" class="faint" :title="AWARD_HINT"><input v-model="coinAward" type="checkbox" /> as treasure</label>
        <button class="btn" :disabled="!(ctx.purses.value[selected] ?? 0) || !characters.length" title="Each party member gets an equal share; the remainder stays here" @click="split">Split evenly</button>
      </template>
      <span class="grow" />
      <span class="faint">Bulk <b class="num">{{ formatBulk(currentTotal?.bulk ?? 0) || '0' }}</b><template v-if="current?.strMod !== null && current?.characterId"> of {{ 5 + (current.strMod ?? 0) }} / {{ 10 + (current.strMod ?? 0) }}</template></span>
    </div>
    <p v-for="w in implantWarnings" :key="w" class="warn">{{ w }}</p>

    <div class="list">
      <div class="cols faint"><span /><span /><span>Item</span><span>Lvl</span><span>Bulk</span><span>Value</span></div>
      <InventoryRow v-for="e in rows" :key="e.id" :stack="e" />
      <p v-if="!rows.length" class="empty">{{ current?.name ?? 'This owner' }} holds no items.</p>
    </div>

    <div v-if="view === 'gm' && !theirs" class="add">
      <input v-model.number="addQty" class="input qty" type="number" min="1" aria-label="Quantity" />
      <div class="search">
        <input v-model="addQuery" class="input" placeholder="Add an item: search the compendium or type any name…" data-test="inv-add" @keydown.enter="addTyped" />
        <div v-if="addQuery.trim()" class="results panel">
          <button v-for="r in results" :key="r.id" class="result" @click="add(r)"><span>{{ r.name }}</span><span class="faint num">{{ r.level }} · {{ r.price ? ctx.money(r.price.cp) : '—' }}</span></button>
          <button class="result" @click="add(null)"><span>Add “{{ addQuery.trim() }}” as written</span><span class="faint">no compendium entry</span></button>
        </div>
      </div>
      <label class="faint"><input v-model="addUnidentified" type="checkbox" /> unidentified</label>
      <label v-if="!lockOwner" class="faint" :title="AWARD_HINT"><input v-model="addAward" type="checkbox" /> as treasure</label>
    </div>
  </section>
</template>

<style scoped>
.inv { display: flex; flex-direction: column; gap: .6rem; }
.head, .bar, .add { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
.grow { flex: 1; }
.owners { display: flex; gap: 2px; flex-wrap: wrap; border-bottom: var(--frame); }
.owner { display: flex; align-items: baseline; gap: .5rem; padding: .4rem .8rem; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--text-dim); }
.owner.on { color: var(--text); border-bottom-color: var(--accent); background: var(--bg-raised); }
.load { font-size: .68rem; text-transform: uppercase; color: var(--warn); } .load.app { color: var(--accent); }
.purse { font-size: 1.15rem; min-width: 6rem; }
.coin { width: 9rem; } .give { width: 9rem; } .qty { width: 4.2rem; }
.warn { color: var(--warn); margin: 0; }
.cols { display: grid; grid-template-columns: 14px 2.6rem minmax(0, 1fr) 2rem 3rem 6.5rem; gap: .5rem; padding: .1rem .4rem; font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; border-bottom: var(--frame); }
.cols span:nth-child(n + 4) { text-align: right; }
.empty { padding: 1.2rem; }
.search { position: relative; flex: 1; min-width: 16rem; }
.results { position: absolute; z-index: 6; left: 0; right: 0; bottom: calc(100% + 4px); display: flex; flex-direction: column; box-shadow: var(--shadow); }
.result { display: flex; justify-content: space-between; gap: 1rem; padding: .3rem .6rem; background: none; border: 0; text-align: left; }
.result:hover { background: var(--bg-hover); }
</style>
