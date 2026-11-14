<script setup lang="ts">
/**
 * A session's board: scenes, beats, clues, encounters and notes laid out
 * freely, connected, grouped in frames. Planning arranges it; running it
 * logs what happened onto it; finishing carries over what did not come up.
 */
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { MarkerType, useVueFlow, VueFlow, type Connection, type Edge, type Node, type NodeTypesObject } from '@vue-flow/core'
import { computed, markRaw, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Archive, Maximize } from 'lucide-vue-next'
import { nearestSides, PANEL_CONFIG, PANEL_ORDER, type PanelKind } from '@/domain/rules/sessionBoard'
import type { EntryOf, SessionEdge, SessionPanel } from '@/domain/schema'
import { saveEntry } from '@/data/entries'
import { entries } from '@/data/repo'
import { addEdge, addPanel, deletePanel, moveToDrawer, patchEdge, placeFromDrawer, removeEdge } from '@/data/sessions'
import AppDialog from '@/ui/components/AppDialog.vue'
import { confirmDialog, reportError } from '@/ui/dialogs'
import { useLive } from '@/ui/useLive'
import { useBoard } from './board'
import BoardDrawer from './BoardDrawer.vue'
import CaptureBar from './CaptureBar.vue'
import FinishDialog from './FinishDialog.vue'
import FrameNode from './FrameNode.vue'
import PanelEditor from './PanelEditor.vue'
import PanelNode from './PanelNode.vue'
import RecapDialog from './RecapDialog.vue'

const props = defineProps<{ campaignId: string; sessionId: string }>()
const router = useRouter()
const nodeTypes = { panel: markRaw(PanelNode), frame: markRaw(FrameNode) } as unknown as NodeTypesObject
const { screenToFlowCoordinate, fitView } = useVueFlow('session-board')

const session = useLive(async () => { const e = await entries.get(props.sessionId); return e?.type === 'session' ? e as EntryOf<'session'> : null }, undefined, [() => props.sessionId])
const board = useBoard(computed(() => session.value ?? null))
const { panels, edges, drawer, running, selected } = board
const editingId = ref<string | null>(null)
const editing = computed(() => panels.value.find(p => p.id === editingId.value) ?? null)
const side = ref<'none' | 'drawer'>('none')
const menu = ref<{ x: number; y: number; at: { x: number; y: number } } | null>(null)
const edgeEdit = ref<SessionEdge | null>(null)
const recap = ref(false)
const finishing = ref(false)
const review = ref(false)
onBeforeUnmount(() => board.flush())

const fail = (what: string) => (err: unknown) => reportError(what, err)
const abs = (p: SessionPanel) => { const f = p.parentId ? panels.value.find(x => x.id === p.parentId) : null; return f ? { x: f.x + p.x, y: f.y + p.y } : { x: p.x, y: p.y } }
/** In review, what did not come up stands out: the rest fades. */
const dim = (p: SessionPanel) => review.value && !(p.kind === 'log' || ['played', 'continued', 'done', 'revealed', 'awarded'].includes(p.status ?? ''))

const nodes = computed<Node[]>(() => {
  const s = session.value
  if (!s) return []
  const frames = new Set(panels.value.filter(p => p.kind === 'frame').map(p => p.id))
  return [...panels.value].sort((a, b) => Number(b.kind === 'frame') - Number(a.kind === 'frame')).map((p) => {
    const inFrame = p.parentId && frames.has(p.parentId)
    const base = { id: p.id, position: { x: p.x, y: p.y }, ...(inFrame ? { parentNode: p.parentId ?? undefined } : {}), style: dim(p) ? { opacity: '0.35' } : undefined }
    return p.kind === 'frame'
      ? { ...base, type: 'frame', zIndex: 0, data: { panel: p, onEdit: () => { editingId.value = p.id }, onResize: (w: number, h: number) => board.update(p.id, { w, h }, true) } }
      : { ...base, type: 'panel', zIndex: 2, data: { panel: p, session: s, board, selected: selected.value?.id === p.id, onEdit: () => { editingId.value = p.id; board.select(p.id) } } }
  })
})

const EDGE_STYLE: Record<SessionEdge['kind'], Record<string, string | number>> = {
  plan: { stroke: 'var(--text-faint)', strokeDasharray: '6 4', strokeWidth: 1.5 }, sequence: { stroke: 'var(--accent)', strokeWidth: 2.5 }, attach: { stroke: '#7cc44e', strokeDasharray: '2 3', strokeWidth: 1.5 },
}
/** A connection leaves and arrives at the sides of its two panels that face each other. */
function sidesOf(e: SessionEdge): { sourceHandle: string; targetHandle: string } {
  const a = panels.value.find(p => p.id === e.sourceId), b = panels.value.find(p => p.id === e.targetId)
  if (!a || !b) return { sourceHandle: 's-bottom', targetHandle: 't-top' }
  const [from, to] = nearestSides({ ...abs(a), w: a.w ?? PANEL_CONFIG[a.kind].width, h: a.h ?? 110 }, { ...abs(b), w: b.w ?? PANEL_CONFIG[b.kind].width, h: b.h ?? 110 })
  return { sourceHandle: `s-${from}`, targetHandle: `t-${to}` }
}
const flowEdges = computed<Edge[]>(() => {
  const ids = new Set(panels.value.map(p => p.id))
  return edges.value.filter(e => ids.has(e.sourceId) && ids.has(e.targetId)).map(e => ({
    id: e.id, source: e.sourceId, target: e.targetId, ...sidesOf(e), style: EDGE_STYLE[e.kind], data: e, zIndex: 1,
    label: e.label || (e.kind === 'sequence' ? String(board.sequenceNumbers.value.get(e.id) ?? '') : undefined),
    markerEnd: e.kind === 'attach' ? undefined : MarkerType.ArrowClosed,
  }))
})

// ── Board input ──
async function add(kind: PanelKind, at?: { x: number; y: number }) {
  const s = session.value
  if (!s) return
  const where = at ?? screenToFlowCoordinate({ x: window.innerWidth / 2 - 300, y: window.innerHeight / 2 - 160 })
  // From the toolbar: beside what is already there, not on top of it
  if (!at) while (panels.value.some(p => { const q = abs(p); return Math.abs(q.x - where.x) < 250 && Math.abs(q.y - where.y) < 120 })) where.x += 290
  const p = await addPanel({ campaignId: s.campaignId, sessionId: s.id, kind, x: Math.round(where.x), y: Math.round(where.y) }).catch(fail('Adding the panel'))
  menu.value = null
  if (p) { board.select(p.id); editingId.value = p.id }
}

function onDragStop(e: { nodes: Node[] }) {
  const frames = panels.value.filter(p => p.kind === 'frame')
  for (const n of e.nodes) {
    const p = panels.value.find(x => x.id === n.id)
    if (!p) continue
    if (p.kind === 'frame') { board.update(p.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }, true); continue }
    // Where it now stands on the board decides which frame, if any, it belongs to
    const parent = p.parentId ? frames.find(f => f.id === p.parentId) : null
    const at = { x: n.position.x + (parent?.x ?? 0), y: n.position.y + (parent?.y ?? 0) }
    const into = frames.find(f => at.x >= f.x && at.x <= f.x + (f.w ?? 520) && at.y >= f.y && at.y <= f.y + (f.h ?? 320)) ?? null
    board.update(p.id, { parentId: into?.id ?? null, x: Math.round(at.x - (into?.x ?? 0)), y: Math.round(at.y - (into?.y ?? 0)) }, true)
  }
}
const onConnect = (c: Connection) => { if (c.source && c.target) addEdge(props.sessionId, c.source, c.target, 'plan').catch(fail('Connecting')) }
const onEdgeClick = (e: { edge: Edge }) => { if (e.edge.data) edgeEdit.value = { ...(e.edge.data as SessionEdge) } }
function onPaneMenu(e: MouseEvent) { e.preventDefault(); menu.value = { x: e.clientX, y: e.clientY, at: screenToFlowCoordinate({ x: e.clientX, y: e.clientY }) } }
function onMoveEnd(e: { flowTransform: { x: number; y: number; zoom: number } }) {
  const v = { x: Math.round(e.flowTransform.x), y: Math.round(e.flowTransform.y), zoom: Math.round(e.flowTransform.zoom * 100) / 100 }
  const old = session.value?.data.viewport
  if (old && (old.x !== v.x || old.y !== v.y || old.zoom !== v.zoom)) saveEntry(props.sessionId, { data: { viewport: v } }).catch(fail('Saving the view'))
}

async function remove(p: SessionPanel) {
  if (!await confirmDialog({ title: `Delete “${p.title || PANEL_CONFIG[p.kind].label}”?`, body: p.kind === 'frame' ? 'The frame goes; the panels in it stay on the board.' : 'The panel and its connections are removed.', confirmLabel: 'Delete', danger: true })) return
  editingId.value = null
  await deletePanel(p.id).catch(fail('Deleting the panel'))
}
async function toDrawer(p: SessionPanel) { editingId.value = null; board.flush(p.id); await moveToDrawer(p.id).catch(fail('Moving the panel')) }
function place(id: string) { void placeFromDrawer(id, props.sessionId, screenToFlowCoordinate({ x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 100 })).catch(fail('Placing the panel')) }
const attachedTo = (p: SessionPanel) => edges.value.filter(e => e.kind === 'attach' && (e.sourceId === p.id || e.targetId === p.id)).map(e => panels.value.find(x => x.id === (e.sourceId === p.id ? e.targetId : e.sourceId))?.title ?? '').filter(Boolean)

// ── The session itself ──
const setData = (data: Record<string, unknown>) => saveEntry(props.sessionId, { data }).catch(fail('Saving the session'))
async function start() {
  const s = session.value
  if (!s) return
  await setData({ mode: 'running', ...(s.data.date ? {} : { date: new Date().toISOString().slice(0, 10) }) })
  recap.value = true
}
watch(running, (on) => { if (!on) review.value = false })
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { menu.value = null } }
</script>

<template>
  <div v-if="session" class="board" :class="{ wide: editing || side === 'drawer' }" @keydown="onKey">
    <header class="top">
      <button class="btn btn-ghost btn-icon" title="All sessions" @click="router.push({ name: 'sessions', params: { campaignId } })"><ArrowLeft :size="16" /></button>
      <input class="title" :value="session.name" aria-label="Session name" @change="saveEntry(sessionId, { name: ($event.target as HTMLInputElement).value })" />
      <label class="faint">No. <input class="input num" :value="session.data.number" aria-label="Session number" @change="setData({ number: ($event.target as HTMLInputElement).value.trim() })" /></label>
      <input class="input date" type="date" :value="session.data.date" aria-label="Date played" @change="setData({ date: ($event.target as HTMLInputElement).value })" />
      <div class="seg" role="group" aria-label="Mode">
        <button :class="{ on: session.data.mode === 'planning' }" @click="setData({ mode: 'planning' })">Plan</button>
        <button :class="{ on: session.data.mode === 'running' }" data-test="session-run" @click="start">Run</button>
        <button :class="{ on: session.data.mode === 'finished' }" data-test="session-finish" @click="finishing = true">{{ session.data.mode === 'finished' ? 'Finished' : 'Finish' }}</button>
      </div>
      <span class="grow" />
      <button v-if="session.data.mode !== 'planning'" class="btn" :class="{ 'btn-primary': review }" title="Fade what came up; what is left stands out" @click="review = !review">Review</button>
      <button class="btn btn-icon" title="Fit the board" @click="fitView({ padding: 0.15 })"><Maximize :size="15" /></button>
      <button class="btn" :class="{ 'btn-primary': side === 'drawer' }" data-test="open-drawer" @click="side = side === 'drawer' ? 'none' : 'drawer'; editingId = null"><Archive :size="14" /> Drawer ({{ drawer.length }})</button>
    </header>
    <div class="palette">
      <button v-for="k in PANEL_ORDER" :key="k" class="btn" :style="{ '--k': PANEL_CONFIG[k].color }" :data-add="k" @click="add(k)">+ {{ PANEL_CONFIG[k].label }}</button>
      <span class="faint hint">Right-click the board adds at the pointer · drag from a panel's lower dot to connect · double-click edits</span>
    </div>

    <div class="canvas" data-test="session-board">
      <VueFlow id="session-board" :nodes="nodes" :edges="flowEdges" :node-types="nodeTypes" :default-viewport="session.data.viewport" :min-zoom="0.15" :max-zoom="2" @node-drag-stop="onDragStop" @connect="onConnect" @edge-click="onEdgeClick" @pane-context-menu="onPaneMenu" @pane-click="menu = null; board.select(null)" @move-end="onMoveEnd" />
      <p v-if="!panels.length" class="empty-note faint">An empty board. Add a scene to start, or place something from the drawer.</p>
      <div v-if="menu" class="menu panel" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }" role="menu">
        <button v-for="k in PANEL_ORDER" :key="k" @click="add(k, menu.at)">{{ PANEL_CONFIG[k].label }}</button>
      </div>
    </div>
    <CaptureBar v-if="running" class="cap" :session="session" :target="selected" @logged="t => t && board.markLogged(t)" @clear="board.select(null)" />

    <PanelEditor v-if="editing" class="sidebar" :panel="editing" :board="board" :attached="attachedTo(editing)" @close="editingId = null; board.flush()" @remove="remove(editing)" @drawer="toDrawer(editing)" />
    <BoardDrawer v-else-if="side === 'drawer'" class="sidebar" :campaign-id="campaignId" :panels="drawer" @place="place" />

    <AppDialog v-if="edgeEdit" title="Connection" @close="edgeEdit = null">
      <label><span class="label">Kind</span><select v-model="edgeEdit.kind" class="input"><option value="plan">Planned path</option><option value="sequence">Happened next</option><option value="attach">Attached</option></select></label>
      <label><span class="label">Label</span><input v-model="edgeEdit.label" class="input" placeholder="if they fail…" /></label>
      <template #footer>
        <button class="btn btn-danger" @click="removeEdge(edgeEdit.id); edgeEdit = null">Remove</button>
        <button class="btn btn-primary" @click="patchEdge(edgeEdit.id, { kind: edgeEdit.kind, label: edgeEdit.label }); edgeEdit = null">Save</button>
      </template>
    </AppDialog>
    <RecapDialog v-if="recap" :session="session" @close="recap = false" />
    <FinishDialog v-if="finishing" :session="session" @close="finishing = false" @finished="review = true" />
  </div>
  <p v-else-if="session === null" class="empty">This session is not here. <RouterLink :to="{ name: 'sessions', params: { campaignId } }">All sessions</RouterLink></p>
</template>

<style scoped>
.board { height: 100%; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr) auto; }
.board.wide { grid-template-columns: minmax(0, 1fr) 400px; }
.top, .palette { grid-column: 1 / -1; display: flex; align-items: center; gap: .5rem; padding: .4rem .7rem; border-bottom: var(--frame); background: var(--bg-raised); flex-wrap: wrap; }
.palette { padding: .3rem .7rem; background: var(--bg-sunken); } .palette .btn { padding: .15em .6em; font-size: .82rem; border-color: color-mix(in srgb, var(--k) 55%, var(--line)); } .hint { font-size: .78rem; margin-left: .5rem; }
.title { font-family: var(--font-title); font-size: 1.1rem; background: none; border: 1px solid transparent; border-radius: var(--radius); padding: .15rem .4rem; min-width: 12rem; } .title:hover, .title:focus { border-color: var(--line-strong); outline: none; }
.num { width: 3.6rem; display: inline-block; padding: .2em .4em; } .date { width: auto; padding: .2em .4em; } .grow { flex: 1; }
.seg { display: flex; border: var(--frame); border-radius: var(--radius); overflow: hidden; } .seg button { background: none; border: 0; padding: .3rem .8rem; color: var(--text-dim); } .seg button.on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.canvas { position: relative; min-height: 0; background: var(--bg-sunken); } .canvas :deep(.vue-flow__edge-textbg) { fill: var(--bg-raised); } .canvas :deep(.vue-flow__edge-text) { fill: var(--text); font-size: 11px; }
.canvas :deep(.vue-flow__handle) { width: 9px; height: 9px; background: var(--line-strong); border-color: var(--bg); }
.empty-note { position: absolute; inset: 40% 0 auto; text-align: center; pointer-events: none; }
.menu { position: fixed; z-index: 30; display: flex; flex-direction: column; padding: .3rem; box-shadow: var(--shadow); } .menu button { background: none; border: 0; text-align: left; padding: .25rem .6rem; border-radius: var(--radius); } .menu button:hover { background: var(--bg-hover); }
.cap { grid-column: 1; } .sidebar { grid-column: 2; grid-row: 3 / 5; min-height: 0; }
</style>
