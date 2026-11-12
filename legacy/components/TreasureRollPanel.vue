<template>
  <section class="trp">
    <div class="trp-title">Roll treasure <span class="trp-dim">level {{ level }} · Party Treasure by Level</span></div>

    <div class="trp-row">
      <label class="trp-dim">Share
        <select v-model.number="share" class="trp-input">
          <option v-for="s in shareOptions" :key="s.label" :value="s.value">{{ s.label }}</option>
        </select>
      </label>
      <span class="trp-dim">Rarity</span>
      <label v-for="r in ROLL_RARITIES" :key="r" class="trp-check"><input v-model="rarities" type="checkbox" :value="r" /> {{ r }}</label>
    </div>
    <div class="trp-row">
      <span class="trp-dim">Kinds</span>
      <label v-for="g in GEAR_FILTERS" :key="g" class="trp-check"><input v-model="gear" type="checkbox" :value="g" /> {{ g }}</label>
      <label class="trp-check" title="Leave out compendium items a party member or the stash already has"><input v-model="skipOwned" type="checkbox" /> skip what the party owns</label>
      <button class="ghost-btn trp-btn" :disabled="loading || !rarities.length" @click="roll">{{ rolled ? 'Roll again' : 'Roll' }}</button>
    </div>

    <div v-if="loading" class="trp-dim">Loading items…</div>
    <template v-else-if="rolled">
      <div v-if="!candidates.length" class="trp-dim">No priced compendium items of levels {{ range[0] }}–{{ range[1] }}. Sync the compendium first.</div>
      <div v-for="(s, i) in rolled.slots" :key="i" class="trp-slot">
        <span class="trp-kind">{{ s.slot.kind === 'permanent' ? 'Permanent' : 'Consumable' }} {{ s.slot.level }}</span>
        <span class="trp-name" :class="{ 'trp-dim': !s.item }">{{ s.item?.name ?? 'nothing fits the filters' }}</span>
        <span class="trp-dim">{{ s.item ? money(s.item.price) : '' }}</span>
        <button class="trp-icon" title="Roll this slot again" @click="reroll(i)">⟳</button>
        <button class="trp-icon" title="Leave this slot out" @click="rolled.slots.splice(i, 1)">✕</button>
      </div>
      <div class="trp-slot">
        <span class="trp-kind">Currency</span>
        <input :value="rolled.currency / unit" type="number" min="0" class="trp-input trp-input--num" @change="rolled.currency = Math.max(0, Math.round(Number(($event.target as HTMLInputElement).value) * unit))" />
        <span class="trp-dim">{{ unitLabel }}</span>
      </div>
      <div class="trp-row">
        <span class="trp-dim">Total {{ money(total) }}</span>
        <button class="seal-btn trp-btn" :disabled="adding || (!filled.length && !rolled.currency)" @click="addToLoot">Add to loot</button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * Rolls a share of a level's treasure into the encounter's loot (FEATURES_PLAN §10.4).
 * Nothing is awarded until the encounter is resolved, so the wealth % stays honest.
 */
import { useInventory } from '~/composables/useInventory'
import { rulesQuery } from '~/composables/useRules'
import { formatMoney } from '~/rules/format'
import { GAME_RULES } from '~/rules/registry'
import {
  GEAR_FILTERS, rollSlot, rollTreasure, rowLevelRange,
  type GearFilter, type RolledSlot, type TreasureCandidate,
} from '~/rules/treasureRoll'
import type { TreasurePace } from '~/rules/wealth'
import type { GameId } from '~/types/game'
import type { Item, Rarity } from '~/types/rules'

const props = defineProps<{ campaignId: number; game: GameId; owner: string; level: number; partySize: number; pace: TreasurePace | null }>()

const ROLL_RARITIES: Rarity[] = ['common', 'uncommon', 'rare']
const inv = useInventory()

const row = computed(() => GAME_RULES[props.game].treasure[Math.max(1, Math.min(20, props.level)) - 1])
const range = computed(() => rowLevelRange(row.value))

/** What's still unawarded this level, as a share of the row. */
const restShare = computed(() => props.pace ? Math.max(0, Math.min(1, props.pace.remaining / Math.max(1, props.pace.expected))) : 1)
const shareOptions = computed(() => [
  { label: `Rest of this level (${Math.round(restShare.value * 100)}%)`, value: restShare.value },
  { label: 'A quarter of the level', value: 0.25 },
  { label: 'A third of the level', value: 1 / 3 },
  { label: 'Half the level', value: 0.5 },
  { label: 'The whole level', value: 1 },
])
const share = ref(0.25)
watch(restShare, (r) => { share.value = Math.min(0.25, r) || 0.25 }, { immediate: true })

const rarities = ref<Rarity[]>(['common'])
const gear = ref<GearFilter[]>([...GEAR_FILTERS])
const skipOwned = ref(true)

const loading = ref(false)
const adding = ref(false)
const candidates = shallowRef<TreasureCandidate[]>([])
const rolled = ref<{ slots: RolledSlot[]; currency: number } | null>(null)

const unit = computed(() => props.game === 'sf2e' ? 10 : 100)
const unitLabel = computed(() => props.game === 'sf2e' ? 'cr' : 'gp')
const money = (cp: number) => formatMoney({ cp }, props.game)
const filled = computed(() => rolled.value?.slots.filter(s => s.item) ?? [])
const total = computed(() => filled.value.reduce((n, s) => n + s.item!.price, 0) + (rolled.value?.currency ?? 0))

let loadedFor = ''
async function loadCandidates() {
  const key = `${props.game}:${range.value.join('-')}`
  if (key === loadedFor) return
  loading.value = true
  try {
    const page = await rulesQuery({ kind: 'item', games: [props.game], levelMin: range.value[0], levelMax: range.value[1], limit: 20000 })
    candidates.value = (page.items as Item[])
      .filter(i => i.price && i.price.cp > 0)
      .map(i => ({ id: i.id, name: i.name, level: i.level, rarity: i.rarity, category: i.category, price: i.price!.cp, quantity: i.priceFor ?? 1 }))
    loadedFor = key
  } finally {
    loading.value = false
  }
}

function ownedIds(): Set<string> {
  if (!skipOwned.value) return new Set()
  return new Set(inv.entries.value.filter(e => !e.owner.startsWith('encounter:') && e.itemId).map(e => e.itemId!))
}

function options() {
  return { share: share.value, partySize: props.partySize || 4, rarities: rarities.value, gear: gear.value, skipIds: ownedIds() }
}

async function roll() {
  await loadCandidates()
  rolled.value = rollTreasure(row.value, candidates.value, options())
}

function reroll(i: number) {
  const r = rolled.value
  if (!r) return
  const taken = new Set(r.slots.filter((_, j) => j !== i).map(s => s.item?.id).filter((id): id is string => !!id))
  if (r.slots[i].item) taken.add(r.slots[i].item!.id)
  r.slots[i] = { ...r.slots[i], item: rollSlot(r.slots[i].slot, candidates.value, options(), taken) }
}

async function addToLoot() {
  const r = rolled.value
  if (!r) return
  adding.value = true
  try {
    for (const s of filled.value) {
      await inv.addEntry({ campaignId: props.campaignId, owner: props.owner, itemId: s.item!.id, quantity: s.item!.quantity ?? 1 })
    }
    if (r.currency) await inv.adjustPurse(props.campaignId, props.owner, r.currency)
    rolled.value = null
  } finally {
    adding.value = false
  }
}
</script>

<style scoped>
.trp { border-top: 1px solid var(--border); padding-top: 12px; margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.trp-title { font-family: var(--fh, serif); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); }
.trp-title .trp-dim { text-transform: none; letter-spacing: 0; }
.trp-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.trp-dim { font-size: 11.5px; color: var(--text3); display: inline-flex; align-items: center; gap: 6px; }
.trp-check { font-size: 12px; color: var(--text2); display: inline-flex; align-items: center; gap: 4px; }
.trp-input { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-size: 12px; }
.trp-input--num { width: 90px; }
.trp-btn { padding: 3px 12px; font-size: 12px; }
.trp-slot { display: flex; align-items: center; gap: 10px; padding: 3px 6px; border-radius: 6px; }
.trp-slot:hover { background: var(--surface-hi); }
.trp-kind { width: 120px; flex: none; font-size: 11.5px; color: var(--text3); }
.trp-name { flex: 1; font-size: 13px; color: var(--text); }
.trp-icon { background: none; border: none; color: var(--text3); cursor: pointer; font-size: 13px; }
.trp-icon:hover { color: var(--text); }
</style>
