/**
 * Floors of an encounter map (FLOORS_PLAN.md §2).
 *
 * Every map has a main floor, stored where a one-floor map always kept its
 * data: the image and grid on the encounter, walls, fog and tiles on the map
 * row. Further floors are in `EncounterMap.floors`. Tokens and areas name
 * their floor with `floorId`; null (or missing) is the main floor.
 *
 * Everything that reads or writes one floor's data goes through here, so the
 * main floor's odd storage stays in this file.
 */
import { newId } from '@/domain/ids'
import type { Encounter, EncounterMap, Floor } from '@/domain/schema'

/** The main floor's id in a FloorView; stored as null on tokens and areas. */
export const MAIN_FLOOR = 'main'

type EncounterPart = Pick<Encounter, 'map' | 'grid'>
type MapPart = Pick<EncounterMap, 'mainFloor' | 'floors' | 'walls' | 'fog' | 'battlemap'>

/** One floor, whichever way it is stored. */
export interface FloorView extends Floor {
  main: boolean
}

export type FloorChange = Partial<Omit<Floor, 'id'>>

/** What to write for a change: a patch of the encounter row and one of the map row (either may be empty). */
export interface FloorWrite {
  encounter: Partial<EncounterPart>
  map: Partial<Omit<EncounterMap, 'id'>>
}

/** The id a token or area stores for the floor shown as `id`. */
export const storedFloorId = (id: string | null | undefined): string | null => (!id || id === MAIN_FLOOR ? null : id)

/** Whether a token or area stands on the floor shown as `id`. */
export const onFloor = (item: { floorId?: string | null }, id: string | null | undefined): boolean => (item.floorId ?? null) === storedFloorId(id)

/** A name for a new floor at `level`: ground floor, basement, floor 2 … */
export function defaultFloorName(level: number): string {
  if (level === 0) return 'Ground floor'
  if (level === -1) return 'Basement'
  if (level < 0) return `Basement ${-level}`
  return `Floor ${level + 1}`
}

function mainView(enc: EncounterPart, map: MapPart): FloorView {
  return {
    id: MAIN_FLOOR, main: true, name: map.mainFloor.name, level: map.mainFloor.level,
    image: enc.map, grid: enc.grid, walls: map.walls, fog: map.fog, battlemap: map.battlemap,
  }
}

/** Every floor of the map, bottom to top. A map without extra floors has just the main one. */
export function floorsOf(enc: EncounterPart, map: MapPart): FloorView[] {
  return [mainView(enc, map), ...map.floors.map(f => ({ ...f, main: false }))].sort((a, b) => a.level - b.level)
}

/** The floor shown as `id` (null = main); undefined when it is gone. */
export function floorById(enc: EncounterPart, map: MapPart, id: string | null | undefined): FloorView | undefined {
  const key = storedFloorId(id)
  if (key === null) return mainView(enc, map)
  const f = map.floors.find(x => x.id === key)
  return f ? { ...f, main: false } : undefined
}

/** The floor `steps` above (negative: below) the one shown as `id`, if there is one. */
export function floorBeside(enc: EncounterPart, map: MapPart, id: string | null | undefined, steps: number): FloorView | undefined {
  const list = floorsOf(enc, map)
  const at = list.findIndex(f => f.id === (storedFloorId(id) ?? MAIN_FLOOR))
  return at < 0 ? undefined : list[at + steps]
}

/** Where a change to one floor is written. */
export function floorWrite(map: MapPart, id: string | null | undefined, change: FloorChange): FloorWrite {
  const key = storedFloorId(id)
  if (key === null) {
    const out: FloorWrite = { encounter: {}, map: {} }
    if ('image' in change) out.encounter.map = change.image ?? null
    if (change.grid) out.encounter.grid = change.grid
    if (change.walls) out.map.walls = change.walls
    if (change.fog) out.map.fog = change.fog
    if ('battlemap' in change) out.map.battlemap = change.battlemap ?? null
    if (change.name !== undefined || change.level !== undefined) out.map.mainFloor = { name: change.name ?? map.mainFloor.name, level: change.level ?? map.mainFloor.level }
    return out
  }
  return { encounter: {}, map: { floors: map.floors.map(f => (f.id === key ? { ...f, ...change, id: f.id } : f)) } }
}

/** A new floor on top of the others (or under them); returns it with the map patch that adds it. */
export function addFloor(enc: EncounterPart, map: MapPart, init: Partial<Omit<Floor, 'id' | 'level'>> & { below?: boolean } = {}): { floor: Floor; map: Pick<EncounterMap, 'floors'> } {
  const levels = floorsOf(enc, map).map(f => f.level)
  const level = init.below ? Math.min(...levels) - 1 : Math.max(...levels) + 1
  const floor: Floor = {
    id: newId(), name: init.name ?? defaultFloorName(level), level,
    image: init.image ?? null, grid: init.grid ?? { ...enc.grid }, walls: init.walls ?? [], fog: init.fog ?? {}, battlemap: init.battlemap ?? null,
  }
  return { floor, map: { floors: [...map.floors, floor] } }
}

/**
 * Removes a floor. The main floor can go only while another is left: the one
 * nearest to it takes its place (`promoted`), and what stood on that floor now
 * stores null. Null when the floor is gone or is the last one.
 */
export function removeFloor(enc: EncounterPart, map: MapPart, id: string | null | undefined): { write: FloorWrite; promoted: string | null } | null {
  const key = storedFloorId(id)
  if (key !== null) {
    if (!map.floors.some(f => f.id === key)) return null
    return { write: { encounter: {}, map: { floors: map.floors.filter(f => f.id !== key) } }, promoted: null }
  }
  const level = map.mainFloor.level
  const next = [...map.floors].sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level) || a.level - b.level)[0]
  if (!next) return null
  return {
    write: {
      encounter: { map: next.image, grid: next.grid },
      map: { mainFloor: { name: next.name, level: next.level }, walls: next.walls, fog: next.fog, battlemap: next.battlemap, floors: map.floors.filter(f => f.id !== next.id) },
    },
    promoted: next.id,
  }
}

/**
 * Puts the floors in the order given (bottom to top, ids as in FloorView) with
 * `groundId` at level 0, or the floor at level 0 now, or the lowest. Floors
 * left out keep their place above the ones given.
 */
export function orderFloors(enc: EncounterPart, map: MapPart, bottomToTop: string[], groundId?: string): Pick<EncounterMap, 'mainFloor' | 'floors'> {
  const all = floorsOf(enc, map)
  const known = new Set(all.map(f => f.id))
  const ids = [...new Set(bottomToTop.filter(i => known.has(i)))]
  for (const f of all) if (!ids.includes(f.id)) ids.push(f.id)
  const current = all.find(f => f.level === 0)?.id
  const ground = [groundId, current].find(g => g !== undefined && ids.includes(g)) ?? ids[0]!
  const base = ids.indexOf(ground)
  const level = new Map(ids.map((i, n) => [i, n - base]))
  return {
    mainFloor: { ...map.mainFloor, level: level.get(MAIN_FLOOR)! },
    floors: map.floors.map(f => ({ ...f, level: level.get(f.id)! })),
  }
}
