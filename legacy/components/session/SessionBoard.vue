<template>
    <div class="sb">
        <!-- Palette -->
        <div class="sb-toolbar">
            <button
                v-for="k in PANEL_KIND_ORDER"
                :key="k"
                class="sb-add"
                :style="{ '--kind': PANEL_KINDS[k].color }"
                :title="`Add ${PANEL_KINDS[k].label}`"
                @click="addAtCenter(k)"
            >
                <OhVueIcon :name="PANEL_KINDS[k].icon" scale="0.75" />
                <span>{{ PANEL_KINDS[k].label }}</span>
            </button>
            <span class="sb-spacer" />
            <AppTooltip v-if="mode === 'finished'" text="Carry unused prep over to the next session or the drawer">
              <button class="sb-tool" @click="openFinish()">
                  <OhVueIcon name="md-importexport" scale="0.8" /> Review
              </button>
            </AppTooltip>
            <AppTooltip v-if="running" text="What the players should know from last session">
              <button class="sb-tool" @click="$emit('recap')">
                  <OhVueIcon name="md-history" scale="0.8" /> Recap
              </button>
            </AppTooltip>
            <AppTooltip text="Party: Perception, saves, hero points">
              <button class="sb-tool" :class="{ active: showParty }" @click="toggleParty">
                  <OhVueIcon name="gi-meeple-group" scale="0.8" /> Party
              </button>
            </AppTooltip>
            <AppTooltip text="Fit everything into view">
              <button class="sb-tool" @click="fit()">
                  <OhVueIcon name="md-fitscreen" scale="0.8" /> Fit
              </button>
            </AppTooltip>
            <AppTooltip text="Unused panels of this campaign">
              <button class="sb-tool" :class="{ active: showDrawer }" @click="showDrawer = !showDrawer">
                  <OhVueIcon name="md-folder" scale="0.8" /> Drawer
                  <span v-if="board.drawer.value.length" class="sb-count">{{ board.drawer.value.length }}</span>
              </button>
            </AppTooltip>
        </div>

        <div class="sb-body">
            <!-- Campaign drawer -->
            <aside v-if="showDrawer" class="sb-drawer">
                <div class="sb-drawer-head">
                    <span class="sb-drawer-title">Drawer</span>
                    <span class="sb-drawer-hint">Drag onto the board</span>
                </div>
                <input v-model="drawerQuery" class="sb-drawer-search" :placeholder="inspire ? 'Search scenes in other campaigns…' : 'Search text or tag…'" />
                <div class="sb-drawer-scope">
                    <button :class="{ on: !inspire }" @click="inspire = false">This campaign</button>
                    <button :class="{ on: inspire }" title="Scenes from your other campaigns, for inspiration" @click="inspire = true">Other campaigns</button>
                </div>
                <div v-if="inspire" class="sb-drawer-list">
                    <div v-for="r in inspireResults" :key="r.panel.id" class="sb-drawer-item" :style="{ '--kind': PANEL_KINDS.scene.color }">
                        <div class="sb-drawer-item-head">
                            <OhVueIcon :name="PANEL_KINDS.scene.icon" scale="0.65" />
                            <span>{{ r.campaign }}</span>
                            <span class="sb-spacer" />
                            <button class="sb-drawer-place" :disabled="copied.has(r.panel.id!)" title="Copy into this campaign's drawer" @click="copyScene(r)">
                                {{ copied.has(r.panel.id!) ? 'Copied' : 'Copy' }}
                            </button>
                        </div>
                        <div class="sb-drawer-item-title">{{ r.panel.title || 'Untitled' }}</div>
                        <div v-if="r.panel.content" class="sb-drawer-item-text">{{ snippet(r.panel.content) }}</div>
                    </div>
                    <p v-if="!inspireResults.length" class="sb-drawer-empty">
                        {{ drawerQuery.trim().length < 2 ? 'Type at least two letters to search the scenes of your other campaigns.' : 'No scenes match.' }}
                    </p>
                </div>
                <template v-else>
                <div class="sb-drawer-kinds">
                    <button
                        v-for="k in drawerKinds"
                        :key="k"
                        :class="{ on: drawerKind === k }"
                        :style="{ '--kind': PANEL_KINDS[k].color }"
                        @click="drawerKind = drawerKind === k ? null : k"
                    >{{ PANEL_KINDS[k].label }}</button>
                </div>
                <div class="sb-drawer-list">
                    <div
                        v-for="p in drawerItems"
                        :key="p.id"
                        class="sb-drawer-item"
                        :style="{ '--kind': PANEL_KINDS[p.kind].color }"
                        draggable="true"
                        @dragstart="onDrawerDragStart($event, p.id)"
                    >
                        <div class="sb-drawer-item-head">
                            <OhVueIcon :name="PANEL_KINDS[p.kind].icon" scale="0.65" />
                            <span>{{ PANEL_KINDS[p.kind].label }}</span>
                            <span class="sb-spacer" />
                            <button class="sb-drawer-place" title="Place on this board" @click="placeAtCenter(p.id)">Place</button>
                            <button class="sb-drawer-del" title="Delete for good" @click="removeFromDrawer(p)"><OhVueIcon name="md-delete" scale="0.6" /></button>
                        </div>
                        <div class="sb-drawer-item-title">{{ p.title || 'Untitled' }}</div>
                        <div v-if="p.content" class="sb-drawer-item-text">{{ snippet(p.content) }}</div>
                        <div class="sb-drawer-item-meta">
                            <span v-if="originName(p)">from {{ originName(p) }}</span>
                            <span v-for="t in p.tags" :key="t" class="sb-tag">{{ t }}</span>
                        </div>
                    </div>
                    <p v-if="!drawerItems.length" class="sb-drawer-empty">
                        {{ board.drawer.value.length ? 'Nothing matches.' : 'Nothing in the drawer. Panels you move here from any session show up for every session of this campaign.' }}
                    </p>
                </div>
                </template>
            </aside>

            <div class="sb-main">
            <!-- Canvas -->
            <div ref="canvasRef" class="sb-canvas" @dragover.prevent @drop="onDrop">
                <VueFlow
                    :id="flowId"
                    v-model:nodes="nodes"
                    :edges="flowEdges"
                    :node-types="nodeTypes"
                    :edge-types="edgeTypes"
                    :default-viewport="board.viewport.value"
                    :connection-mode="ConnectionMode.Loose"
                    :delete-key-code="null"
                    :min-zoom="0.2"
                    :max-zoom="2"
                    :snap-to-grid="true"
                    :snap-grid="[10, 10]"
                    :zoom-on-double-click="false"
                    @pane-ready="onPaneReady"
                    @connect="onConnect"
                    @node-drag-stop="onNodeDragStop"
                    @node-double-click="(e: any) => openEditor(panelIdOf(e.node.id))"
                    @node-click="(e: any) => board.select(panelIdOf(e.node.id))"
                    @move-end="(e: any) => board.setViewport(e.flowTransform)"
                    @pane-context-menu="onPaneContextMenu"
                    @pane-click="closeMenus"
                    @edge-click="onEdgeClick"
                >
                    <Background pattern-color="var(--text)" :gap="20" />
                    <Controls :show-interactive="false" />
                </VueFlow>

                <SessionPartyPanel v-if="showParty" :campaign-id="campaignId" />

                <div v-if="board.loaded.value && !board.panels.value.length" class="sb-empty">
                    <OhVueIcon name="gi-book-aura" scale="2.2" style="opacity: 0.15" />
                    <p>An empty board. Add a <b>Scene</b> or a <b>Beat</b> from the toolbar, or right-click anywhere.</p>
                </div>

                <!-- Right-click: add a panel here -->
                <AppContextMenu v-if="paneMenu" open :x="paneMenu.x" :y="paneMenu.y" class="sb-menu" @close="paneMenu = null">
                    <div class="sb-menu-label">Add here</div>
                    <DropdownMenuItem
                        v-for="k in PANEL_KIND_ORDER"
                        :key="k"
                        class="sb-menu-item"
                        @select="addAt(k, paneMenu.flow)"
                    >
                        <OhVueIcon :name="PANEL_KINDS[k].icon" scale="0.7" :style="{ color: PANEL_KINDS[k].color }" />
                        {{ PANEL_KINDS[k].label }}
                    </DropdownMenuItem>
                </AppContextMenu>

                <!-- Click on a connection: change or remove it -->
                <AppContextMenu v-if="edgeMenu" open :x="edgeMenu.x" :y="edgeMenu.y" class="sb-menu" @close="edgeMenu = null">
                    <div class="sb-menu-label">Connection</div>
                    <DropdownMenuItem
                        v-for="k in EDGE_KINDS"
                        :key="k.kind"
                        class="sb-menu-item"
                        :class="{ on: edgeMenu.kind === k.kind }"
                        @select="setEdgeKind(k.kind)"
                    >
                        <span class="sb-edge-swatch" :class="`sb-edge-swatch--${k.kind}`" />
                        {{ k.label }}
                    </DropdownMenuItem>
                    <DropdownMenuItem class="sb-menu-item sb-menu-item--danger" @select="removeEdge()">
                        <OhVueIcon name="md-delete" scale="0.7" /> Remove
                    </DropdownMenuItem>
                </AppContextMenu>
            </div>

            <!-- Running: log what happens -->
            <SessionCaptureBar
                v-if="running"
                :target="captureTarget"
                :campaign-id="campaignId"
                :encounters="encounters"
                :game-id="campaignGameId"
                @submit="onCapture"
                @clear-target="board.select(null)"
            />
            </div>

            <SessionFinishDialog
                v-if="finish"
                :rows="finish.rows"
                :next-label="finish.nextLabel"
                @close="finish = null"
                @confirm="onFinish"
            />

            <!-- Panel editor -->
            <SessionPanelEditor
                v-if="editorPanel"
                :panel="editorPanel"
                :board="board"
                :session-id="sessionId"
                :campaign-id="campaignId"
                :encounters="encounters"
                @close="editorId = null"
                @navigate="(t, n) => $emit('navigate', t, n)"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { markRaw } from 'vue'
import { DropdownMenuItem } from 'reka-ui'
import { VueFlow, ConnectionMode, MarkerType, type Node, type Edge, type Connection, type VueFlowStore, type NodeDragEvent, type EdgeMouseEvent, type NodeTypesObject, type EdgeTypesObject } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import SessionPanelNode, { type PanelNodeInfo } from '~/components/session/SessionPanelNode.vue'
import SessionFloatingEdge from '~/components/session/SessionFloatingEdge.vue'
import SessionFrameNode from '~/components/session/SessionFrameNode.vue'
import { useSessionBoard, type SessionPanel } from '~/composables/useSessionBoard'
import { useEntities } from '~/composables/useEntities'
import { useEntityMarkdown } from '~/composables/useEntityMarkdown'
import { useEntityRendering } from '~/composables/useEntityRendering'
import { getDb, type DbEncounter, type DbSessionPanel, type SessionBoardEdge, type SessionPanelKind } from '~/composables/useDb'
import { PANEL_KINDS, PANEL_KIND_ORDER, EDGE_KIND_STYLE, encounterOutcome, finishReviewRows, rollOnTable, type FinishChoice, type FinishRow } from '~/utils/sessionBoard'
import { notify } from '~/composables/useNotices'
import { lsKey } from '~/utils/appNamespace'
import { useParty } from '~/composables/useParty'
import { ENTITY_TYPE_CONFIG, type EntityType, type RandomTableAttributes, type SessionAttributes } from '~/types/entities'
import { imageSrc } from '~/rules/images'

const props = defineProps<{ sessionId: number; campaignId: number; mode?: string }>()
defineEmits<{ navigate: [type: string, name: string]; recap: [] }>()

const store = useEntities()
const running = computed(() => props.mode === 'running')
const board = useSessionBoard(() => props.sessionId, () => props.campaignId, () => running.value)
const { renderMarkdown } = useEntityMarkdown()
const { entityLookup, campaignGameId } = useEntityRendering(() => props.campaignId)
const router = useRouter()
const route = useRoute()
const party = useParty()

const flowId = computed(() => `session-board-${props.sessionId}`)
const nodeTypes = { panel: markRaw(SessionPanelNode), frame: markRaw(SessionFrameNode) } as unknown as NodeTypesObject
// Edges attach to the facing sides of their panels, whichever handles they were drawn between
const edgeTypes = { floating: markRaw(SessionFloatingEdge) } as unknown as EdgeTypesObject

const EDGE_KINDS: { kind: SessionBoardEdge['kind']; label: string }[] = [
    { kind: 'plan', label: 'Plan (leads to)' },
    { kind: 'sequence', label: 'Happened next' },
    { kind: 'attach', label: 'Attached log' },
]

let flow: VueFlowStore | null = null
const canvasRef = ref<HTMLElement | null>(null)

// ── Encounters (picker and panel info) ───────────────────────────────────
const encounters = ref<{ id: number; name: string; status: string }[]>([])
const encounterRows = new Map<number, DbEncounter>()
async function loadEncounters() {
    const rows = await getDb().encounters.where('campaign_id').equals(props.campaignId).toArray()
    encounterRows.clear()
    for (const r of rows) encounterRows.set(r.id!, r)
    encounters.value = rows.map(r => ({ id: r.id!, name: r.name, status: r.status ?? 'prepared' })).sort((a, b) => a.name.localeCompare(b.name))
}

// ── Nodes ────────────────────────────────────────────────────────────────
const nodes = ref<Node[]>([])
const nodeId = (p: SessionPanel) => `p${p.id}`
const panelIdOf = (id: string) => Number(id.slice(1))

function previewOf(p: SessionPanel): string {
    if (!p.content || !PANEL_KINDS[p.kind].hasContent) return ''
    const text = p.content.length > 700 ? p.content.slice(0, 700) + '…' : p.content
    return renderMarkdown(text, { rich: true, entityLookup })
}

function infoOf(p: SessionPanel): PanelNodeInfo {
    const a = p.attrs as Record<string, any>
    if (a.continuedFrom && p.kind === 'scene') {
        const from = store.entities.find(e => e.id === a.continuedFrom.sessionId)
        return { sub: `continued from ${from?.name ?? 'an earlier session'}` }
    }
    if (p.kind === 'encounter') {
        if (a.encounterId == null) return {}
        const enc = encounters.value.find(e => e.id === a.encounterId)
        return enc ? { sub: enc.status } : { missing: 'Encounter no longer exists' }
    }
    if (p.kind === 'entity' || p.kind === 'random-table') {
        if (a.entityId == null) return {}
        const ent = store.entities.find(e => e.id === a.entityId)
        if (!ent) return { missing: 'Entry no longer exists' }
        const cfg = ENTITY_TYPE_CONFIG[ent.type as EntityType]
        if (p.kind === 'random-table') {
            const t = ent.attributes as RandomTableAttributes
            return { sub: [t.die, `${t.rows?.length ?? 0} rows`].filter(Boolean).join(' · ') }
        }
        const ea = ent.attributes as Record<string, any>
        return { sub: cfg?.label ?? ent.type, icon: cfg?.defaultIcon, imageUrl: imageSrc(ea.portraitSource || ea.logoSource || ea.imageSource, 'thumb') }
    }
    return {}
}

/** Node data reads the panel reactively; it's rebuilt only when panels come or go or change frames. */
function buildNodes() {
    const frames = board.panels.value.filter(p => p.kind === 'frame')
    const others = board.panels.value.filter(p => p.kind !== 'frame')
    nodes.value = [
        ...frames.map((p): Node => ({
            id: nodeId(p), type: 'frame', position: { x: p.x, y: p.y }, zIndex: -1,
            style: { width: `${p.w ?? 520}px`, height: `${p.h ?? 320}px` },
            data: frameData(p),
        })),
        ...others.map((p): Node => ({
            id: nodeId(p), type: 'panel', position: { x: p.x, y: p.y },
            parentNode: p.parent_uid && board.byUid.value.get(p.parent_uid) ? `p${board.byUid.value.get(p.parent_uid)!.id}` : undefined,
            data: panelData(p),
        })),
    ]
}

function panelData(p: SessionPanel) {
    return {
        panel: p,
        get previewHtml() { return previewOf(p) },
        get info() { return infoOf(p) },
        get isTarget() { return running.value && board.selectedPanelId.value === p.id },
        onOpen: () => openEditor(p.id),
        onStatus: (s: string) => board.setStatus(p.id, s),
        onRun: () => runEncounter(p),
        onRoll: () => rollTable(p),
        onLogRoll: () => logRoll(p),
        onAwardXp: () => awardXp(p),
        onToggleShouldKnow: () => board.updateAttrs(p.id, { playersShouldKnow: !p.attrs.playersShouldKnow }),
        onToDrawer: () => { board.moveToDrawer(p.id); if (editorId.value === p.id) editorId.value = null },
        onDelete: () => deletePanel(p),
    }
}

function frameData(p: SessionPanel) {
    return {
        panel: p,
        onOpen: () => openEditor(p.id),
        onColor: (c: string) => board.updateAttrs(p.id, { color: c }),
        onResize: (w: number, h: number, done: boolean) => {
            const n = flow?.findNode(nodeId(p))
            if (n) n.style = { ...(n.style as object), width: `${w}px`, height: `${h}px` }
            if (done) board.updatePanel(p.id, { w, h })
        },
        onDelete: () => deletePanel(p),
    }
}

watch(
    () => board.panels.value.map(p => `${p.id}:${p.parent_uid ?? ''}:${p.session_id}`).join('|'),
    buildNodes,
)

// ── Edges ────────────────────────────────────────────────────────────────
const flowEdges = computed<Edge[]>(() => {
    const ids = new Map(board.panels.value.map(p => [p.uid, nodeId(p)]))
    return board.edges.value
        .filter(e => ids.has(e.source) && ids.has(e.target))
        .map((e) => {
            const st = EDGE_KIND_STYLE[e.kind]
            return {
                id: e.id, source: ids.get(e.source)!, target: ids.get(e.target)!,
                type: 'floating',
                label: e.kind === 'sequence' ? String(board.sequenceNumbers.value.get(e.id) ?? '') : e.label,
                labelStyle: e.kind === 'sequence' ? { fill: 'var(--accent-l)', fontWeight: 700, fontSize: '11px' } : undefined,
                labelBgStyle: e.kind === 'sequence' ? { fill: 'var(--bg2)' } : undefined,
                style: { stroke: st.stroke, strokeWidth: st.width, strokeDasharray: st.dash },
                markerEnd: e.kind === 'attach' ? undefined : { type: MarkerType.ArrowClosed, color: st.stroke },
                data: { kind: e.kind },
            }
        })
})

function onConnect(c: Connection) {
    const a = board.panels.value.find(p => nodeId(p) === c.source)
    const b = board.panels.value.find(p => nodeId(p) === c.target)
    if (!a || !b || a.kind === 'frame' || b.kind === 'frame') return
    board.addEdge(a.uid, b.uid, a.kind === 'log' || b.kind === 'log' ? 'attach' : 'plan')
}

const edgeMenu = ref<{ id: string; kind: SessionBoardEdge['kind']; x: number; y: number } | null>(null)
function onEdgeClick({ edge, event }: EdgeMouseEvent) {
    const ev = event as MouseEvent
    const pos = { x: ev.clientX, y: ev.clientY }
    paneMenu.value = null
    edgeMenu.value = { id: edge.id, kind: (edge.data as { kind: SessionBoardEdge['kind'] }).kind, ...pos }
}
function setEdgeKind(kind: SessionBoardEdge['kind']) {
    if (edgeMenu.value) board.updateEdge(edgeMenu.value.id, { kind })
    edgeMenu.value = null
}
function removeEdge() {
    if (edgeMenu.value) board.removeEdge(edgeMenu.value.id)
    edgeMenu.value = null
}

// ── Adding panels ────────────────────────────────────────────────────────
const paneMenu = ref<{ x: number; y: number; flow: { x: number; y: number } } | null>(null)

function toFlow(clientX: number, clientY: number) {
    return flow ? flow.screenToFlowCoordinate({ x: clientX, y: clientY }) : { x: 0, y: 0 }
}

function onPaneContextMenu(e: MouseEvent) {
    e.preventDefault()
    edgeMenu.value = null
    paneMenu.value = { x: e.clientX, y: e.clientY, flow: toFlow(e.clientX, e.clientY) }
}

function closeMenus() {
    paneMenu.value = null
    edgeMenu.value = null
}

function viewCenter() {
    const r = canvasRef.value?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    const c = toFlow(r.left + r.width / 2, r.top + r.height / 2)
    // A little scatter, so panels added in a row don't land on top of each other
    return { x: c.x + (Math.random() * 60 - 30), y: c.y + (Math.random() * 60 - 30) }
}

async function addAt(kind: SessionPanelKind, at: { x: number; y: number }) {
    closeMenus()
    const w = PANEL_KINDS[kind].width
    const p = await board.addPanel(kind, { x: Math.round(at.x - (kind === 'frame' ? 0 : w / 2)), y: Math.round(at.y - 20) })
    if (p) openEditor(p.id)
}

function addAtCenter(kind: SessionPanelKind) {
    addAt(kind, viewCenter())
}

// ── Moving panels and frames ─────────────────────────────────────────────
function onNodeDragStop(e: NodeDragEvent) {
    for (const n of e.nodes) {
        const p = board.panels.value.find(x => nodeId(x) === n.id)
        if (!p) continue
        const abs = { x: Math.round(n.computedPosition.x), y: Math.round(n.computedPosition.y) }
        if (p.kind === 'frame') { board.updatePanel(p.id, { x: abs.x, y: abs.y }); continue }
        // Dropped inside a frame: it becomes part of it (position relative to the frame)
        const w = n.dimensions?.width ?? PANEL_KINDS[p.kind].width
        const h = n.dimensions?.height ?? 80
        const cx = abs.x + w / 2, cy = abs.y + h / 2
        const frame = board.panels.value.find(f => f.kind === 'frame' && cx >= f.x && cx <= f.x + (f.w ?? 520) && cy >= f.y && cy <= f.y + (f.h ?? 320))
        if (frame) board.updatePanel(p.id, { parent_uid: frame.uid, x: abs.x - frame.x, y: abs.y - frame.y })
        else board.updatePanel(p.id, { parent_uid: null, x: abs.x, y: abs.y })
    }
}

// ── Editor ───────────────────────────────────────────────────────────────
const editorId = ref<number | null>(null)
const editorPanel = computed(() => (editorId.value == null ? null : board.panels.value.find(p => p.id === editorId.value) ?? null))
function openEditor(id: number) {
    closeMenus()
    editorId.value = id
}

async function deletePanel(p: SessionPanel) {
    const hasText = !!(p.content?.trim() || (p.kind !== 'frame' && p.title))
    if (hasText && !confirm(`Delete "${p.title || PANEL_KINDS[p.kind].label}"? This cannot be undone. To keep it for later, move it to the drawer instead.`)) return
    if (editorId.value === p.id) editorId.value = null
    await board.deletePanel(p.id)
}

// ── Drawer ───────────────────────────────────────────────────────────────
const showDrawer = ref(false)
const drawerQuery = ref('')
const drawerKind = ref<SessionPanelKind | null>(null)
const drawerKinds = computed(() => PANEL_KIND_ORDER.filter(k => board.drawer.value.some(p => p.kind === k)))
const drawerItems = computed(() => {
    const q = drawerQuery.value.trim().toLowerCase()
    return board.drawer.value.filter(p =>
        (!drawerKind.value || p.kind === drawerKind.value) &&
        (!q || p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q))))
})
// Inspiration: scenes of the other campaigns
const inspire = ref(false)
const copied = ref(new Set<number>())
const otherScenes = ref<{ panel: DbSessionPanel; campaign: string }[] | null>(null)
watch(inspire, async (on) => {
    if (!on || otherScenes.value) return
    const db = getDb()
    const names = new Map((await db.campaigns.toArray()).map(c => [c.id!, c.name]))
    const rows = await db.sessionPanels.where('kind').equals('scene').filter(p => p.campaign_id !== props.campaignId).toArray()
    otherScenes.value = rows.map(panel => ({ panel, campaign: names.get(panel.campaign_id) ?? 'Another campaign' }))
})
const inspireResults = computed(() => {
    const q = drawerQuery.value.trim().toLowerCase()
    if (q.length < 2) return []
    return (otherScenes.value ?? [])
        .filter(r => r.panel.title.toLowerCase().includes(q) || r.panel.content.toLowerCase().includes(q) || r.panel.tags.some(t => t.toLowerCase().includes(q)))
        .slice(0, 40)
})
async function copyScene(r: { panel: DbSessionPanel; campaign: string }) {
    const copy = await board.copyToDrawer(r.panel, [`from ${r.campaign}`])
    if (copy) copied.value = new Set([...copied.value, r.panel.id!])
}

function originName(p: SessionPanel) {
    if (p.origin_session_id == null) return ''
    return store.entities.find(e => e.id === p.origin_session_id)?.name ?? ''
}
function snippet(text: string) {
    const t = text.replace(/[#>*_`{}\[\]]/g, '').replace(/\s+/g, ' ').trim()
    return t.length > 110 ? t.slice(0, 110) + '…' : t
}
function onDrawerDragStart(e: DragEvent, id: number) {
    e.dataTransfer?.setData('application/x-startome-panel', String(id))
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDrop(e: DragEvent) {
    const id = Number(e.dataTransfer?.getData('application/x-startome-panel'))
    if (!id) return
    const at = toFlow(e.clientX, e.clientY)
    const p = board.drawer.value.find(x => x.id === id)
    board.placeFromDrawer(id, { x: Math.round(at.x - (p ? PANEL_KINDS[p.kind].width / 2 : 100)), y: Math.round(at.y - 20) })
}
function placeAtCenter(id: number) {
    const c = viewCenter()
    board.placeFromDrawer(id, { x: Math.round(c.x - 110), y: Math.round(c.y - 20) })
}
async function removeFromDrawer(p: SessionPanel) {
    if (!confirm(`Delete "${p.title || PANEL_KINDS[p.kind].label}"? This cannot be undone.`)) return
    await board.deletePanel(p.id)
}

// ── Play ─────────────────────────────────────────────────────────────────
const captureTarget = computed(() => (board.selectedPanelId.value == null ? null : board.panels.value.find(p => p.id === board.selectedPanelId.value && p.kind !== 'frame' && p.kind !== 'log') ?? null))

/** Where a new Log goes: under the panel it's attached to (below its other logs), else at the view's centre. */
function logSpot(target: SessionPanel | null): { x: number; y: number } {
    if (!target) {
        const c = viewCenter()
        return { x: Math.round(c.x - 120), y: Math.round(c.y - 30) }
    }
    const abs = board.absolutePosition(target)
    const h = flow?.findNode(nodeId(target))?.dimensions.height ?? 120
    const attached = board.edges.value.filter(e => e.kind === 'attach' && (e.source === target.uid || e.target === target.uid)).length
    return { x: abs.x + 10, y: Math.round(abs.y + h + 40 + attached * 110) }
}

async function addLog(target: SessionPanel | null, content: string, attrs: Record<string, unknown> = {}) {
    const log = await board.addPanel('log', logSpot(target), {
        content,
        attrs: { logType: 'happened', at: new Date().toISOString(), ...attrs },
    })
    if (log && target) {
        board.addEdge(target.uid, log.uid, 'attach')
        board.markLogged(target.id)
    }
    return log
}

async function onCapture(entry: { text: string; logType: string; playersShouldKnow: boolean }) {
    await addLog(captureTarget.value, entry.text, { logType: entry.logType, playersShouldKnow: entry.playersShouldKnow || undefined })
}

function runEncounter(p: SessionPanel) {
    const id = p.attrs.encounterId
    if (typeof id !== 'number') return
    board.select(p.id)
    board.flushAll()
    router.push(`/encounter/${id}?from=session-${props.sessionId}`)
}

/** Encounters resolved since their panel last looked: their outcome becomes a Log on the panel. */
async function logEncounterResults() {
    for (const p of board.panels.value.filter(x => x.kind === 'encounter' && typeof x.attrs.encounterId === 'number' && !x.attrs.resultLogged)) {
        const enc = encounterRows.get(p.attrs.encounterId as number)
        if (enc?.status !== 'resolved') continue
        board.updateAttrs(p.id, { resultLogged: true })
        await addLog(p, encounterOutcome(enc), { fromEncounterId: enc.id })
    }
}

function rollTable(p: SessionPanel) {
    const ent = store.entities.find(e => e.id === p.attrs.entityId)
    if (!ent) return
    const { roll, result } = rollOnTable(ent.attributes as RandomTableAttributes)
    board.updateAttrs(p.id, { lastRoll: { roll, result, at: new Date().toISOString() } })
}

async function logRoll(p: SessionPanel) {
    const last = p.attrs.lastRoll as { roll: number; result: string } | undefined
    if (!last) return
    await addLog(p, `Rolled ${last.roll} on {{random-table: ${p.title}}}: ${last.result}`)
}

/** Opens the Award XP dialog prefilled; confirming it ticks the panel and remembers the award. */
function awardXp(p: SessionPanel) {
    const started = new Date().toISOString()
    const reason = p.title || 'Session reward'
    party.requestXpAward({ campaignId: props.campaignId, refType: null, refId: null, reason, amount: Number(p.attrs.xp) || undefined })
    const stop = watch(party.xpPrompt, async (prompt) => {
        if (prompt) return
        stop()
        // The dialog writes the award after closing
        await new Promise(r => setTimeout(r, 400))
        const award = await getDb().xpAwards.where('campaign_id').equals(props.campaignId).filter(a => a.at >= started && !a.undone_at).last()
        if (!award?.id) return
        board.updateAttrs(p.id, { awardIds: [...((p.attrs.awardIds as number[]) ?? []), award.id] })
        board.setStatus(p.id, 'awarded')
    })
}

function onWindowFocus() {
    if (!running.value) return
    loadEncounters().then(logEncounterResults)
}

// ── Party panel ──────────────────────────────────────────────────────────
const PARTY_KEY = lsKey('session.showParty')
const showParty = useLocalStorage(PARTY_KEY, false, { serializer: { read: v => v === '1', write: v => (v ? '1' : '0') } })
function toggleParty() {
    showParty.value = !showParty.value
}

// ── Finishing ────────────────────────────────────────────────────────────
const finish = ref<{ rows: FinishRow<SessionPanel>[]; nextLabel: string } | null>(null)

async function openFinish() {
    board.flushAll()
    await loadEncounters()
    const rows = finishReviewRows(board.panels.value, id => encounterRows.get(id)?.status === 'resolved')
    const next = await board.nextSession(false)
    const n = parseInt((board.session.value?.attributes as SessionAttributes | undefined)?.sessionNumber ?? '', 10)
    finish.value = { rows, nextLabel: next ? `"${next.name}"` : `a new session${isNaN(n) ? '' : ` (Session ${n + 1})`}` }
}

async function onFinish(choices: FinishChoice[]) {
    const rows = finish.value?.rows ?? []
    finish.value = null
    const toNext = rows.filter((_, i) => choices[i] === 'next').map(r => ({ id: r.panel.id, copy: r.copy }))
    rows.forEach((r, i) => {
        if (choices[i] === 'drawer') board.moveToDrawer(r.panel.id)
        else if (choices[i] === 'leave' && r.panel.kind === 'scene') board.updatePanel(r.panel.id, { status: 'skipped' })
    })
    if (!toNext.length) return
    const target = await board.nextSession(true)
    if (!target) return
    await board.sendToSession(target, toNext, `Carried over from ${board.session.value?.name ?? 'last session'}`)
    notify(`${toNext.length} panel${toNext.length === 1 ? '' : 's'} carried over to ${target.name}.`, 'info', {
        action: { label: 'Open', run: () => router.push(`/campaign/${props.campaignId}/sessions/${target.id}`) },
    })
}

// Switching the session to finished opens the review: SessionEditor calls this on the click,
// so loading an already finished session doesn't
defineExpose({ openFinish })

// ── View ─────────────────────────────────────────────────────────────────
function onPaneReady(api: VueFlowStore) {
    flow = api
}
/** Waits (a few frames at most) until every panel has its size. */
async function waitMeasured(tries = 30): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
        await new Promise(r => requestAnimationFrame(r))
        const ns = flow?.getNodes.value ?? []
        if (ns.length && ns.every(n => n.dimensions.width > 0)) return true
    }
    return false
}

/** Fits once every panel has its size. */
async function fitWhenMeasured() {
    if (!(await waitMeasured())) return
    await fit()
    board.setViewport(flow!.getViewport())
}
async function fit() {
    await flow?.fitView({ padding: 0.15, maxZoom: 1.1 })
}

function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        if (paneMenu.value || edgeMenu.value) closeMenus()
    }
}

useEventListener(window, 'keydown', onKey)
useEventListener(window, 'focus', onWindowFocus)

onMounted(async () => {
    await Promise.all([board.load(), loadEncounters(), store.loadAll(props.campaignId)])
    // A converted board has never been looked at: show all of it once the panels are measured
    const vp = board.viewport.value
    const fitOnOpen = board.panels.value.length > 0 && vp.x === 40 && vp.y === 40 && vp.zoom === 0.9
    buildNodes()
    if (fitOnOpen && !route.query.panel) fitWhenMeasured()
    // Opened from search (?panel=): that panel, centred, in the editor
    const fromSearch = Number(route.query.panel)
    const found = fromSearch ? board.panels.value.find(p => p.id === fromSearch) : undefined
    if (found) {
        board.select(found.id)
        openEditor(found.id)
        await waitMeasured()
        const abs = board.absolutePosition(found)
        flow?.setCenter(abs.x + PANEL_KINDS[found.kind].width / 2, abs.y + 60, { zoom: 1 })
        board.setViewport(flow!.getViewport())
    }
    // Back from an encounter: the panel you ran it from is selected again
    if (board.selectedPanelId.value != null) {
        await nextTick()
        const n = flow?.findNode(`p${board.selectedPanelId.value}`)
        if (n) flow?.addSelectedNodes([n])
    }
    if (running.value) await logEncounterResults()
})

watch(() => props.sessionId, async () => {
    editorId.value = null
    await board.load()
    buildNodes()
})
</script>

<style scoped>
.sb { flex: 1; min-height: 0; display: flex; flex-direction: column; }

.sb-toolbar {
    container-type: inline-size;
    display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
    padding: 6px 10px; border-bottom: 1px solid var(--border); background: var(--bg2); flex-shrink: 0;
}
.sb-add {
    --kind: var(--accent);
    display: flex; align-items: center; gap: 5px; padding: 3px 9px 3px 7px;
    border-radius: 99px; border: 1px solid color-mix(in oklch, var(--kind) 35%, var(--border));
    background: color-mix(in oklch, var(--kind) 7%, transparent);
    color: var(--text2); font-size: 11.5px; cursor: pointer; transition: all 0.12s;
}
.sb-add :deep(svg) { color: var(--kind); }
.sb-add:hover { border-color: var(--kind); color: var(--text); background: color-mix(in oklch, var(--kind) 15%, transparent); }
.sb-spacer { flex: 1; }
/* Narrow board: the palette shows icons only (names stay in the tooltips) */
@container (max-width: 1080px) {
    .sb-add span { display: none; }
    .sb-add { padding: 4px 7px; }
}
.sb-tool {
    display: flex; align-items: center; gap: 5px; padding: 4px 10px;
    border-radius: var(--r1); background: var(--surface); border: 1px solid var(--border);
    color: var(--text2); font-size: 12px; cursor: pointer;
}
.sb-tool:hover { border-color: var(--border-hi); color: var(--text); }
.sb-tool.active { background: var(--accent-bg); border-color: var(--accent); color: var(--accent-l); }
.sb-count { font-size: 10px; padding: 0 5px; border-radius: 99px; background: var(--accent); color: #fff; }

.sb-body { flex: 1; min-height: 0; display: flex; }
.sb-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.sb-canvas { flex: 1; min-height: 0; position: relative; }

.sb-empty {
    position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; color: var(--text3); font-size: 13px; pointer-events: none; text-align: center; padding: 20px;
}
.sb-empty b { color: var(--text2); }

.sb-menu {
    min-width: 170px; padding: 4px;
    background: var(--surface-hi); border: 1px solid var(--border-hi); border-radius: var(--r1);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); display: flex; flex-direction: column;
}
.sb-menu-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); padding: 4px 8px; }
.sb-menu-item {
    display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 4px;
    font-size: 12.5px; color: var(--text); background: none; border: none; cursor: pointer; text-align: left;
}
.sb-menu-item:hover, .sb-menu-item[data-highlighted] { background: var(--bg2); outline: none; }
.sb-menu-item.on { color: var(--accent-l); }
.sb-menu-item--danger:hover { color: var(--danger); background: var(--danger-bg); }
.sb-edge-swatch { width: 22px; height: 0; border-top: 2px solid; display: inline-block; }
.sb-edge-swatch--plan { border-top: 2px dashed var(--text3); }
.sb-edge-swatch--sequence { border-top: 3px solid var(--accent); }
.sb-edge-swatch--attach { border-top: 2px dotted #7cc44e; }

.sb-drawer {
    width: 270px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0;
    border-right: 1px solid var(--border); background: var(--bg2);
}
.sb-drawer-head { display: flex; align-items: baseline; gap: 8px; padding: 8px 12px 4px; }
.sb-drawer-title { font-family: var(--fh); font-size: 14px; color: var(--text); }
.sb-drawer-hint { font-size: 11px; color: var(--text3); }
.sb-drawer-search {
    margin: 4px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r1);
    color: var(--text); font-size: 12.5px; padding: 5px 8px; outline: none;
}
.sb-drawer-search:focus { border-color: var(--accent); }
.sb-drawer-scope { display: flex; margin: 2px 10px 6px; border: 1px solid var(--border); border-radius: var(--r1); overflow: hidden; }
.sb-drawer-scope button { flex: 1; font-size: 11px; padding: 4px 6px; background: none; border: none; color: var(--text3); cursor: pointer; }
.sb-drawer-scope button.on { background: var(--accent-bg); color: var(--accent-l); }
.sb-drawer-kinds { display: flex; flex-wrap: wrap; gap: 3px; padding: 2px 10px 6px; }
.sb-drawer-kinds button {
    --kind: var(--accent);
    font-size: 10.5px; padding: 1px 7px; border-radius: 99px; cursor: pointer;
    border: 1px solid var(--border); background: none; color: var(--text3);
}
.sb-drawer-kinds button.on { border-color: var(--kind); color: var(--text); }
.sb-drawer-list { flex: 1; overflow-y: auto; padding: 4px 10px 12px; display: flex; flex-direction: column; gap: 6px; }
.sb-drawer-item {
    --kind: var(--accent);
    border: 1px solid var(--border); border-left: 3px solid var(--kind); border-radius: var(--r1);
    background: var(--surface); padding: 6px 8px; cursor: grab;
}
.sb-drawer-item-head { display: flex; align-items: center; gap: 5px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--kind); }
.sb-drawer-place, .sb-drawer-del {
    font-size: 10.5px; text-transform: none; letter-spacing: 0; padding: 1px 6px; border-radius: 4px;
    border: 1px solid var(--border); background: none; color: var(--text2); cursor: pointer; display: flex; align-items: center;
}
.sb-drawer-place:hover { color: var(--text); border-color: var(--border-hi); }
.sb-drawer-del:hover { color: var(--danger); border-color: var(--danger); }
.sb-drawer-item-title { font-size: 13px; font-weight: 600; color: var(--text); margin-top: 2px; }
.sb-drawer-item-text { font-size: 11.5px; color: var(--text2); margin-top: 2px; line-height: 1.4; }
.sb-drawer-item-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; font-size: 10.5px; color: var(--text3); }
.sb-tag { padding: 0 5px; border-radius: 99px; background: var(--bg2); }
.sb-drawer-empty { font-size: 12px; color: var(--text3); line-height: 1.5; }
</style>
