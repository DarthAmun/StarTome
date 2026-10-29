<template>
  <div class="eb screen-in">
    <header class="eb-head">
      <div>
        <h1 class="page-title eb-title">Encounter builder</h1>
        <div class="eb-sub">
          <template v-if="party.size">
            Party level
            <span class="eb-stepper" :title="build.partyLevel === null ? 'From the party tab' : 'Overridden for this encounter'">
              <button aria-label="Lower party level" :disabled="partyLevelUsed <= MIN_LEVEL" @click="setPartyLevel(partyLevelUsed - 1)">−</button>
              <b :class="{ 'eb-override': build.partyLevel !== null }">{{ partyLevelUsed }}</b>
              <button aria-label="Raise party level" :disabled="partyLevelUsed >= MAX_LEVEL" @click="setPartyLevel(partyLevelUsed + 1)">+</button>
            </span>
            <button v-if="build.partyLevel !== null" class="eb-link" @click="build.partyLevel = null">reset to {{ party.level }}</button>
            <span v-if="party.mixed" class="eb-warn" title="Members are at different levels">mixed: {{ party.min }}–{{ party.max }}</span>
            · {{ party.size }} {{ party.size === 1 ? 'member' : 'members' }}
          </template>
          <template v-else>
            No party members yet: budgets assume four level {{ partyLevelUsed }} PCs.
            <NuxtLink :to="`/campaign/${campaignId}/party`">Set up the party</NuxtLink>
          </template>
        </div>
        <div v-if="pace" class="eb-sub eb-pace" title="Treasure awarded since the last level-up against this level's row of Party Treasure by Level. Add loot on the encounter's Loot dialog.">
          Treasure this level: <b>{{ money(pace.awarded) }}</b> of {{ money(pace.expected) }}
          · {{ pace.remaining >= 0 ? `${money(pace.remaining)} left to give` : `${money(-pace.remaining)} ahead` }}
        </div>
      </div>
    </header>

    <div class="eb-cols">
      <!-- ── Search ── -->
      <section class="eb-panel eb-search">
        <div class="eb-panel-title">Compendium</div>
        <input v-model="text" class="eb-input" placeholder="Search creatures and hazards…" />
        <div class="eb-filters">
          <label class="eb-filter">
            <span>Level</span>
            <input v-model.number="levelMin" type="number" class="eb-num" min="-1" max="25" />
            –
            <input v-model.number="levelMax" type="number" class="eb-num" min="-1" max="25" />
          </label>
          <select v-model="kindFilter" class="eb-select" aria-label="Kind">
            <option value="both">Creatures &amp; hazards</option>
            <option value="creature">Creatures</option>
            <option value="hazard">Hazards</option>
          </select>
          <select v-model="rarity" class="eb-select" aria-label="Rarity">
            <option value="">Any rarity</option>
            <option v-for="r in RARITIES" :key="r" :value="r">{{ r }}</option>
          </select>
          <input v-model="traitText" class="eb-input eb-input--traits" placeholder="Traits, e.g. undead, fiend" />
        </div>
        <div class="eb-results">
          <div v-for="r in results" :key="r.id" class="eb-result">
            <div class="eb-thumb">
              <img v-if="r.img" :src="r.img" alt="" />
              <span v-else>{{ r.name.charAt(0) }}</span>
            </div>
            <div class="eb-result-info">
              <span class="eb-result-name">{{ r.name }}</span>
              <span class="eb-result-meta">{{ r.kind === 'hazard' ? (r.complex ? 'Complex hazard' : 'Hazard') : 'Creature' }} {{ r.level }} · {{ xpOf(r) }} XP{{ otherGameTag(r.game, game) }}</span>
            </div>
            <button class="eb-add" title="Add" @click="add(r.id)"><OhVueIcon name="md-add" scale="0.75" /></button>
          </div>
          <p v-if="!results.length && !loading" class="eb-hint">
            <template v-if="compendiumEmpty">The compendium has no creatures yet. <NuxtLink to="/compendium/sync">Sync it from Foundry</NuxtLink>.</template>
            <template v-else>No matches</template>
          </p>
          <p v-else-if="total > results.length" class="eb-hint">{{ results.length }} of {{ total }}: narrow the search to see more</p>
        </div>
      </section>

      <!-- ── Selection ── -->
      <section class="eb-panel eb-sel">
        <input v-model="build.name" class="eb-input eb-name" placeholder="Encounter name" />
        <EncounterMeterBar :game="game" :xp="totalXp" :party-size="party.size" />

        <div v-if="!build.slots.length" class="eb-hint eb-empty">Add creatures and hazards from the compendium.</div>
        <div v-for="(slot, i) in build.slots" :key="`${slot.rulesId}:${i}`" class="eb-slot" :class="{ 'eb-slot--missing': !entries[slot.rulesId] }">
          <template v-if="entries[slot.rulesId]">
            <div class="eb-slot-info">
              <span class="eb-slot-name">{{ entries[slot.rulesId].name }}</span>
              <span class="eb-result-meta">
                {{ kindLabel(entries[slot.rulesId]) }} {{ entries[slot.rulesId].level }}
                <template v-if="slot.adjustment">→ counts as {{ xpLevel(entries[slot.rulesId].level, slot.adjustment) }}</template>
              </span>
              <span v-if="tooStrong(xpEntry(slot), party.min)" class="eb-warn"
                :title="`More than ${MAX_LEVEL_ABOVE} levels above the lowest party member (${party.min})`">too strong for level {{ party.min }}</span>
              <span v-else-if="slotXp(slot) === 0" class="eb-warn eb-warn--dim" title="More than four levels below the party: worth no XP">too weak to count</span>
            </div>
            <span class="eb-slot-xp">{{ slotXp(slot) * slot.count }} XP</span>
            <button class="eb-remove" title="Remove" @click="remove(i)"><OhVueIcon name="md-close" scale="0.7" /></button>
            <div class="eb-slot-controls">
              <div class="eb-adjust" role="radiogroup" aria-label="Weak/elite">
                <button v-for="opt in ADJUSTMENTS" :key="opt.label" :class="{ active: slot.adjustment === opt.value }"
                  role="radio" :aria-checked="slot.adjustment === opt.value" @click="slot.adjustment = opt.value">{{ opt.label }}</button>
              </div>
              <span class="eb-stepper">
                <button aria-label="Fewer" @click="slot.count > 1 ? slot.count-- : remove(i)">−</button>
                <b>{{ slot.count }}</b>
                <button aria-label="More" @click="slot.count++">+</button>
              </span>
            </div>
          </template>
          <template v-else>
            <div class="eb-slot-info"><span class="eb-slot-name">Missing compendium entry</span></div>
            <span />
            <button class="eb-remove" title="Remove" @click="remove(i)"><OhVueIcon name="md-close" scale="0.7" /></button>
          </template>
        </div>

        <div class="eb-actions">
          <button class="ghost-btn" :disabled="!build.slots.length && !build.name" @click="clear">Clear</button>
          <button class="seal-btn" :disabled="creating || (!build.slots.length && !party.size)" @click="create">
            <OhVueIcon name="gi-crossed-swords" scale="0.8" /> Create encounter
          </button>
        </div>
        <p class="eb-hint">Places the party's tokens and every enemy on a new prepared encounter. The selection stays here until you clear it.</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { dbApi } from '~/composables/useDb'
import { useParty } from '~/composables/useParty'
import { rulesCounts, rulesGetMany, rulesQuery } from '~/composables/useRules'
import { toCreatureOption, otherGameTag, type CreatureOption } from '~/composables/useCreatureSearch'
import { createEncounterFromBuild, useBuildState, type BuildSlot } from '~/composables/useEncounterBuild'
import { entryXp, MAX_LEVEL_ABOVE, tooStrong, xpLevel, type XpEntry } from '~/rules/encounter'
import { MAX_LEVEL, MIN_LEVEL, clampLevel } from '~/rules/party'
import type { Adjustment } from '~/rules/combat'
import { campaignGame, type GameId } from '~/types/game'
import { useWealth } from '~/composables/useWealth'
import { formatMoney } from '~/rules/format'
import type { TreasurePace } from '~/rules/wealth'
import { RARITIES, type Hazard, type Rarity, type RulesEntity } from '~/types/rules'

const route = useRoute()
const router = useRouter()
const campaignId = Number(route.params.id)
const { characters, party, load } = useParty()
const { state: build, add: addSlot, remove, clear: clearBuild } = useBuildState(campaignId)

const game = ref<GameId>('pf2e')
const pace = ref<TreasurePace | null>(null)
const money = (cp: number) => formatMoney({ cp }, game.value)
const partyLevelUsed = computed(() => build.value.partyLevel ?? party.value.level ?? 1)

function setPartyLevel(level: number) {
  const l = clampLevel(level)
  build.value.partyLevel = l === party.value.level ? null : l
}

const ADJUSTMENTS: { value: Adjustment | null; label: string }[] = [
  { value: 'weak', label: 'Weak' }, { value: null, label: 'Normal' }, { value: 'elite', label: 'Elite' },
]

// ── Search ──
type ResultRow = CreatureOption & { complex: boolean }
const text = ref('')
const levelMin = ref<number | ''>('')
const levelMax = ref<number | ''>('')
const kindFilter = ref<'both' | 'creature' | 'hazard'>('both')
const rarity = ref<Rarity | ''>('')
const traitText = ref('')
const results = shallowRef<ResultRow[]>([])
const total = ref(0)
const loading = ref(false)
const compendiumEmpty = ref(false)
let run = 0
let timer: ReturnType<typeof setTimeout> | null = null

function traits() {
  return traitText.value.split(',').map(t => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean)
}

async function search() {
  const mine = ++run
  loading.value = true
  try {
    const kinds = kindFilter.value === 'both' ? (['creature', 'hazard'] as const) : [kindFilter.value]
    const num = (v: number | '') => (v === '' || !Number.isFinite(v) ? null : v)
    const pages = await Promise.all(kinds.map(kind => rulesQuery({
      kind, text: text.value.trim(), limit: 60, sort: 'level',
      levelMin: num(levelMin.value), levelMax: num(levelMax.value),
      rarities: rarity.value ? [rarity.value] : undefined, traits: traits(),
    })))
    const items = pages.flatMap(p => p.items).sort((a, b) => a.level - b.level || a.sortName.localeCompare(b.sortName)).slice(0, 60)
    const rows = await Promise.all(items.map(async e => ({ ...(await toCreatureOption(e)), complex: e.kind === 'hazard' && (e as Hazard).complex })))
    if (mine !== run) return
    results.value = rows
    total.value = pages.reduce((n, p) => n + p.total, 0)
  } finally {
    if (mine === run) loading.value = false
  }
}

watch([text, levelMin, levelMax, kindFilter, rarity, traitText], () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(search, 150)
})

function xpOf(r: ResultRow) {
  return entryXp(game.value, { level: r.level, kind: r.kind, complex: r.complex }, partyLevelUsed.value)
}

function add(rulesId: string) {
  addSlot(rulesId)
}

// ── Selection ──
const entries = shallowRef<Record<string, RulesEntity>>({})

watch(() => build.value.slots.map(s => s.rulesId).join('|'), async () => {
  const ids = [...new Set(build.value.slots.map(s => s.rulesId))].filter(id => !entries.value[id])
  if (!ids.length) return
  const found = await rulesGetMany(ids)
  entries.value = { ...entries.value, ...Object.fromEntries(found.map(e => [e.id, e])) }
}, { immediate: true })

function kindLabel(e: RulesEntity) {
  if (e.kind !== 'hazard') return 'Creature'
  return (e as Hazard).complex ? 'Complex hazard' : 'Hazard'
}

function xpEntry(slot: BuildSlot): XpEntry {
  const e = entries.value[slot.rulesId]
  return { level: e?.level ?? 0, kind: e?.kind === 'hazard' ? 'hazard' : 'creature', complex: e?.kind === 'hazard' && (e as Hazard).complex, adjustment: slot.adjustment }
}

function slotXp(slot: BuildSlot) {
  return entries.value[slot.rulesId] ? entryXp(game.value, xpEntry(slot), partyLevelUsed.value) : 0
}

const totalXp = computed(() => build.value.slots.reduce((n, s) => n + slotXp(s) * s.count, 0))

function clear() {
  if (build.value.slots.length && !confirm('Clear the selection?')) return
  clearBuild()
}

const creating = ref(false)
async function create() {
  creating.value = true
  try {
    const res = await createEncounterFromBuild(campaignId, build.value, characters.value)
    if (!res) return
    if (res.missing) alert(`${res.missing} ${res.missing === 1 ? 'entry is' : 'entries are'} no longer in the compendium and were left out.`)
    clearBuild()
    router.push(`/encounter/${res.encounterId}`)
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  const campaign = await dbApi.campaigns.get(campaignId)
  game.value = campaignGame(campaign)
  await load(campaignId)
  pace.value = await useWealth().loadTreasurePace(campaignId, party.value.level, party.value.size)
  // Start the level filter around the party, as GM Core's −4…+4 range
  if (levelMin.value === '' && levelMax.value === '') {
    levelMin.value = Math.max(-1, partyLevelUsed.value - 4)
    levelMax.value = partyLevelUsed.value + 4
  }
  const counts = await rulesCounts()
  compendiumEmpty.value = !(counts.creature ?? 0)
  search()
})
</script>

<style scoped>
.eb { flex: 1; overflow-y: auto; padding: 28px 32px 48px; }
.eb-head { margin-bottom: 20px; }
.eb-title { margin: 0 0 4px; }
.eb-sub { font-size: 13px; color: var(--text2); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.eb-sub b { color: var(--text); }
.eb-override { color: var(--accent) !important; }
.eb-link { background: none; border: none; padding: 0; color: var(--text3); font-size: 12px; text-decoration: underline; cursor: pointer; }
.eb-pace { margin-top: 4px; color: var(--text3); }
.eb-pace b { color: var(--text); }
.eb-warn { padding: 1px 6px; border-radius: 4px; font-size: 11px; color: #c9973a; border: 1px solid #c9973a66; white-space: nowrap; }
.eb-warn--dim { color: var(--text3); border-color: var(--border); }

.eb-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 20px; align-items: start; }
.eb-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.eb-panel-title { font-family: var(--fh, serif); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); }
.eb-input { width: 100%; padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg2, transparent); color: var(--text); font-size: 13px; }
.eb-name { font-size: 15px; font-family: var(--fh, serif); }
.eb-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.eb-filter { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text3); }
.eb-num { width: 52px; padding: 5px 6px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text); font-family: var(--fm); text-align: center; }
.eb-select { padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); font-size: 12px; text-transform: capitalize; }
.eb-input--traits { flex: 1; min-width: 160px; width: auto; font-size: 12px; padding: 5px 8px; }

.eb-results { max-height: calc(100vh - 300px); overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.eb-result { display: flex; align-items: center; gap: 10px; padding: 5px 6px; border-radius: 6px; }
.eb-result:hover { background: var(--surface-hi); }
.eb-thumb { width: 30px; height: 30px; border-radius: 50%; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--surface-hi); color: var(--text3); font-size: 13px; }
.eb-thumb img { width: 100%; height: 100%; object-fit: cover; }
.eb-result-info, .eb-slot-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.eb-result-name, .eb-slot-name { font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.eb-result-meta { font-size: 11px; color: var(--text3); }
.eb-slot-info .eb-warn { align-self: flex-start; margin-top: 2px; }
.eb-add, .eb-remove { width: 26px; height: 26px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--border); border-radius: 6px; color: var(--text2); cursor: pointer; }
.eb-add:hover { color: var(--text); border-color: var(--border-hi); }
.eb-remove:hover { color: var(--blood, #d04a4a); }

.eb-slot { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 8px 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; }
.eb-slot-controls { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; }
.eb-slot--missing { opacity: 0.6; }
.eb-adjust { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.eb-adjust button { padding: 3px 8px; font-size: 11px; background: transparent; border: none; color: var(--text3); cursor: pointer; }
.eb-adjust button + button { border-left: 1px solid var(--border); }
.eb-adjust button.active { background: var(--surface-hi); color: var(--text); }
.eb-stepper { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--border); border-radius: 6px; }
.eb-stepper button { width: 22px; height: 24px; background: transparent; border: none; color: var(--text2); cursor: pointer; }
.eb-stepper button:disabled { opacity: 0.35; cursor: default; }
.eb-stepper b { min-width: 22px; text-align: center; font-family: var(--fm); font-size: 13px; color: var(--text); }
.eb-slot-xp { min-width: 58px; text-align: right; font-family: var(--fm); font-size: 12px; color: var(--text2); }

.eb-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.eb-hint { font-size: 12px; color: var(--text3); margin: 0; }
.eb-empty { padding: 8px 0; }

@media (max-width: 860px) {
  .eb { padding: 20px 16px 40px; }
  .eb-cols { grid-template-columns: 1fr; }
  .eb-results { max-height: 360px; }
}
</style>
