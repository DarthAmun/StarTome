/**
 * One session's board (SESSION_BOARD_PLAN.md): its panels, the campaign
 * drawer, and the connections and viewport stored on the session entity.
 * Panel edits are written debounced per panel; the session's `content` (what
 * search and links read) is rebuilt from the panels after each change.
 */
import { ref, computed, watch } from 'vue'
import { getDb, type DbSessionPanel, type SessionBoardEdge, type SessionPanelKind } from '~/composables/useDb'
import { useEntities } from '~/composables/useEntities'
import { reportError } from '~/composables/useNotices'
import { blankPanel, boardText, newUid } from '~/utils/sessionBoard'
import { toPlain } from '~/utils/json'
import type { SessionAttributes } from '~/types/entities'

export type SessionPanel = DbSessionPanel & { id: number }

export interface BoardState {
  edges: SessionBoardEdge[]
  viewport: { x: number; y: number; zoom: number }
  selectedPanelId?: number
  migrated?: true
}

const PANEL_SAVE_MS = 400
const CONTENT_SAVE_MS = 1200

export function useSessionBoard(sessionId: () => number, campaignId: () => number) {
  const store = useEntities()
  const panels = ref<SessionPanel[]>([])
  const drawer = ref<SessionPanel[]>([])
  const edges = ref<SessionBoardEdge[]>([])
  const viewport = ref<BoardState['viewport']>({ x: 40, y: 40, zoom: 0.9 })
  const loaded = ref(false)

  const session = computed(() => store.entities.find(e => e.id === sessionId()) ?? (store.currentEntity?.id === sessionId() ? store.currentEntity : null))
  const byUid = computed(() => new Map(panels.value.map(p => [p.uid, p])))

  async function load() {
    loaded.value = false
    const db = getDb()
    const sid = sessionId()
    const cid = campaignId()
    try {
      const [mine, loose] = await Promise.all([
        db.sessionPanels.where('session_id').equals(sid).toArray(),
        db.sessionPanels.where('campaign_id').equals(cid).filter(p => p.session_id == null).toArray(),
      ])
      if (sid !== sessionId()) return
      panels.value = mine as SessionPanel[]
      drawer.value = loose as SessionPanel[]
      const board = ((session.value?.attributes ?? {}) as SessionAttributes & { board?: BoardState }).board
      // Connections whose panel is gone (deleted elsewhere) are dropped
      const uids = new Set(mine.map(p => p.uid))
      edges.value = (board?.edges ?? []).filter(e => uids.has(e.source) && uids.has(e.target))
      if (board?.viewport) viewport.value = { ...board.viewport }
      loaded.value = true
    } catch (err) {
      reportError('Loading the session board', err)
    }
  }

  // ── Saving ──────────────────────────────────────────────────────────────

  const panelTimers = new Map<number, ReturnType<typeof setTimeout>>()
  const panelPending = new Map<number, Partial<DbSessionPanel>>()
  let contentTimer: ReturnType<typeof setTimeout> | null = null
  let boardTimer: ReturnType<typeof setTimeout> | null = null

  function flushPanel(id: number) {
    const t = panelTimers.get(id)
    if (t) clearTimeout(t)
    panelTimers.delete(id)
    const patch = panelPending.get(id)
    panelPending.delete(id)
    if (patch) getDb().sessionPanels.update(id, toPlain({ ...patch, updated_at: new Date().toISOString() })).catch(err => reportError('Saving the panel', err))
  }

  function flushContent() {
    if (contentTimer) clearTimeout(contentTimer)
    if (!contentTimer) return
    contentTimer = null
    const content = boardText(panels.value)
    if (session.value && session.value.content !== content) {
      store.updateEntity(sessionId(), { content }).catch(() => {})
    }
  }

  function scheduleContent() {
    if (contentTimer) clearTimeout(contentTimer)
    contentTimer = setTimeout(flushContent, CONTENT_SAVE_MS)
  }

  function flushBoard() {
    if (boardTimer) clearTimeout(boardTimer)
    if (!boardTimer) return
    boardTimer = null
    const s = session.value
    if (!s) return
    const attrs = (s.attributes ?? {}) as Record<string, unknown>
    const prev = (attrs.board ?? {}) as BoardState
    const board: BoardState = { ...prev, edges: edges.value, viewport: viewport.value, migrated: true }
    store.updateEntity(sessionId(), { attributes: toPlain({ ...attrs, board }) as SessionAttributes }).catch(() => {})
  }

  function scheduleBoard() {
    if (boardTimer) clearTimeout(boardTimer)
    boardTimer = setTimeout(flushBoard, PANEL_SAVE_MS)
  }

  function flushAll() {
    for (const id of [...panelPending.keys()]) flushPanel(id)
    flushContent()
    flushBoard()
  }

  onBeforeUnmount(flushAll)

  // ── Panels ──────────────────────────────────────────────────────────────

  function find(id: number): SessionPanel | undefined {
    return panels.value.find(p => p.id === id) ?? drawer.value.find(p => p.id === id)
  }

  async function addPanel(kind: SessionPanelKind, at: { x: number; y: number }, extra: Partial<DbSessionPanel> = {}): Promise<SessionPanel | null> {
    try {
      const row = { ...blankPanel(kind, campaignId(), sessionId(), at), ...extra }
      const id = await getDb().sessionPanels.add(toPlain(row)) as number
      const panel = { ...row, id } as SessionPanel
      panels.value = [...panels.value, panel]
      scheduleContent()
      return panel
    } catch (err) {
      reportError('Adding the panel', err)
      return null
    }
  }

  /** Changes a panel; written after a short pause. */
  function updatePanel(id: number, patch: Partial<DbSessionPanel>) {
    const panel = find(id)
    if (!panel) return
    Object.assign(panel, patch)
    panelPending.set(id, { ...(panelPending.get(id) ?? {}), ...patch })
    const t = panelTimers.get(id)
    if (t) clearTimeout(t)
    panelTimers.set(id, setTimeout(() => flushPanel(id), PANEL_SAVE_MS))
    if ('title' in patch || 'content' in patch || 'attrs' in patch) scheduleContent()
  }

  function updateAttrs(id: number, patch: Record<string, unknown>) {
    const panel = find(id)
    if (panel) updatePanel(id, { attrs: { ...panel.attrs, ...patch } })
  }

  /** Takes a panel off the board: its connections go, panels in a frame stay where they are. */
  function detach(panel: SessionPanel) {
    const before = edges.value.length
    edges.value = edges.value.filter(e => e.source !== panel.uid && e.target !== panel.uid)
    if (edges.value.length !== before) scheduleBoard()
    if (panel.kind === 'frame') {
      for (const child of panels.value.filter(p => p.parent_uid === panel.uid)) {
        updatePanel(child.id, { parent_uid: null, x: child.x + panel.x, y: child.y + panel.y })
      }
    }
    panels.value = panels.value.filter(p => p.id !== panel.id)
    scheduleContent()
  }

  async function deletePanel(id: number) {
    const panel = find(id)
    if (!panel) return
    if (panels.value.includes(panel)) detach(panel)
    drawer.value = drawer.value.filter(p => p.id !== id)
    panelPending.delete(id)
    try { await getDb().sessionPanels.delete(id) } catch (err) { reportError('Deleting the panel', err) }
  }

  /** Board → campaign drawer. */
  function moveToDrawer(id: number) {
    const panel = panels.value.find(p => p.id === id)
    if (!panel || panel.kind === 'frame') return
    const abs = absolutePosition(panel)
    updatePanel(id, { session_id: null, parent_uid: null, x: abs.x, y: abs.y })
    detach(panel)
    drawer.value = [panel, ...drawer.value]
  }

  /** Campaign drawer → this board. */
  function placeFromDrawer(id: number, at: { x: number; y: number }) {
    const panel = drawer.value.find(p => p.id === id)
    if (!panel) return
    // A uid can be taken on this board if the panel was copied here before
    const uid = byUid.value.has(panel.uid) ? newUid() : panel.uid
    updatePanel(id, { session_id: sessionId(), x: at.x, y: at.y, parent_uid: null, uid })
    drawer.value = drawer.value.filter(p => p.id !== id)
    panels.value = [...panels.value, panel]
    scheduleContent()
  }

  function absolutePosition(p: SessionPanel): { x: number; y: number } {
    const parent = p.parent_uid ? byUid.value.get(p.parent_uid) : undefined
    return parent ? { x: parent.x + p.x, y: parent.y + p.y } : { x: p.x, y: p.y }
  }

  // ── Connections and viewport ────────────────────────────────────────────

  function addEdge(source: string, target: string, kind: SessionBoardEdge['kind']) {
    if (source === target) return
    if (edges.value.some(e => e.source === source && e.target === target && e.kind === kind)) return
    edges.value = [...edges.value, { id: newUid(), source, target, kind }]
    scheduleBoard()
  }

  function updateEdge(id: string, patch: Partial<SessionBoardEdge>) {
    edges.value = edges.value.map(e => (e.id === id ? { ...e, ...patch } : e))
    scheduleBoard()
  }

  function removeEdge(id: string) {
    edges.value = edges.value.filter(e => e.id !== id)
    scheduleBoard()
  }

  function setViewport(v: BoardState['viewport']) {
    viewport.value = { x: Math.round(v.x), y: Math.round(v.y), zoom: Math.round(v.zoom * 100) / 100 }
    scheduleBoard()
  }

  watch(sessionId, () => { flushAll(); load() })

  return {
    panels, drawer, edges, viewport, loaded, session, byUid,
    load, addPanel, updatePanel, updateAttrs, deletePanel, moveToDrawer, placeFromDrawer, absolutePosition,
    addEdge, updateEdge, removeEdge, setViewport, flushAll,
  }
}
