/**
 * What the players' window gets of an encounter. A whitelist: every field is
 * built here from what players may know. GM notes, AC, initiative, stat block
 * links, hidden tokens, hidden conditions and timers never leave the GM's
 * window; an enemy's HP becomes a word. Walls are not sent at all, only what
 * can be seen.
 */
import type { ImageRef } from '@/domain/schema/common'
import { healthState, type HealthState, type TokenCondition, type TokenTimer } from './conditions'
import type { Point } from './walls'

export interface PlayerViewPrefs {
  railPosition: 'top' | 'left' | 'right'
  railSize: 'small' | 'medium' | 'large'
  /** Names beside the portraits. */
  railNames: boolean
  /** Hidden combatants that take turns: left out, or shown as "?". */
  hiddenTurns: 'omit' | 'mystery'
}
export const DEFAULT_PLAYER_PREFS: PlayerViewPrefs = { railPosition: 'right', railSize: 'medium', railNames: true, hiddenTurns: 'omit' }

export function readPlayerPrefs(raw: unknown): PlayerViewPrefs {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<PlayerViewPrefs>
  const pick = <T extends string>(x: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(x as T) ? x as T : fallback)
  return {
    railPosition: pick(v.railPosition, ['top', 'left', 'right'], 'right'), railSize: pick(v.railSize, ['small', 'medium', 'large'], 'medium'),
    railNames: v.railNames !== false, hiddenTurns: pick(v.hiddenTurns, ['omit', 'mystery'], 'omit'),
  }
}

export interface PlayerSource {
  id: string
  name: string
  shown: ImageRef | null
  x: number
  y: number
  size: number
  visible: boolean
  dead: boolean
  playerToken: boolean
  ally: boolean
  actsWhileHidden: boolean
  hp: { current: number | null; max: number | null; temp: number }
  elevation: number | null
  conditions: TokenCondition[]
  timers: TokenTimer[]
  /** On the sensor map of a starship battle, not on this map. */
  sensor: unknown
}

export interface PlayerToken {
  id: string
  name: string
  image: ImageRef | null
  x: number
  y: number
  size: number
  dead: boolean
  party: boolean
  /** Exact numbers for the party's own tokens only. */
  hp: { current: number | null; max: number | null; temp: number } | null
  /** Everyone else: a word. */
  health: HealthState | null
  conditions: { name: string; value: number | null; color?: string; icon?: string }[]
  timers: { name: string; remaining: number }[]
  elevation: number | null
}

export interface PlayerTurn { id: string; name: string; image: ImageRef | null; dead: boolean; party: boolean; mystery: boolean }

export interface PlayerScene {
  encounterId: string
  map: ImageRef | null
  grid: { size: number; offsetX: number; offsetY: number }
  fog: Record<string, string>
  tokens: PlayerToken[]
  areas: { id: string; color: string; cells: string[] }[]
  /** What can be seen (grid units); empty = no darkness. */
  lit: Point[][]
  running: boolean
  round: number
  activeId: string | null
  turns: PlayerTurn[]
  prefs: PlayerViewPrefs
}

export function toPlayerToken(t: PlayerSource): PlayerToken {
  return {
    id: t.id, name: t.name, image: t.shown, x: t.x, y: t.y, size: t.size, dead: t.dead, party: t.playerToken,
    hp: t.playerToken ? { ...t.hp } : null, health: t.playerToken ? null : healthState(t),
    conditions: t.conditions.filter(c => !c.hidden).map(c => ({ name: c.name, value: c.value, ...(c.color ? { color: c.color } : {}), ...(c.icon ? { icon: c.icon } : {}) })),
    timers: t.timers.filter(x => x.visibleToPlayers).map(x => ({ name: x.name, remaining: x.remaining })),
    elevation: t.elevation,
  }
}

/** The turn order as players may see it: hidden combatants are dropped, or shown as "?". */
export function playerTurns(order: PlayerSource[], prefs: PlayerViewPrefs): PlayerTurn[] {
  const out: PlayerTurn[] = []
  for (const t of order) {
    if (t.visible) out.push({ id: t.id, name: t.name, image: t.shown, dead: t.dead, party: t.playerToken, mystery: false })
    else if (prefs.hiddenTurns === 'mystery') out.push({ id: t.id, name: '?', image: null, dead: false, party: false, mystery: true })
  }
  return out
}

export interface PlayerSceneInput {
  encounterId: string
  map: ImageRef | null
  grid: PlayerScene['grid']
  fog: Record<string, string>
  tokens: PlayerSource[]
  /** Tokens that take turns, in order. */
  order: PlayerSource[]
  /** Areas with their squares already worked out; hidden ones are left out here. */
  areas: { id: string; color: string; hidden?: boolean; cells: string[] }[]
  lit: Point[][]
  running: boolean
  round: number
  activeId: string | null
  prefs: PlayerViewPrefs
}

export function toPlayerScene(i: PlayerSceneInput): PlayerScene {
  const turns = playerTurns(i.order, i.prefs)
  return {
    encounterId: i.encounterId, map: i.map, grid: { ...i.grid }, fog: { ...i.fog },
    tokens: i.tokens.filter(t => t.visible && !t.sensor).map(toPlayerToken),
    areas: i.areas.filter(a => !a.hidden).map(a => ({ id: a.id, color: a.color, cells: [...a.cells] })),
    lit: i.lit.map(poly => poly.map(p => ({ x: p.x, y: p.y }))),
    running: i.running, round: i.round,
    // A hidden token's turn is nobody's turn, unless it shows as "?"
    activeId: turns.some(t => t.id === i.activeId) ? i.activeId : null,
    turns, prefs: { ...i.prefs },
  }
}
