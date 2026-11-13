/**
 * Session boards: the panels of a session, the campaign's drawer of unplaced
 * panels, and the connections between panels. A session's body (what search
 * and links read) is rebuilt from its panels whenever they change.
 */
import { newId, nowIso } from '@/domain/ids'
import { blankPanel, boardText, carryOverLayout, PANEL_CONFIG, type PanelKind } from '@/domain/rules/sessionBoard'
import { zSessionEdge, zSessionPanel, type EntryOf, type SessionEdge, type SessionPanel } from '@/domain/schema'
import { getDb } from './db'
import { createEntry, saveEntry } from './entries'

const panels = () => getDb().rows('sessionPanels')
const edges = () => getDb().rows('sessionEdges')
type Session = EntryOf<'session'>
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
/** A session's number: the field, or the number its name ends in ("Session 39"). */
export const sessionNumber = (s: Session): number | null => { const n = parseInt(s.data.number || (/(\d+)\s*$/.exec(s.name)?.[1] ?? ''), 10); return Number.isNaN(n) ? null : n }

export const sessions = {
  /** Sessions of a campaign, by number, then by when they were made. */
  async ofCampaign(campaignId: string): Promise<Session[]> {
    const rows = await getDb().rows('entries').where('[campaignId+type]').equals([campaignId, 'session']).toArray() as Session[]
    const num = (s: Session) => sessionNumber(s) ?? Infinity
    return rows.sort((a, b) => num(a) - num(b) || a.createdAt.localeCompare(b.createdAt))
  },
  /** The session being run in this campaign, if any. */
  running: async (campaignId: string): Promise<Session | null> => (await sessions.ofCampaign(campaignId)).find(s => s.data.mode === 'running') ?? null,
  panels: (sessionId: string): Promise<SessionPanel[]> => panels().where('sessionId').equals(sessionId).toArray(),
  drawer: async (campaignId: string): Promise<SessionPanel[]> => (await panels().where('campaignId').equals(campaignId).toArray()).filter(p => p.sessionId === null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  edges: (sessionId: string): Promise<SessionEdge[]> => edges().where('sessionId').equals(sessionId).toArray(),
  /** Scenes of every other campaign, to copy from. */
  async scenesElsewhere(campaignId: string): Promise<{ panel: SessionPanel; campaign: string }[]> {
    const db = getDb()
    const names = new Map((await db.rows('campaigns').toArray()).map(c => [c.id, c.name]))
    return (await panels().toArray()).filter(p => p.kind === 'scene' && p.campaignId !== campaignId && names.has(p.campaignId)).map(p => ({ panel: p, campaign: names.get(p.campaignId) ?? '' }))
  },
}

/** Rebuilds the session's body from its panels; its links follow. */
export async function syncSessionText(sessionId: string): Promise<void> {
  const body = boardText(await sessions.panels(sessionId))
  const entry = await getDb().rows('entries').get(sessionId)
  if (entry && entry.body !== body) await saveEntry(sessionId, { body })
}

export async function createSession(campaignId: string): Promise<Session> {
  const all = await sessions.ofCampaign(campaignId)
  const n = Math.max(0, ...all.map(s => sessionNumber(s) ?? 0)) + 1 || all.length + 1
  const entry = await createEntry(campaignId, 'session', `Session ${n}`)
  return (await saveEntry(entry.id, { data: { number: String(n), mode: 'planning' } })) as Session
}

/** The session after this one; made as "Session N+1" when `create` and there is none. */
export async function nextSession(session: Session, create: boolean): Promise<Session | null> {
  const all = await sessions.ofCampaign(session.campaignId)
  const i = all.findIndex(s => s.id === session.id)
  if (i >= 0 && i < all.length - 1) return all[i + 1] ?? null
  return create ? createSession(session.campaignId) : null
}

export interface NewPanel { campaignId: string; sessionId: string | null; kind: PanelKind; x: number; y: number; parentId?: string | null; title?: string; body?: string; status?: string | null; attrs?: Record<string, unknown>; tags?: string[] }

export async function addPanel(input: NewPanel): Promise<SessionPanel> {
  const ts = nowIso()
  const base = blankPanel(input.kind, ts)
  const row = zSessionPanel.parse(plain({
    ...base, ...input, attrs: { ...base.attrs, ...(input.attrs ?? {}) }, title: input.title ?? base.title, status: input.status === undefined ? base.status : input.status,
    id: newId(), originSessionId: input.sessionId, createdAt: ts, updatedAt: ts,
  }))
  await panels().put(row)
  if (row.sessionId) await syncSessionText(row.sessionId)
  return row
}

export type PanelPatch = Partial<Pick<SessionPanel, 'title' | 'body' | 'status' | 'attrs' | 'tags' | 'x' | 'y' | 'w' | 'h' | 'parentId' | 'sessionId'>>

export async function patchPanel(id: string, patch: PanelPatch): Promise<void> {
  let sessionId: string | null = null
  await getDb().transaction('rw', panels(), async () => {
    const row = await panels().get(id)
    if (!row) return
    await panels().put(zSessionPanel.parse({ ...row, ...plain(patch), updatedAt: nowIso() }))
    if ('title' in patch || 'body' in patch || 'attrs' in patch) sessionId = row.sessionId
  })
  if (sessionId) await syncSessionText(sessionId)
}

/** Removes a panel's connections; panels inside a frame stay where they are on the board. */
async function unhook(panel: SessionPanel): Promise<void> {
  if (!panel.sessionId) return
  const mine = (await sessions.edges(panel.sessionId)).filter(e => e.sourceId === panel.id || e.targetId === panel.id)
  await edges().bulkDelete(mine.map(e => e.id))
  if (panel.kind !== 'frame') return
  for (const child of (await sessions.panels(panel.sessionId)).filter(p => p.parentId === panel.id)) await panels().put({ ...child, parentId: null, x: child.x + panel.x, y: child.y + panel.y })
}

export async function deletePanel(id: string): Promise<void> {
  const panel = await panels().get(id)
  if (!panel) return
  await unhook(panel)
  await panels().delete(id)
  if (panel.sessionId) await syncSessionText(panel.sessionId)
}

/** Board → the campaign's drawer. */
export async function moveToDrawer(id: string): Promise<void> {
  const panel = await panels().get(id)
  if (!panel?.sessionId || panel.kind === 'frame') return
  await unhook(panel)
  await panels().put({ ...panel, sessionId: null, parentId: null, updatedAt: nowIso() })
  await syncSessionText(panel.sessionId)
}

/** Drawer → a board. */
export async function placeFromDrawer(id: string, sessionId: string, at: { x: number; y: number }): Promise<void> {
  const panel = await panels().get(id)
  if (!panel) return
  await panels().put({ ...panel, sessionId, parentId: null, x: at.x, y: at.y, updatedAt: nowIso() })
  await syncSessionText(sessionId)
}

/** A fresh copy of a panel (a scene from another campaign) in this campaign's drawer. */
export async function copyToDrawer(source: SessionPanel, campaignId: string, extraTags: string[] = []): Promise<SessionPanel> {
  const ts = nowIso()
  const row = zSessionPanel.parse({
    ...plain(source), id: newId(), campaignId, sessionId: null, parentId: null, originSessionId: null, status: PANEL_CONFIG[source.kind].statuses?.[0] ?? null, attrs: {},
    tags: [...new Set([...source.tags, ...extraTags])], createdAt: ts, updatedAt: ts,
  })
  await panels().put(row)
  return row
}

/**
 * Puts panels on another session's board, in a new frame below what is there.
 * `copy` leaves the panel where it is and puts a fresh "planned" copy there
 * (a scene that continues); otherwise the panel moves.
 */
export async function sendToSession(fromId: string, target: Session, items: { id: string; copy: boolean }[], frameTitle: string): Promise<void> {
  if (!items.length) return
  const { frame, spots } = carryOverLayout(await sessions.panels(target.id), items.length)
  const group = await addPanel({ campaignId: target.campaignId, sessionId: target.id, kind: 'frame', x: frame.x, y: frame.y, title: frameTitle })
  await panels().update(group.id, { w: frame.w, h: frame.h })
  const ts = nowIso()
  for (const [i, item] of items.entries()) {
    const panel = await panels().get(item.id), at = spots[i]
    if (!panel || !at) continue
    if (item.copy) {
      await panels().put(zSessionPanel.parse({ ...plain(panel), ...at, id: newId(), sessionId: target.id, parentId: group.id, status: 'planned', attrs: { ...panel.attrs, continuedFrom: { sessionId: fromId, panelId: panel.id } }, originSessionId: panel.originSessionId ?? fromId, createdAt: ts, updatedAt: ts }))
    } else {
      await unhook(panel)
      await panels().put({ ...panel, ...at, sessionId: target.id, parentId: group.id, updatedAt: ts })
    }
  }
  await syncSessionText(fromId)
  await syncSessionText(target.id)
}

// ── Connections ────────────────────────────────────────────────────────────

export async function addEdge(sessionId: string, sourceId: string, targetId: string, kind: SessionEdge['kind']): Promise<void> {
  if (sourceId === targetId) return
  if ((await sessions.edges(sessionId)).some(e => e.sourceId === sourceId && e.targetId === targetId && e.kind === kind)) return
  await edges().put(zSessionEdge.parse({ id: newId(), sessionId, sourceId, targetId, kind }))
}
export const patchEdge = (id: string, patch: Partial<Pick<SessionEdge, 'kind' | 'label'>>) => edges().update(id, patch)
export const removeEdge = (id: string) => edges().delete(id)

/** A line of the session's log: a log panel, attached to the panel it is about (or free, as improvised). */
export async function addLog(session: Session, text: string, opts: { logType?: string; attachTo?: SessionPanel | null; playersShouldKnow?: boolean; at?: { x: number; y: number } } = {}): Promise<SessionPanel> {
  const all = await sessions.panels(session.id)
  const anchor = opts.attachTo
  const logsThere = anchor ? all.filter(p => p.kind === 'log' && Math.abs(p.x - anchor.x) < 40 && p.y > anchor.y).length : all.filter(p => p.kind === 'log').length
  const at = opts.at ?? (anchor ? { x: anchor.x + 20, y: anchor.y + 220 + logsThere * 130 } : { x: -300, y: logsThere * 130 })
  const log = await addPanel({
    campaignId: session.campaignId, sessionId: session.id, kind: 'log', ...at, parentId: anchor?.parentId ?? null, body: text,
    attrs: { logType: opts.logType ?? (anchor ? 'happened' : 'improvised'), ...(opts.playersShouldKnow ? { playersShouldKnow: true } : {}) },
  })
  if (anchor) await addEdge(session.id, log.id, anchor.id, 'attach')
  return log
}

/** What an encounter panel shows of its encounter, and the outcome line once it is resolved. */
export async function encounterBrief(encounterId: string): Promise<{ name: string; status: string; outcome: import('@/domain/rules/sessionBoard').OutcomeInput } | null> {
  const db = getDb()
  const enc = await db.rows('encounters').get(encounterId)
  if (!enc) return null
  const log = await db.rows('combatLog').where('[encounterId+seq]').between([encounterId, -Infinity], [encounterId, Infinity]).toArray()
  const record = (await db.rows('partyLedger').where('campaignId').equals(enc.campaignId).toArray()).find(l => l.kind === 'encounterResolved' && l.encounterId === encounterId && !l.undoneAt)
  const loot = (record?.kind === 'encounterResolved' ? record.loot : {}) as { rows?: unknown[]; cp?: number }
  const game = (await db.rows('campaigns').get(enc.campaignId))?.game ?? 'pf2e'
  const cp = loot.cp ?? 0
  return {
    name: enc.name, status: enc.status,
    outcome: {
      name: enc.name, rounds: log.reduce((m, e) => Math.max(m, e.round), 0), defeated: enc.defeated.map(d => String(d.name ?? '')).filter(Boolean),
      fallen: log.filter(e => e.type === 'death' && e.combatantName).map(e => e.combatantName), xpEach: enc.xpAwarded,
      lootStacks: loot.rows?.length ?? 0, lootText: cp ? (game === 'sf2e' ? `${(cp / 10).toLocaleString()} credits` : `${(cp / 100).toLocaleString()} gp`) : '',
    },
  }
}
