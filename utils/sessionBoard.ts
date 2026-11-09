/**
 * The session board (SESSION_BOARD_PLAN.md): panel kinds, the conversion of
 * old two-editor sessions into panels, and the text a board stands for
 * (search and links read the session's `content`, built from its panels).
 */
import { extractLinks } from '~/composables/useEntityParser'
import type { DbSessionPanel, SessionBoardEdge, SessionPanelKind } from '~/db/schema'

export type { DbSessionPanel, SessionBoardEdge, SessionPanelKind } from '~/db/schema'

export interface PanelKindConfig {
  label: string
  color: string
  icon: string
  /** Has markdown text, edited in the side drawer. */
  hasContent: boolean
  /** Statuses in cycle order; the first is where a new panel starts. */
  statuses?: string[]
  /** Width a new panel gets on the board. */
  width: number
}

export const PANEL_KINDS: Record<SessionPanelKind, PanelKindConfig> = {
  scene:          { label: 'Scene',        color: '#b87de8', icon: 'gi-scroll-unfurled',       hasContent: true,  statuses: ['planned', 'played', 'continued', 'skipped'], width: 260 },
  beat:           { label: 'Beat',         color: '#6b9fe8', icon: 'gi-footsteps',             hasContent: true,  statuses: ['open', 'done'], width: 200 },
  clue:           { label: 'Clue',         color: '#e8c44a', icon: 'gi-magnifying-glass',      hasContent: true,  statuses: ['hidden', 'revealed'], width: 220 },
  encounter:      { label: 'Encounter',    color: '#e05555', icon: 'gi-crossed-swords',        hasContent: false, width: 220 },
  log:            { label: 'Log',          color: '#7cc44e', icon: 'gi-quill-ink',             hasContent: true,  width: 240 },
  note:           { label: 'Note',         color: '#8fa3b8', icon: 'gi-notebook',              hasContent: true,  width: 240 },
  entity:         { label: 'Entity',       color: '#4ab8e8', icon: 'gi-person',                hasContent: false, width: 210 },
  'random-table': { label: 'Random table', color: '#e8924a', icon: 'gi-dice-six-faces-six',    hasContent: false, width: 210 },
  reward:         { label: 'Reward',       color: '#d4af37', icon: 'gi-coins',                 hasContent: true,  statuses: ['pending', 'awarded'], width: 220 },
  frame:          { label: 'Frame',        color: '#5fc98a', icon: 'gi-square',                  hasContent: false, width: 520 },
}

/** Palette order. */
export const PANEL_KIND_ORDER: SessionPanelKind[] = ['scene', 'beat', 'clue', 'encounter', 'log', 'note', 'entity', 'random-table', 'reward', 'frame']

export const LOG_TYPES = ['happened', 'changed', 'improvised', 'consequence'] as const
export type LogType = typeof LOG_TYPES[number]

export const LOG_TYPE_COLORS: Record<LogType, string> = {
  happened: '#7cc44e', changed: '#e8924a', improvised: '#4ab8e8', consequence: '#e05555',
}

export const EDGE_KIND_STYLE: Record<SessionBoardEdge['kind'], { stroke: string; dash?: string; width: number }> = {
  plan:     { stroke: 'var(--text3)', dash: '6 4', width: 1.5 },
  sequence: { stroke: 'var(--accent)', width: 2.5 },
  attach:   { stroke: '#7cc44e', dash: '2 3', width: 1.5 },
}

export function newUid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/** A panel that hasn't been written yet. */
export type NewPanel = Omit<DbSessionPanel, 'id'>

export function blankPanel(kind: SessionPanelKind, campaignId: number, sessionId: number | null, at: { x: number; y: number }, title = ''): NewPanel {
  const cfg = PANEL_KINDS[kind]
  const ts = new Date().toISOString()
  return {
    uid: newUid(), campaign_id: campaignId, session_id: sessionId, kind,
    title: title || (kind === 'frame' ? 'Group' : ''),
    content: '', status: cfg.statuses?.[0], attrs: kind === 'log' ? { logType: 'happened', at: ts } : kind === 'frame' ? { color: cfg.color } : {},
    tags: [], x: at.x, y: at.y,
    ...(kind === 'frame' ? { w: 520, h: 320 } : {}),
    origin_session_id: sessionId ?? undefined,
    created_at: ts, updated_at: ts,
  }
}

// ── Old sessions → board ─────────────────────────────────────────────────

export interface LegacySession {
  mode?: string
  scriptContent?: string
  notesContent?: string
  /** `content` held the notes before notesContent existed. */
  content?: string
}

const HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/

/**
 * One old session as panels and plan connections: the prep split at its
 * headings into Scenes (text before the first heading becomes a "Prep" Note),
 * the notes from play as one unattached Log below.
 */
export function legacySessionToBoard(s: LegacySession, campaignId: number, sessionId: number, ts = new Date().toISOString()): { panels: NewPanel[]; edges: SessionBoardEdge[] } {
  const played = s.mode === 'running' || s.mode === 'finished'
  const panels: NewPanel[] = []
  const base = { campaign_id: campaignId, session_id: sessionId, tags: [] as string[], origin_session_id: sessionId, created_at: ts, updated_at: ts }

  const sections: { title: string; body: string[] }[] = []
  let preamble: string[] = []
  let inFence = false
  for (const line of (s.scriptContent ?? '').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    const m = !inFence && line.match(HEADING)
    if (m) sections.push({ title: m[2], body: [] })
    else if (sections.length) sections[sections.length - 1].body.push(line)
    else preamble.push(line)
  }
  // Blank lines and `---` separators around a section belong to neither neighbour
  const trim = (lines: string[]) => lines.join('\n').replace(/^(\s*(-{3,}|\*{3,})?\s*\n)+/, '').replace(/(\n\s*(-{3,}|\*{3,})?\s*)+$/, '').trim()

  const pre = trim(preamble)
  const rowY = pre ? 220 : 0
  if (pre) panels.push({ ...base, uid: newUid(), kind: 'note', title: 'Prep', content: pre, attrs: {}, x: 0, y: 0 })
  sections.forEach((sec, i) => {
    panels.push({ ...base, uid: newUid(), kind: 'scene', title: sec.title, content: trim(sec.body), status: played ? 'played' : 'planned', attrs: {}, x: i * 300, y: rowY })
  })

  const notes = (s.notesContent ?? s.content ?? '').trim()
  if (notes) {
    panels.push({
      ...base, uid: newUid(), kind: 'log', title: 'Notes (from the old editor)', content: notes,
      attrs: { logType: 'happened', at: ts }, x: 0, y: rowY + (sections.length ? 260 : 0),
    })
  }

  const scenes = panels.filter(p => p.kind === 'scene')
  const edges: SessionBoardEdge[] = scenes.slice(1).map((p, i) => ({ id: newUid(), source: scenes[i].uid, target: p.uid, kind: 'plan' }))
  return { panels, edges }
}

// ── Board → text ─────────────────────────────────────────────────────────

/**
 * The text a board stands for, stored as the session's `content`: global
 * search reads it and the session's links (backlinks on NPCs …) come from it.
 */
export function boardText(panels: Pick<DbSessionPanel, 'kind' | 'title' | 'content' | 'attrs' | 'x' | 'y'>[]): string {
  const ordered = [...panels].sort((a, b) => a.y - b.y || a.x - b.x)
  const parts: string[] = []
  for (const p of ordered) {
    if (p.kind === 'frame') continue
    const lines: string[] = []
    if (p.title) lines.push(`### ${p.title}`)
    const ref = panelRef(p)
    if (ref) lines.push(ref)
    if (p.content?.trim()) lines.push(p.content.trim())
    if (lines.length) parts.push(lines.join('\n'))
  }
  return parts.join('\n\n')
}

/** The `{{type: Name}}` link a link-only panel stands for. */
function panelRef(p: Pick<DbSessionPanel, 'kind' | 'title' | 'attrs'>): string | null {
  const a = (p.attrs ?? {}) as Record<string, unknown>
  if (!p.title) return null
  if (p.kind === 'encounter' && a.encounterId != null) return `{{encounter: ${p.title}}}`
  if (p.kind === 'random-table' && a.entityId != null) return `{{random-table: ${p.title}}}`
  if (p.kind === 'entity' && a.entityId != null && typeof a.entityType === 'string') return `{{${a.entityType}: ${p.title}}}`
  return null
}

// ── Converting stored sessions ───────────────────────────────────────────

/** The Dexie tables `convertLegacySessions` works on (a transaction's or the database's). */
export interface BoardTables {
  entities: any
  sessionPanels: any
  entityLinks: any
}

function objectOf(v: unknown): Record<string, any> {
  if (v && typeof v === 'object') return v as Record<string, any>
  if (typeof v === 'string') { try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : {} } catch { return {} } }
  return {}
}

/**
 * Every session without a board gets one from its old prep and notes: on
 * opening the database (v19), imports (backups, campaign files, DM's Tome) and the demo campaign.
 * Its `content` and links are rebuilt from the panels. Returns how many were converted.
 */
export async function convertLegacySessions(t: BoardTables, campaignId?: number): Promise<number> {
  const sessions: { id: number; campaign_id: number; content?: string; attributes: unknown }[] =
    await t.entities.where('type').equals('session').toArray()
  let n = 0
  for (const row of sessions) {
    if (campaignId != null && row.campaign_id !== campaignId) continue
    const attrs = objectOf(row.attributes)
    if (attrs.board?.migrated) continue
    const { panels, edges } = legacySessionToBoard({ ...attrs, content: row.content }, row.campaign_id, row.id)
    if (panels.length) await t.sessionPanels.bulkAdd(panels)
    const content = boardText(panels)
    await t.entities.update(row.id, {
      content,
      attributes: { ...attrs, board: { edges, viewport: { x: 40, y: 40, zoom: 0.9 }, migrated: true } },
    })
    await t.entityLinks.where('source_id').equals(row.id).delete()
    const links = extractLinks(content).map(l => ({ source_id: row.id, target_type: l.type, target_name: l.name, metadata: l.metadata ?? {} }))
    if (links.length) await t.entityLinks.bulkAdd(links)
    n++
  }
  return n
}

// ── Reading a board back ─────────────────────────────────────────────────

/**
 * A session's Logs in the order they were written (time, then board
 * position), each with the panels it's attached to. The Session Log page
 * reads sessions this way.
 */
export function logsInOrder<P extends Pick<DbSessionPanel, 'uid' | 'kind' | 'attrs' | 'x' | 'y'>>(panels: P[], edges: SessionBoardEdge[]): { log: P; attachedTo: P[] }[] {
  const byUid = new Map(panels.map(p => [p.uid, p]))
  const time = (p: P) => (typeof p.attrs?.at === 'string' ? Date.parse(p.attrs.at as string) || 0 : 0)
  return panels
    .filter(p => p.kind === 'log')
    .sort((a, b) => time(a) - time(b) || a.y - b.y || a.x - b.x)
    .map(log => ({
      log,
      attachedTo: edges
        .filter(e => e.kind === 'attach' && (e.source === log.uid || e.target === log.uid))
        .map(e => byUid.get(e.source === log.uid ? e.target : e.source))
        .filter((p): p is P => !!p && p.kind !== 'log'),
    }))
}

// ── Play helpers ─────────────────────────────────────────────────────────

/** A roll on a random table: the die from its attributes (d20 when unset), the row it lands on. */
export function rollOnTable(table: { die?: string; rows?: { min: number; max: number; result: string }[] }, random = Math.random): { roll: number; result: string } {
  const sides = Number((table.die ?? 'd20').replace(/^d/, '')) || 20
  const roll = 1 + Math.floor(random() * sides)
  const row = (table.rows ?? []).find(r => roll >= r.min && roll <= r.max)
  return { roll, result: row?.result ?? '—' }
}

export interface EncounterOutcomeInput {
  name: string
  combat_log?: unknown
  defeated?: unknown
  xp_awarded?: number | null
  resolution?: unknown
}

/** The text of the Log an Encounter panel gets when its encounter is resolved. */
export function encounterOutcome(enc: EncounterOutcomeInput): string {
  const log = (Array.isArray(enc.combat_log) ? enc.combat_log : []) as { round?: number; type?: string; tokenName?: string }[]
  const rounds = log.reduce((m, e) => Math.max(m, e.round ?? 0), 0)
  const defeated = (Array.isArray(enc.defeated) ? enc.defeated : []) as { name?: string }[]
  const fallen = [...new Set(log.filter(e => e.type === 'death' && e.tokenName).map(e => e.tokenName!))]
  const res = (enc.resolution && typeof enc.resolution === 'object' ? enc.resolution : {}) as { loot?: { entries?: unknown[]; cp?: number } }
  const lines = [`Resolved {{encounter: ${enc.name}}}${rounds ? ` after ${rounds} round${rounds === 1 ? '' : 's'}` : ''}.`]
  const names = defeated.map(d => d.name).filter(Boolean) as string[]
  if (names.length) lines.push(`- Defeated: ${countNames(names)}`)
  const down = fallen.filter(n => !names.includes(n))
  if (down.length) lines.push(`- Went down: ${down.join(', ')}`)
  if (enc.xp_awarded) lines.push(`- XP: ${enc.xp_awarded} each`)
  const stacks = res.loot?.entries?.length ?? 0
  const cp = res.loot?.cp ?? 0
  if (stacks || cp) lines.push(`- Loot to the stash: ${[stacks ? `${stacks} item${stacks === 1 ? '' : 's'}` : '', cp ? `${(cp / 100).toLocaleString()} gp` : ''].filter(Boolean).join(' and ')}`)
  return lines.join('\n')
}

function countNames(names: string[]): string {
  const counts = new Map<string, number>()
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1)
  return [...counts].map(([n, c]) => (c > 1 ? `${c}× ${n}` : n)).join(', ')
}

// ── Finishing a session ──────────────────────────────────────────────────

/** What happens to an unused panel when a session is finished. */
export type FinishChoice = 'next' | 'drawer' | 'leave'

export interface FinishRow<P> {
  panel: P
  /** Why it's listed: "not played", "continued" … */
  reason: string
  choice: FinishChoice
  choices: FinishChoice[]
  /** A continued scene is copied to the next session; it stays on this board as played so far. */
  copy: boolean
}

/**
 * The panels a finish review lists, with their default choice
 * (SESSION_BOARD_PLAN.md §6): untouched scenes to the drawer, continued
 * scenes and loose prep (beats, clues, rewards, encounters) to the next session.
 */
export function finishReviewRows<P extends Pick<DbSessionPanel, 'kind' | 'status' | 'attrs'>>(panels: P[], encounterResolved: (id: number) => boolean): FinishRow<P>[] {
  const rows: FinishRow<P>[] = []
  for (const p of panels) {
    const row = (reason: string, choice: FinishChoice, choices: FinishChoice[], copy = false) => rows.push({ panel: p, reason, choice, choices, copy })
    if (p.kind === 'scene' && (p.status ?? 'planned') === 'planned') row('not played', 'drawer', ['drawer', 'next', 'leave'])
    else if (p.kind === 'scene' && p.status === 'continued') row('continued', 'next', ['next', 'drawer', 'leave'], true)
    else if (p.kind === 'beat' && p.status !== 'done') row('not done', 'next', ['next', 'drawer', 'leave'])
    else if (p.kind === 'clue' && p.status !== 'revealed') row('not revealed', 'next', ['next', 'drawer', 'leave'])
    else if (p.kind === 'reward' && p.status !== 'awarded') row('not awarded', 'next', ['next', 'leave'])
    else if (p.kind === 'encounter' && typeof p.attrs.encounterId === 'number' && !encounterResolved(p.attrs.encounterId)) row('not run', 'next', ['next', 'drawer', 'leave'])
  }
  return rows
}

/** Where carried-over panels go on the next board: a frame below what's there, four per row. */
export function carryOverLayout(existing: Pick<DbSessionPanel, 'x' | 'y' | 'h' | 'kind' | 'parent_uid'>[], count: number): { frame: { x: number; y: number; w: number; h: number }; spots: { x: number; y: number }[] } {
  const top = existing.filter(p => !p.parent_uid)
  const bottom = top.length ? Math.max(...top.map(p => p.y + (p.kind === 'frame' ? (p.h ?? 320) : 200))) + 80 : 0
  const left = top.length ? Math.min(...top.map(p => p.x)) : 0
  const perRow = 4
  const rowsN = Math.max(1, Math.ceil(count / perRow))
  const spots = Array.from({ length: count }, (_, i) => ({ x: 30 + (i % perRow) * 290, y: 60 + Math.floor(i / perRow) * 230 }))
  return { frame: { x: left, y: bottom, w: 30 + Math.min(count, perRow) * 290, h: 60 + rowsN * 230 }, spots }
}
