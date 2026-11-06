import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { dbApi, getDb } from '~/composables/useDb'
import {
  blankMap, EXPORT_CELL_PX, floodFill, TILES, getTile, mapWalls, paintRoom, propAt, propImages, readBattleMap, resizeMap,
  restackProp, toPropFrame, fromPropFrame, type BattleMap, type MapProp,
} from '~/rules/battlemap'
import { cleanUpUnusedImages, storeImage } from '~/rules/images'
import { CAMPAIGN_TABLES, exportCampaignsPayload, importPayload } from '~/sync/backup'

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

  it('gives every tile its own character and id', () => {
    expect(new Set(TILES.map(t => t.char)).size).toBe(TILES.length)
    expect(new Set(TILES.map(t => t.id)).size).toBe(TILES.length)
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

  it('turns every square of a wide door along its wall', () => {
    const across = mapWalls(grid('#++#', 'ssss')).filter(w => w.coverType === 'door')
    expect(across.map(w => w.points[0].y === w.points[1].y)).toEqual([true, true])
    const upright = mapWalls(grid('#s', '+s', '+s', '#s')).filter(w => w.coverType === 'door')
    expect(upright).toEqual([
      { points: [{ x: 0.5, y: 1 }, { x: 0.5, y: 2 }], coverType: 'door' },
      { points: [{ x: 0.5, y: 2 }, { x: 0.5, y: 3 }], coverType: 'door' },
    ])
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
    expect(row?.fov_enabled).toBe(true)
    const walls = await dbApi.walls.list(id)
    expect(walls.filter(w => !w.generated)).toHaveLength(1)
    expect(walls.filter(w => w.generated)).toHaveLength(mapWalls(map).length)
  })
})

function prop(id: string, extra: Partial<MapProp> = {}): MapProp {
  return { id, image: `img:${id}`, x: 2, y: 2, w: 2, h: 1, rotation: 0, layer: 'object', ...extra }
}

describe('battle map assets', () => {
  it('finds the topmost asset under a point, objects above the floor, rotation included', () => {
    const map: BattleMap = { ...blankMap(6, 6), props: [prop('table'), prop('rug', { layer: 'floor', w: 4, h: 4 })] }
    expect(propAt(map, 2.9, 2.2)?.id).toBe('table')
    expect(propAt(map, 2, 3.5)?.id).toBe('rug')
    // Turned upright, the 2×1 table covers (2, 2.9) but no longer (2.9, 2)
    const turned: BattleMap = { ...blankMap(6, 6), props: [prop('table', { rotation: 90 })] }
    expect(propAt(turned, 2, 2.9)?.id).toBe('table')
    expect(propAt(turned, 2.9, 2)).toBeNull()
  })

  it('converts points to and from an asset\'s own frame', () => {
    const p = prop('a', { rotation: 37, x: 3.2, y: 1.7 })
    const local = toPropFrame(p, 4, 2.5)
    const back = fromPropFrame(p, local.x, local.y)
    expect(back.x).toBeCloseTo(4)
    expect(back.y).toBeCloseTo(2.5)
  })

  it('restacks within a layer only', () => {
    const map: BattleMap = { ...blankMap(4, 4), props: [prop('a'), prop('rug', { layer: 'floor' }), prop('b')] }
    expect(restackProp(map, 'a', 1).props!.map(p => p.id)).toEqual(['b', 'rug', 'a'])
    expect(restackProp(map, 'b', 1).props!.map(p => p.id)).toEqual(['a', 'rug', 'b'])
  })

  it('keeps assets when resizing and drops malformed ones when reading', () => {
    const map: BattleMap = { ...blankMap(4, 4), props: [prop('a')] }
    expect(resizeMap(map, 6, 6).props).toHaveLength(1)
    const read = readBattleMap({ ...map, props: [prop('a'), { id: 'x', image: 'img:x', x: 1 }] })
    expect(read?.props?.map(p => p.id)).toEqual(['a'])
    expect(propImages(read)).toEqual(['img:a'])
  })

  it('keeps the images of placed and library assets in cleanup and campaign files', async () => {
    const db = getDb()
    await Promise.all([...CAMPAIGN_TABLES.map(t => db.table(t).clear()), db.images.clear()])
    const png = new Blob(['png'], { type: 'image/png' })
    const libraryOnly = await dbApi.mapAssets.add('Statue', png, 64, 64)
    const placedAsset = await dbApi.mapAssets.add('Table', png, 128, 64)
    const orphan = await storeImage(png)
    const campaignId = await db.campaigns.add({ name: 'Keep', description: '', created_at: 'x', updated_at: 'x' })
    const enc = await dbApi.encounters.create({ campaignId, name: 'Hall' })
    const map: BattleMap = { ...blankMap(4, 4), props: [prop('t', { image: placedAsset.image })] }
    await db.encounters.update(enc!.id!, { battlemap: map })

    expect(await cleanUpUnusedImages()).toBe(1)
    expect(await db.images.get(orphan.slice(4))).toBeUndefined()

    const file = await exportCampaignsPayload([campaignId])
    expect(file.mapAssets?.map(a => a.name)).toEqual(['Table'])
    expect(file.images?.map(i => i.id)).toEqual([placedAsset.image.slice(4)])

    // Into another browser: the asset comes along once, even when imported twice
    await Promise.all([...CAMPAIGN_TABLES.map(t => db.table(t).clear()), db.images.clear()])
    const all = new Set([...CAMPAIGN_TABLES, 'rules', 'rulesOverlays'])
    await importPayload(file, { mode: 'merge', sections: all })
    await importPayload(file, { mode: 'merge', sections: all })
    expect((await dbApi.mapAssets.list()).map(a => a.image)).toEqual([placedAsset.image])
    expect(await db.images.get(placedAsset.image.slice(4))).toBeDefined()
    expect(libraryOnly.image).not.toBe(placedAsset.image)
  })
})
