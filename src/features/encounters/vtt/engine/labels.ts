/**
 * Square names ("A1", "C7") in a corner of each grid square, small and faint.
 * A plain 2D canvas over the map, in screen space: each view change redraws
 * only the squares on screen, so a large map costs no more than a small one.
 * It only shows; clicks go through it.
 */
import { cellName } from '@/domain/rules/gridLabels'
import type { Grid, Viewport } from './types'

/** Below this many screen pixels per square the names would crowd: none are drawn. */
const MIN_CELL_PX = 30

export class CellLabels {
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d')
  private on = false

  constructor(container: HTMLElement) {
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' })
    this.canvas.dataset.test = 'cell-labels'
    container.appendChild(this.canvas)
  }

  set shown(on: boolean) { this.on = on }
  get shown(): boolean { return this.on }

  /** `map`: the map's size in pixels (the drawn grid's extent without one). */
  draw(view: Viewport, grid: Grid, map: { w: number; h: number }): void {
    const ctx = this.ctx, c = this.canvas
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    const cell = grid.size * view.scale
    if (!this.on || grid.size < 4 || cell < MIN_CELL_PX || !w) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const cols = Math.ceil((map.w - grid.offsetX) / grid.size), rows = Math.ceil((map.h - grid.offsetY) / grid.size)
    // Squares on screen: screen x = view.x + (offsetX + col·size)·scale
    const x0 = view.x + grid.offsetX * view.scale, y0 = view.y + grid.offsetY * view.scale
    const c0 = Math.max(0, Math.floor(-x0 / cell)), c1 = Math.min(cols - 1, Math.floor((w - x0) / cell))
    const r0 = Math.max(0, Math.floor(-y0 / cell)), r1 = Math.min(rows - 1, Math.floor((h - y0) / cell))
    const size = Math.max(8, Math.min(13, cell * 0.2)), pad = Math.max(2, cell * 0.05)
    ctx.font = `600 ${size}px system-ui, sans-serif`
    ctx.textBaseline = 'top'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = 'rgba(8, 8, 20, 0.45)'
    ctx.fillStyle = 'rgba(238, 238, 238, 0.55)'
    for (let r = r0; r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        const text = cellName(col, r), x = x0 + col * cell + pad, y = y0 + r * cell + pad
        ctx.strokeText(text, x, y)
        ctx.fillText(text, x, y)
      }
    }
  }

  destroy(): void { this.canvas.remove() }
}
