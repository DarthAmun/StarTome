/**
 * Which floor the players' window shows, and what of the map goes with it
 * (FLOORS_PLAN.md D3, D5). Players see the floor their tokens stand on, not
 * whichever floor the GM happens to look at:
 *
 * 1. A floor the GM keeps the players on wins.
 * 2. When a party token is acting, its floor.
 * 3. When party tokens stand on the GM's floor, that one (a split party
 *    follows the GM between the floors it stands on).
 * 4. Otherwise the floor most party tokens stand on.
 * 5. Without party tokens on the map, the GM's floor.
 *
 * Only that floor's tokens and the floor below (faded, D5) are handed on;
 * tokens of every other floor never reach the players' window.
 */
import type { Encounter, EncounterMap } from '@/domain/schema'
import { floorBeside, floorById, floorsOf, MAIN_FLOOR, type FloorView } from './floors'

type EncounterPart = Pick<Encounter, 'map' | 'grid'>
type MapPart = Pick<EncounterMap, 'mainFloor' | 'floors' | 'walls' | 'fog' | 'battlemap'>

export interface FloorToken { id: string; floorId?: string | null; playerToken: boolean }

/** The FloorView id a token stands on; one whose floor is gone stands on the main floor. */
export const tokenFloorId = (map: Pick<EncounterMap, 'floors'>, t: { floorId?: string | null }): string =>
  (t.floorId && map.floors.some(f => f.id === t.floorId) ? t.floorId : MAIN_FLOOR)

export interface PlayersFloorInput {
  /** The floor the GM looks at (FloorView id). */
  gmFloor: string
  /** The floor the GM keeps the players on, if any. */
  locked: string | null
  activeId: string | null
}

/** The FloorView id of the floor the players' window shows. */
export function playersFloorId(enc: EncounterPart, map: MapPart, tokens: FloorToken[], o: PlayersFloorInput): string {
  const known = (id: string | null) => (id && floorById(enc, map, id) ? id : null)
  const locked = known(o.locked)
  if (locked) return locked
  const gm = known(o.gmFloor) ?? MAIN_FLOOR
  const party = tokens.filter(t => t.playerToken)
  if (!party.length) return gm
  const active = party.find(t => t.id === o.activeId)
  if (active) return tokenFloorId(map, active)
  const counts = new Map<string, number>()
  for (const t of party) { const f = tokenFloorId(map, t); counts.set(f, (counts.get(f) ?? 0) + 1) }
  if (counts.has(gm)) return gm
  // The most party tokens; on a tie the lower floor
  const order = floorsOf(enc, map).map(f => f.id)
  return [...counts].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0]![0]
}

export interface PlayersFloor<T> {
  floor: FloorView
  /** The tokens standing on it. */
  tokens: T[]
  /** The floor below with its tokens, shown faded where this one is empty. */
  below: { floor: FloorView; tokens: T[] } | null
}

/** The players' floor and only the tokens on it and on the floor below. */
export function playersFloor<T extends FloorToken>(enc: EncounterPart, map: MapPart, tokens: T[], o: PlayersFloorInput): PlayersFloor<T> {
  const id = playersFloorId(enc, map, tokens, o)
  const floor = floorById(enc, map, id) ?? floorById(enc, map, MAIN_FLOOR)!
  const on = (f: FloorView) => tokens.filter(t => tokenFloorId(map, t) === f.id)
  const below = floorBeside(enc, map, floor.id, -1)
  return { floor, tokens: on(floor), below: below ? { floor: below, tokens: on(below) } : null }
}
