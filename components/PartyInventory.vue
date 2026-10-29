<template>
  <section class="inv party-section">
    <div class="inv-head">
      <div class="party-section-title">Inventory</div>
      <div class="inv-view" role="group" aria-label="View">
        <button :class="{ active: view === 'gm' }" @click="view = 'gm'">GM view</button>
        <button :class="{ active: view === 'player' }" title="What the players know: unidentified items show their player name and count as 0" @click="view = 'player'">Player view</button>
      </div>
    </div>

    <!-- Totals -->
    <div class="inv-totals">
      <span>Party total <b>{{ money(totals.total) }}</b></span>
      <span class="inv-dim">items {{ money(totals.items) }} · coins {{ money(totals.coins) }}</span>
      <span v-if="unknownCount" class="inv-warn" title="Free-text entries without a price, or compendium items without one">{{ unknownCount }} without a price</span>
      <span class="inv-spacer" />
      <span v-if="rules.baselineAt" class="inv-dim" :title="`Set ${formatDate(rules.baselineAt)} at party level ${rules.startingLevel}`">
        Baseline {{ money(rules.startingTreasure) }}
      </span>
      <button class="ghost-btn inv-small" :disabled="partyLevel == null" title="Store the current GM total and party level as the start of treasure tracking" @click="setBaseline">
        {{ rules.baselineAt ? 'Re-set baseline' : 'Set treasure baseline' }}
      </button>
    </div>

    <!-- Owners -->
    <div class="inv-owners">
      <button v-for="o in owners" :key="o.key" class="inv-owner" :class="{ active: o.key === selected }" @click="selected = o.key">
        <OhVueIcon :name="o.key === STASH ? 'gi-locked-chest' : 'gi-person'" scale="0.75" />
        <span>{{ o.name }}</span>
        <span class="inv-owner-total">{{ money(totals.byOwner[o.key]?.total ?? 0) }}</span>
        <span v-if="o.load && o.load !== 'ok'" class="inv-owner-load" :class="`inv-load--${o.load}`" :title="loadLabel(o.load)">!</span>
      </button>
    </div>

    <div class="inv-panel">
      <!-- Purse -->
      <div class="inv-purse">
        <OhVueIcon name="gi-two-coins" scale="0.85" />
        <span class="inv-purse-amount">{{ money(purses[selected] ?? 0) }}</span>
        <input v-model="coinInput" class="inv-input inv-coin-input" :placeholder="game === 'sf2e' ? 'e.g. 250 cr' : 'e.g. 12 gp 5 sp'" @keydown.enter="changeCoins(1)" />
        <button class="ghost-btn inv-small" :disabled="coinCp == null" @click="changeCoins(1)">Add</button>
        <button class="ghost-btn inv-small" :disabled="coinCp == null" @click="changeCoins(-1)">Remove</button>
        <select v-model="coinTarget" class="inv-input inv-select" :disabled="coinCp == null">
          <option value="">Give to…</option>
          <option v-for="o in owners.filter(x => x.key !== selected)" :key="o.key" :value="o.key">{{ o.name }}</option>
        </select>
        <button v-if="selected === STASH && memberOwners.length" class="ghost-btn inv-small" :disabled="!(purses[STASH] ?? 0)"
          title="Each party member gets an equal share; the remainder stays in the stash" @click="splitStash">
          Split evenly
        </button>
      </div>
      <div class="inv-bulk">
        Bulk {{ formatBulkTotal(totals.byOwner[selected]?.bulk ?? 0) }}
        <template v-if="selectedCharacter">
          <template v-if="selectedCharacter.strMod != null">
            / limit {{ 5 + selectedCharacter.strMod }} (max {{ 10 + selectedCharacter.strMod }})
            <span v-if="selectedLoad && selectedLoad !== 'ok'" class="inv-warn" :class="`inv-load--${selectedLoad}`">{{ loadLabel(selectedLoad) }}</span>
          </template>
          <span v-else class="inv-dim">· enter a Str modifier on the roster for the encumbrance warning</span>
        </template>
      </div>
      <div v-if="lastSplit" class="inv-note">{{ lastSplit }}</div>

      <!-- Items -->
      <div v-if="!ownerEntries.length" class="party-empty">No items.</div>
      <div v-for="e in ownerEntries" :key="e.id" class="inv-item" :class="{ 'inv-item--unid': !e.identified }">
        <div class="inv-row">
          <input class="inv-input inv-qty" type="number" min="0" :value="e.quantity" title="Quantity (0 removes)"
            @change="updateEntry(e.id, { quantity: Number(($event.target as HTMLInputElement).value) })" />
          <div class="inv-name">
            <template v-if="view === 'gm'">
              <NuxtLink v-if="e.itemId && items.get(e.itemId)" :to="`/compendium/items?id=${encodeURIComponent(e.itemId)}`">{{ eff(e).name }}</NuxtLink>
              <span v-else>{{ eff(e).name }}</span>
              <span v-if="e.itemId && !items.get(e.itemId)" class="inv-warn" title="The compendium entry is missing; sync or import it">missing entry</span>
              <span v-if="!e.identified" class="inv-unid" :title="`Players see: ${playerOf(e).name}`">unidentified · “{{ playerOf(e).name }}”</span>
              <span v-if="runeLabel(e)" class="inv-dim">{{ runeLabel(e) }}</span>
            </template>
            <template v-else>
              <span>{{ playerOf(e).name }}</span>
              <span v-if="!e.identified" class="inv-unid">unidentified</span>
            </template>
          </div>
          <span class="inv-level" title="Level">{{ shownLevel(e) }}</span>
          <span class="inv-price" :title="priceTitle(e)">{{ shownPrice(e) }}</span>
          <span class="inv-bulk-cell" title="Bulk">{{ formatBulkTotal(entryBulk(e, item(e))) }}</span>
          <div class="inv-actions">
            <button class="party-icon-btn" :title="e.identified ? 'Mark as unidentified' : 'Identify'" @click="setIdentified(e.id, !e.identified)">
              <OhVueIcon :name="e.identified ? 'md-visibility' : 'md-visibilityoff'" scale="0.75" />
            </button>
            <button class="party-icon-btn" title="Move to…" :class="{ active: moving === e.id }" @click="startMove(e)">
              <OhVueIcon name="md-arrowforward" scale="0.75" />
            </button>
            <button class="party-icon-btn" title="Details" :class="{ active: open === e.id }" @click="open = open === e.id ? null : e.id">
              <OhVueIcon name="md-edit" scale="0.7" />
            </button>
            <button class="party-icon-btn party-icon-btn--danger" title="Delete" @click="removeEntry(e.id)">
              <OhVueIcon name="md-close" scale="0.75" />
            </button>
          </div>
        </div>

        <!-- Move -->
        <div v-if="moving === e.id" class="inv-move">
          Move
          <input v-if="e.quantity > 1" v-model.number="moveQty" class="inv-input inv-qty" type="number" min="1" :max="e.quantity" />
          <span v-if="e.quantity > 1">of {{ e.quantity }}</span>
          to
          <select v-model="moveTo" class="inv-input inv-select">
            <option v-for="o in owners.filter(x => x.key !== selected)" :key="o.key" :value="o.key">{{ o.name }}</option>
          </select>
          <button class="seal-btn inv-small" :disabled="!moveTo" @click="doMove(e)">Move</button>
          <button class="ghost-btn inv-small" @click="moving = null">Cancel</button>
        </div>

        <!-- Details -->
        <div v-if="open === e.id" class="inv-details">
          <label>
            <span>Name</span>
            <input class="inv-input" :value="e.nameOverride ?? ''" :placeholder="item(e)?.name ?? 'Name'"
              @change="updateEntry(e.id, { nameOverride: val($event) })" />
          </label>
          <label>
            <span>Price each</span>
            <input class="inv-input" :value="e.priceOverride != null ? money(e.priceOverride) : ''" :placeholder="item(e)?.price ? money(item(e)!.price!.cp) : 'unknown'"
              @change="setPrice(e, val($event))" />
          </label>
          <label>
            <span>Bulk</span>
            <input class="inv-input" :value="e.bulkOverride != null ? formatBulk(e.bulkOverride) : ''" :placeholder="item(e) ? formatBulk(item(e)!.bulk, item(e)!.bulkNote) : '—'"
              @change="setBulk(e, val($event))" />
          </label>
          <template v-if="gearKind(e)">
            <label v-if="game === 'pf2e'">
              <span>Potency</span>
              <select class="inv-input" :value="e.runes?.potency ?? 0" @change="setRune(e, 'potency', num($event))">
                <option v-for="n in 4" :key="n" :value="n - 1">{{ n === 1 ? '—' : `+${n - 1}` }}</option>
              </select>
            </label>
            <label v-if="game === 'pf2e'">
              <span>{{ gearKind(e) === 'weapon' ? 'Striking' : 'Resilient' }}</span>
              <select class="inv-input" :value="(gearKind(e) === 'weapon' ? e.runes?.striking : e.runes?.resilient) ?? 0"
                @change="setRune(e, gearKind(e) === 'weapon' ? 'striking' : 'resilient', num($event))">
                <option :value="0">—</option><option :value="1">base</option><option :value="2">greater</option><option :value="3">major</option>
              </select>
            </label>
            <label v-if="game === 'sf2e'">
              <span>Grade</span>
              <select class="inv-input" :value="e.grade ?? ''" @change="updateEntry(e.id, { grade: val($event) })">
                <option value="">{{ itemGrade(e) ? `as item (${itemGrade(e)})` : '—' }}</option>
                <option v-for="g in SF2E_GRADES" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
          </template>
          <label class="inv-wide">
            <span>GM notes</span>
            <textarea class="inv-input" rows="2" :value="e.notes" placeholder="Only you see these; > [!hidden] blocks stay hidden in exports too"
              @change="updateEntry(e.id, { notes: val($event) })" />
          </label>
          <div class="inv-wide inv-subtitle">While unidentified, players see</div>
          <label>
            <span>Player name</span>
            <input class="inv-input" :value="e.playerName ?? ''" :placeholder="item(e)?.unidentified?.name || unidentifiedName(item(e))"
              @change="updateEntry(e.id, { playerName: val($event) })" />
          </label>
          <label class="inv-wide">
            <span>Player description</span>
            <textarea class="inv-input" rows="2" :value="e.playerDescription ?? ''" :placeholder="item(e)?.unidentified?.description || 'Nothing'"
              @change="updateEntry(e.id, { playerDescription: val($event) })" />
          </label>
        </div>
      </div>

      <!-- Add -->
      <div class="inv-add">
        <div class="inv-add-bar">
          <input v-model="addQuery" class="inv-input inv-add-input" placeholder="Add an item: search the compendium or type a name…" @keydown.enter="addTyped" />
          <input v-model.number="addQty" class="inv-input inv-qty" type="number" min="1" title="Quantity" />
          <label class="inv-check" title="Players don't know what it is yet">
            <input v-model="addUnidentified" type="checkbox" /> unidentified
          </label>
        </div>
        <div v-if="addQuery.trim()" class="party-add-results">
          <div v-for="r in addResults" :key="r.id" class="party-add-row">
            <span class="party-add-name">{{ r.name }} <span class="party-add-hint">· {{ r.level }} · {{ money(r.price?.cp ?? null) }}</span></span>
            <button class="ghost-btn party-add-btn" @click="addLinked(r)">+ Add</button>
          </div>
          <div class="party-add-row party-add-row--new">
            <span class="party-add-name">Free text: “{{ addQuery.trim() }}” <span class="party-add-hint">(set its price under Details)</span></span>
            <button class="ghost-btn party-add-btn" @click="addFree">+ Add</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { dbApi } from '~/composables/useDb'
import { useInventory } from '~/composables/useInventory'
import { rulesQuery } from '~/composables/useRules'
import { useFormatters } from '~/composables/useFormatters'
import type { Character } from '~/composables/useParty'
import { characterOwner, effective, encumbrance, entryBulk, partyTotals, STASH, toPlayerView, unidentifiedName, type Encumbrance, type InventoryEntry, type OwnerKey } from '~/rules/inventory'
import { formatBulk, formatMoney, parseBulk, parseMoney } from '~/rules/format'
import { isPartyMember } from '~/rules/party'
import { campaignRules, type CampaignRules, type GameId } from '~/types/game'
import type { Item, Runes } from '~/types/rules'
import { stripGmOnly } from '~/utils/gmContent'

const props = defineProps<{ campaignId: number; game: GameId; characters: Character[]; partyLevel: number | null }>()

const SF2E_GRADES = ['commercial', 'tactical', 'advanced', 'superior', 'elite', 'ultimate', 'paragon']

const inv = useInventory()
const { entries, purses, items, purseList, load, addEntry, updateEntry, removeEntry, setIdentified, move, adjustPurse, transferCoins, splitPurse } = inv
const { formatDate } = useFormatters()

const view = ref<'gm' | 'player'>('gm')
const selected = ref<OwnerKey>(STASH)
const rules = ref<CampaignRules>(campaignRules(null))

onMounted(async () => {
  rules.value = campaignRules(await dbApi.campaigns.get(props.campaignId))
  await load(props.campaignId)
})

const money = (cp: number | null) => formatMoney(cp == null ? null : { cp }, props.game)
const item = (e: InventoryEntry): Item | undefined => (e.itemId ? items.value.get(e.itemId) : undefined)
const eff = (e: InventoryEntry) => effective(e, item(e))
const playerOf = (e: InventoryEntry) => toPlayerView(e, item(e), stripGmOnly)
const val = (ev: Event) => (ev.target as HTMLInputElement).value
const num = (ev: Event) => Number((ev.target as HTMLSelectElement).value)

const totals = computed(() => partyTotals(entries.value, items.value, purseList.value, view.value, props.game !== 'sf2e'))
const unknownCount = computed(() => Object.values(totals.value.byOwner).reduce((a, t) => a + t.unknownPrices, 0))

// ── Owners ──
const memberOwners = computed(() => props.characters.filter(isPartyMember).map(c => characterOwner(c.id)))
const owners = computed(() => [
  { key: STASH, name: 'Party stash', load: null as Encumbrance | null },
  ...props.characters.map(c => ({
    key: characterOwner(c.id), name: c.name,
    load: encumbrance(totals.value.byOwner[characterOwner(c.id)]?.bulk ?? 0, c.strMod),
  })),
])
const selectedCharacter = computed(() => props.characters.find(c => characterOwner(c.id) === selected.value) ?? null)
const selectedLoad = computed(() => owners.value.find(o => o.key === selected.value)?.load ?? null)
watch(owners, list => { if (!list.some(o => o.key === selected.value)) selected.value = STASH })

const ownerEntries = computed(() => entries.value
  .filter(e => e.owner === selected.value)
  .sort((a, b) => eff(a).name.localeCompare(eff(b).name)))

function loadLabel(l: Encumbrance) {
  return l === 'overloaded' ? 'Over the Bulk limit' : 'Encumbered'
}

function formatBulkTotal(tenths: number) {
  return tenths ? formatBulk(tenths) : '0'
}

// ── Row display ──
function shownLevel(e: InventoryEntry) {
  const l = view.value === 'gm' ? eff(e).level : playerOf(e).level
  return l == null ? '' : String(l)
}
function shownPrice(e: InventoryEntry) {
  if (view.value === 'player') {
    const p = playerOf(e).price
    return p == null ? '?' : money(p)
  }
  return eff(e).unitPrice == null ? '—' : money(Math.round((eff(e).unitPrice! * e.quantity) / eff(e).per))
}
function priceTitle(e: InventoryEntry) {
  const f = eff(e)
  if (f.unitPrice == null) return 'No price'
  return f.per > 1 ? `${money(f.unitPrice)} per ${f.per}` : `${money(f.unitPrice)} each`
}
function gearKind(e: InventoryEntry): 'weapon' | 'armor' | null {
  const c = item(e)?.category
  return c === 'weapon' || c === 'armor' ? c : null
}
function itemGrade(e: InventoryEntry) {
  const i = item(e)
  return i?.weapon?.grade ?? i?.armor?.grade ?? null
}
function runeLabel(e: InventoryEntry) {
  if (e.grade) return e.grade
  const r = e.runes
  if (!r) return ''
  const fund = r.striking ? ['striking', 'greater striking', 'major striking'][r.striking - 1] : r.resilient ? ['resilient', 'greater resilient', 'major resilient'][r.resilient - 1] : ''
  return [r.potency ? `+${r.potency}` : '', fund].filter(Boolean).join(' ')
}

// ── Edits ──
function setPrice(e: InventoryEntry, raw: string) {
  if (!raw.trim()) return updateEntry(e.id, { priceOverride: null })
  const cp = parseMoney(raw, props.game)
  if (cp != null) updateEntry(e.id, { priceOverride: cp })
}
function setBulk(e: InventoryEntry, raw: string) {
  if (!raw.trim()) return updateEntry(e.id, { bulkOverride: null })
  const b = parseBulk(raw)
  if (b !== undefined) updateEntry(e.id, { bulkOverride: b })
}
function setRune(e: InventoryEntry, key: 'potency' | 'striking' | 'resilient', value: number) {
  const base: Runes = e.runes ?? { potency: 0, property: [] }
  const next: Runes = { ...base, [key]: value || undefined, potency: key === 'potency' ? value : base.potency }
  const empty = !next.potency && !next.striking && !next.resilient && !next.property.length
  updateEntry(e.id, { runes: empty ? null : next })
}

const open = ref<number | null>(null)

// ── Move ──
const moving = ref<number | null>(null)
const moveTo = ref<OwnerKey>('')
const moveQty = ref(1)
function startMove(e: InventoryEntry) {
  if (moving.value === e.id) { moving.value = null; return }
  moving.value = e.id
  moveQty.value = e.quantity
  moveTo.value = owners.value.find(o => o.key !== selected.value)?.key ?? ''
}
async function doMove(e: InventoryEntry) {
  await move(e.id, moveTo.value, Math.min(e.quantity, Math.max(1, moveQty.value || 1)))
  moving.value = null
}

// ── Coins ──
const coinInput = ref('')
const coinTarget = ref<OwnerKey>('')
const coinCp = computed(() => {
  const cp = parseMoney(coinInput.value, props.game)
  return cp != null && cp > 0 ? cp : null
})
async function changeCoins(sign: 1 | -1) {
  if (coinCp.value == null) return
  await adjustPurse(props.campaignId, selected.value, sign * coinCp.value)
  coinInput.value = ''
}
watch(coinTarget, async to => {
  if (!to || coinCp.value == null) return
  await transferCoins(props.campaignId, selected.value, to, coinCp.value)
  coinInput.value = ''
  coinTarget.value = ''
})
const lastSplit = ref('')
async function splitStash() {
  const n = memberOwners.value.length
  const { each, remainder } = await splitPurse(props.campaignId, STASH, memberOwners.value)
  lastSplit.value = each ? `Gave ${money(each)} to each of ${n} members; ${money(remainder)} stays in the stash.` : 'Not enough coins to split.'
}

// ── Baseline ──
async function setBaseline() {
  if (props.partyLevel == null) return
  const gmTotal = partyTotals(entries.value, items.value, purseList.value, 'gm').total
  if (rules.value.baselineAt && !confirm(`Replace the baseline of ${money(rules.value.startingTreasure)} with ${money(gmTotal)}?`)) return
  const next = { ...rules.value, startingTreasure: gmTotal, startingLevel: props.partyLevel, baselineAt: new Date().toISOString() }
  await dbApi.campaigns.update(props.campaignId, { rules: next })
  rules.value = next
}

// ── Add ──
const addQuery = ref('')
const addQty = ref(1)
const addUnidentified = ref(false)
const addResults = ref<Item[]>([])
let searchSeq = 0
watch(addQuery, async q => {
  const seq = ++searchSeq
  if (!q.trim()) { addResults.value = []; return }
  const page = await rulesQuery({ kind: 'item', games: [props.game], text: q.trim().toLowerCase(), limit: 8 })
  if (seq === searchSeq) addResults.value = page.items as Item[]
})
async function addLinked(r: Item) {
  await addEntry({ campaignId: props.campaignId, owner: selected.value, itemId: r.id, quantity: addQty.value || 1, identified: !addUnidentified.value })
  addQuery.value = ''
}
async function addFree() {
  const name = addQuery.value.trim()
  if (!name) return
  await addEntry({ campaignId: props.campaignId, owner: selected.value, name, quantity: addQty.value || 1, identified: !addUnidentified.value })
  addQuery.value = ''
}
function addTyped() {
  const q = addQuery.value.trim().toLowerCase()
  const exact = addResults.value.find(r => r.name.toLowerCase() === q)
  return exact ? addLinked(exact) : addFree()
}
</script>

<style scoped>
/* Shared with the party page (its styles are scoped) */
.party-section { margin-bottom: 28px; }
.party-section-title { font-family: var(--fh, serif); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); }
.party-empty { font-size: 13px; color: var(--text3); padding: 8px 0 12px; }
.party-icon-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--border); border-radius: 6px; color: var(--text2); cursor: pointer; }
.party-icon-btn:hover { color: var(--text); border-color: var(--border-hi); }
.party-icon-btn--danger:hover { color: var(--blood, #d04a4a); }
.party-add-results { margin-top: 6px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.party-add-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
.party-add-row:last-child { border-bottom: none; }
.party-add-name { flex: 1; font-size: 13px; color: var(--text); }
.party-add-hint { color: var(--text3); font-size: 12px; }
.party-add-btn { padding: 3px 10px; font-size: 12px; }

.inv-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.inv-head .party-section-title { margin-bottom: 0; }
.inv-view { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.inv-view button { padding: 3px 10px; font-size: 12px; background: transparent; border: none; color: var(--text2); cursor: pointer; }
.inv-view button.active { background: var(--surface-hi); color: var(--text); }

.inv-totals { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 10px 0 12px; font-size: 13px; color: var(--text2); }
.inv-totals b { color: var(--text); }
.inv-spacer { flex: 1; }
.inv-dim { color: var(--text3); font-size: 12px; }
.inv-warn { padding: 1px 6px; border-radius: 4px; font-size: 11px; color: #c9973a; border: 1px solid #c9973a66; }
.inv-load--overloaded { color: var(--blood, #d04a4a); border-color: #d04a4a66; }
.inv-note { font-size: 12px; color: var(--text2); margin: 4px 0 8px; }
.inv-small { padding: 3px 10px; font-size: 12px; }

.inv-owners { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.inv-owner { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; font-size: 13px; background: transparent; border: 1px solid var(--border); border-radius: 8px; color: var(--text2); cursor: pointer; }
.inv-owner.active { border-color: var(--border-hi); background: var(--surface); color: var(--text); }
.inv-owner-total { font-family: var(--fm); font-size: 11px; color: var(--text3); }
.inv-owner-load { font-weight: 700; color: #c9973a; }
.inv-owner-load.inv-load--overloaded { color: var(--blood, #d04a4a); }

.inv-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
.inv-purse { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--text2); }
.inv-purse-amount { font-family: var(--fm); color: var(--text); min-width: 90px; }
.inv-bulk { font-size: 12px; color: var(--text2); margin: 8px 0 10px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.inv-input { height: 28px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text); font-size: 13px; }
textarea.inv-input { height: auto; padding: 6px 8px; resize: vertical; font-family: inherit; }
.inv-coin-input { width: 150px; }
.inv-select { max-width: 180px; }
.inv-select option, .inv-details select option { background: var(--surface); }
.inv-qty { width: 56px; text-align: center; font-family: var(--fm); }

.inv-item { border-top: 1px solid var(--border); }
.inv-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.inv-name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--text); }
.inv-name a { color: inherit; text-decoration: none; }
.inv-name a:hover { text-decoration: underline; }
.inv-unid { font-size: 11px; color: #a87de8; }
.inv-level { width: 28px; text-align: right; font-family: var(--fm); font-size: 12px; color: var(--text3); }
.inv-price { width: 110px; text-align: right; font-family: var(--fm); font-size: 12px; color: var(--text2); }
.inv-bulk-cell { width: 44px; text-align: right; font-family: var(--fm); font-size: 12px; color: var(--text3); }
.inv-actions { display: flex; gap: 4px; }
.inv-actions .active { border-color: var(--border-hi); color: var(--text); }

.inv-move { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 4px 0 10px 66px; font-size: 13px; color: var(--text2); }
.inv-details { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px 12px; padding: 4px 0 12px 66px; }
.inv-details label { display: flex; flex-direction: column; gap: 3px; }
.inv-details label > span, .inv-subtitle { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); }
.inv-subtitle { margin-top: 4px; }
.inv-wide { grid-column: 1 / -1; }

.inv-add { margin-top: 10px; }
.inv-add-bar { display: flex; gap: 8px; align-items: center; }
.inv-add-input { flex: 1; border-style: dashed; border-color: var(--border-hi); }
.inv-check { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text2); white-space: nowrap; }

@media (max-width: 640px) {
  .inv-move, .inv-details { padding-left: 0; }
  .inv-price { width: 80px; }
  .inv-level { display: none; }
}
</style>
