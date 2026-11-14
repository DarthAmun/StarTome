<script setup lang="ts">
/**
 * One stack of the inventory. Click it for everything you can do with it:
 * rename, reprice, identify, store in a container, move, attach runes or
 * upgrades, make it a relic, implant it, delete it.
 */
import { computed, inject, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, Link2Off, Trash2 } from 'lucide-vue-next'
import { ATTACH_LABEL, attachKindOf, attachmentWarnings, canAttach, fundamentalOf, hostKindOf } from '@/domain/rules/attachments'
import { formatBulk, parseBulk, parseMoney } from '@/domain/rules/format'
import { containerLoad, dormantGift, entryBulk, entryValue, type InventoryEntry as Stack } from '@/domain/rules/inventory'
import { SF2E_GRADES } from '@/domain/rules/registry'
import { isAugmentation, upgradeSlots, upgradeWarnings } from '@/domain/rules/sf2eGear'
import type { Item, RelicGift } from '@/domain/rules/types'
import { attach, detach, move, removeEntry, setImplanted, setRelic, store, updateEntry, type EntryPatch } from '@/data/inventory'
import { rulesQuery } from '@/data/rules'
import { identify, offerItems } from '@/services/characterLink/link'
import { confirmDialog, reportError } from '@/ui/dialogs'
import { peek } from '@/ui/workbench'
import { INVENTORY, type InventoryContext } from './inventoryContext'

const props = defineProps<{ stack: Stack; locked?: boolean }>()
const ctx = inject(INVENTORY) as InventoryContext
const e = computed(() => props.stack)
const gm = computed(() => ctx.view.value === 'gm')
const open = ref(false)
const val = (ev: Event) => (ev.target as HTMLInputElement).value
const run = (what: string, work: Promise<unknown>) => { void work.catch(err => reportError(what, err)) }
const patch = (p: EntryPatch) => run('Saving the item', updateEntry(e.value.id, p))

const item = computed(() => ctx.item(e.value))
const eff = computed(() => ctx.eff(e.value))
const player = computed(() => ctx.playerOf(e.value))
const isAttached = computed(() => !!e.value.attachedTo)
const mirrored = computed(() => !!e.value.pbEntryId || !!e.value.pbOfferId)
const attached = computed(() => ctx.attachedOf(e.value))
const container = computed(() => ctx.inContainer(e.value))
const load = computed(() => (item.value?.container ? containerLoad(e.value, ctx.stacks.value, ctx.items.value) : null))
const sf = computed(() => ctx.game.value === 'sf2e')
const gearKind = computed(() => (item.value?.category === 'weapon' || item.value?.category === 'armor' ? item.value.category : null))
const itemGrade = (s: Stack) => { const i = ctx.item(s); return i?.weapon?.grade ?? i?.armor?.grade ?? null }

// ── What the row shows ─────────────────────────────────────────────────────
const name = computed(() => (gm.value ? eff.value.name : player.value.name))
const level = computed(() => {
  const own = gm.value ? eff.value.level : player.value.level
  // An item is as high-level as its highest rune
  const levels = [own, ...ctx.shownAttached(e.value).map(a => (gm.value ? ctx.eff(a).level : ctx.playerOf(a).level))].filter((x): x is number => x !== null)
  return levels.length ? String(Math.max(...levels)) : ''
})
const price = computed(() => {
  if (!gm.value) return player.value.price === null ? '?' : ctx.money(player.value.price)
  if (eff.value.unitPrice === null) return '—'
  return ctx.money([e.value, ...attached.value].reduce((n, x) => n + entryValue(x, ctx.linked(x)), 0))
})
const priceTitle = computed(() => (eff.value.unitPrice === null ? 'No price' : `${ctx.money(eff.value.unitPrice)} ${eff.value.per > 1 ? `per ${eff.value.per}` : 'each'}${attached.value.length ? ', with what is attached' : ''}`))
const bulk = computed(() => { const b = entryBulk(e.value, ctx.linked(e.value)); return b ? formatBulk(b) : '—' })
const kindLabel = computed(() => (e.value.attachKind === 'gift' ? `${ctx.gift(e.value)?.tier ?? ''} gift`.trim() : ATTACH_LABEL[e.value.attachKind ?? 'accessory']))

const slotted = computed(() => attached.value.map(a => ({ kind: a.attachKind ?? 'accessory', name: ctx.nameOf(a), grade: a.grade ?? itemGrade(a), description: ctx.item(a)?.description ?? '' })))
const slotInput = computed(() => ({ item: item.value, grade: e.value.grade ?? itemGrade(e.value), baseOverride: e.value.upgradeSlots ?? null }))
const slotLabel = computed(() => {
  if (!sf.value || !gearKind.value || isAttached.value) return ''
  const used = slotted.value.filter(a => a.kind === 'upgrade' || a.kind === 'installed').length
  const slots = upgradeSlots({ ...slotInput.value, attachedTexts: slotted.value.map(a => a.description) })
  return slots || used ? `upgrades ${used}/${slots}` : ''
})
const warnings = computed(() => {
  if (isAttached.value) return []
  const out = attachmentWarnings(ctx.attachedInfo(e.value), { kind: hostKindOf(item.value), relic: !!e.value.relic })
  if (sf.value && gearKind.value) out.push(...upgradeWarnings(slotted.value, slotInput.value))
  return out
})
function openEntry() { if (e.value.itemId && gm.value) peek({ kind: 'rules', id: e.value.itemId }) }

// ── Edits ──────────────────────────────────────────────────────────────────
function setPrice(raw: string) {
  if (!raw.trim()) return patch({ priceOverride: null })
  const cp = parseMoney(raw, ctx.game.value)
  if (cp !== null) patch({ priceOverride: cp })
}
function setBulk(raw: string) {
  if (!raw.trim()) return patch({ bulkOverride: null })
  const b = parseBulk(raw)
  if (b !== undefined) patch({ bulkOverride: b })
}
const containers = computed(() => (ctx.stacks.value.some(x => x.containerId === e.value.id) ? [] : ctx.stacks.value.filter(c => c.owner === e.value.owner && c.id !== e.value.id && !c.containerId && !!ctx.item(c)?.container)))
const canImplant = computed(() => sf.value && e.value.owner.startsWith('character:') && isAugmentation(item.value))
async function remove() {
  const extra = attached.value.length ? ` What is attached to it (${attached.value.map(ctx.nameOf).join(', ')}) goes with it.` : ''
  if (await confirmDialog({ title: `Delete ${ctx.nameOf(e.value)}?`, body: `The stack is removed from the inventory.${extra}`, confirmLabel: 'Delete', danger: true })) run('Deleting the item', removeEntry(e.value.id))
}

// ── Move ───────────────────────────────────────────────────────────────────
const targets = computed(() => ctx.owners.value.filter(o => o.key !== e.value.owner))
const moveTo = ref('')
const moveQty = ref(1)
watch(open, (o) => { if (o) { moveQty.value = e.value.quantity; moveTo.value = targets.value[0]?.key ?? '' } })
/** A linked player is given things as an offer: the stack stays here, marked, until they accept. */
const offerTarget = computed(() => { const c = targets.value.find(o => o.key === moveTo.value)?.character; return c?.link ? c : null })
function doMove() {
  const quantity = Math.min(e.value.quantity, Math.max(1, moveQty.value || 1))
  if (!offerTarget.value) return run('Moving the item', move(e.value.id, moveTo.value, quantity))
  run('Offering the item', offerItems(offerTarget.value, [{ entry: e.value, item: item.value, quantity, attached: attached.value.map(a => ({ entry: a, item: ctx.item(a) ?? ctx.gift(a) })) }]))
  open.value = false
}
const holder = computed(() => ctx.owners.value.find(o => o.key === e.value.owner)?.character ?? null)
function reveal() { if (holder.value && e.value.pbEntryId) run('Identifying', identify(holder.value, e.value.pbEntryId, ctx.nameOf(e.value))) }

// ── Attach ─────────────────────────────────────────────────────────────────
const canHost = computed(() => !mirrored.value && !isAttached.value && (!!e.value.relic || !!hostKindOf(item.value) || !e.value.itemId))
const attachQuery = ref('')
const results = ref<(Item | RelicGift)[]>([])
const attachHint = computed(() => (e.value.relic ? 'Search relic gifts and runes…' : sf.value ? 'Search upgrades…' : 'Search runes, talismans, accessories…'))
/** Loose entries of the same owner that fit this host. */
const loose = computed(() => {
  const q = attachQuery.value.trim().toLowerCase()
  return ctx.stacks.value.filter(l => l.owner === e.value.owner && l.id !== e.value.id && !l.attachedTo && !l.pbOfferId && !ctx.stacks.value.some(x => x.attachedTo === l.id)
    && !!attachKindOf(ctx.item(l)) && canAttach(ctx.item(l), item.value, !!e.value.relic) && (!q || ctx.nameOf(l).toLowerCase().includes(q)))
})
let seq = 0
watch([attachQuery, open], async () => {
  const mine = ++seq
  if (!open.value || !canHost.value) { results.value = []; return }
  const q = attachQuery.value.trim().toLowerCase()
  const kind = hostKindOf(item.value)
  // Without a search: the fundamental runes for this kind of item, so +1 or striking is two clicks
  const texts = q ? [q] : sf.value ? [] : kind === 'armor' ? ['armor potency', 'resilient'] : kind === 'shield' ? ['reinforcing'] : kind === 'weapon' ? ['weapon potency', 'striking'] : []
  const found: (Item | RelicGift)[] = []
  if (e.value.relic) {
    const aspects = e.value.relic.aspects
    const page = await rulesQuery({ kind: 'relicGift', text: q, limit: 1000 })
    found.push(...(page.items as RelicGift[]).filter(g => !aspects.length || g.aspects.includes('any') || g.aspects.some(a => aspects.includes(a))))
  }
  for (const text of texts) {
    // Most matches don't attach to anything: fetch plenty, keep what fits
    const page = await rulesQuery({ kind: 'item', games: [ctx.game.value], text, limit: 300 })
    found.push(...(page.items as Item[]).filter(r => !!attachKindOf(r) && canAttach(r, item.value, !!e.value.relic)))
  }
  const rank = (r: Item | RelicGift) => { const f = fundamentalOf(r.name); return f ? (f.slot.endsWith('Potency') ? 0 : 10) + f.value : 100 }
  if (mine === seq) results.value = [...new Map(found.map(r => [r.id, r])).values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, 20)
})
const doAttach = (source: { entryId: string } | { itemId: string }) => run('Attaching', attach(e.value.id, source))
</script>

<template>
  <div class="row" :class="{ attached: isAttached, inside: !!container, open, dormant: dormantGift(stack) }" :data-item="name">
    <button class="main" :disabled="!gm || locked" @click="open = !open">
      <component :is="open ? ChevronDown : ChevronRight" v-if="gm && !locked" :size="13" class="caret" />
      <span class="qty num">{{ stack.quantity > 1 ? `${stack.quantity}×` : '' }}</span>
      <span class="name">
        <span :class="{ link: gm && stack.itemId }" @click.stop="openEntry">{{ name }}</span>
        <span v-if="isAttached" class="tag">{{ kindLabel }}</span>
        <span v-if="ctx.runeLabel(stack) && !isAttached" class="tag rune">{{ ctx.runeLabel(stack) }}</span>
        <span v-if="!stack.identified && gm" class="tag warn">{{ stack.attachKind === 'gift' ? 'dormant' : 'unidentified' }}</span>
        <span v-if="stack.relic" class="tag rune">relic{{ stack.relic.aspects.length ? `: ${stack.relic.aspects.join(', ')}` : '' }}</span>
        <span v-if="stack.implanted" class="tag rune">implanted</span>
        <span v-if="slotLabel" class="tag">{{ slotLabel }}</span>
        <span v-if="load" class="tag" :class="{ warn: load.over }">holds {{ formatBulk(load.contents) || '0' }}{{ load.capacity ? ` / ${formatBulk(load.capacity)}` : '' }}</span>
        <span v-if="mirrored" class="tag">{{ stack.pbOfferId ? 'offered' : 'in their app' }}</span>
        <span v-if="stack.itemId && !ctx.linked(stack) && gm" class="tag warn" title="Its compendium entry is not in this compendium">entry missing</span>
        <span v-for="w in gm ? warnings : []" :key="w" class="tag warn" :title="w">!</span>
      </span>
      <span class="num faint lvl">{{ level }}</span>
      <span class="num faint">{{ bulk }}</span>
      <span class="num price" :title="gm ? priceTitle : undefined">{{ price }}</span>
    </button>
    <button v-if="isAttached && gm && !locked" class="btn btn-ghost btn-icon" :title="stack.attachKind === 'gift' ? 'Remove this gift' : 'Take it off; it becomes a loose item again'" @click="run('Detaching', detach(stack.id))"><Link2Off :size="13" /></button>

    <div v-if="open && gm && mirrored" class="detail">
      <p v-if="stack.pbOfferId" class="dim">Offered to a player: it stays here until they accept. Withdraw it under Play Buddy › Sent.</p>
      <template v-else>
        <p class="dim">This is in {{ holder?.name ?? 'the player' }}'s Play Buddy. It is shown and counted here, and changed there.</p>
        <div v-if="!stack.identified && holder?.link" class="line"><button class="btn" data-test="identify" @click="reveal">Identify it for {{ holder.name }}</button></div>
      </template>
    </div>
    <div v-else-if="open && gm" class="detail">
      <p v-for="w in warnings" :key="w" class="warn">{{ w }}</p>
      <div class="grid">
        <label><span class="label">Quantity</span><input class="input" type="number" min="0" :value="stack.quantity" @change="patch({ quantity: Number(val($event)) })" /></label>
        <label class="span-2"><span class="label">Name {{ stack.itemId ? '(empty = the entry\'s)' : '' }}</span><input class="input" :value="stack.nameOverride ?? ''" :placeholder="item?.name" @change="patch({ nameOverride: val($event) })" /></label>
        <label><span class="label">Price each</span><input class="input" :value="stack.priceOverride === null ? '' : ctx.money(stack.priceOverride)" :placeholder="item?.price ? ctx.money(item.price.cp) : sf ? '50 cr' : '5 gp'" @change="setPrice(val($event))" /></label>
        <label><span class="label">Bulk</span><input class="input" :value="stack.bulkOverride === null ? '' : formatBulk(stack.bulkOverride)" :placeholder="item ? formatBulk(item.bulk) : 'L, 1'" @change="setBulk(val($event))" /></label>
        <label v-if="sf && gearKind"><span class="label">Grade</span><select class="input" :value="stack.grade ?? ''" @change="patch({ grade: val($event) || null })"><option value="">{{ itemGrade(stack) ?? 'commercial' }} (entry)</option><option v-for="g in SF2E_GRADES" :key="g" :value="g">{{ g }}</option></select></label>
        <label v-if="sf && gearKind"><span class="label">Base upgrade slots</span><input class="input" type="number" min="0" :value="stack.upgradeSlots ?? ''" placeholder="table" @change="patch({ upgradeSlots: val($event) === '' ? null : Number(val($event)) })" /></label>
        <label v-if="containers.length || container"><span class="label">Stored in</span><select class="input" :value="stack.containerId ?? ''" @change="run('Storing', store(stack.id, val($event) || null))"><option value="">carried loose</option><option v-for="c in containers" :key="c.id" :value="c.id">{{ ctx.nameOf(c) }}</option></select></label>
        <label class="span-3"><span class="label">GM notes</span><textarea class="input" rows="2" :value="stack.notes" @change="patch({ notes: val($event) })" /></label>
      </div>
      <div class="line">
        <label><input type="checkbox" :checked="stack.identified" @change="patch({ identified: !stack.identified })" /> {{ stack.attachKind === 'gift' ? 'Awakened' : 'Identified' }}</label>
        <template v-if="!stack.identified && stack.attachKind !== 'gift'">
          <input class="input" :value="stack.playerName ?? ''" :placeholder="`Players see: ${player.name}`" aria-label="Name the players see" @change="patch({ playerName: val($event) })" />
          <input class="input" :value="stack.playerDescription ?? ''" placeholder="What the players read about it" aria-label="Description the players see" @change="patch({ playerDescription: val($event) })" />
        </template>
      </div>
      <div v-if="!isAttached" class="line">
        <label v-if="!sf"><input type="checkbox" :checked="!!stack.relic" @change="run('Changing the relic', setRelic(stack.id, stack.relic ? null : { aspects: [] }))" /> Relic</label>
        <input v-if="stack.relic" class="input" :value="stack.relic.aspects.join(', ')" placeholder="Aspects: fire, mind…" aria-label="Relic aspects" @change="run('Changing the relic', setRelic(stack.id, { aspects: val($event).split(',').map(a => a.trim().toLowerCase()).filter(Boolean) }))" />
        <label v-if="canImplant || stack.implanted"><input type="checkbox" :checked="!!stack.implanted" @change="run('Changing the implant', setImplanted(stack.id, !stack.implanted))" /> Implanted</label>
      </div>
      <div v-if="!isAttached && !stack.implanted && targets.length" class="line">
        <span class="faint">Move</span>
        <input v-model.number="moveQty" class="input qty-in" type="number" min="1" :max="stack.quantity" aria-label="Quantity to move" />
        <span class="faint">to</span>
        <select v-model="moveTo" class="input" aria-label="Move to"><option v-for="o in targets" :key="o.key" :value="o.key">{{ o.name }}</option></select>
        <button class="btn" :disabled="!moveTo" data-test="move-item" @click="doMove">{{ offerTarget ? 'Offer' : 'Move' }}</button>
      </div>
      <div v-if="canHost" class="attach">
        <input v-model="attachQuery" class="input" :placeholder="attachHint" />
        <div class="choices">
          <button v-for="l in loose" :key="l.id" class="chip" title="A loose item of the same owner" @click="doAttach({ entryId: l.id })">{{ ctx.nameOf(l) }} <span class="faint">owned</span></button>
          <button v-for="r in results" :key="r.id" class="chip" @click="doAttach({ itemId: r.id })">{{ r.name }} <span v-if="r.kind === 'item' && r.price" class="faint">{{ ctx.money(r.price.cp) }}</span></button>
        </div>
      </div>
      <div class="line end"><button class="btn btn-danger" @click="remove"><Trash2 :size="13" /> Delete</button></div>
    </div>
  </div>
</template>

<style scoped>
.row { border-bottom: var(--frame); display: grid; grid-template-columns: minmax(0, 1fr) auto; }
.row.attached .main { padding-left: 2.6rem; color: var(--text-dim); }
.row.inside .main { padding-left: 1.6rem; }
.row.attached.inside .main { padding-left: 3.6rem; }
.row.dormant { opacity: .65; }
.main { display: grid; grid-template-columns: 14px 2.6rem minmax(0, 1fr) 2rem 3rem 6.5rem; gap: .5rem; align-items: baseline; padding: .3rem .4rem; background: none; border: 0; text-align: left; color: inherit; }
.main:disabled { cursor: default; opacity: 1; }
.main:hover:not(:disabled), .row.open .main { background: var(--bg-hover); }
.caret { align-self: center; color: var(--text-faint); }
.qty { text-align: right; color: var(--text-dim); }
.name { display: flex; flex-wrap: wrap; gap: .1rem .45rem; align-items: baseline; }
.link:hover { color: var(--accent); text-decoration: underline; }
.tag { font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint); }
.tag.rune { color: var(--accent); } .tag.warn, p.warn { color: var(--warn); }
.price, .lvl { text-align: right; }
.detail { grid-column: 1 / -1; padding: .6rem .8rem .8rem 1.6rem; background: var(--bg-sunken); display: flex; flex-direction: column; gap: .55rem; }
.detail p { margin: 0; font-size: .88rem; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem .7rem; }
.span-2 { grid-column: span 2; } .span-3 { grid-column: 1 / -1; }
.line { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
.line.end { justify-content: flex-end; }
.line .input { width: auto; flex: 1; min-width: 8rem; }
.line .qty-in { flex: none; width: 4.5rem; min-width: 0; }
.attach { display: flex; flex-direction: column; gap: .35rem; }
.choices { display: flex; flex-wrap: wrap; gap: .25rem; }
.choices .chip { background: none; cursor: pointer; }
.choices .chip:hover { border-color: var(--accent); color: var(--text); }
</style>
