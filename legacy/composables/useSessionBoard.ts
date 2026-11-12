/**
 * One session's board (SESSION_BOARD_PLAN.md): its panels, the campaign
 * drawer, and the connections and viewport stored on the session entity.
 * Panel edits are written debounced per panel; the session's `content` (what
 * search and links read) is rebuilt from the panels after each change.
 */
import { ref, computed, watch } from 'vue'
import { getDb, type DbSessionPanel, type SessionBoardEdge, type SessionPanelKind } from '~/composables/useDb'
import { useEntities, type Entity } from '~/composables/useEntities'
import { reportError } from '~/composables/useNotices'
import { PANEL_KINDS, blankPanel, boardText, carryOverLayout, newUid } from '~/utils/sessionBoard'
import { toPlain } from '~/utils/json'
import type { SessionAttributes } from '~/types/entities'

export type SessionPanel = DbSessionPanel & { id: number }

export interface BoardState {
  edges: SessionBoardEdge[]
  viewport: { x: number; y: number; zoom: number }
  /** The panel last clicked or ticked: the capture bar's target, restored after an encounter. */
  selectedPanelId?: number | null
  /** End of the "happened next" chain. */
  lastTouchedUid?: string | null
  migrated?: true
}

/** Statuses that mean a panel came up in play. */
export const TOUCHED_STATUSES = new Set(['played', 'continued', 'done', 'revealed', 'awarded'])

/** What a panel's status becomes when something is logged on it in running mode. */
const TOUCH_STATUS: Partial<Record<SessionPanelKind, string>> = { scene: 'played', beat: 'done', clue: 'revealed' }

/** Panels that can be part of the "happened next" chain (not notes, logs, references or rewards). */
const SEQUENCE_KINDS = new Set<SessionPanelKind>(['scene', 'beat', 'clue', 'encounter'])

const PANEL_SAVE_MS = 400
const CONTENT_SAVE_MS = 1200

export function useSessionBoard(sessionId: () => number, campaignId: () => number, running: () => boolean = () => false) {
  const store = useEntities()
  const panels = ref<SessionPanel[]>([])
  const drawer = ref<SessionPanel[]>([])
  const edges = ref<SessionBoardEdge[]>([])
  const viewport = ref<BoardState['viewport']>({ x: 40, y: 40, zoom: 0.9 })
  const selectedPanelId = ref<number | null>(null)
  const lastTouchedUid = ref<string | null>(null)
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
      selectedPanelId.value = mine.some(p => p.id === board?.selectedPanelId) ? board!.selectedPanelId! : null
      lastTouchedUid.value = board?.lastTouchedUid && uids.has(board.lastTouchedUid) ? board.lastTouchedUid : null
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
    const board: BoardState = {
      ...prev, edges: edges.value, viewport: viewport.value, migrated: true,
      selectedPanelId: selectedPanelId.value, lastTouchedUid: lastTouchedUid.value,
    }
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
    if (selectedPanelId.value === panel.id) selectedPanelId.value = null
    if (lastTouchedUid.value === panel.uid) lastTouchedUid.value = null
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

  // ── Play: statuses, the "happened next" chain, the capture target ───────

  /**
   * A panel came up in play: in running mode it joins the "happened next"
   * chain after the panel that came up before it.
   */
  function touch(id: number) {
    const panel = panels.value.find(p => p.id === id)
    if (!panel || !running() || !SEQUENCE_KINDS.has(panel.kind)) return
    const prev = lastTouchedUid.value
    if (prev === panel.uid) return
    if (prev && byUid.value.has(prev) && !edges.value.some(e => e.kind === 'sequence' && e.source === prev && e.target === panel.uid)) {
      edges.value = [...edges.value, { id: newUid(), source: prev, target: panel.uid, kind: 'sequence' }]
    }
    lastTouchedUid.value = panel.uid
    scheduleBoard()
  }

  /** Sets a status; a status that means "it came up" adds the panel to the chain while running. */
  function setStatus(id: number, status: string) {
    const panel = find(id)
    if (!panel) return
    const was = panel.status
    updatePanel(id, { status })
    if (TOUCHED_STATUSES.has(status) && !TOUCHED_STATUSES.has(was ?? '')) touch(id)
    select(id)
  }

  function select(id: number | null) {
    if (selectedPanelId.value === id) return
    selectedPanelId.value = id
    scheduleBoard()
  }

  /** Something was logged on this panel: an untouched scene, beat or clue now counts as played. */
  function markLogged(id: number) {
    const panel = panels.value.find(p => p.id === id)
    if (!panel) return
    const to = TOUCH_STATUS[panel.kind]
    if (to && !TOUCHED_STATUSES.has(panel.status ?? '') && panel.status !== 'skipped') setStatus(id, to)
    else touch(id)
  }

  /** Sequence connections in chain order, numbered from 1 (for their labels). */
  const sequenceNumbers = computed(() => {
    const seq = edges.value.filter(e => e.kind === 'sequence')
    return new Map(seq.map((e, i) => [e.id, i + 1]))
  })

  /** A copy of a panel from anywhere (another campaign's scene) into this campaign's drawer. */
  async function copyToDrawer(source: DbSessionPanel, extraTags: string[] = []): Promise<SessionPanel | null> {
    try {
      const { id: _id, ...rest } = toPlain(source)
      const ts = new Date().toISOString()
      const row = {
        ...rest, uid: newUid(), campaign_id: campaignId(), session_id: null, parent_uid: null,
        status: PANEL_KINDS[source.kind].statuses?.[0], attrs: {}, origin_session_id: undefined,
        tags: [...new Set([...(rest.tags ?? []), ...extraTags])], created_at: ts, updated_at: ts,
      }
      const id = await getDb().sessionPanels.add(row) as number
      const panel = { ...row, id } as SessionPanel
      drawer.value = [panel, ...drawer.value]
      return panel
    } catch (err) {
      reportError('Copying the panel', err)
      return null
    }
  }

  // ── Finishing: next session, carrying panels over ───────────────────────

  /** The session after this one (by number, else by creation); created as "Session N+1" when `create` and there is none. */
  async function nextSession(create: boolean): Promise<Entity | null> {
    const num = (e: Entity) => parseInt((e.attributes as SessionAttributes).sessionNumber ?? '', 10)
    const sessions = (store.byType.session ?? []).filter(e => e.campaignId === campaignId()).sort((a, b) => {
      const na = num(a), nb = num(b)
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb
      return a.id - b.id
    })
    const i = sessions.findIndex(e => e.id === sessionId())
    if (i >= 0 && i < sessions.length - 1) return sessions[i + 1]
    if (!create) return null
    const current = session.value
    const n = current && !isNaN(num(current)) ? num(current) + 1 : sessions.length + 1
    const board: BoardState = { edges: [], viewport: { x: 40, y: 40, zoom: 0.9 }, migrated: true }
    return store.createEntity(campaignId(), 'session', `Session ${n}`, { mode: 'planning', sessionNumber: String(n), board } as SessionAttributes)
  }

  /**
   * Puts panels on another session's board, in a new frame below what's
   * there. `copy` leaves the panel here and puts a fresh "planned" copy there
   * (a scene that continues); otherwise the panel moves.
   */
  async function sendToSession(target: Entity, items: { id: number; copy: boolean }[], frameTitle: string) {
    if (!items.length) return
    const db = getDb()
    const existing = await db.sessionPanels.where('session_id').equals(target.id).toArray()
    const { frame, spots } = carryOverLayout(existing, items.length)
    const ts = new Date().toISOString()
    const frameRow = { ...blankPanel('frame', campaignId(), target.id, { x: frame.x, y: frame.y }, frameTitle), w: frame.w, h: frame.h }
    await db.sessionPanels.add(toPlain(frameRow))
    for (const [i, item] of items.entries()) {
      const panel = panels.value.find(p => p.id === item.id)
      if (!panel) continue
      const at = { ...spots[i], parent_uid: frameRow.uid }
      if (item.copy) {
        const { id: _id, ...rest } = toPlain(panel)
        await db.sessionPanels.add({
          ...rest, ...at, uid: newUid(), session_id: target.id, status: 'planned',
          attrs: { ...rest.attrs, continuedFrom: { sessionId: sessionId(), uid: panel.uid } },
          origin_session_id: panel.origin_session_id ?? sessionId(), created_at: ts, updated_at: ts,
        })
      } else {
        updatePanel(item.id, { session_id: target.id, ...at })
        flushPanel(item.id)
        detach(panel)
      }
    }
    // The other session's text (search, links) now includes them
    const theirs = await db.sessionPanels.where('session_id').equals(target.id).toArray()
    await store.updateEntity(target.id, { content: boardText(theirs) })
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
    panels, drawer, edges, viewport, loaded, session, byUid, selectedPanelId, lastTouchedUid, sequenceNumbers,
    load, addPanel, updatePanel, updateAttrs, deletePanel, moveToDrawer, placeFromDrawer, absolutePosition,
    addEdge, updateEdge, removeEdge, setViewport, flushAll, touch, setStatus, select, markLogged,
    nextSession, sendToSession, copyToDrawer,
  }
}
