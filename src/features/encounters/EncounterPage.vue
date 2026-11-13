<script setup lang="ts">
/**
 * One encounter on its map. Prepare: map, grid, walls, who is in it, how hard
 * it is. Run: the turn order beside the map, prompts at turn changes, the log.
 * Its state is in vtt/live.ts; this page is the frame around the panels.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Maximize, MonitorPlay, Plus } from 'lucide-vue-next'
import type { AreaOverlay } from '@/domain/rules/areas'
import { statLinkOf } from '@/data/encounters'
import { reopenEncounter } from '@/data/resolution'
import { storeImage } from '@/services/images'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import { activeRollContext } from '@/ui/dice'
import { peek } from '@/ui/workbench'
import ResolveDialog from './ResolveDialog.vue'
import AreaDialog from './vtt/AreaDialog.vue'
import AreaSavePrompt from './vtt/AreaSavePrompt.vue'
import ConditionsDialog from './vtt/ConditionsDialog.vue'
import type { Cell } from './vtt/engine/types'
import { areas, flushSaves, getToken, live, loadEncounter, placeActor, placeCreature, saveEncounter, type FovMode } from './vtt/live'
import LogPanel from './vtt/LogPanel.vue'
import MapCanvas from './vtt/MapCanvas.vue'
import MapMenu from './vtt/MapMenu.vue'
import { openPlayers, startPlayerSync } from './vtt/playerSync'
import PreparePanel from './vtt/PreparePanel.vue'
import QuickAdd from './vtt/QuickAdd.vue'
import { encounterRolls, targetId } from './vtt/rolls'
import TokenDialog from './vtt/TokenDialog.vue'
import { tools } from './vtt/tools'
import ToolBar from './vtt/ToolBar.vue'
import TurnOrder from './vtt/TurnOrder.vue'
import TurnPrompts from './vtt/TurnPrompts.vue'
import { keepTurn, restoreTurn, startEncounter } from './vtt/turns'

const props = defineProps<{ campaignId: string; encounterId: string }>()
const router = useRouter()

const loaded = ref<boolean | null>(null)
const canvas = ref<InstanceType<typeof MapCanvas> | null>(null)
const menu = ref<{ hit: { tokenId: string | null; wallId: string | null; areaId: string | null; cell: Cell }; x: number; y: number } | null>(null)
const editId = ref<string | null>(null)
const condId = ref<string | null>(null)
const areaId = ref<string | null>(null)
const quick = ref<{ cell: Cell; start: 'creature' | 'token' } | null>(null)
const resolving = ref(false)
const side = ref<'order' | 'log'>('order')
let stopSync: (() => void) | null = null

const enc = computed(() => live.encounter)
const mode = computed(() => (enc.value?.status === 'active' ? 'run' : enc.value?.status === 'resolved' ? 'resolved' : 'prepare'))
const selected = computed(() => getToken(live.selectedId))
const editArea = computed<AreaOverlay | undefined>(() => areas().find(a => a.id === areaId.value))
const FOV: [FovMode, string, string][] = [['gm', 'All', 'You see everything; players see what their tokens see'], ['active', 'Acting', 'Only what the acting token sees'], ['group', 'Party', 'What the players\' tokens see together']]

async function load(id: string) {
  loaded.value = await loadEncounter(id).catch((err) => { reportError('Loading the encounter', err); return false })
  if (!loaded.value) return
  restoreTurn()
  tools.tool = 'select'
  stopSync = startPlayerSync(props.campaignId)
}
onMounted(() => { activeRollContext.value = encounterRolls; window.addEventListener('keydown', onKey); void load(props.encounterId) })
watch(() => props.encounterId, (id) => { stopSync?.(); void load(id) })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  activeRollContext.value = null
  stopSync?.()
  void flushSaves()
})

function run() { if (mode.value === 'prepare') { startEncounter(); side.value = 'order' } }
function prepare() { if (mode.value === 'run') saveEncounter({ status: 'prepared' }) }
async function reopen() {
  if (!enc.value || !await confirmDialog({ title: 'Re-open this encounter?', body: 'Its XP award is undone and its loot comes back from the stash as far as it is still there. Level-ups that followed stay.', confirmLabel: 'Re-open' })) return
  try {
    const short = await reopenEncounter(enc.value.id)
    await load(enc.value.id)
    if (short.names.length || short.cp) notify(`Could not take back: ${[...short.names, short.cp ? 'some coins' : ''].filter(Boolean).join(', ')}.`)
  } catch (err) { reportError('Re-opening the encounter', err) }
}

function rename(e: Event) { const name = (e.target as HTMLInputElement).value.trim(); if (name) saveEncounter({ name }) }
function openStat() {
  const t = selected.value, link = t ? statLinkOf(t) : null
  if (link) peek({ kind: 'rules', id: link.rulesId, adjustment: link.adjustment })
  else if (t?.ref.kind === 'entry') peek({ kind: 'entry', id: t.ref.entryId })
}

async function onDrop(e: DragEvent) {
  const at = canvas.value?.cellAt(e.clientX, e.clientY) ?? { col: 5, row: 5 }
  const actorId = e.dataTransfer?.getData('application/x-startome-actor'), rulesId = e.dataTransfer?.getData('application/x-startome-rules')
  const file = [...(e.dataTransfer?.files ?? [])].find(f => f.type.startsWith('image/'))
  try {
    keepTurn()
    if (actorId) { const { token, unlinked } = await placeActor(actorId, at.col, at.row); if (token && unlinked) editId.value = token.id }
    else if (rulesId) await placeCreature(rulesId, at.col, at.row)
    else if (file) saveEncounter({ map: await storeImage(file) })
  } catch (err) { reportError('Dropping onto the map', err) }
}

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
  if (typing || document.querySelector('dialog[open]')) return
  if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey && mode.value === 'run') { e.preventDefault(); quick.value = { cell: { col: 6, row: 6 }, start: 'creature' } }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && tools.tool === 'wall') { if (canvas.value?.undoWall()) e.preventDefault() }
  else if (e.key === 'Escape' && tools.tool !== 'select') tools.tool = 'select'
}
</script>

<template>
  <div v-if="loaded && enc" class="enc" :class="mode">
    <header class="top">
      <button class="btn btn-ghost btn-icon" title="All encounters" @click="router.push({ name: 'encounters', params: { campaignId } })"><ArrowLeft :size="16" /></button>
      <input class="title" :value="enc.name" aria-label="Encounter name" @change="rename" />
      <div v-if="mode !== 'resolved'" class="seg" role="group" aria-label="Mode">
        <button :class="{ on: mode === 'prepare' }" data-test="mode-prepare" @click="prepare">Prepare</button>
        <button :class="{ on: mode === 'run' }" data-test="mode-run" @click="run">Run</button>
      </div>
      <span v-else class="chip">Resolved{{ enc.xpAwarded != null ? ` · ${enc.xpAwarded} XP each` : '' }}</span>
      <div v-if="mode === 'run' && enc.fovEnabled" class="seg" role="group" aria-label="Sight">
        <button v-for="[m, label, hint] in FOV" :key="m" :class="{ on: live.fovMode === m }" :title="hint" @click="live.fovMode = m">{{ label }}</button>
      </div>
      <span class="grow" />
      <button v-if="mode !== 'resolved'" class="btn" title="Add a creature or token (A while running)" data-test="quick-add" @click="quick = { cell: { col: 6, row: 6 }, start: 'creature' }"><Plus :size="14" /> Add</button>
      <button class="btn btn-icon" title="Fit the map to the window" @click="canvas?.fit()"><Maximize :size="15" /></button>
      <button class="btn" title="Open the players' window" data-test="open-players" @click="openPlayers"><MonitorPlay :size="15" /> Players</button>
      <button v-if="mode !== 'resolved'" class="btn" data-test="resolve" @click="resolving = true">Resolve…</button>
      <button v-else class="btn" data-test="reopen" @click="reopen">Re-open</button>
    </header>

    <div class="stage" @dragover.prevent @drop.prevent="onDrop">
      <MapCanvas ref="canvas" @context="(hit, x, y) => (menu = { hit, x, y })" />
      <ToolBar />
      <TurnPrompts v-if="mode === 'run'" />
    </div>

    <aside class="side">
      <PreparePanel v-if="mode === 'prepare'" @unlinked="editId = $event" />
      <div v-if="mode !== 'prepare'" class="tabs"><button :class="{ on: side === 'order' }" @click="side = 'order'">Turn order</button><button :class="{ on: side === 'log' }" data-test="tab-log" @click="side = 'log'">Log ({{ live.log.length }})</button></div>
      <LogPanel v-if="mode !== 'prepare' && side === 'log'" class="fill" />
      <TurnOrder v-else class="fill" :running="mode === 'run'" @edit="editId = $event" @conditions="condId = $event" />
      <div v-if="selected" class="sel" data-test="selected-token">
        <b>{{ selected.name }}</b>
        <span class="num dim"><template v-if="selected.hp.max !== null">{{ selected.hp.current }}/{{ selected.hp.max }} HP</template><template v-if="selected.ac !== null"> · AC {{ selected.ac }}</template></span>
        <span class="grow" />
        <button v-if="statLinkOf(selected) || selected.ref.kind === 'entry'" class="btn" data-test="open-stat" @click="openStat">{{ statLinkOf(selected) ? 'Stat block' : 'NPC' }}</button>
        <button class="btn" @click="editId = selected.id">Edit</button>
        <label class="target">Attacks target
          <select v-model="targetId" class="input" aria-label="Target"><option :value="null">nobody</option><option v-for="t in live.tokens.filter(x => x.id !== selected!.id)" :key="t.id" :value="t.id">{{ t.name }}{{ t.ac !== null ? ` (AC ${t.ac})` : '' }}</option></select>
        </label>
      </div>
    </aside>

    <MapMenu v-if="menu" v-bind="menu" @close="menu = null" @edit="editId = $event" @conditions="condId = $event" @area="areaId = $event" @add="(cell, kind) => (quick = { cell, start: kind })" />
    <TokenDialog v-if="editId && getToken(editId)" :key="editId" :token="getToken(editId)!" @close="editId = null" @conditions="condId = editId; editId = null" />
    <ConditionsDialog v-if="condId && getToken(condId)" :key="condId" :token="getToken(condId)!" @close="condId = null" />
    <AreaDialog v-if="editArea" :key="editArea.id" :area="editArea" @close="areaId = null" />
    <AreaSavePrompt />
    <QuickAdd v-if="quick" :cell="quick.cell" :start="quick.start" @close="quick = null" />
    <ResolveDialog v-if="resolving" :encounter-id="enc.id" @close="resolving = false" @resolved="load(enc.id)" />
  </div>
  <p v-else-if="loaded === false" class="empty">This encounter is gone. <RouterLink :to="{ name: 'encounters', params: { campaignId } }">All encounters</RouterLink></p>
</template>

<style scoped>
.enc { height: 100%; display: grid; grid-template-columns: minmax(0, 1fr) 340px; grid-template-rows: auto minmax(0, 1fr); }
.top { grid-column: 1 / -1; display: flex; align-items: center; gap: .5rem; padding: .4rem .7rem; border-bottom: var(--frame); background: var(--bg-raised); }
.title { font-family: var(--font-title); font-size: 1.1rem; background: none; border: 1px solid transparent; border-radius: var(--radius); padding: .15rem .4rem; min-width: 12rem; }
.title:hover, .title:focus { border-color: var(--line-strong); outline: none; }
.grow { flex: 1; }
.seg, .tabs { display: flex; border: var(--frame); border-radius: var(--radius); overflow: hidden; }
.seg button, .tabs button { background: none; border: 0; padding: .3rem .8rem; color: var(--text-dim); }
.seg button.on, .tabs button.on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.stage { position: relative; min-width: 0; min-height: 0; }
.side { display: flex; flex-direction: column; min-height: 0; border-left: var(--frame); background: var(--bg-raised); overflow: hidden; }
.side .tabs { border-width: 0 0 1px; border-radius: 0; } .side .tabs button { flex: 1; }
.fill { flex: 1; min-height: 8rem; } .prepare .side { overflow: auto; } .prepare .fill { flex: none; }
.sel { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; padding: .5rem .6rem; border-top: var(--frame); background: var(--bg-sunken); }
.target { width: 100%; display: flex; align-items: center; gap: .4rem; font-size: .82rem; color: var(--text-dim); white-space: nowrap; } .target .input { padding: .2em .4em; }
</style>
