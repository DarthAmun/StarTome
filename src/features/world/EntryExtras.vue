<script setup lang="ts">
/** What only some entry types have: a table's rows and its roll, the player-character switch, a quest's objectives, a region's shape. */
import { computed, ref } from 'vue'
import { Dices, Map as MapIcon, Plus, X } from 'lucide-vue-next'
import { evaluateFormula } from '@/domain/formula'
import { taskProgress } from '@/domain/markdownBlocks'
import type { Entry } from '@/domain/schema'
import { addCharacterFor, characterOfEntry, removeCharacter } from '@/data/party'
import { relationsOf, type Relations } from '@/data/relations'
import { campaign, peek } from '@/ui/workbench'
import NpcProgression from './NpcProgression.vue'
import { sessionPanelsOf } from '@/data/repo'
import { confirmDialog } from '@/ui/dialogs'
import { renderMarkdown } from '@/ui/markdown'
import { useLive } from '@/ui/useLive'

const props = defineProps<{ entry: Entry }>()
const emit = defineEmits<{ change: [data: Record<string, unknown>]; map: [] }>()

// ── Random table ──
const rows = computed(() => (props.entry.type === 'random-table' ? props.entry.data.rows : []))
const rolled = ref<{ n: number; text: string } | null>(null)
function setRow(i: number, patch: Partial<{ min: number; max: number; result: string }>) {
  emit('change', { rows: rows.value.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
}
function addRow() {
  const last = rows.value[rows.value.length - 1]
  emit('change', { rows: [...rows.value, { min: (last?.max ?? 0) + 1, max: (last?.max ?? 0) + 1, result: '' }] })
}
function roll() {
  if (props.entry.type !== 'random-table') return
  const n = evaluateFormula(props.entry.data.die)
  rolled.value = { n, text: rows.value.find(r => n >= r.min && n <= r.max)?.result ?? 'No row for that number.' }
}

// ── NPC in the party ──
const character = useLive(() => characterOfEntry(props.entry.id), undefined, [() => props.entry.id])
async function togglePc() {
  if (!character.value) { await addCharacterFor(props.entry); return }
  if (await confirmDialog({ title: `Remove ${props.entry.name} from the party?`, body: 'The NPC entry stays. Their items and coins go to the party stash.', confirmLabel: 'Remove' })) await removeCharacter(character.value.id)
}

// ── What links say: an NPC's factions, places and last session; a faction's members ──
const relations = useLive<Relations | null>(() => (props.entry.type === 'npc' || props.entry.type === 'faction' ? relationsOf(props.entry) : Promise.resolve(null)), null, [() => props.entry.id, () => props.entry.updatedAt])

// ── Quest objectives, region shape, session panels ──
const progress = computed(() => (props.entry.type === 'quest' ? taskProgress(props.entry.body) : null))
const polygon = computed(() => {
  if (props.entry.type !== 'region' || props.entry.data.polygon.length < 3) return null
  const pts = props.entry.data.polygon
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const minX = Math.min(...xs), minY = Math.min(...ys)
  const scale = Math.min(180 / (Math.max(...xs) - minX || 1), 80 / (Math.max(...ys) - minY || 1))
  return pts.map(p => `${10 + (p.x - minX) * scale},${10 + (p.y - minY) * scale}`).join(' ')
})
const panels = useLive(async () => (props.entry.type === 'session' ? sessionPanelsOf(props.entry.id) : []), [], [() => props.entry.id])
</script>

<template>
  <details v-if="entry.type === 'npc' && (entry.data.class || entry.data.class2)" class="extra">
    <summary class="eyebrow">Progression</summary>
    <NpcProgression :ancestry="entry.data.ancestry" :classes="[entry.data.class, entry.data.class2]" :level="entry.data.level" :game="campaign?.game ?? 'pf2e'" />
  </details>
  <div v-if="entry.type === 'npc'" class="extra line">
    <label class="check"><input type="checkbox" :checked="!!character" @change.prevent="togglePc" /> Player character</label>
    <span v-if="character" class="faint">In the party at level {{ character.level }}</span>
    <template v-if="relations">
      <span v-if="relations.factions.length" class="rel"><span class="eyebrow">Faction</span><button v-for="f in relations.factions" :key="f.id" class="chip" @click="peek({ kind: 'entry', id: f.id })">{{ f.name }}</button></span>
      <span v-if="relations.locations.length" class="rel"><span class="eyebrow">Found at</span><button v-for="l in relations.locations" :key="l.id" class="chip" @click="peek({ kind: 'entry', id: l.id })">{{ l.name }}</button></span>
      <span class="rel"><span class="eyebrow">Last seen</span>
        <button v-if="relations.lastSession" class="chip" @click="peek({ kind: 'entry', id: relations.lastSession.id })">{{ relations.lastSession.data.number ? `Session ${relations.lastSession.data.number}` : relations.lastSession.name }}</button>
        <span v-else class="faint">not yet met</span></span>
    </template>
  </div>

  <div v-else-if="entry.type === 'faction' && relations?.members.length" class="extra line">
    <span class="rel"><span class="eyebrow">{{ relations.members.length }} {{ relations.members.length === 1 ? 'member' : 'members' }}</span><button v-for="m in relations.members" :key="m.id" class="chip" @click="peek({ kind: 'entry', id: m.id })">{{ m.name }}</button></span>
  </div>

  <div v-else-if="entry.type === 'quest' && progress" class="extra line">
    <span class="eyebrow">Objectives</span>
    <div class="bar"><i :style="{ width: `${(progress.done / progress.total) * 100}%` }" /></div>
    <span class="num">{{ progress.done }}/{{ progress.total }}</span>
  </div>

  <div v-else-if="entry.type === 'location'" class="extra line">
    <button class="btn" @click="emit('map')"><MapIcon :size="14" /> {{ entry.data.map ? 'Open the map' : 'Open the map page (no map image yet)' }}</button>
  </div>

  <div v-else-if="entry.type === 'region'" class="extra line">
    <svg v-if="polygon" width="200" height="100"><polygon :points="polygon" :fill="`${entry.data.color}44`" :stroke="entry.data.color" stroke-width="2" /></svg>
    <span class="faint">{{ entry.data.mapEntryId ? 'Drawn on a map.' : 'Not on a map yet. Open a location’s map and choose “Place a region” to draw it there.' }}</span>
  </div>

  <div v-else-if="entry.type === 'random-table'" class="extra">
    <div class="table">
      <div class="thead eyebrow"><span>Min</span><span>Max</span><span>Result</span><span /></div>
      <div v-for="(r, i) in rows" :key="i" class="trow" :class="{ hit: rolled && rolled.n >= r.min && rolled.n <= r.max }">
        <input class="input num" type="number" :value="r.min" aria-label="Min" @change="setRow(i, { min: Number(($event.target as HTMLInputElement).value) })" />
        <input class="input num" type="number" :value="r.max" aria-label="Max" @change="setRow(i, { max: Number(($event.target as HTMLInputElement).value) })" />
        <input class="input" :value="r.result" placeholder="Result… {{ links work" aria-label="Result" @change="setRow(i, { result: ($event.target as HTMLInputElement).value })" />
        <button class="btn btn-ghost btn-icon" title="Remove the row" @click="emit('change', { rows: rows.filter((_r, j) => j !== i) })"><X :size="14" /></button>
      </div>
    </div>
    <div class="line">
      <button class="btn" @click="addRow"><Plus :size="14" /> Row</button>
      <button class="btn btn-primary" :disabled="!rows.length" @click="roll"><Dices :size="14" /> Roll {{ entry.data.die }}</button>
      <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown -->
      <span v-if="rolled" class="result"><span class="num">{{ rolled.n }}</span> <span class="prose" v-html="renderMarkdown(rolled.text)" /></span>
    </div>
  </div>

  <div v-else-if="entry.type === 'session'" class="extra">
    <p class="faint">The session board (scenes, capture, recap) arrives with the Sessions phase. Its panels, as imported:</p>
    <div v-for="p in panels" :key="p.id" class="panel-line"><span class="eyebrow">{{ p.kind }}{{ p.status ? ` · ${p.status}` : '' }}</span> {{ p.title || p.body.slice(0, 80) }}</div>
  </div>
</template>

<style scoped>
.extra { margin-bottom: 1rem; }
.line { display: flex; align-items: center; gap: .8rem; flex-wrap: wrap; }
.check { display: flex; align-items: center; gap: .5rem; }
.rel { display: inline-flex; align-items: center; gap: .35rem; flex-wrap: wrap; }
.rel .chip { background: none; cursor: pointer; }
.rel .chip:hover { border-color: var(--accent); color: var(--accent); }
.bar { flex: 1; max-width: 220px; height: 6px; background: var(--bg-sunken); border: var(--frame); border-radius: 99px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--accent); }
.table { margin-bottom: .6rem; }
.thead, .trow { display: grid; grid-template-columns: 64px 64px 1fr 30px; gap: .4rem; align-items: center; margin-bottom: .3rem; }
.trow.hit .input { border-color: var(--accent); }
.result { display: inline-flex; gap: .6rem; align-items: baseline; }
.result .num { color: var(--accent); font-size: 1.2rem; }
.result :deep(p) { margin: 0; }
.panel-line { padding: .2rem 0; border-bottom: var(--frame); }
</style>
