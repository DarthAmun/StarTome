/**
 * One session's board as the page works with it: its panels, connections and
 * drawer (live from the database), and what play does to it: statuses, the
 * "happened next" chain, the panel the capture bar writes to.
 */
import { computed, reactive, type Ref } from 'vue'
import { SEQUENCE_KINDS, TOUCH_STATUS, TOUCHED } from '@/domain/rules/sessionBoard'
import type { EntryOf, SessionPanel } from '@/domain/schema'
import { addEdge, patchPanel, sessions } from '@/data/sessions'
import { reportError } from '@/ui/dialogs'
import { useLive } from '@/ui/useLive'

/** Per session: the panel last clicked (the capture bar's target) and the end of the chain. Kept while the app runs, so coming back from an encounter restores it. */
const memory = reactive(new Map<string, { selectedId: string | null; lastTouchedId: string | null }>())
export function boardMemory(sessionId: string) {
  let m = memory.get(sessionId)
  if (!m) { memory.set(sessionId, { selectedId: null, lastTouchedId: null }); m = memory.get(sessionId) }
  return m as { selectedId: string | null; lastTouchedId: string | null }
}

export function useBoard(session: Ref<EntryOf<'session'> | null>) {
  const id = () => session.value?.id ?? ''
  const panels = useLive(() => (id() ? sessions.panels(id()) : Promise.resolve([])), [], [id])
  const edges = useLive(() => (id() ? sessions.edges(id()) : Promise.resolve([])), [], [id])
  const drawer = useLive(() => (session.value ? sessions.drawer(session.value.campaignId) : Promise.resolve([])), [], [() => session.value?.campaignId])
  const mem = computed(() => boardMemory(id()))
  const running = computed(() => session.value?.data.mode === 'running')
  const selected = computed(() => panels.value.find(p => p.id === mem.value.selectedId) ?? null)
  const fail = (what: string) => (err: unknown) => reportError(what, err)

  // Text is written after a short pause, per panel
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const pending = new Map<string, Parameters<typeof patchPanel>[1]>()
  function flush(panelId?: string) {
    for (const key of panelId ? [panelId] : [...pending.keys()]) {
      const t = timers.get(key), patch = pending.get(key)
      if (t) clearTimeout(t)
      timers.delete(key)
      pending.delete(key)
      if (patch) patchPanel(key, patch).catch(fail('Saving the panel'))
    }
  }
  function update(panelId: string, patch: Parameters<typeof patchPanel>[1], now = false) {
    pending.set(panelId, { ...(pending.get(panelId) ?? {}), ...patch })
    const t = timers.get(panelId)
    if (t) clearTimeout(t)
    if (now) flush(panelId)
    else timers.set(panelId, setTimeout(() => flush(panelId), 400))
  }

  function select(panelId: string | null) { mem.value.selectedId = panelId }

  /** A panel came up in play: while the session runs it joins the "happened next" chain after the one before it. */
  function touch(panel: SessionPanel) {
    if (!running.value || !SEQUENCE_KINDS.has(panel.kind)) return
    const prev = mem.value.lastTouchedId
    if (prev === panel.id) return
    if (prev && panels.value.some(p => p.id === prev)) addEdge(id(), prev, panel.id, 'sequence').catch(fail('Saving the connection'))
    mem.value.lastTouchedId = panel.id
  }

  function setStatus(panel: SessionPanel, status: string) {
    update(panel.id, { status }, true)
    if (TOUCHED.has(status) && !TOUCHED.has(panel.status ?? '')) touch(panel)
    select(panel.id)
  }

  /** Something was logged on this panel: an untouched scene, beat or clue now counts as played. */
  function markLogged(panel: SessionPanel) {
    const to = TOUCH_STATUS[panel.kind]
    if (to && !TOUCHED.has(panel.status ?? '') && panel.status !== 'skipped') setStatus(panel, to)
    else touch(panel)
  }

  /** Sequence connections numbered in the order they were made. */
  const sequenceNumbers = computed(() => new Map(edges.value.filter(e => e.kind === 'sequence').map((e, i) => [e.id, i + 1])))

  return { panels, edges, drawer, running, selected, select, update, flush, touch, setStatus, markLogged, sequenceNumbers }
}
export type Board = ReturnType<typeof useBoard>
