/**
 * Square names along the map's edges, like a chessboard: column letters in a
 * strip along the top, row numbers down the left. The strips hug the map's
 * top and left edge and stay on screen when the map is panned past them, so
 * the map itself stays clean. A plain 2D canvas over the map, in screen
 * space, redrawn with each view change; it only shows, clicks go through it.
 */
import { columnName, rulerStep } from '@/domain/rules/gridLabels'
import type { Grid, Viewport } from './types'

const TOP_H = 18
const LEFT_W = 26
/** Names closer than this many screen pixels crowd: then only every 2nd, 5th … is named. */
const MIN_GAP = { col: 22, row: 16 }

export class GridRulers {
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d')
  private on = false

  constructor(private container: HTMLElement) {
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' })
    this.canvas.dataset.test = 'grid-rulers'
  }

  /** The canvas is on the page only while rulers are shown: the map has a single canvas otherwise. */
  set shown(on: boolean) {
    this.on = on
    if (on && !this.canvas.isConnected) this.container.appendChild(this.canvas)
    else if (!on) this.canvas.remove()
  }
  get shown(): boolean { return this.on }

  /** `map`: the map's size in pixels (the drawn grid's extent without one). */
  draw(view: Viewport, grid: Grid, map: { w: number; h: number }): void {
    const ctx = this.ctx, c = this.canvas
    if (!ctx || !this.on) return
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    if (grid.size < 4 || !w) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const cell = grid.size * view.scale
    const cols = Math.ceil((map.w - grid.offsetX) / grid.size), rows = Math.ceil((map.h - grid.offsetY) / grid.size)
    // Square (col, row) starts on screen at x0 + col·cell, y0 + row·cell
    const x0 = view.x + grid.offsetX * view.scale, y0 = view.y + grid.offsetY * view.scale
    const left = Math.max(x0, 0), right = Math.min(x0 + cols * cell, w), top = Math.max(y0, 0), bottom = Math.min(y0 + rows * cell, h)
    if (right <= left || bottom <= top) return
    // The strips sit just outside the map's edge, or on the screen's edge once the map is panned past it
    const stripY = Math.max(0, y0 - TOP_H), stripX = Math.max(0, x0 - LEFT_W)
    ctx.fillStyle = 'rgba(10, 10, 22, 0.62)'
    ctx.fillRect(left, stripY, right - left, TOP_H)
    ctx.fillRect(stripX, top, LEFT_W, bottom - top)
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(232, 226, 204, 0.9)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const colStep = rulerStep(cell, MIN_GAP.col), rowStep = rulerStep(cell, MIN_GAP.row)
    for (let col = Math.max(0, Math.floor((left - x0) / cell)); col < cols; col++) {
      const x = x0 + (col + 0.5) * cell
      if (x > right) break
      if (col % colStep === 0 && x >= left) ctx.fillText(columnName(col), x, stripY + TOP_H / 2)
    }
    for (let row = Math.max(0, Math.floor((top - y0) / cell)); row < rows; row++) {
      const y = y0 + (row + 0.5) * cell
      if (y > bottom) break
      if (row % rowStep === 0 && y >= top) ctx.fillText(String(row + 1), stripX + LEFT_W / 2, y)
    }
  }

  destroy(): void { this.canvas.remove() }
}
