<script setup lang="ts">
/**
 * Fills a share of a level's treasure with random compendium items and
 * coins, and puts them with the given owner (the stash, or an encounter's loot).
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { RefreshCw, X } from 'lucide-vue-next'
import type { GameId } from '@/domain/game'
import { formatMoney } from '@/domain/rules/format'
import type { InventoryEntry as Stack, OwnerKey } from '@/domain/rules/inventory'
import { GAME_RULES } from '@/domain/rules/registry'
import { GEAR_FILTERS, rollSlot, rollTreasure, rowLevelRange, type GearFilter, type RolledSlot, type TreasureCandidate } from '@/domain/rules/treasureRoll'
import type { Item, Rarity } from '@/domain/rules/types'
import type { TreasurePace } from '@/domain/rules/wealth'
import { addEntry, adjustPurse } from '@/data/inventory'
import { rulesQuery } from '@/data/rules'
import { reportError } from '@/ui/dialogs'

const props = defineProps<{ campaignId: string; game: GameId; owner: OwnerKey; level: number; partySize: number; pace: TreasurePace | null; stacks: Stack[] }>()
/** What was added, so the caller can count it as treasure. */
const emit = defineEmits<{ added: [value: { value: number; consumables: number }, label: string] }>()

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare']
const row = computed(() => GAME_RULES[props.game].treasure[Math.max(1, Math.min(20, props.level)) - 1])
const range = computed(() => (row.value ? rowLevelRange(row.value) : [0, 0] as [number, number]))
/** What is still unawarded this level, as a share of the row. */
const rest = computed(() => (props.pace ? Math.max(0, Math.min(1, props.pace.remaining / Math.max(1, props.pace.expected))) : 1))
const shares = computed(() => [[`Rest of this level (${Math.round(rest.value * 100)}%)`, rest.value], ['A quarter of the level', 0.25], ['A third of the level', 1 / 3], ['Half the level', 0.5], ['The whole level', 1]] as [string, number][])
const share = ref(0.25)
watch(rest, (r) => { share.value = Math.min(0.25, r) || 0.25 }, { immediate: true })
const rarities = ref<Rarity[]>(['common'])
const gear = ref<GearFilter[]>([...GEAR_FILTERS])
const skipOwned = ref(true)
const loading = ref(false)
const adding = ref(false)
const candidates = shallowRef<TreasureCandidate[]>([])
const rolled = ref<{ slots: RolledSlot[]; currency: number } | null>(null)
const unit = computed(() => (props.game === 'sf2e' ? 10 : 100))
const money = (cp: number) => formatMoney({ cp }, props.game)
const filled = computed(() => rolled.value?.slots.flatMap(s => (s.item ? [{ slot: s.slot, item: s.item }] : [])) ?? [])
const total = computed(() => filled.value.reduce((n, s) => n + s.item.price, 0) + (rolled.value?.currency ?? 0))

let loadedFor = ''
async function loadCandidates() {
  const key = `${props.game}:${range.value.join('-')}`
  if (key === loadedFor) return
  loading.value = true
  try {
    const page = await rulesQuery({ kind: 'item', games: [props.game], levelMin: range.value[0], levelMax: range.value[1], limit: 20000 })
    candidates.value = (page.items as Item[]).filter(i => i.price && i.price.cp > 0).map(i => ({ id: i.id, name: i.name, level: i.level, rarity: i.rarity, category: i.category, price: i.price?.cp ?? 0, quantity: i.priceFor ?? 1 }))
    loadedFor = key
  } finally { loading.value = false }
}
const options = () => ({
  share: share.value, partySize: props.partySize || 4, rarities: rarities.value, gear: gear.value,
  skipIds: skipOwned.value ? new Set(props.stacks.filter(e => !e.owner.startsWith('encounter:') && e.itemId).map(e => e.itemId ?? '')) : new Set<string>(),
})
async function roll() {
  if (!row.value) return
  try { await loadCandidates(); rolled.value = rollTreasure(row.value, candidates.value, options()) } catch (err) { reportError('Rolling treasure', err) }
}
function reroll(i: number) {
  const r = rolled.value, s = r?.slots[i]
  if (!r || !s) return
  const taken = new Set(r.slots.map(x => x.item?.id).filter((id): id is string => !!id))
  r.slots[i] = { ...s, item: rollSlot(s.slot, candidates.value, options(), taken) }
}
async function add() {
  const r = rolled.value
  if (!r) return
  adding.value = true
  try {
    for (const s of filled.value) await addEntry({ campaignId: props.campaignId, owner: props.owner, itemId: s.item.id, quantity: s.item.quantity ?? 1 })
    if (r.currency) await adjustPurse(props.campaignId, props.owner, r.currency)
    emit('added', { value: total.value, consumables: filled.value.filter(s => s.slot.kind === 'consumable').reduce((n, s) => n + s.item.price, 0) }, `Rolled treasure (level ${props.level})`)
    rolled.value = null
  } catch (err) { reportError('Adding the treasure', err) } finally { adding.value = false }
}
</script>

<template>
  <div class="roll">
    <div class="line">
      <label class="faint">Share <select v-model.number="share" class="input"><option v-for="[label, v] in shares" :key="label" :value="v">{{ label }}</option></select></label>
      <span class="faint">Rarity</span>
      <label v-for="r in RARITIES" :key="r"><input v-model="rarities" type="checkbox" :value="r" /> {{ r }}</label>
    </div>
    <div class="line">
      <span class="faint">Kinds</span>
      <label v-for="g in GEAR_FILTERS" :key="g"><input v-model="gear" type="checkbox" :value="g" /> {{ g }}</label>
      <label title="Leave out compendium items a party member or the stash already has"><input v-model="skipOwned" type="checkbox" /> skip what the party owns</label>
      <button class="btn" :disabled="loading || !rarities.length" data-test="treasure-roll" @click="roll">{{ rolled ? 'Roll again' : `Roll level ${level} treasure` }}</button>
    </div>
    <p v-if="loading" class="faint">Loading items…</p>
    <template v-else-if="rolled">
      <p v-if="!candidates.length" class="faint">No priced compendium items of levels {{ range[0] }}–{{ range[1] }}. Sync the compendium first.</p>
      <div v-for="(s, i) in rolled.slots" :key="i" class="slot">
        <span class="kind faint">{{ s.slot.kind === 'permanent' ? 'Permanent' : 'Consumable' }} {{ s.slot.level }}</span>
        <span class="name" :class="{ faint: !s.item }">{{ s.item?.name ?? 'nothing fits the filters' }}</span>
        <span class="faint num">{{ s.item ? money(s.item.price) : '' }}</span>
        <button class="btn btn-ghost btn-icon" title="Roll this slot again" @click="reroll(i)"><RefreshCw :size="13" /></button>
        <button class="btn btn-ghost btn-icon" title="Leave this slot out" @click="rolled.slots.splice(i, 1)"><X :size="13" /></button>
      </div>
      <div class="slot">
        <span class="kind faint">Currency</span>
        <input :value="rolled.currency / unit" type="number" min="0" class="input coins" aria-label="Currency" @change="rolled.currency = Math.max(0, Math.round(Number(($event.target as HTMLInputElement).value) * unit))" />
        <span class="faint">{{ game === 'sf2e' ? 'cr' : 'gp' }}</span>
      </div>
      <div class="line"><span class="faint">Total {{ money(total) }}</span><button class="btn btn-primary" :disabled="adding || (!filled.length && !rolled.currency)" @click="add">Add to {{ owner === 'stash' ? 'the stash' : 'the loot' }}</button></div>
    </template>
  </div>
</template>

<style scoped>
.roll { display: flex; flex-direction: column; gap: .4rem; }
.roll p { margin: 0; }
.line { display: flex; align-items: center; gap: .7rem; flex-wrap: wrap; }
.line .input { width: auto; }
.slot { display: grid; grid-template-columns: 8rem minmax(0, 1fr) auto auto auto; gap: .6rem; align-items: center; }
.coins { width: 7rem; }
</style>
