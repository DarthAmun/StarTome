import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { dbApi, getDb } from '~/composables/useDb'
import {
  blankMap, EXPORT_CELL_PX, floodFill, getTile, mapWalls, paintRoom, readBattleMap, resizeMap, type BattleMap,
} from '~/rules/battlemap'

/** A map from rows of tile characters. */
function grid(...rows: string[]): BattleMap {
  return { cols: rows[0].length, rows: rows.length, tiles: rows.join('') }
}

describe('battle map tiles', () => {
  it('paints a room: walls on the border, floor inside', () => {
    const m = paintRoom(blankMap(6, 5, 'void'), 1, 1, 4, 3, 's')
    expect(m.tiles).toBe(grid(
      '......',
      '.####.',
      '.#ss#.',
      '.####.',
      '......',
    ).tiles)
  })

  it('flood fills only the connected area', () => {
    const m = floodFill(grid('ss#s', 'ss#s'), 0, 0, 'g')
    expect(m.tiles).toBe(grid('gg#s', 'gg#s').tiles)
  })

  it('keeps the top-left when resized; new squares are void', () => {
    const m = resizeMap(grid('ssss', 'ssss', 'ssss', 'ssss'), 5, 4)
    expect(getTile(m, 3, 3)).toBe('s')
    expect(getTile(m, 4, 0)).toBe('.')
  })

  it('reads only well-formed maps', () => {
    expect(readBattleMap({ cols: 4, rows: 4, tiles: 's'.repeat(16) })).not.toBeNull()
    expect(readBattleMap({ cols: 4, rows: 4, tiles: 's' })).toBeNull()
    expect(readBattleMap('nope')).toBeNull()
  })
})

describe('battle map walls', () => {
  it('outlines a room with one wall per side, merged along straight runs', () => {
    const m = grid(
      '######',
      '#ssss#',
      '#ssss#',
      '######',
    )
    expect(mapWalls(m)).toEqual([
      { points: [{ x: 1, y: 1 }, { x: 5, y: 1 }], coverType: 'full' },
      { points: [{ x: 1, y: 3 }, { x: 5, y: 3 }], coverType: 'full' },
      { points: [{ x: 1, y: 1 }, { x: 1, y: 3 }], coverType: 'full' },
      { points: [{ x: 5, y: 1 }, { x: 5, y: 3 }], coverType: 'full' },
    ])
  })

  it('puts a door across the gap, turned to meet the walls beside it', () => {
    const across = mapWalls(grid('#+#', 'sss')).filter(w => w.coverType === 'door')
    expect(across).toEqual([{ points: [{ x: 1, y: 0.5 }, { x: 2, y: 0.5 }], coverType: 'door' }])
    const upright = mapWalls(grid('#s', '+s', '#s')).filter(w => w.coverType === 'door')
    expect(upright).toEqual([{ points: [{ x: 0.5, y: 1 }, { x: 0.5, y: 2 }], coverType: 'door' }])
  })

  it('makes no walls between two solid tiles or along the map border', () => {
    expect(mapWalls(grid('#.', '.#'))).toEqual([])
    expect(mapWalls(grid('ss', 'ss'))).toEqual([])
  })
})

describe('applying a battle map to an encounter', () => {
  it('sets the map and grid, and replaces only the walls it made', async () => {
    const enc = await dbApi.encounters.create({ campaignId: 1, name: 'Crypt' })
    const id = enc!.id!
    await dbApi.walls.add({ encounter_id: id, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], coverType: 'standard', isOpen: false })
    const map = grid('###', '#s#', '###')
    const png = new Blob(['png'], { type: 'image/png' })

    await dbApi.encounters.applyBattleMap(id, map, png, mapWalls(map))
    await dbApi.encounters.applyBattleMap(id, map, png, mapWalls(map))

    const row = await getDb().encounters.get(id)
    expect(row?.battlemap).toEqual(map)
    expect(row?.map_source).toMatch(/^img:/)
    expect(row?.grid_size).toBe(EXPORT_CELL_PX)
    const walls = await dbApi.walls.list(id)
    expect(walls.filter(w => !w.generated)).toHaveLength(1)
    expect(walls.filter(w => w.generated)).toHaveLength(mapWalls(map).length)
  })
})
