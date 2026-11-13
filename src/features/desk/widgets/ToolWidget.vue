<script setup lang="ts">
/** The Desk's tools in one place: each kind is small, and they share how they look. */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { GameId } from '@/domain/game'
import { builtinConditions } from '@/domain/rules/conditions'
import { adjustDc, clampDcLevel, DC_STEPS, levelDc, PROFICIENCIES, SIMPLE_DCS } from '@/domain/rules/dcs'
import { generateFullName, pick, type NameGender } from '@/domain/rules/nameGenerator'
import type { RulesEntity } from '@/domain/rules/types'
import { encounters } from '@/data/encounters'
import { createEntry, saveEntry } from '@/data/entries'
import { workspace } from '@/data/repo'
import { rulesFindByName, rulesGet, rulesNameList, rulesSearch } from '@/data/rules'
import { notify } from '@/ui/dialogs'
import { useLive } from '@/ui/useLive'
import { peek } from '@/ui/workbench'
import type { DeskWidget, ToolKind } from '../desk'

const props = defineProps<{ widget: DeskWidget; campaignId: string; game: GameId; partyLevel: number | null }>()
const emit = defineEmits<{ config: [config: Record<string, unknown>] }>()
const router = useRouter()
const kind = computed(() => props.widget.kind as ToolKind)

// Scratchpad: one per campaign, kept apart from the layout so clearing the board keeps it
const pad = ref('')
let padTimer: ReturnType<typeof setTimeout> | null = null
if (props.widget.kind === 'scratchpad') void workspace.get<string>(props.campaignId, 'desk.scratchpad', '').then((t) => { pad.value = typeof t === 'string' ? t : '' })
function savePad() { if (padTimer) clearTimeout(padTimer); padTimer = setTimeout(() => void workspace.set(props.campaignId, 'desk.scratchpad', pad.value), 400) }

const open = useLive(async () => (props.widget.kind === 'encounter-link' ? (await encounters.ofCampaign(props.campaignId)).filter(e => e.status !== 'resolved') : []), [], [() => props.campaignId])
const conditions = computed(() => builtinConditions(props.game))
async function condition(name: string) { const e = await rulesFindByName('condition', name, props.game); if (e) peek({ kind: 'rules', id: e.id }); else notify('Sync the compendium for the full rules text.') }

// DCs
const level = ref(props.partyLevel ?? 1)
watch(() => props.partyLevel, (l) => { if (l !== null) level.value = l })
const dc = computed(() => levelDc(clampDcLevel(Number(level.value) || 0), props.game))

// Timer: a stopwatch, or a countdown from the minutes given
const elapsed = ref(0), running = ref(false), minutes = ref<number | null>(null)
let tick: ReturnType<typeof setInterval> | null = null
function toggleTimer() { running.value = !running.value; if (tick) clearInterval(tick); tick = running.value ? setInterval(() => { elapsed.value++ }, 1000) : null }
function resetTimer() { elapsed.value = 0; if (running.value) toggleTimer() }
const shown = computed(() => { const total = minutes.value ? Math.max(0, minutes.value * 60 - elapsed.value) : elapsed.value; return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}` })
const over = computed(() => !!minutes.value && elapsed.value >= minutes.value * 60)
onUnmounted(() => { if (tick) clearInterval(tick); if (padTimer) { clearTimeout(padTimer); void workspace.set(props.campaignId, 'desk.scratchpad', pad.value) } })

// Compendium
const query = ref('')
const hits = useLive(async () => (query.value.trim().length >= 2 ? rulesSearch(query.value, 12, [props.game]) : [] as RulesEntity[]), [], [query])
const pinned = useLive(async () => (props.widget.rulesId ? (await rulesGet(props.widget.rulesId)) ?? null : null), null, [() => props.widget.rulesId])

// NPC generator
const gender = ref<NameGender | ''>(''), ancestry = ref(''), cls = ref('')
const ancestries = useLive(async () => (props.widget.kind === 'npc-generator' ? (await rulesNameList('ancestry', [props.game])).map(a => a.name) : []), [])
const classes = useLive(async () => (props.widget.kind === 'npc-generator' ? (await rulesNameList('class', [props.game])).map(a => a.name) : []), [])
const npc = ref<{ name: string; ancestry: string; cls: string; gender: string } | null>(null)
function generate() {
  const g = gender.value || pick<NameGender>(['male', 'female', 'neutral'])
  const a = ancestry.value || (ancestries.value.length ? pick(ancestries.value) : 'Human'), c = cls.value || (classes.value.length ? pick(classes.value) : '')
  const n = generateFullName(g, a)
  npc.value = { name: `${n.first} ${n.last}`, ancestry: a, cls: c, gender: g }
}
async function keepNpc() {
  if (!npc.value) return
  const e = await createEntry(props.campaignId, 'npc', npc.value.name)
  await saveEntry(e.id, { data: { ancestry: npc.value.ancestry, class: npc.value.cls } })
  peek({ kind: 'entry', id: e.id })
}

// Weather: your own list, rolled or picked
const weather = computed(() => ((props.widget.config?.conditions ?? []) as { name: string }[]).filter(c => c && typeof c.name === 'string'))
const newWeather = ref('')
const setWeather = (patch: Record<string, unknown>) => emit('config', { ...(props.widget.config ?? {}), ...patch })
function addWeather() { if (newWeather.value.trim()) { setWeather({ conditions: [...weather.value, { name: newWeather.value.trim() }] }); newWeather.value = '' } }
</script>

<template>
  <textarea v-if="kind === 'scratchpad'" v-model="pad" class="pad" placeholder="Notes for tonight…" aria-label="Scratchpad" @input="savePad" />

  <div v-else-if="kind === 'encounter-link'" class="list">
    <button v-for="e in open" :key="e.id" @click="router.push({ name: 'encounter', params: { campaignId, encounterId: e.id } })"><b>{{ e.name }}</b> <span class="faint">{{ e.status === 'active' ? `running · round ${e.turn.round}` : 'prepared' }}</span></button>
    <p v-if="!open.length" class="faint">No encounter is prepared or running.</p>
  </div>

  <div v-else-if="kind === 'conditions-grid'" class="chips"><button v-for="c in conditions" :key="c.name" class="chip" :style="{ borderColor: c.color }" :title="c.desc" @click="condition(c.name)">{{ c.name }}</button></div>

  <div v-else-if="kind === 'dc-table'" class="dc">
    <label>Level <input v-model.number="level" type="number" min="-1" max="25" class="input num" aria-label="Level for the DC" /> <b class="num big" data-test="level-dc">DC {{ dc }}</b></label>
    <div class="grid"><span v-for="s in DC_STEPS" :key="s.key"><i>{{ s.label }}</i> <b class="num">{{ adjustDc(dc, s.key) }}</b></span></div>
    <div class="grid simple"><span v-for="p in PROFICIENCIES" :key="p"><i>{{ p }}</i> <b class="num">{{ SIMPLE_DCS[p] }}</b></span></div>
  </div>

  <div v-else-if="kind === 'timer'" class="timer">
    <b class="num clock" :class="{ over }">{{ shown }}</b>
    <div class="row"><button class="btn btn-primary" @click="toggleTimer">{{ running ? 'Pause' : 'Start' }}</button><button class="btn" @click="resetTimer">Reset</button>
      <label class="faint">count down <input v-model.number="minutes" type="number" min="0" class="input num" placeholder="min" aria-label="Minutes to count down" /></label></div>
  </div>

  <div v-else-if="kind === 'rules-lookup'" class="list">
    <input v-model="query" class="input" placeholder="Look up a rule, item, creature…" aria-label="Compendium lookup" />
    <button v-for="h in hits" :key="h.id" @click="peek({ kind: 'rules', id: h.id })"><b>{{ h.name }}</b> <span class="faint">{{ h.kind }}{{ h.level ? ` ${h.level}` : '' }}</span></button>
  </div>

  <div v-else-if="kind === 'rules-entry'" class="list">
    <button v-if="pinned" @click="peek({ kind: 'rules', id: pinned.id })"><b>{{ pinned.name }}</b> <span class="faint">{{ pinned.kind }} {{ pinned.level }}</span></button>
    <p v-else class="faint">Not in the compendium.</p>
  </div>

  <div v-else-if="kind === 'npc-generator'" class="gen">
    <div class="row">
      <select v-model="gender" class="input" aria-label="Gender"><option value="">Any</option><option value="female">Female</option><option value="male">Male</option><option value="neutral">Neutral</option></select>
      <input v-model="ancestry" class="input" list="desk-ancestries" placeholder="Any ancestry" aria-label="Ancestry" /><datalist id="desk-ancestries"><option v-for="a in ancestries" :key="a" :value="a" /></datalist>
      <input v-model="cls" class="input" list="desk-classes" placeholder="Any class" aria-label="Class" /><datalist id="desk-classes"><option v-for="c in classes" :key="c" :value="c" /></datalist>
    </div>
    <div class="row"><button class="btn btn-primary" data-test="npc-generate" @click="generate">Generate</button><button v-if="npc" class="btn" @click="keepNpc">Keep as an NPC entry</button></div>
    <p v-if="npc" class="npc" data-test="npc-result"><b>{{ npc.name }}</b><br /><span class="dim">{{ [npc.gender, npc.ancestry, npc.cls].filter(Boolean).join(' · ') }}</span></p>
  </div>

  <div v-else-if="kind === 'weather'" class="gen">
    <p v-if="widget.config?.current" class="npc"><b>{{ widget.config.current }}</b></p>
    <div class="chips"><button v-for="c in weather" :key="c.name" class="chip" :class="{ on: widget.config?.current === c.name }" @click="setWeather({ current: c.name })" @contextmenu.prevent="setWeather({ conditions: weather.filter(x => x.name !== c.name) })">{{ c.name }}</button></div>
    <div class="row"><button class="btn btn-primary" :disabled="!weather.length" @click="setWeather({ current: pick(weather).name })">Roll</button><input v-model="newWeather" class="input" placeholder="Add weather… (right-click one to remove)" @keydown.enter="addWeather" /></div>
  </div>
</template>

<style scoped>
.pad { width: 100%; height: 100%; resize: none; background: none; border: 0; color: var(--text); font: inherit; outline: none; }
.list { display: flex; flex-direction: column; gap: 2px; } .list button { background: none; border: 0; text-align: left; padding: .25rem .4rem; border-radius: var(--radius); } .list button:hover { background: var(--bg-hover); } p { margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: .3rem; } .chips .chip { background: none; cursor: pointer; } .chips .chip:hover, .chips .chip.on { background: var(--accent-soft); color: var(--text); }
.num.input { width: 4.2rem; display: inline-block; padding: .2em .4em; } .big { font-size: 1.3rem; color: var(--accent); margin-left: .6rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: .1rem .8rem; margin-top: .5rem; font-size: .86rem; } .grid span { display: flex; justify-content: space-between; } .grid i { font-style: normal; color: var(--text-dim); text-transform: capitalize; } .simple { border-top: var(--frame); padding-top: .4rem; }
.timer { display: flex; flex-direction: column; gap: .5rem; align-items: flex-start; } .clock { font-size: 2.4rem; line-height: 1; } .clock.over { color: var(--danger); }
.row { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; } .gen { display: flex; flex-direction: column; gap: .5rem; } .gen .row .input { flex: 1; min-width: 6rem; } .npc b { font-size: 1.15rem; font-family: var(--font-title); }
</style>
