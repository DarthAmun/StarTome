/**
 * The map engine: draws a scene with Pixi and turns pointer input into the
 * handlers' calls. It holds no encounter state of its own beyond what it was
 * last told to draw and the view (pan and zoom).
 */
import * as PIXI from 'pixi.js'
import { isDoorWall, wallAt } from '@/domain/rules/walls'
import { drawArea, drawFog, drawGrid, drawMarkers, drawStairs, drawRuler, drawSight, drawWallDraft, drawWalls, playPing } from './layers'
import { GridRulers } from './rulers'
import { drawToken } from './tokens'
import type { Cell, EngineHandlers, FovView, Grid, GridLook, Point, SceneArea, SceneBelow, SceneStair, SceneToken, Viewport, Wall } from './types'

const LONG_PRESS_MS = 550

export class MapEngine {
  private app = new PIXI.Application()
  private world = new PIXI.Container()
  /** The floor below, faded; this floor's map covers it where it is not empty. */
  private belowC = new PIXI.Container()
  private belowMap = new PIXI.Sprite()
  private belowTokens = new PIXI.Container(); private belowFog = new PIXI.Graphics()
  private below: SceneBelow | null = null
  private belowUrl: string | null = null
  private map = new PIXI.Sprite()
  private stairsC = new PIXI.Container()
  private stairs: SceneStair[] = []
  private gridG = new PIXI.Graphics()
  private areasG = new PIXI.Container()
  private fogG = new PIXI.Graphics()
  private wallsG = new PIXI.Graphics()
  private tokensC = new PIXI.Container()
  private markersC = new PIXI.Container()
  private markers: { slot: number; x: number; y: number; off?: boolean }[] = []
  private draftG = new PIXI.Graphics()
  private rulerC = new PIXI.Container()
  private previewG = new PIXI.Graphics()
  private dark = new PIXI.Graphics()
  private erase = new PIXI.Graphics()
  private outline = new PIXI.Graphics()
  private pings = new PIXI.Container()
  private labels: GridRulers | null = null
  /** How the grid looks; null = the default look. */
  private look: GridLook | null = null

  private view: Viewport = { x: 0, y: 0, scale: 1 }
  private grid: Grid = { size: 40, offsetX: 0, offsetY: 0 }
  private fog: Record<string, string> = {}
  private walls: Wall[] = []
  private areas: SceneArea[] = []
  private tokens: SceneToken[] = []
  private activeId: string | null = null
  private fov: FovView = { lit: [], outlines: [] }
  private mapUrl: string | null = null
  private mapSize = { w: 0, h: 0 }
  private generation = 0
  private ready = false
  private dead = false

  private pan: { sx: number; sy: number; vx: number; vy: number } | null = null
  private drag: { id: string; node: PIXI.Container; dx: number; dy: number; moved: boolean } | null = null
  private painting = false
  private rulerFrom: Point | null = null
  private areaAnchor: Cell | null = null
  private wallDraft: Point[] = []
  private wallNext: Point | null = null
  private lastWallClick = 0
  private longPress: ReturnType<typeof setTimeout> | null = null
  private pressAt: Point | null = null
  private tween: (() => void) | null = null
  private onKey = (e: KeyboardEvent) => this.key(e)

  constructor(private container: HTMLElement, private gm: boolean, private handlers: EngineHandlers) {}

  async init(): Promise<void> {
    await this.app.init({ resizeTo: this.container, backgroundColor: 0x0e0e1a, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 })
    if (this.dead) { this.app.destroy(true); return }
    this.container.appendChild(this.app.canvas)
    this.labels = new GridRulers(this.container)
    this.belowC.addChild(this.belowMap, this.belowTokens, this.belowFog)
    this.belowC.alpha = 0.35
    this.belowC.eventMode = 'none'
    this.world.addChild(this.belowC, this.map, this.gridG, this.areasG, this.fogG, this.wallsG, this.stairsC, this.markersC, this.tokensC, this.draftG, this.rulerC, this.previewG)
    // The darkness is its own render group, so punching holes in it leaves the map below alone
    const sight = new PIXI.Container()
    sight.filters = [new PIXI.AlphaFilter()]
    sight.enableRenderGroup()
    this.erase.blendMode = 'erase'
    sight.addChild(this.dark, this.erase)
    // Darkness, outlines and pings only show: clicks go through them to the tokens below (else no token moves while sight is drawn)
    sight.eventMode = this.outline.eventMode = this.pings.eventMode = 'none'
    this.app.stage.addChild(this.world, sight, this.outline, this.pings)
    this.app.stage.eventMode = 'static'
    this.app.stage.hitArea = { contains: () => true }
    this.app.stage.on('pointerdown', e => this.down(e)).on('pointermove', e => this.move(e)).on('pointerup', () => this.up()).on('pointerupoutside', () => this.up())
    this.app.canvas.addEventListener('wheel', e => this.wheel(e), { passive: false })
    this.app.canvas.addEventListener('contextmenu', e => this.context(e))
    document.addEventListener('keydown', this.onKey)
    this.ready = true
    this.applyView()
  }

  destroy(): void {
    this.dead = true
    this.generation++
    if (this.longPress) clearTimeout(this.longPress)
    document.removeEventListener('keydown', this.onKey)
    const was = this.ready
    // Calls that still arrive (a watcher firing late) find nothing to draw on
    this.ready = false
    if (was) this.app.destroy(true, { children: true })
    this.labels?.destroy()
  }

  // ── What to draw ─────────────────────────────────────────────────────────

  async setMap(url: string | null): Promise<void> {
    if (url === this.mapUrl) return
    this.mapUrl = url
    const generation = ++this.generation
    const texture = url ? await PIXI.Assets.load<PIXI.Texture>({ src: url, parser: 'texture' }).catch(() => null) : null
    if (generation !== this.generation || this.dead) return
    this.map.texture = texture ?? PIXI.Texture.EMPTY
    this.mapSize = texture ? { w: texture.width, h: texture.height } : { w: 0, h: 0 }
    this.redrawStill()
  }

  setGrid(grid: Grid): void {
    this.grid = { ...grid }
    this.redrawStill()
    void this.drawTokens()
  }

  setFog(fog: Record<string, string>): void { this.fog = fog; this.redrawFog() }
  setWalls(walls: Wall[]): void { this.walls = walls; if (this.gm && this.ready) drawWalls(this.wallsG, walls, this.grid) }
  setFov(fov: FovView): void { this.fov = fov; this.redrawSight() }
  /** Grid colour, lines every 5 squares, square names on the edges and beside tokens. */
  setGridLook(look: GridLook): void { this.look = { ...look }; if (this.labels) this.labels.shown = look.rulers; this.redrawStill(); void this.drawTokens() }

  setAreas(areas: SceneArea[]): void {
    this.areas = areas
    if (!this.ready) return
    this.areasG.removeChildren().forEach(c => c.destroy())
    for (const a of areas) { const g = new PIXI.Graphics(); drawArea(g, a, this.grid); this.areasG.addChild(g) }
  }

  /** Numbered marks on squares (a starship's battle stations); `off` = malfunctioning. */
  setMarkers(markers: { slot: number; x: number; y: number; off?: boolean }[]): void {
    this.markers = markers
    if (!this.ready) return
    drawMarkers(this.markersC, markers, this.grid)
  }

  /** The floor below, drawn faded under this one (null: none). */
  async setBelow(below: SceneBelow | null): Promise<void> {
    this.below = below
    const url = below?.url ?? null
    if (url !== this.belowUrl) {
      this.belowUrl = url
      const texture = url ? await PIXI.Assets.load<PIXI.Texture>({ src: url, parser: 'texture' }).catch(() => null) : null
      if (this.dead || this.belowUrl !== url) return
      this.belowMap.texture = texture ?? PIXI.Texture.EMPTY
    }
    if (!this.ready || this.below !== below) return
    // Fog of the floor below hides what is there, as on that floor
    if (below && this.belowMap.texture !== PIXI.Texture.EMPTY) drawFog(this.belowFog, below.fog, below.grid, this.belowMap.texture.width, this.belowMap.texture.height, this.gm ? 0.6 : 1)
    else this.belowFog.clear()
    const list = below?.tokens ?? []
    const textures = await Promise.all(list.map(t => (t.image ? PIXI.Assets.load<PIXI.Texture>({ src: t.image, parser: 'texture' }).catch(() => null) : null)))
    if (this.dead || this.below !== below) return
    this.belowTokens.removeChildren().forEach(c => c.destroy({ children: true }))
    for (const [i, t] of list.entries()) this.belowTokens.addChild(drawToken(t, below!.grid, textures[i] ?? null, { gm: this.gm, active: false, screenCell: 0 }))
  }

  setStairs(stairs: SceneStair[]): void {
    this.stairs = stairs
    if (this.ready) drawStairs(this.stairsC, stairs, this.grid)
  }

  setTokens(tokens: SceneToken[], activeId: string | null): void {
    this.tokens = tokens
    this.activeId = activeId
    void this.drawTokens()
  }

  /** The tool changed: unfinished drafts of the old one go away. */
  toolChanged(): void {
    this.wallDraft = []; this.wallNext = null; this.draftG.clear()
    this.rulerFrom = null; this.rulerC.removeChildren().forEach(c => c.destroy())
    this.areaAnchor = null; this.previewG.clear()
  }

  // ── The view ─────────────────────────────────────────────────────────────

  get viewport(): Viewport { return { ...this.view } }
  /** The map's size in pixels and in squares (null without a map). */
  get size(): { w: number; h: number; cols: number; rows: number } | null {
    const { w, h } = this.mapSize
    return w ? { w, h, cols: (w - this.grid.offsetX) / this.grid.size, rows: (h - this.grid.offsetY) / this.grid.size } : null
  }

  setViewport(v: Viewport): void { this.view = { ...v }; this.applyView() }

  /** Shows the whole map (or the tokens, without one) in the middle of the screen. */
  fit(): void {
    if (!this.ready) return
    const w = this.mapSize.w || 30 * this.grid.size, h = this.mapSize.h || 20 * this.grid.size
    const scale = Math.max(0.1, Math.min(4, Math.min(this.app.screen.width / w, this.app.screen.height / h) * 0.95))
    this.view = { scale, x: (this.app.screen.width - w * scale) / 2, y: (this.app.screen.height - h * scale) / 2 }
    this.applyView()
    this.handlers.onViewport?.(this.viewport)
  }

  resize(): void { if (this.ready) { this.app.resize(); this.redrawSight() } }

  /** The square under a point of the page. */
  cellAt(clientX: number, clientY: number): Cell {
    const r = this.container.getBoundingClientRect(), g = this.toGrid(clientX - r.left, clientY - r.top)
    return { col: Math.floor(g.x), row: Math.floor(g.y) }
  }

  ping(col: number, row: number): void {
    if (this.ready) playPing(this.app, this.pings, { x: col, y: row }, () => ({ grid: this.grid, view: this.view }))
  }

  /** Glides so the grid position sits in the middle of the screen. */
  centerOn(col: number, row: number): void {
    if (!this.ready) return
    const wx = this.grid.offsetX + col * this.grid.size, wy = this.grid.offsetY + row * this.grid.size
    const from = { x: this.view.x, y: this.view.y }
    const to = { x: this.app.screen.width / 2 - wx * this.view.scale, y: this.app.screen.height / 2 - wy * this.view.scale }
    if (this.tween) this.app.ticker.remove(this.tween)
    const start = performance.now()
    this.tween = () => {
      const p = Math.min(1, (performance.now() - start) / 450), e = 1 - (1 - p) ** 3
      this.view.x = from.x + (to.x - from.x) * e
      this.view.y = from.y + (to.y - from.y) * e
      this.applyView()
      if (p >= 1 && this.tween) { this.app.ticker.remove(this.tween); this.tween = null }
    }
    this.app.ticker.add(this.tween)
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  private applyView(): void {
    if (!this.ready) return
    this.world.position.set(this.view.x, this.view.y)
    this.world.scale.set(this.view.scale)
    this.redrawSight()
  }

  private redrawStill(): void {
    if (!this.ready) return
    this.redrawGrid()
    this.redrawFog()
    if (this.gm) drawWalls(this.wallsG, this.walls, this.grid)
    this.setAreas(this.areas)
    this.setMarkers(this.markers)
    this.setStairs(this.stairs)
    this.redrawSight()
  }

  private redrawGrid(): void { drawGrid(this.gridG, this.grid, this.mapSize.w || 60 * this.grid.size, this.mapSize.h || 40 * this.grid.size, this.view.scale, this.look ?? undefined) }

  private redrawFog(): void {
    if (this.ready) drawFog(this.fogG, this.fog, this.grid, this.mapSize.w || 60 * this.grid.size, this.mapSize.h || 40 * this.grid.size, this.gm ? 0.6 : 1)
  }

  private redrawSight(): void {
    if (!this.ready) return
    const map = { w: this.mapSize.w || this.app.screen.width / this.view.scale, h: this.mapSize.h || this.app.screen.height / this.view.scale }
    drawSight(this.dark, this.erase, this.outline, this.fov.lit, this.fov.outlines, this.grid, this.view, map, this.gm ? 0.72 : 1)
    this.labels?.draw(this.view, this.grid, { w: this.mapSize.w || 60 * this.grid.size, h: this.mapSize.h || 40 * this.grid.size })
  }

  private async drawTokens(): Promise<void> {
    if (!this.ready) return
    const generation = ++this.tokenGeneration
    const list = this.tokens
    const textures = await Promise.all(list.map(t => (t.image ? PIXI.Assets.load<PIXI.Texture>({ src: t.image, parser: 'texture' }).catch(() => null) : null)))
    if (generation !== this.tokenGeneration || this.dead) return
    this.tokensC.removeChildren().forEach(c => c.destroy({ children: true }))
    const screenCell = this.grid.size * this.view.scale
    list.forEach((t, i) => {
      const node = drawToken(t, this.grid, textures[i] ?? null, { gm: this.gm, active: t.id === this.activeId, screenCell, cell: !!this.look?.tokenCells })
      node.eventMode = 'static'
      node.cursor = this.gm ? 'grab' : 'default'
      node.on('pointerdown', e => this.tokenDown(e, t, node))
      this.tokensC.addChild(node)
    })
  }
  private tokenGeneration = 0

  // ── Pointer ──────────────────────────────────────────────────────────────

  private toGrid(sx: number, sy: number): Point {
    return { x: ((sx - this.view.x) / this.view.scale - this.grid.offsetX) / this.grid.size, y: ((sy - this.view.y) / this.view.scale - this.grid.offsetY) / this.grid.size }
  }
  private half(sx: number, sy: number): Cell {
    const g = this.toGrid(sx, sy)
    return { col: Math.round(g.x * 2) / 2, row: Math.round(g.y * 2) / 2 }
  }

  private tokenDown(e: PIXI.FederatedPointerEvent, t: SceneToken, node: PIXI.Container): void {
    if (e.button !== 0 || this.handlers.tool() !== 'select' || e.altKey) return
    e.stopPropagation()
    if (!this.gm) { this.handlers.onTokenClick?.(t.id); return }
    const local = this.world.toLocal(e.global)
    this.drag = { id: t.id, node, dx: local.x - node.x, dy: local.y - node.y, moved: false }
    node.cursor = 'grabbing'
    this.tokensC.setChildIndex(node, this.tokensC.children.length - 1)
  }

  private down(e: PIXI.FederatedPointerEvent): void {
    const tool = this.handlers.tool(), { x, y } = e.global
    if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && !this.gm)) {
      this.pan = { sx: x, sy: y, vx: this.view.x, vy: this.view.y }
      this.app.canvas.style.cursor = 'grabbing'
      return
    }
    if (e.button !== 0 || !this.gm) return
    const g = this.toGrid(x, y)
    if (tool === 'ping') { this.emitPing(g, e.shiftKey); return }
    if (tool === 'stairs') { this.handlers.onStairClick?.({ col: Math.floor(g.x), row: Math.floor(g.y) }); return }
    if (tool === 'select') {
      const door = wallAt(this.walls, g.x, g.y, 8 / this.view.scale / this.grid.size)
      if (door && isDoorWall(door.kind)) { this.handlers.onDoorToggle?.(door.id); return }
      // A long press on the bare map pings without switching tools
      this.pressAt = { x, y }
      const shift = e.shiftKey
      this.longPress = setTimeout(() => { this.longPress = null; this.pan = null; this.emitPing(g, shift) }, LONG_PRESS_MS)
      this.pan = { sx: x, sy: y, vx: this.view.x, vy: this.view.y }
      return
    }
    if (tool === 'wall') {
      const now = Date.now(), double = now - this.lastWallClick < 300
      this.lastWallClick = now
      if (double) this.commitWall()
      else { this.wallDraft.push(this.snap(g)); this.redrawDraft() }
      return
    }
    if (tool === 'fog') { this.painting = true; this.paint(g); return }
    if (tool === 'measure') {
      const h = this.half(x, y)
      if (this.rulerFrom) { this.rulerFrom = null; this.rulerC.removeChildren().forEach(c => c.destroy()) }
      else this.rulerFrom = { x: h.col, y: h.row }
      return
    }
    if (tool === 'area') {
      const at = this.half(x, y)
      this.areaAnchor = this.handlers.onAreaClick?.(this.areaAnchor, at) ? at : null
      this.preview(at)
    }
  }

  private move(e: PIXI.FederatedPointerEvent): void {
    const { x, y } = e.global
    if (this.pressAt && Math.hypot(x - this.pressAt.x, y - this.pressAt.y) > 6) this.cancelPress()
    if (this.drag) {
      const local = this.world.toLocal(e.global)
      this.drag.node.position.set(local.x - this.drag.dx, local.y - this.drag.dy)
      this.drag.moved = true
      return
    }
    if (this.painting) { this.paint(this.toGrid(x, y)); return }
    if (this.pan && !this.longPress) {
      this.view.x = this.pan.vx + (x - this.pan.sx)
      this.view.y = this.pan.vy + (y - this.pan.sy)
      this.applyView()
      return
    }
    const tool = this.handlers.tool()
    if (tool === 'wall' && this.gm) { this.wallNext = this.snap(this.toGrid(x, y)); this.redrawDraft() }
    else if (tool === 'area' && this.gm) this.preview(this.half(x, y))
    else if (tool === 'measure' && this.rulerFrom) { const h = this.half(x, y); drawRuler(this.rulerC, this.rulerFrom, { x: h.col, y: h.row }, this.grid, this.view.scale) }
  }

  private up(): void {
    this.cancelPress()
    this.painting = false
    if (this.drag) {
      const d = this.drag
      this.drag = null
      d.node.cursor = 'grab'
      const gx = Math.round((d.node.x - this.grid.offsetX) / this.grid.size), gy = Math.round((d.node.y - this.grid.offsetY) / this.grid.size)
      d.node.position.set(this.grid.offsetX + gx * this.grid.size, this.grid.offsetY + gy * this.grid.size)
      const t = this.tokens.find(k => k.id === d.id)
      if (d.moved && t && (t.x !== gx || t.y !== gy)) this.handlers.onTokenMoved?.(d.id, gx, gy)
      else this.handlers.onTokenClick?.(d.id)
    }
    if (this.pan) {
      this.pan = null
      this.app.canvas.style.cursor = 'default'
      this.handlers.onViewport?.(this.viewport)
    }
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault()
    const wx = (e.offsetX - this.view.x) / this.view.scale, wy = (e.offsetY - this.view.y) / this.view.scale
    this.view.scale = Math.min(4, Math.max(0.1, this.view.scale * (e.deltaY < 0 ? 1.1 : 0.9)))
    this.view.x = e.offsetX - wx * this.view.scale
    this.view.y = e.offsetY - wy * this.view.scale
    this.applyView()
    this.redrawGrid()
    this.handlers.onViewport?.(this.viewport)
  }

  private context(e: MouseEvent): void {
    e.preventDefault()
    if (!this.gm) return
    const tool = this.handlers.tool()
    if (tool === 'wall' && this.wallDraft.length) { this.commitWall(); return }
    if (tool === 'area' && this.areaAnchor) { this.areaAnchor = null; this.previewG.clear(); return }
    const g = this.toGrid(e.offsetX, e.offsetY), cell = { col: Math.floor(g.x), row: Math.floor(g.y) }
    const token = [...this.tokens].reverse().find(t => g.x >= t.x && g.x < t.x + t.size && g.y >= t.y && g.y < t.y + t.size)
    const wall = token ? null : wallAt(this.walls, g.x, g.y, 12 / this.view.scale / this.grid.size)
    const key = `${cell.col},${cell.row}`
    const stair = token || wall ? null : this.stairs.find(s => s.x === cell.col && s.y === cell.row)
    const area = token || wall || stair ? null : [...this.areas].reverse().find(a => a.cells.includes(key))
    this.handlers.onContext?.({ tokenId: token?.id ?? null, wallId: wall?.id ?? null, areaId: area?.id ?? null, stairId: stair?.id ?? null, cell }, e.clientX, e.clientY)
  }

  private key(e: KeyboardEvent): void {
    if (!this.gm || this.handlers.tool() !== 'wall' || !this.wallDraft.length) return
    if (e.key === 'Backspace') { e.preventDefault(); this.wallDraft.pop(); this.redrawDraft() }
    if (e.key === 'Enter') { e.preventDefault(); this.commitWall() }
  }

  private cancelPress(): void {
    if (this.longPress) clearTimeout(this.longPress)
    this.longPress = null
    this.pressAt = null
  }

  private emitPing(g: Point, focus: boolean): void {
    this.ping(g.x, g.y)
    this.handlers.onPing?.(g.x, g.y, focus)
  }

  private paint(g: Point): void {
    const brush = this.handlers.fogBrush?.() ?? { size: 1, hide: true }
    const half = Math.floor(brush.size / 2), keys: string[] = []
    for (let dc = -half; dc <= half; dc++) for (let dr = -half; dr <= half; dr++) {
      const c = Math.floor(g.x) + dc, r = Math.floor(g.y) + dr
      if (c >= 0 && r >= 0) keys.push(`${c},${r}`)
    }
    this.handlers.onFogPaint?.(keys, brush.hide)
  }

  /** The nearest corner, edge middle or centre of the square under the point. */
  private snap(g: Point): Point {
    return { x: Math.round(g.x * 2) / 2, y: Math.round(g.y * 2) / 2 }
  }

  private redrawDraft(): void {
    drawWallDraft(this.draftG, this.wallDraft, this.wallNext, this.handlers.wallKind?.() ?? 'full', this.grid)
  }

  private commitWall(): void {
    if (this.wallDraft.length >= 2) this.handlers.onWallDone?.([...this.wallDraft], this.handlers.wallKind?.() ?? 'full')
    this.wallDraft = []
    this.wallNext = null
    this.draftG.clear()
  }

  private preview(at: Cell): void {
    this.previewG.clear()
    const draft = this.handlers.areaDraft?.(this.areaAnchor, at)
    if (draft) drawArea(this.previewG, draft, this.grid, 0.35)
  }
}
