/**
 * Battle maps made in the map maker (pages/encounter/[id]/map-maker.vue).
 *
 * A map is a grid of tiles, one character per cell, stored on its encounter
 * (`battlemap`). The maker renders it to an image for the VTT and derives
 * line-of-sight walls from it: wall tiles block; door, window and hidden door
 * tiles get a wall of that kind across the gap.
 */
import type { WallKind } from './walls'

export type TileId =
  | 'void' | 'stone' | 'wood' | 'carpet' | 'dirt' | 'grass' | 'sand' | 'snow' | 'ice' | 'rubble'
  | 'swamp' | 'water' | 'deepwater' | 'fire' | 'magma' | 'wall' | 'window' | 'door' | 'secret'

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
  { id: 'carpet', char: 'c', label: 'Carpet',      color: '#7a2630', solid: false },
  { id: 'sand',   char: 'n', label: 'Sand',        color: '#c9b07a', solid: false },
  { id: 'snow',   char: 'o', label: 'Snow',        color: '#dfe6ec', solid: false },
  { id: 'ice',    char: 'i', label: 'Ice',         color: '#9cc9dc', solid: false },
  { id: 'rubble', char: 'r', label: 'Rubble (difficult)', color: '#6f6a60', solid: false },
  { id: 'swamp',  char: 'm', label: 'Swamp',       color: '#4a5530', solid: false },
  { id: 'water',  char: 'a', label: 'Water',       color: '#3b6e8f', solid: false },
  { id: 'deepwater', char: 'q', label: 'Deep water', color: '#1f4563', solid: false },
  { id: 'fire',   char: 'f', label: 'Fire',        color: '#3a2418', solid: false },
  { id: 'magma',  char: 'l', label: 'Magma',       color: '#2b1410', solid: false },
  { id: 'wall',   char: '#', label: 'Wall',        color: '#3a3631', solid: true },
  { id: 'window', char: '=', label: 'Window (sight passes)', color: '#8a8478', solid: false },
  { id: 'door',   char: '+', label: 'Door',        color: '#8a8478', solid: false },
  { id: 'secret', char: '%', label: 'Hidden door (players see a wall)', color: '#3a3631', solid: false },
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
  /** Placed assets, drawn in array order within their layer. */
  props?: MapProp[]
}

/**
 * An asset placed on the map. The floor layer lies on the tiles, under the
 * walls' shadows (rugs, cracks); the object layer stands on top (tables, trees).
 */
export type PropLayer = 'floor' | 'object'

export interface MapProp {
  id: string
  image: string          // "img:<id>"
  /** Centre, in squares from the map's top-left. */
  x: number
  y: number
  /** Size in squares, before rotation. */
  w: number
  h: number
  /** Degrees clockwise. */
  rotation: number
  layer: PropLayer
  flip?: boolean
}

export const PROP_MIN_SIZE = 0.25

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

/** A map read from an encounter row: anything malformed becomes null, malformed props are dropped. */
export function readBattleMap(v: unknown): BattleMap | null {
  if (!v || typeof v !== 'object') return null
  const { cols, rows, tiles, props } = v as Partial<BattleMap>
  if (typeof cols !== 'number' || typeof rows !== 'number' || typeof tiles !== 'string') return null
  if (cols !== clampSize(cols) || rows !== clampSize(rows) || tiles.length !== cols * rows) return null
  const placed = Array.isArray(props) ? props.filter(isProp) : []
  return placed.length ? { cols, rows, tiles, props: placed } : { cols, rows, tiles }
}

function isProp(p: unknown): p is MapProp {
  if (!p || typeof p !== 'object') return false
  const q = p as Partial<MapProp>
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
  return typeof q.id === 'string' && typeof q.image === 'string' && num(q.x) && num(q.y)
    && num(q.w) && num(q.h) && q.w! > 0 && q.h! > 0 && num(q.rotation) && (q.layer === 'floor' || q.layer === 'object')
}

/** Image refs the map's props show (backups and image cleanup keep them). */
export function propImages(map: unknown): string[] {
  return readBattleMap(map)?.props?.map(p => p.image) ?? []
}

/** Props in drawing order: the floor layer, then objects. */
export function propsInOrder(map: BattleMap): MapProp[] {
  const props = map.props ?? []
  return [...props.filter(p => p.layer === 'floor'), ...props.filter(p => p.layer === 'object')]
}

/** A point in squares, in the prop's own frame (centre at 0,0, not rotated). */
export function toPropFrame(p: MapProp, x: number, y: number): { x: number; y: number } {
  const a = (-p.rotation * Math.PI) / 180
  const dx = x - p.x
  const dy = y - p.y
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }
}

/** A point in the prop's own frame back in map squares. */
export function fromPropFrame(p: MapProp, x: number, y: number): { x: number; y: number } {
  const a = (p.rotation * Math.PI) / 180
  return { x: p.x + x * Math.cos(a) - y * Math.sin(a), y: p.y + x * Math.sin(a) + y * Math.cos(a) }
}

/** The topmost prop under a point (squares), objects before floor. */
export function propAt(map: BattleMap, x: number, y: number): MapProp | null {
  const order = propsInOrder(map)
  for (let i = order.length - 1; i >= 0; i--) {
    const p = order[i]!
    const local = toPropFrame(p, x, y)
    if (Math.abs(local.x) <= p.w / 2 && Math.abs(local.y) <= p.h / 2) return p
  }
  return null
}

/** The map with one prop changed (by id); `null` removes it. */
export function updateProp(map: BattleMap, id: string, next: MapProp | null): BattleMap {
  const props = (map.props ?? []).flatMap(p => (p.id !== id ? [p] : next ? [next] : []))
  return { ...map, props }
}

/** The prop moved one step up (+1) or down (-1) within its layer. */
export function restackProp(map: BattleMap, id: string, step: 1 | -1): BattleMap {
  const props = [...(map.props ?? [])]
  const i = props.findIndex(p => p.id === id)
  if (i < 0) return map
  // Swap with the nearest prop of the same layer in that direction
  for (let j = i + step; j >= 0 && j < props.length; j += step) {
    const a = props[i]!, b = props[j]!
    if (b.layer !== a.layer) continue
    props[i] = b
    props[j] = a
    return { ...map, props }
  }
  return map
}

/** Rounds to a step (0.5 squares for positions, 15° for angles). */
export function snap(v: number, step: number): number {
  return Math.round(v / step) * step
}

export function getTile(map: BattleMap, col: number, row: number): string {
  if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return tileChar('void')
  return map.tiles[row * map.cols + col] ?? tileChar('void')
}

/** The map grown or cut to a new size, keeping the top-left; new cells are void. Props stay where they are. */
export function resizeMap(map: BattleMap, cols: number, rows: number): BattleMap {
  cols = clampSize(cols)
  rows = clampSize(rows)
  let tiles = ''
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) tiles += getTile(map, c, r)
  }
  return { ...map, cols, rows, tiles }
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

export interface GeneratedWall { points: { x: number; y: number }[]; coverType: WallKind }

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
  // Doors, windows and hidden doors
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const coverType = OPENINGS[getTile(map, c, r)]
      if (coverType) walls.push({ points: doorLine(map, c, r), coverType })
    }
  }
  return walls
}

/** Tiles that sit in a wall and get a wall of their own across them, by tile character. */
const OPENINGS: Record<string, WallKind> = { '+': 'door', '=': 'window', '%': 'secret' }

/** Door, window or hidden door. */
export function isOpening(ch: string): boolean {
  return ch in OPENINGS
}

/**
 * Whether a door (window, hidden door) tile runs across the cell left to right:
 * it follows the wall it sits in, the axis with more wall (or openings, for doors
 * and windows wider than one square) next to it. Left to right when that's even.
 */
export function doorIsHorizontal(map: BattleMap, col: number, row: number): boolean {
  const inWall = (c: number, r: number) => isSolid(map, c, r) || isOpening(getTile(map, c, r))
  const across = Number(inWall(col - 1, row)) + Number(inWall(col + 1, row))
  const upright = Number(inWall(col, row - 1)) + Number(inWall(col, row + 1))
  return across >= upright
}

function doorLine(map: BattleMap, c: number, r: number): { x: number; y: number }[] {
  return doorIsHorizontal(map, c, r)
    ? [{ x: c, y: r + 0.5 }, { x: c + 1, y: r + 0.5 }]
    : [{ x: c + 0.5, y: r }, { x: c + 0.5, y: r + 1 }]
}
