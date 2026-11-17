import { describe, expect, it } from 'vitest'
import {
  blankMap, floodFill, TILES, getTile, mapWalls, paintRoom, propAt, propImages, readBattleMap, resizeMap,
  restackProp, toPropFrame, fromPropFrame, pairStairs, stairCells, tileAt, tileOf, withCustomTile, type BattleMap, type MapProp,
} from '@/domain/rules/battlemap'
import { isDoorWall, visibilityPolygon, wallsToSegments, withHiddenDoorOutline, type Wall, type WallKind } from '@/domain/rules/walls'

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

  it('puts windows across the gap like doors, and hidden doors along their faces like the wall', () => {
    const openings = mapWalls(grid('#=%+#', 'sssss')).filter(w => w.coverType !== 'full')
    expect(openings.map(w => w.coverType)).toEqual(['window', 'secret', 'door'])
    expect(openings.filter(w => w.coverType !== 'secret').every(w => w.points[0].y === 0.5 && w.points[1].y === 0.5)).toBe(true)
    // Top face, side, bottom face of square (2, 0)
    expect(openings.find(w => w.coverType === 'secret')?.points).toEqual([{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 2, y: 1 }])
    const upright = mapWalls(grid('#s', '=s', '%s', '#s')).filter(w => w.coverType !== 'full')
    expect(upright.map(w => w.coverType)).toEqual(['window', 'secret'])
    expect(upright[1]?.points).toEqual([{ x: 0, y: 2 }, { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 2 }])
  })

  it('a closed hidden door hides as much of itself as the wall beside it does', () => {
    const map = grid('sss', '#%#', 'sss')
    const walls: Wall[] = mapWalls(map).map((w, i) => ({ id: `w${i}`, points: w.points, kind: w.coverType, open: false, generated: true }))
    const seen = visibilityPolygon({ x: 1.5, y: 0.5 }, wallsToSegments(walls), Infinity, { w: 3, h: 3 })
    const inside = (p: { x: number; y: number }) => {
      let hit = false
      for (let i = 0, j = seen.length - 1; i < seen.length; j = i++) {
        const a = seen[i]!, b = seen[j]!
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
      }
      return hit
    }
    expect(inside({ x: 1.5, y: 0.9 })).toBe(true)
    expect(inside({ x: 1.5, y: 1.25 })).toBe(false)
    expect(inside({ x: 0.5, y: 1.25 })).toBe(false)
    // Opened, sight goes through
    const open = visibilityPolygon({ x: 1.5, y: 0.5 }, wallsToSegments(walls.map(w => (w.kind === 'secret' ? { ...w, open: true } : w))), Infinity, { w: 3, h: 3 })
    expect(open.some(p => p.y > 2.5)).toBe(true)
  })

  it('gives hidden doors of maps made before their outline, and leaves other walls alone', () => {
    const old = (points: { x: number; y: number }[], kind: WallKind = 'secret') => withHiddenDoorOutline({ kind, points })
    expect(old([{ x: 2, y: 0.5 }, { x: 3, y: 0.5 }]).points).toEqual([{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 2, y: 1 }])
    expect(old([{ x: 0.5, y: 2 }, { x: 0.5, y: 3 }]).points).toEqual([{ x: 0, y: 2 }, { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 2 }])
    expect(old([{ x: 2, y: 0.5 }, { x: 3, y: 0.5 }], 'door').points).toEqual([{ x: 2, y: 0.5 }, { x: 3, y: 0.5 }])
    expect(old([{ x: 0, y: 0 }, { x: 4, y: 0 }]).points).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }])
  })

  it('lets sight through windows and open (hidden) doors only', () => {
    const wall = (kind: WallKind, open = false): Wall => ({ id: 'w', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], kind, open, generated: false })
    const blocking = (w: Wall) => wallsToSegments([w])[0]!.blocking
    expect([wall('full'), wall('window'), wall('door'), wall('door', true), wall('secret'), wall('secret', true)].map(blocking))
      .toEqual([true, false, true, false, true, false])
    expect((['door', 'secret', 'window', 'full'] as WallKind[]).map(isDoorWall)).toEqual([true, true, false, false])
  })

  it('makes no walls between two solid tiles or along the map border', () => {
    expect(mapWalls(grid('#.', '.#'))).toEqual([])
    expect(mapWalls(grid('ss', 'ss'))).toEqual([])
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

})

describe('stairs between map maker floors', () => {
  it('pairs stairs up with the nearest stairs down on the floor above', () => {
    const ground = grid('^ss^', 'ssss')
    const upper = grid('ssvs', 'vsss')
    const top = grid('ssss', 'ssss')
    expect(stairCells(ground, 'up')).toEqual([[0, 0], [3, 0]])
    expect(pairStairs([ground, upper, top])).toEqual([
      { lower: 0, up: [0, 0], down: [0, 1] },
      { lower: 0, up: [3, 0], down: [2, 0] },
    ])
    // Stairs down on the ground floor lead nowhere; a missing floor breaks the chain
    expect(pairStairs([grid('vs'), null, grid('^s')])).toEqual([])
  })
})

describe('tile roles: starship and image tiles', () => {
  it('makes walls and doors from hull and airlock tiles like from stone ones', () => {
    const stone = mapWalls(grid('#+#', 'sss'))
    const ship = mapWalls(grid('WAW', 'SSS'))
    expect(ship).toEqual(stone)
    expect(ship.some(w => w.coverType === 'door')).toBe(true)
    expect(mapWalls(grid('WPW', 'SSS')).some(w => w.coverType === 'window')).toBe(true)
  })

  it('adds an image tile once per picture and role, with a character no built-in tile uses', () => {
    let m: BattleMap = blankMap(4, 4, 'void')
    const wall = withCustomTile(m, { image: 'img:rock', role: 'wall', label: 'Rock' })!
    m = wall.map
    expect(withCustomTile(m, { image: 'img:rock', role: 'wall', label: 'Rock' })).toEqual({ map: m, char: wall.char })
    const floor = withCustomTile(m, { image: 'img:rock', role: 'floor', label: 'Rock floor' })!
    expect(floor.char).not.toBe(wall.char)
    for (const ch of [wall.char, floor.char]) expect(TILES.some(t => t.char === ch)).toBe(false)
    // An image wall blocks sight like a wall; an image door gets a door
    const door = withCustomTile(floor.map, { image: 'img:hatch', role: 'door', label: 'Hatch' })!
    const painted = { ...door.map, cols: 3, rows: 2, tiles: `${wall.char}${door.char}${wall.char}${floor.char.repeat(3)}` }
    expect(tileAt(painted, 0, 0)).toMatchObject({ role: 'wall', solid: true, image: 'img:rock', label: 'Rock' })
    expect(mapWalls(painted)).toEqual(mapWalls(grid('#+#', 'sss')))
    // Read back from the encounter with its image tiles; unknown characters are void
    expect(readBattleMap(JSON.parse(JSON.stringify(door.map)))?.customTiles).toHaveLength(3)
    expect(tileOf(painted, '7').role).toBe('void')
    expect(readBattleMap({ ...door.map, customTiles: [{ char: 's', image: 'img:x', role: 'wall', label: 'Clash' }] })?.customTiles).toBeUndefined()
  })

  it('paints a room with the wall tile given', () => {
    expect(paintRoom(blankMap(4, 4, 'void'), 0, 0, 3, 3, 'S', 'W').tiles).toBe(grid('WWWW', 'WSSW', 'WSSW', 'WWWW').tiles)
  })
})
