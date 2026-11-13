<script setup lang="ts">
/**
 * The encounter builder: pick creatures and hazards against an XP budget, then
 * "Create encounter" puts the party and every enemy on a new prepared
 * encounter. The selection is a draft kept with the campaign until cleared.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Minus, Plus, X } from 'lucide-vue-next'
import { adjustedName, type Adjustment } from '@/domain/rules/combat'
import { xpEntryOf } from '@/domain/rules/difficulty'
import { entryXp, MAX_LEVEL_ABOVE, rateEncounter, tooStrong, type XpEntry } from '@/domain/rules/encounter'
import { formatMoney } from '@/domain/rules/format'
import { clampLevel, isPartyMember, partyLevel } from '@/domain/rules/party'
import type { Hazard, Rarity, RulesEntity } from '@/domain/rules/types'
import { createEncounterFromBuild, emptyBuild, readBuild, type BuildSlot, type BuildState } from '@/data/encounterBuild'
import { campaignSettings, partyOf } from '@/data/party'
import { workspace } from '@/data/repo'
import { rulesCount } from '@/data/repo'
import { rulesGetMany, rulesQuery } from '@/data/rules'
import { loadWealth } from '@/data/wealth'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import { useLive } from '@/ui/useLive'
import { peek } from '@/ui/workbench'
import DifficultyMeter from './DifficultyMeter.vue'
import EncounterTabs from './EncounterTabs.vue'

const props = defineProps<{ campaignId: string }>()
const router = useRouter()

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'unique']
const build = ref<BuildState>(emptyBuild())
const ready = ref(false)
void workspace.get<unknown>(props.campaignId, 'builder.draft', null).then((raw) => { build.value = readBuild(raw); ready.value = true })
watch(build, (b) => { if (ready.value) void workspace.set(props.campaignId, 'builder.draft', JSON.parse(JSON.stringify(b))) }, { deep: true })

const settings = useLive(() => campaignSettings(props.campaignId), null)
const game = computed(() => settings.value?.game ?? 'pf2e')
const characters = useLive(() => partyOf(props.campaignId), [])
const party = computed(() => partyLevel(characters.value))
const level = computed(() => build.value.partyLevel ?? party.value.level ?? 1)
const wealth = useLive(async () => loadWealth(props.campaignId, { level: level.value, size: party.value.size, xps: characters.value.filter(isPartyMember).map(c => c.xp) }), null, [level, party])
const compendium = useLive(() => rulesCount(), 1)

// ── Search ──
const text = ref(''), levelMin = ref<number | ''>(''), levelMax = ref<number | ''>(''), kind = ref<'both' | 'creature' | 'hazard'>('both'), rarity = ref<Rarity | ''>(''), traitText = ref(''), bothGames = ref(false)
const results = shallowRef<RulesEntity[]>([])
const total = ref(0)
let run = 0
watch([text, levelMin, levelMax, kind, rarity, traitText, bothGames, game], async () => {
  const mine = ++run
  const num = (v: number | '') => (v === '' || !Number.isFinite(v) ? null : v)
  const page = await rulesQuery({
    kinds: kind.value === 'both' ? ['creature', 'hazard'] : [kind.value], text: text.value.trim(), games: bothGames.value ? [] : [game.value], limit: 60, sort: 'level',
    levelMin: num(levelMin.value), levelMax: num(levelMax.value), rarities: rarity.value ? [rarity.value] : undefined,
    traits: traitText.value.split(',').map(t => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean),
  })
  if (mine === run) { results.value = page.items; total.value = page.total }
}, { immediate: true })
/** The level range that gives XP against this party. */
function nearParty() { levelMin.value = level.value - 4; levelMax.value = level.value + MAX_LEVEL_ABOVE }
const xpOfEntry = (e: RulesEntity) => { const x = xpEntryOf(e, null); return x ? entryXp(game.value, x, level.value) : 0 }

// ── Selection ──
const entries = shallowRef<Record<string, RulesEntity>>({})
watch(() => build.value.slots.map(s => s.rulesId).join('|'), async () => {
  const ids = [...new Set(build.value.slots.map(s => s.rulesId))].filter(id => !entries.value[id])
  if (ids.length) entries.value = { ...entries.value, ...Object.fromEntries((await rulesGetMany(ids)).map(e => [e.id, e])) }
}, { immediate: true })

function add(e: RulesEntity) {
  entries.value = { ...entries.value, [e.id]: e }
  const slot = build.value.slots.find(s => s.rulesId === e.id && s.adjustment === null)
  if (slot) slot.count++
  else build.value.slots.push({ rulesId: e.id, count: 1, adjustment: null })
}
const xpEntry = (s: BuildSlot): XpEntry | null => { const e = entries.value[s.rulesId]; return e ? xpEntryOf(e, s.adjustment) : null }
const slotXp = (s: BuildSlot) => { const x = xpEntry(s); return x ? entryXp(game.value, x, level.value) : 0 }
const warn = (s: BuildSlot) => { const x = xpEntry(s); return !x ? '' : tooStrong(x, build.value.partyLevel === null ? party.value.min : level.value) ? 'far above the party' : slotXp(s) === 0 ? 'too weak to count' : '' }
const kindLabel = (e: RulesEntity) => (e.kind !== 'hazard' ? 'Creature' : (e as Hazard).complex ? 'Complex hazard' : 'Hazard')
const totalXp = computed(() => build.value.slots.reduce((n, s) => n + slotXp(s) * s.count, 0))
const rated = computed(() => ({ party: party.value, level: level.value, difficulty: { rows: [], xp: totalXp.value, unlinked: 0 }, rating: rateEncounter(game.value, totalXp.value, party.value.size), award: 0 }))
function step(i: number, by: number) { const s = build.value.slots[i]; if (!s) return; s.count += by; if (s.count <= 0) build.value.slots.splice(i, 1) }
function setLevel(v: number | null) { build.value.partyLevel = v === null || clampLevel(v) === party.value.level ? null : clampLevel(v) }

async function clear() {
  if (!build.value.slots.length || await confirmDialog({ title: 'Clear the selection?', body: 'The builder starts empty again.', confirmLabel: 'Clear' })) build.value = emptyBuild()
}
const creating = ref(false)
async function create() {
  creating.value = true
  try {
    const res = await createEncounterFromBuild(props.campaignId, build.value)
    if (res.missing) notify(`${res.missing} ${res.missing === 1 ? 'entry is' : 'entries are'} no longer in the compendium and were left out.`)
    build.value = emptyBuild()
    await router.push({ name: 'encounter', params: { campaignId: props.campaignId, encounterId: res.encounterId } })
  } catch (err) { reportError('Creating the encounter', err) } finally { creating.value = false }
}
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>Encounters</h1></div>
    <EncounterTabs :campaign-id="campaignId" />
    <div class="cols">
      <section class="find">
        <div class="row">
          <input v-model="text" class="input grow" placeholder="Search creatures and hazards…" data-test="builder-search" />
          <select v-model="kind" class="input auto" aria-label="Kind"><option value="both">Creatures and hazards</option><option value="creature">Creatures</option><option value="hazard">Hazards</option></select>
        </div>
        <div class="row">
          <label class="faint">Level <input v-model.number="levelMin" type="number" class="input num" aria-label="Lowest level" /> to <input v-model.number="levelMax" type="number" class="input num" aria-label="Highest level" /></label>
          <button class="btn" title="Levels that give XP against this party" @click="nearParty">Near the party</button>
          <select v-model="rarity" class="input auto" aria-label="Rarity"><option value="">Any rarity</option><option v-for="r in RARITIES" :key="r" :value="r">{{ r }}</option></select>
          <input v-model="traitText" class="input traits" placeholder="traits, comma-separated" aria-label="Traits" />
          <label class="faint"><input v-model="bothGames" type="checkbox" /> both games</label>
        </div>
        <p v-if="!compendium" class="faint">The compendium is empty. <RouterLink :to="{ name: 'compendium-sync' }">Sync it from Foundry</RouterLink> or import homebrew first.</p>
        <table v-else class="results">
          <tbody>
            <tr v-for="e in results" :key="e.id" :data-result="e.name">
              <td class="num lvl">{{ e.level }}</td>
              <td><button class="linkish" @click="peek({ kind: 'rules', id: e.id })">{{ e.name }}</button></td>
              <td class="faint">{{ kindLabel(e) }}{{ e.game !== game && e.game !== 'both' ? ` · ${e.game}` : '' }}</td>
              <td class="num faint">{{ xpOfEntry(e) }} XP</td>
              <td><button class="btn btn-icon" :aria-label="`Add ${e.name}`" @click="add(e)"><Plus :size="14" /></button></td>
            </tr>
          </tbody>
        </table>
        <p v-if="compendium && total > results.length" class="faint">{{ results.length }} of {{ total }}: narrow the search for the rest.</p>
        <p class="faint">Need one that does not exist? <RouterLink :to="{ name: 'compendium', query: { kind: 'creature' } }">Build a creature</RouterLink> in the compendium, then find it here.</p>
      </section>

      <section class="pick panel">
        <input v-model="build.name" class="input" placeholder="Encounter name" aria-label="Encounter name" />
        <DifficultyMeter :rated="rated" :override="build.partyLevel" @level="setLevel" />
        <p v-if="wealth?.pace" class="faint">Treasure this level: {{ formatMoney({ cp: wealth.pace.awarded }, game) }} of {{ formatMoney({ cp: wealth.pace.expected }, game) }} awarded.</p>
        <ul data-test="builder-selection">
          <li v-for="(s, i) in build.slots" :key="s.rulesId + (s.adjustment ?? '')">
            <button class="btn btn-icon" aria-label="One fewer" @click="step(i, -1)"><Minus :size="12" /></button><b class="num">{{ s.count }}</b><button class="btn btn-icon" aria-label="One more" @click="step(i, 1)"><Plus :size="12" /></button>
            <span class="name">{{ entries[s.rulesId] ? adjustedName(entries[s.rulesId]!.name, s.adjustment) : 'Not in the compendium' }}<small v-if="warn(s)" class="warn"> · {{ warn(s) }}</small></span>
            <select class="input auto" :value="s.adjustment ?? ''" aria-label="Weak or elite" @change="s.adjustment = (($event.target as HTMLSelectElement).value || null) as Adjustment | null"><option value="weak">Weak</option><option value="">Normal</option><option value="elite">Elite</option></select>
            <span class="num faint xp">{{ slotXp(s) * s.count }} XP</span>
            <button class="btn btn-ghost btn-icon" aria-label="Remove" @click="build.slots.splice(i, 1)"><X :size="13" /></button>
          </li>
        </ul>
        <p v-if="!build.slots.length" class="faint">Add creatures and hazards from the left.</p>
        <div class="row end">
          <button class="btn" :disabled="!build.slots.length && !build.name" @click="clear">Clear</button>
          <button class="btn btn-primary" :disabled="creating" data-test="create-encounter" @click="create">Create encounter</button>
        </div>
        <p class="faint">The party's tokens are placed on the left, the enemies on the right of a new prepared encounter.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cols { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, 1fr); gap: 1.2rem; align-items: start; }
.find, .pick { display: flex; flex-direction: column; gap: .6rem; } .pick { padding: .9rem; position: sticky; top: 0; }
.row { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; } .row.end { justify-content: flex-end; } .grow { flex: 1; } .auto { width: auto; }
.num.input { width: 4rem; display: inline-block; padding: .25em .4em; } .traits { width: 12rem; } p { margin: 0; }
.results { width: 100%; border-collapse: collapse; } .results td { padding: .18rem .4rem; border-bottom: var(--frame); } .lvl { color: var(--accent); width: 2rem; text-align: right; }
.linkish { background: none; border: 0; padding: 0; color: var(--text); text-align: left; } .linkish:hover { color: var(--accent); }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .3rem; } li { display: flex; align-items: center; gap: .35rem; }
.name { flex: 1; min-width: 0; } .warn { color: var(--warn); } .xp { width: 4.5rem; text-align: right; }
</style>
