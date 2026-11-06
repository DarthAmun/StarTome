/**
 * Battle maps made in the map maker (pages/encounter/[id]/map-maker.vue).
 *
 * A map is a grid of tiles, one character per cell, stored on its encounter
 * (`battlemap`). The maker renders it to an image for the VTT and derives
 * line-of-sight walls from it: wall tiles block, door tiles get a door.
 */
import type { DbEncounterWall } from '~/db/schema'

export type TileId = 'void' | 'stone' | 'wood' | 'dirt' | 'grass' | 'rubble' | 'water' | 'wall' | 'door'

export interface TileDef {
  id: TileId
  char: string
  label: string
  /** Base colour; the renderer adds texture on top. */
  color: string
  /** Blocks sight: walls are drawn along its edges to open tiles. */
  solid: boolean
}

export const TILES: TileDef[] = [
  { id: 'stone',  char: 's', label: 'Stone floor', color: '#8a8478', solid: false },
  { id: 'wood',   char: 'w', label: 'Wood floor',  color: '#9a6b3f', solid: false },
  { id: 'dirt',   char: 'd', label: 'Dirt',        color: '#7b6247', solid: false },
  { id: 'grass',  char: 'g', label: 'Grass',       color: '#5d7d3a', solid: false },
  { id: 'rubble', char: 'r', label: 'Rubble (difficult)', color: '#6f6a60', solid: false },
  { id: 'water',  char: 'a', label: 'Water',       color: '#3b6e8f', solid: false },
  { id: 'wall',   char: '#', label: 'Wall',        color: '#3a3631', solid: true },
  { id: 'door',   char: '+', label: 'Door',        color: '#8a8478', solid: false },
  { id: 'void',   char: '.', label: 'Void',        color: '#121212', solid: true },
]

const BY_CHAR = new Map(TILES.map(t => [t.char, t]))
const BY_ID = new Map(TILES.map(t => [t.id, t]))

export function tileByChar(c: string): TileDef {
  return BY_CHAR.get(c) ?? BY_ID.get('void')!
}

export function tileChar(id: TileId): string {
  return BY_ID.get(id)!.char
}

export interface BattleMap {
  cols: number
  rows: number
  /** cols × rows characters, row by row (TILES[].char). */
  tiles: string
}

export const MIN_SIZE = 4
export const MAX_SIZE = 80
/** Pixels per cell in the exported image; the encounter's grid size is set to it. */
export const EXPORT_CELL_PX = 70

export function clampSize(n: number): number {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(Number.isFinite(n) ? n : MIN_SIZE)))
}

export function blankMap(cols: number, rows: number, fill: TileId = 'stone'): BattleMap {
  cols = clampSize(cols)
  rows = clampSize(rows)
  return { cols, rows, tiles: tileChar(fill).repeat(cols * rows) }
}

/** A map read from an encounter row: anything malformed becomes null. */
export function readBattleMap(v: unknown): BattleMap | null {
  if (!v || typeof v !== 'object') return null
  const { cols, rows, tiles } = v as Partial<BattleMap>
  if (typeof cols !== 'number' || typeof rows !== 'number' || typeof tiles !== 'string') return null
  if (cols !== clampSize(cols) || rows !== clampSize(rows) || tiles.length !== cols * rows) return null
  return { cols, rows, tiles }
}

export function getTile(map: BattleMap, col: number, row: number): string {
  if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return tileChar('void')
  return map.tiles[row * map.cols + col]
}

/** The map grown or cut to a new size, keeping the top-left; new cells are void. */
export function resizeMap(map: BattleMap, cols: number, rows: number): BattleMap {
  cols = clampSize(cols)
  rows = clampSize(rows)
  let tiles = ''
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) tiles += getTile(map, c, r)
  }
  return { cols, rows, tiles }
}

/** The map with the given cells set to `char` (cells outside the map are skipped). */
export function paintCells(map: BattleMap, cells: Iterable<[number, number]>, char: string): BattleMap {
  const arr = map.tiles.split('')
  for (const [c, r] of cells) {
    if (c >= 0 && r >= 0 && c < map.cols && r < map.rows) arr[r * map.cols + c] = char
  }
  return { ...map, tiles: arr.join('') }
}

/** Cells of the rectangle spanned by two corners (inclusive). */
export function rectCells(c1: number, r1: number, c2: number, r2: number): [number, number][] {
  const out: [number, number][] = []
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push([c, r])
  }
  return out
}

/** A room: `floor` inside the rectangle, walls on its border. */
export function paintRoom(map: BattleMap, c1: number, r1: number, c2: number, r2: number, floor: string): BattleMap {
  const [x0, x1] = [Math.min(c1, c2), Math.max(c1, c2)]
  const [y0, y1] = [Math.min(r1, r2), Math.max(r1, r2)]
  const wall = tileChar('wall')
  const border: [number, number][] = []
  const inside: [number, number][] = []
  for (const [c, r] of rectCells(x0, y0, x1, y1)) {
    (c === x0 || c === x1 || r === y0 || r === y1 ? border : inside).push([c, r])
  }
  return paintCells(paintCells(map, inside, floor), border, wall)
}

/** Flood fill from a cell: every connected cell of the same tile becomes `char`. */
export function floodFill(map: BattleMap, col: number, row: number, char: string): BattleMap {
  if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return map
  const target = getTile(map, col, row)
  if (target === char) return map
  const arr = map.tiles.split('')
  const stack: number[] = [row * map.cols + col]
  while (stack.length) {
    const i = stack.pop()!
    if (arr[i] !== target) continue
    arr[i] = char
    const c = i % map.cols
    const r = (i - c) / map.cols
    if (c > 0) stack.push(i - 1)
    if (c < map.cols - 1) stack.push(i + 1)
    if (r > 0) stack.push(i - map.cols)
    if (r < map.rows - 1) stack.push(i + map.cols)
  }
  return { ...map, tiles: arr.join('') }
}

function isSolid(map: BattleMap, col: number, row: number): boolean {
  return tileByChar(getTile(map, col, row)).solid
}

export type GeneratedWall = Pick<DbEncounterWall, 'points' | 'coverType'> & { points: { x: number; y: number }[] }

/**
 * Line-of-sight walls in grid units: a wall along every edge between a solid
 * and an open tile (straight runs merged into one wall), and a door across
 * every door tile, turned to close the gap between its solid neighbours.
 * The map's outer border is left open; the VTT clamps sight to the map.
 */
export function mapWalls(map: BattleMap): GeneratedWall[] {
  const walls: GeneratedWall[] = []
  const blocks = (a: boolean, b: boolean) => a !== b

  // Horizontal edges: boundary y between row y-1 and row y
  for (let y = 1; y < map.rows; y++) {
    let start = -1
    for (let x = 0; x <= map.cols; x++) {
      const edge = x < map.cols && blocks(isSolid(map, x, y - 1), isSolid(map, x, y))
      if (edge && start < 0) start = x
      if (!edge && start >= 0) {
        walls.push({ points: [{ x: start, y }, { x, y }], coverType: 'full' })
        start = -1
      }
    }
  }
  // Vertical edges: boundary x between column x-1 and column x
  for (let x = 1; x < map.cols; x++) {
    let start = -1
    for (let y = 0; y <= map.rows; y++) {
      const edge = y < map.rows && blocks(isSolid(map, x - 1, y), isSolid(map, x, y))
      if (edge && start < 0) start = y
      if (!edge && start >= 0) {
        walls.push({ points: [{ x, y: start }, { x, y }], coverType: 'full' })
        start = -1
      }
    }
  }
  // Doors
  const door = tileChar('door')
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      if (getTile(map, c, r) !== door) continue
      walls.push({ points: doorLine(map, c, r), coverType: 'door' })
    }
  }
  return walls
}

/** Whether a door tile runs across the cell left to right (walls left and right of it). */
export function doorIsHorizontal(map: BattleMap, col: number, row: number): boolean {
  const sides = isSolid(map, col - 1, row) && isSolid(map, col + 1, row)
  const ends = isSolid(map, col, row - 1) && isSolid(map, col, row + 1)
  return sides || !ends
}

function doorLine(map: BattleMap, c: number, r: number): { x: number; y: number }[] {
  return doorIsHorizontal(map, c, r)
    ? [{ x: c, y: r + 0.5 }, { x: c + 1, y: r + 0.5 }]
    : [{ x: c + 0.5, y: r }, { x: c + 0.5, y: r + 1 }]
}
