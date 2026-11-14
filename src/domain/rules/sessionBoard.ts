/**
 * The session board: panel kinds and their statuses, the text a board stands
 * for (search and links read the session's body, built from its panels), the
 * log in the order it was written, and what finishing a session does with
 * prep that did not come up. Pure.
 */
import type { SessionEdge, SessionPanel } from '@/domain/schema'

export type PanelKind = SessionPanel['kind']

export interface PanelKindConfig {
  label: string
  color: string
  /** Has markdown text. */
  hasText: boolean
  /** Statuses in cycle order; the first is where a new panel starts. */
  statuses?: string[]
  /** Width a new panel gets on the board. */
  width: number
}

export const PANEL_CONFIG: Record<PanelKind, PanelKindConfig> = {
  scene: { label: 'Scene', color: '#b87de8', hasText: true, statuses: ['planned', 'played', 'continued', 'skipped'], width: 260 },
  beat: { label: 'Beat', color: '#6b9fe8', hasText: true, statuses: ['open', 'done'], width: 200 },
  clue: { label: 'Clue', color: '#e8c44a', hasText: true, statuses: ['hidden', 'revealed'], width: 220 },
  encounter: { label: 'Encounter', color: '#e05555', hasText: false, width: 220 },
  log: { label: 'Log', color: '#7cc44e', hasText: true, width: 240 },
  note: { label: 'Note', color: '#8fa3b8', hasText: true, width: 240 },
  entity: { label: 'Entry', color: '#4ab8e8', hasText: false, width: 210 },
  'random-table': { label: 'Random table', color: '#e8924a', hasText: false, width: 210 },
  reward: { label: 'Reward', color: '#d4af37', hasText: true, statuses: ['pending', 'awarded'], width: 220 },
  frame: { label: 'Frame', color: '#5fc98a', hasText: false, width: 520 },
}
export const PANEL_ORDER: PanelKind[] = ['scene', 'beat', 'clue', 'encounter', 'log', 'note', 'entity', 'random-table', 'reward', 'frame']

export const LOG_TYPES = ['happened', 'changed', 'improvised', 'consequence'] as const
export type LogType = (typeof LOG_TYPES)[number]
export const LOG_TYPE_COLORS: Record<LogType, string> = { happened: '#7cc44e', changed: '#e8924a', improvised: '#4ab8e8', consequence: '#e05555' }

/** Statuses that mean a panel came up in play. */
export const TOUCHED = new Set(['played', 'continued', 'done', 'revealed', 'awarded'])
/** What a panel's status becomes when something is logged on it while the session runs. */
export const TOUCH_STATUS: Partial<Record<PanelKind, string>> = { scene: 'played', beat: 'done', clue: 'revealed' }
/** Panels that can be part of the "happened next" chain. */
export const SEQUENCE_KINDS = new Set<PanelKind>(['scene', 'beat', 'clue', 'encounter'])

/** What a new panel starts with, besides its ids and place. */
export function blankPanel(kind: PanelKind, now: string): Pick<SessionPanel, 'kind' | 'title' | 'body' | 'status' | 'attrs' | 'tags' | 'w' | 'h'> {
  const cfg = PANEL_CONFIG[kind]
  return {
    kind, title: kind === 'frame' ? 'Group' : '', body: '', status: cfg.statuses?.[0] ?? null, tags: [],
    attrs: kind === 'log' ? { logType: 'happened', at: now } : kind === 'frame' ? { color: cfg.color } : {},
    w: kind === 'frame' ? 520 : null, h: kind === 'frame' ? 320 : null,
  }
}

type TextPanel = Pick<SessionPanel, 'kind' | 'title' | 'body' | 'attrs' | 'x' | 'y'>

/** The `{{type: Name}}` link a link-only panel stands for. */
function panelRef(p: TextPanel): string | null {
  if (!p.title) return null
  if (p.kind === 'encounter' && p.attrs.encounterId != null) return `{{encounter: ${p.title}}}`
  if (p.kind === 'random-table' && p.attrs.entryId != null) return `{{random-table: ${p.title}}}`
  if (p.kind === 'entity' && p.attrs.entryId != null && typeof p.attrs.entryType === 'string') return `{{${p.attrs.entryType}: ${p.title}}}`
  return null
}

/** The text a board stands for, stored as the session's body. */
export function boardText(panels: TextPanel[]): string {
  const parts: string[] = []
  for (const p of [...panels].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (p.kind === 'frame') continue
    const lines: string[] = []
    if (p.title) lines.push(`### ${p.title}`)
    const ref = panelRef(p)
    if (ref) lines.push(ref)
    if (p.body.trim()) lines.push(p.body.trim())
    if (lines.length) parts.push(lines.join('\n'))
  }
  return parts.join('\n\n')
}

type LogPanel = Pick<SessionPanel, 'id' | 'kind' | 'attrs' | 'x' | 'y'>

/** A session's logs in the order they were written (time, then place), each with the panels it is attached to. */
export function logsInOrder<P extends LogPanel>(panels: P[], edges: Pick<SessionEdge, 'sourceId' | 'targetId' | 'kind'>[]): { log: P; attachedTo: P[] }[] {
  const byId = new Map(panels.map(p => [p.id, p]))
  const time = (p: P) => (typeof p.attrs.at === 'string' ? Date.parse(p.attrs.at) || 0 : 0)
  return panels.filter(p => p.kind === 'log').sort((a, b) => time(a) - time(b) || a.y - b.y || a.x - b.x).map(log => ({
    log,
    attachedTo: edges.filter(e => e.kind === 'attach' && (e.sourceId === log.id || e.targetId === log.id))
      .map(e => byId.get(e.sourceId === log.id ? e.targetId : e.sourceId)).filter((p): p is P => !!p && p.kind !== 'log'),
  }))
}

/** A roll on a random table: the row its die lands on. */
export function rollOnTable(table: { die?: string; rows?: { min: number; max: number; result: string }[] }, random = Math.random): { roll: number; result: string } {
  const sides = Number((table.die ?? 'd20').replace(/^d/, '')) || 20
  const roll = 1 + Math.floor(random() * sides)
  return { roll, result: (table.rows ?? []).find(r => roll >= r.min && roll <= r.max)?.result ?? '—' }
}

function countNames(names: string[]): string {
  const counts = new Map<string, number>()
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1)
  return [...counts].map(([n, c]) => (c > 1 ? `${c}× ${n}` : n)).join(', ')
}

export interface OutcomeInput { name: string; rounds: number; defeated: string[]; fallen: string[]; xpEach: number | null; lootStacks: number; lootText: string }

/** The text of the log an encounter panel gets when its encounter is resolved. */
export function encounterOutcome(o: OutcomeInput): string {
  const lines = [`Resolved {{encounter: ${o.name}}}${o.rounds ? ` after ${o.rounds} round${o.rounds === 1 ? '' : 's'}` : ''}.`]
  if (o.defeated.length) lines.push(`- Defeated: ${countNames(o.defeated)}`)
  const down = [...new Set(o.fallen)].filter(n => !o.defeated.includes(n))
  if (down.length) lines.push(`- Went down: ${down.join(', ')}`)
  if (o.xpEach) lines.push(`- XP: ${o.xpEach} each`)
  const loot = [o.lootStacks ? `${o.lootStacks} item${o.lootStacks === 1 ? '' : 's'}` : '', o.lootText].filter(Boolean).join(' and ')
  if (loot) lines.push(`- Loot to the stash: ${loot}`)
  return lines.join('\n')
}

// ── Finishing a session ────────────────────────────────────────────────────

/** What happens to an unused panel when a session is finished. */
export type FinishChoice = 'next' | 'drawer' | 'leave'
export interface FinishRow<P> { panel: P; /** Why it is listed. */ reason: string; choice: FinishChoice; choices: FinishChoice[]; /** A continued scene is copied to the next session and stays here as played so far. */ copy: boolean }

/** The panels a finish review lists with their default: untouched scenes to the drawer; continued scenes and loose prep to the next session. */
export function finishReviewRows<P extends Pick<SessionPanel, 'kind' | 'status' | 'attrs'>>(panels: P[], encounterResolved: (id: string) => boolean): FinishRow<P>[] {
  const rows: FinishRow<P>[] = []
  for (const p of panels) {
    const row = (reason: string, choice: FinishChoice, choices: FinishChoice[], copy = false) => rows.push({ panel: p, reason, choice, choices, copy })
    if (p.kind === 'scene' && (p.status ?? 'planned') === 'planned') row('not played', 'drawer', ['drawer', 'next', 'leave'])
    else if (p.kind === 'scene' && p.status === 'continued') row('continued', 'next', ['next', 'drawer', 'leave'], true)
    else if (p.kind === 'beat' && p.status !== 'done') row('not done', 'next', ['next', 'drawer', 'leave'])
    else if (p.kind === 'clue' && p.status !== 'revealed') row('not revealed', 'next', ['next', 'drawer', 'leave'])
    else if (p.kind === 'reward' && p.status !== 'awarded') row('not awarded', 'next', ['next', 'leave'])
    else if (p.kind === 'encounter' && typeof p.attrs.encounterId === 'string' && !encounterResolved(p.attrs.encounterId)) row('not run', 'next', ['next', 'drawer', 'leave'])
  }
  return rows
}

/** Where carried-over panels go on the next board: a frame below what is there, four per row. */
export function carryOverLayout(existing: Pick<SessionPanel, 'x' | 'y' | 'h' | 'kind' | 'parentId'>[], count: number): { frame: { x: number; y: number; w: number; h: number }; spots: { x: number; y: number }[] } {
  const top = existing.filter(p => !p.parentId)
  const bottom = top.length ? Math.max(...top.map(p => p.y + (p.kind === 'frame' ? (p.h ?? 320) : 200))) + 80 : 0
  const left = top.length ? Math.min(...top.map(p => p.x)) : 0
  const spots = Array.from({ length: count }, (_, i) => ({ x: 30 + (i % 4) * 290, y: 60 + Math.floor(i / 4) * 230 }))
  return { frame: { x: left, y: bottom, w: 30 + Math.min(Math.max(count, 1), 4) * 290, h: 60 + Math.max(1, Math.ceil(count / 4)) * 230 }, spots }
}

export type Side = 'top' | 'bottom' | 'left' | 'right'
interface Box { x: number; y: number; w: number; h: number }

/**
 * The sides of two panels that face each other, for drawing a connection from `a` to `b`:
 * side by side → right to left (or left to right); otherwise the lower edge of the upper one
 * to the upper edge of the lower one.
 */
export function nearestSides(a: Box, b: Box): [from: Side, to: Side] {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2)
  // Gaps between the boxes on each axis: the axis with the wider gap is the one they are apart on
  const gapX = Math.abs(dx) - (a.w + b.w) / 2, gapY = Math.abs(dy) - (a.h + b.h) / 2
  if (gapX > gapY) return dx >= 0 ? ['right', 'left'] : ['left', 'right']
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
}

const TABLE_DICE = [4, 6, 8, 10, 12, 20, 100]

/** A plain list as the rows of a random table: the smallest die that has a face for each, its faces shared out evenly. */
export function tableRows(results: string[]): { die: string; rows: { min: number; max: number; result: string }[] } {
  const list = results.slice(0, 100)
  const die = TABLE_DICE.find(d => d >= list.length) ?? 100
  return { die: `d${die}`, rows: list.map((result, i) => ({ min: Math.floor(i * die / list.length) + 1, max: Math.floor((i + 1) * die / list.length), result })) }
}
