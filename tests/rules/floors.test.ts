import { describe, expect, it } from 'vitest'
import { addFloor, defaultFloorName, floorBeside, floorById, floorsOf, floorWrite, MAIN_FLOOR, onFloor, orderFloors, removeFloor, storedFloorId } from '@/domain/rules/floors'
import { zEncounter, zEncounterMap, type Encounter, type EncounterMap } from '@/domain/schema'

const IMG = { imageId: 'ground' }
function setup(): { enc: Encounter; map: EncounterMap } {
  const enc = zEncounter.parse({ id: 'e', campaignId: 'c', name: 'Tower', map: IMG, grid: { size: 70, offsetX: 0, offsetY: 0 }, createdAt: '', updatedAt: '' })
  const map = zEncounterMap.parse({ id: 'e', fog: { '1,1': 'hidden' }, walls: [{ id: 'w', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }] })
  return { enc, map }
}
/** Applies a floor write the way the data layer does. */
function apply(s: { enc: Encounter; map: EncounterMap }, w: ReturnType<typeof floorWrite>) {
  return { enc: { ...s.enc, ...w.encounter }, map: { ...s.map, ...w.map } }
}

describe('floors', () => {
  it('reads a map made before floors as one main floor holding what it always held', () => {
    const { enc, map } = setup()
    const list = floorsOf(enc, map)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: MAIN_FLOOR, main: true, name: 'Ground floor', level: 0, image: IMG, walls: map.walls, fog: map.fog })
    expect(floorById(enc, map, null)?.id).toBe(MAIN_FLOOR)
  })

  it('adds floors on top and below with fitting names and the main grid', () => {
    let s = setup()
    const up = addFloor(s.enc, s.map)
    s = { ...s, map: { ...s.map, ...up.map } }
    const down = addFloor(s.enc, s.map, { below: true })
    s = { ...s, map: { ...s.map, ...down.map } }
    expect(floorsOf(s.enc, s.map).map(f => [f.name, f.level])).toEqual([['Basement', -1], ['Ground floor', 0], ['Floor 2', 1]])
    expect(up.floor.grid).toEqual({ size: 70, offsetX: 0, offsetY: 0 })
    expect(floorBeside(s.enc, s.map, null, 1)?.id).toBe(up.floor.id)
    expect(floorBeside(s.enc, s.map, up.floor.id, 1)).toBeUndefined()
    expect(floorBeside(s.enc, s.map, MAIN_FLOOR, -1)?.id).toBe(down.floor.id)
    expect([defaultFloorName(-3), defaultFloorName(4)]).toEqual(['Basement 3', 'Floor 5'])
  })

  it('writes the main floor where a one-floor map keeps it, other floors into their entry', () => {
    let s = setup()
    const { floor, map } = addFloor(s.enc, s.map)
    s = { ...s, map: { ...s.map, ...map } }
    const main = floorWrite(s.map, MAIN_FLOOR, { image: null, fog: {}, name: 'Hall' })
    expect(main).toEqual({ encounter: { map: null }, map: { fog: {}, mainFloor: { name: 'Hall', level: 0 } } })
    const other = floorWrite(s.map, floor.id, { fog: { '2,2': 'hidden' } })
    expect(other.encounter).toEqual({})
    expect(other.map.floors?.[0]).toMatchObject({ id: floor.id, fog: { '2,2': 'hidden' } })
    s = apply(s, other)
    expect(floorById(s.enc, s.map, floor.id)?.fog).toEqual({ '2,2': 'hidden' })
    expect(floorById(s.enc, s.map, MAIN_FLOOR)?.fog).toEqual({ '1,1': 'hidden' })
  })

  it('orders floors bottom to top around the ground floor without moving their data', () => {
    let s = setup()
    const a = addFloor(s.enc, s.map); s = { ...s, map: { ...s.map, ...a.map } }
    const b = addFloor(s.enc, s.map); s = { ...s, map: { ...s.map, ...b.map } }
    s = { ...s, map: { ...s.map, ...orderFloors(s.enc, s.map, [b.floor.id, MAIN_FLOOR, a.floor.id], a.floor.id) } }
    expect(floorsOf(s.enc, s.map).map(f => [f.id, f.level])).toEqual([[b.floor.id, -2], [MAIN_FLOOR, -1], [a.floor.id, 0]])
    expect(floorById(s.enc, s.map, MAIN_FLOOR)?.image).toEqual(IMG)
    // Without a ground floor named, the one at level 0 stays there; floors left out go on top
    s = { ...s, map: { ...s.map, ...orderFloors(s.enc, s.map, [a.floor.id, b.floor.id]) } }
    expect(floorsOf(s.enc, s.map).map(f => [f.id, f.level])).toEqual([[a.floor.id, 0], [b.floor.id, 1], [MAIN_FLOOR, 2]])
  })

  it('removes a floor; the main floor only while another is left, the nearest one taking its place', () => {
    let s = setup()
    expect(removeFloor(s.enc, s.map, MAIN_FLOOR)).toBeNull()
    const top = addFloor(s.enc, s.map, { image: { imageId: 'top' } }); s = { ...s, map: { ...s.map, ...top.map } }
    const far = addFloor(s.enc, s.map); s = { ...s, map: { ...s.map, ...far.map } }
    expect(removeFloor(s.enc, s.map, 'nope')).toBeNull()
    const out = removeFloor(s.enc, s.map, MAIN_FLOOR)!
    expect(out.promoted).toBe(top.floor.id)
    s = apply(s, out.write)
    expect(floorsOf(s.enc, s.map).map(f => [f.id, f.name, f.level, f.image])).toEqual([[MAIN_FLOOR, 'Floor 2', 1, { imageId: 'top' }], [far.floor.id, 'Floor 3', 2, null]])
    s = apply(s, removeFloor(s.enc, s.map, far.floor.id)!.write)
    expect(floorsOf(s.enc, s.map)).toHaveLength(1)
  })

  it('tells which floor a token stands on; null is the main floor', () => {
    expect(storedFloorId(MAIN_FLOOR)).toBeNull()
    expect(onFloor({ floorId: null }, MAIN_FLOOR)).toBe(true)
    expect(onFloor({}, null)).toBe(true)
    expect(onFloor({ floorId: 'x' }, 'x')).toBe(true)
    expect(onFloor({ floorId: 'x' }, MAIN_FLOOR)).toBe(false)
  })
})
