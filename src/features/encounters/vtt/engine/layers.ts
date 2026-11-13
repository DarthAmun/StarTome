/** Drawing the still parts of a scene: grid, fog, walls, areas, the ruler, sight and pings. */
import * as PIXI from 'pixi.js'
import { isDoorWall } from '@/domain/rules/walls'
import type { Grid, Point, SceneArea, Viewport, Wall, WallKind } from './types'

export const WALL_COLORS: Record<WallKind, number> = { full: 0xffffff, greater: 0xb8860b, standard: 0xc86414, lesser: 0xc83214, window: 0x9fd4ff, door: 0x64c8dc, secret: 0xc77dff }
const PING_COLOR = 0xffd24a
const PING_MS = 2200
const FOV_OUTLINES = [0x4ecdc4, 0xff9f43, 0xff6b6b, 0xa29bfe, 0x55efc4, 0xfd79a8]

export function drawGrid(g: PIXI.Graphics, grid: Grid, w: number, h: number, scale: number): void {
  g.clear()
  if (!w || !h || grid.size < 4) return
  for (let x = ((grid.offsetX % grid.size) + grid.size) % grid.size; x < w; x += grid.size) g.moveTo(x, 0).lineTo(x, h)
  for (let y = ((grid.offsetY % grid.size) + grid.size) % grid.size; y < h; y += grid.size) g.moveTo(0, y).lineTo(w, y)
  g.stroke({ width: 1 / scale, color: 0xeeeeee, alpha: 0.35 })
}

/** Fog: hidden squares, or everything but the revealed ones after "cover all". */
export function drawFog(g: PIXI.Graphics, fog: Record<string, string>, grid: Grid, w: number, h: number, alpha: number): void {
  g.clear()
  const all = fog._allHidden === 'hidden'
  if (!all && !Object.keys(fog).length) return
  const cols = Math.ceil((w - grid.offsetX) / grid.size) + 1, rows = Math.ceil((h - grid.offsetY) / grid.size) + 1
  let any = false
  const cell = (c: number, r: number) => { g.rect(grid.offsetX + c * grid.size, grid.offsetY + r * grid.size, grid.size, grid.size); any = true }
  if (all) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (fog[`${c},${r}`] !== 'revealed') cell(c, r)
  } else {
    for (const [k, state] of Object.entries(fog)) {
      if (state !== 'hidden') continue
      const [c, r] = k.split(',').map(Number)
      if (c !== undefined && r !== undefined && Number.isFinite(c) && Number.isFinite(r)) cell(c, r)
    }
  }
  if (any) g.fill({ color: 0x0a0a19, alpha })
}

function dashed(g: PIXI.Graphics, a: Point, b: Point, dash: number, gap: number): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (!len) return
  const nx = (b.x - a.x) / len, ny = (b.y - a.y) / len
  for (let pos = 0; pos < len; pos += dash + gap) {
    const end = Math.min(len, pos + dash)
    g.moveTo(a.x + nx * pos, a.y + ny * pos).lineTo(a.x + nx * end, a.y + ny * end)
  }
}

const px = (grid: Grid, p: Point): Point => ({ x: grid.offsetX + p.x * grid.size, y: grid.offsetY + p.y * grid.size })

/** Walls as the GM sees them: solid, dashed when sight passes, a knob on doors. */
export function drawWalls(g: PIXI.Graphics, walls: Wall[], grid: Grid): void {
  g.clear()
  for (const w of walls) {
    if (w.points.length < 2) continue
    const color = WALL_COLORS[w.kind], pts = w.points.map(p => px(grid, p))
    const open = (isDoorWall(w.kind) && w.open) || w.kind === 'window'
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!, b = pts[i + 1]!
      if (open) dashed(g, a, b, 6, 4)
      else g.moveTo(a.x, a.y).lineTo(b.x, b.y)
    }
    g.stroke({ width: 2, color, alpha: open ? 0.55 : 0.9 })
    if (!isDoorWall(w.kind)) continue
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!, b = pts[i + 1]!, s = w.open ? 4 : 6
      g.rect((a.x + b.x) / 2 - s / 2, (a.y + b.y) / 2 - s / 2, s, s).fill({ color, alpha: 0.9 })
    }
  }
}

export function drawWallDraft(g: PIXI.Graphics, points: Point[], next: Point | null, kind: WallKind, grid: Grid): void {
  g.clear()
  const color = WALL_COLORS[kind], pts = points.map(p => px(grid, p))
  if (pts.length >= 2) {
    g.moveTo(pts[0]!.x, pts[0]!.y)
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y)
    g.stroke({ width: 2, color, alpha: 0.9 })
  }
  for (const p of pts) g.circle(p.x, p.y, 4).fill({ color, alpha: 0.9 })
  if (!next) return
  const n = px(grid, next), last = pts[pts.length - 1]
  if (last) { dashed(g, last, n, 6, 4); g.stroke({ width: 2, color, alpha: 0.55 }) }
  g.circle(n.x, n.y, 6).stroke({ width: 1.5, color, alpha: 0.7 })
}

/** Shaded squares with an outline along the edge of the area. */
export function drawArea(g: PIXI.Graphics, area: SceneArea, grid: Grid, alpha = 0.25): void {
  const s = grid.size, cells = new Set(area.cells)
  const at = (k: string) => { const [c, r] = k.split(',').map(Number); return { c: c ?? 0, r: r ?? 0 } }
  for (const k of cells) { const { c, r } = at(k); g.rect(grid.offsetX + c * s, grid.offsetY + r * s, s, s) }
  g.fill({ color: area.color, alpha })
  for (const k of cells) {
    const { c, r } = at(k), x = grid.offsetX + c * s, y = grid.offsetY + r * s
    if (!cells.has(`${c},${r - 1}`)) g.moveTo(x, y).lineTo(x + s, y)
    if (!cells.has(`${c},${r + 1}`)) g.moveTo(x, y + s).lineTo(x + s, y + s)
    if (!cells.has(`${c - 1},${r}`)) g.moveTo(x, y).lineTo(x, y + s)
    if (!cells.has(`${c + 1},${r}`)) g.moveTo(x + s, y).lineTo(x + s, y + s)
  }
  g.stroke({ color: area.color, width: 2, alpha: 0.9 })
}

/** A ruler between two points in half squares, labelled in feet (5 ft a square, diagonals 5/10/5). */
export function drawRuler(layer: PIXI.Container, from: Point, to: Point, grid: Grid, scale: number): void {
  layer.removeChildren().forEach(c => c.destroy())
  const a = px(grid, from), b = px(grid, to)
  const dx = Math.abs(to.x - from.x), dy = Math.abs(to.y - from.y)
  const squares = Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2)
  const g = new PIXI.Graphics()
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0xffcc44, width: 2 / scale, alpha: 0.9 })
  g.circle(a.x, a.y, 5 / scale).circle(b.x, b.y, 5 / scale).fill({ color: 0xffcc44 })
  const text = new PIXI.Text({ text: `${Math.round(squares * 5)} ft`, style: { fontSize: 14 / scale, fill: 0xffcc44, fontFamily: 'system-ui', fontWeight: 'bold', stroke: { color: 0x000000, width: 3 / scale } } })
  text.anchor.set(0.5)
  text.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 18 / scale)
  layer.addChild(g, text)
}

export const toScreen = (p: Point, grid: Grid, v: Viewport): Point => ({ x: (grid.offsetX + p.x * grid.size) * v.scale + v.x, y: (grid.offsetY + p.y * grid.size) * v.scale + v.y })

/** Darkness over the map with holes where the given polygons can see (screen space). */
export function drawSight(dark: PIXI.Graphics, erase: PIXI.Graphics, outline: PIXI.Graphics, lit: Point[][], outlines: Point[][], grid: Grid, v: Viewport, map: { w: number; h: number }, alpha: number): void {
  dark.clear(); erase.clear(); outline.clear()
  const flat = (poly: Point[]) => poly.flatMap((p) => { const s = toScreen(p, grid, v); return [s.x, s.y] })
  if (lit.length) {
    dark.rect(v.x, v.y, map.w * v.scale, map.h * v.scale).fill({ color: 0x000011, alpha })
    for (const poly of lit) if (poly.length >= 3) erase.poly(flat(poly)).fill({ color: 0xffffff, alpha: 1 })
  }
  outlines.forEach((poly, i) => { if (poly.length >= 3) outline.poly(flat(poly)).stroke({ color: FOV_OUTLINES[i % FOV_OUTLINES.length] ?? 0x4ecdc4, width: 1.5, alpha: 0.75 }) })
}

/** Ripples at a grid position; they keep their size at any zoom and follow the map while it moves. */
export function playPing(app: PIXI.Application, layer: PIXI.Container, at: Point, where: () => { grid: Grid; view: Viewport }): void {
  const g = new PIXI.Graphics()
  layer.addChild(g)
  const start = performance.now()
  const tick = () => {
    const t = performance.now() - start
    if (t >= PING_MS || g.destroyed) { app.ticker.remove(tick); if (!g.destroyed) g.destroy(); return }
    const { grid, view } = where(), s = toScreen(at, grid, view)
    g.clear()
    for (const offset of [0, 350, 700]) {
      const p = (t - offset) / 1100
      if (p < 0 || p > 1) continue
      g.circle(s.x, s.y, 10 + (1 - (1 - p) ** 3) * 62).stroke({ color: PING_COLOR, width: 4 * (1 - p) + 1, alpha: 1 - p })
    }
    const fade = t > PING_MS - 400 ? (PING_MS - t) / 400 : 1
    g.circle(s.x, s.y, 9 * (1 + 0.18 * Math.sin(t / 90))).fill({ color: PING_COLOR, alpha: 0.35 * fade })
    g.circle(s.x, s.y, 5).fill({ color: PING_COLOR, alpha: 0.95 * fade }).stroke({ color: 0x000000, width: 1.5, alpha: 0.6 * fade })
  }
  app.ticker.add(tick)
}
