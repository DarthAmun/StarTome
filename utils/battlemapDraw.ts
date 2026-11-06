/**
 * Draws a map maker map (rules/battlemap.ts) on a 2D canvas: for the editor
 * and for the image the encounter gets. Textures are drawn from a hash of the
 * cell, so a map looks the same every time it is drawn.
 */
import { doorIsHorizontal, getTile, tileByChar, type BattleMap, type MapProp } from '~/rules/battlemap'

/** 0…1, the same for the same cell and salt. */
function hash(c: number, r: number, salt: number): number {
  let h = (c * 374761393 + r * 668265263 + salt * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)))
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`
}

export interface DrawOptions {
  /** Grid lines between cells (the editor; the VTT draws its own). */
  grid?: boolean
  /** Loaded images of the props, by image ref; props whose image is missing are skipped. */
  images?: Map<string, CanvasImageSource>
}

export function drawBattleMap(ctx: CanvasRenderingContext2D, map: BattleMap, px: number, opts: DrawOptions = {}) {
  ctx.save()
  ctx.clearRect(0, 0, map.cols * px, map.rows * px)
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) drawCell(ctx, map, c, r, px)
  }
  const props = map.props ?? []
  for (const p of props) if (p.layer === 'floor') drawProp(ctx, p, px, opts.images)
  drawWallShadows(ctx, map, px)
  for (const p of props) if (p.layer === 'object') drawProp(ctx, p, px, opts.images)
  if (opts.grid) {
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let c = 1; c < map.cols; c++) { ctx.moveTo(c * px + 0.5, 0); ctx.lineTo(c * px + 0.5, map.rows * px) }
    for (let r = 1; r < map.rows; r++) { ctx.moveTo(0, r * px + 0.5); ctx.lineTo(map.cols * px, r * px + 0.5) }
    ctx.stroke()
  }
  ctx.restore()
}

function drawCell(ctx: CanvasRenderingContext2D, map: BattleMap, c: number, r: number, px: number) {
  const tile = tileByChar(getTile(map, c, r))
  const x = c * px
  const y = r * px
  // Doors stand on stone floor
  const base = tile.id === 'door' ? tileByChar('s').color : tile.color
  ctx.fillStyle = tile.id === 'void' ? base : shade(base, (hash(c, r, 1) - 0.5) * 0.06)
  ctx.fillRect(x, y, px, px)

  switch (tile.id) {
    case 'stone': {
      // Flagstones: four slabs with joints
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'
      ctx.lineWidth = Math.max(1, px / 35)
      const off = hash(c, r, 2) > 0.5 ? px / 2 : px / 3
      ctx.beginPath()
      ctx.moveTo(x, y + px / 2); ctx.lineTo(x + px, y + px / 2)
      ctx.moveTo(x + off, y); ctx.lineTo(x + off, y + px / 2)
      ctx.moveTo(x + px - off, y + px / 2); ctx.lineTo(x + px - off, y + px)
      ctx.stroke()
      speckle(ctx, c, r, x, y, px, 'rgba(255,255,255,0.06)', 5)
      break
    }
    case 'wood': {
      ctx.strokeStyle = 'rgba(40,20,5,0.35)'
      ctx.lineWidth = Math.max(1, px / 40)
      ctx.beginPath()
      for (let i = 1; i < 4; i++) { ctx.moveTo(x, y + (px * i) / 4); ctx.lineTo(x + px, y + (px * i) / 4) }
      for (let i = 0; i < 4; i++) {
        const sx = x + hash(c, r, 10 + i) * px
        ctx.moveTo(sx, y + (px * i) / 4); ctx.lineTo(sx, y + (px * (i + 1)) / 4)
      }
      ctx.stroke()
      break
    }
    case 'dirt':
      speckle(ctx, c, r, x, y, px, 'rgba(0,0,0,0.18)', 10)
      speckle(ctx, c, r + 999, x, y, px, 'rgba(255,230,190,0.12)', 6)
      break
    case 'grass': {
      ctx.strokeStyle = 'rgba(160,200,90,0.45)'
      ctx.lineWidth = Math.max(1, px / 45)
      ctx.beginPath()
      for (let i = 0; i < 9; i++) {
        const gx = x + hash(c, r, 20 + i) * px
        const gy = y + hash(c, r, 40 + i) * px
        ctx.moveTo(gx, gy); ctx.lineTo(gx + px * 0.04, gy - px * 0.1)
        ctx.moveTo(gx, gy); ctx.lineTo(gx - px * 0.04, gy - px * 0.08)
      }
      ctx.stroke()
      break
    }
    case 'rubble': {
      for (let i = 0; i < 6; i++) {
        const rx = x + (0.12 + hash(c, r, 60 + i) * 0.76) * px
        const ry = y + (0.12 + hash(c, r, 80 + i) * 0.76) * px
        const rad = px * (0.05 + hash(c, r, 100 + i) * 0.08)
        ctx.fillStyle = shade('#9a958a', (hash(c, r, 120 + i) - 0.5) * 0.2)
        ctx.beginPath(); ctx.arc(rx, ry, rad, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1, px / 60); ctx.stroke()
      }
      break
    }
    case 'water': {
      ctx.strokeStyle = 'rgba(200,230,255,0.25)'
      ctx.lineWidth = Math.max(1, px / 40)
      ctx.beginPath()
      for (let i = 0; i < 3; i++) {
        const wy = y + (0.2 + i * 0.3 + (hash(c, r, 140 + i) - 0.5) * 0.1) * px
        const wx = x + hash(c, r, 160 + i) * px * 0.4
        ctx.moveTo(wx, wy)
        ctx.quadraticCurveTo(wx + px * 0.15, wy - px * 0.06, wx + px * 0.3, wy)
        ctx.quadraticCurveTo(wx + px * 0.45, wy + px * 0.06, wx + px * 0.6, wy)
      }
      ctx.stroke()
      break
    }
    case 'carpet': {
      // Woven border and a faint pattern
      ctx.strokeStyle = 'rgba(214,170,90,0.35)'
      ctx.lineWidth = Math.max(1, px / 30)
      ctx.strokeRect(x + px * 0.12, y + px * 0.12, px * 0.76, px * 0.76)
      ctx.beginPath()
      ctx.moveTo(x + px / 2, y + px * 0.3); ctx.lineTo(x + px * 0.7, y + px / 2)
      ctx.lineTo(x + px / 2, y + px * 0.7); ctx.lineTo(x + px * 0.3, y + px / 2); ctx.closePath()
      ctx.stroke()
      break
    }
    case 'sand': {
      ctx.strokeStyle = 'rgba(140,105,50,0.3)'
      ctx.lineWidth = Math.max(1, px / 45)
      ctx.beginPath()
      for (let i = 0; i < 2; i++) {
        const sy = y + (0.3 + i * 0.4 + (hash(c, r, 170 + i) - 0.5) * 0.15) * px
        ctx.moveTo(x, sy)
        ctx.bezierCurveTo(x + px * 0.33, sy - px * 0.08, x + px * 0.66, sy + px * 0.08, x + px, sy)
      }
      ctx.stroke()
      speckle(ctx, c, r, x, y, px, 'rgba(120,90,40,0.25)', 8)
      break
    }
    case 'snow':
      speckle(ctx, c, r, x, y, px, 'rgba(150,170,190,0.35)', 7)
      speckle(ctx, c, r + 777, x, y, px, 'rgba(255,255,255,0.9)', 6)
      break
    case 'ice': {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = Math.max(1, px / 50)
      ctx.beginPath()
      for (let i = 0; i < 3; i++) {
        const ix = x + hash(c, r, 180 + i) * px
        const iy = y + hash(c, r, 190 + i) * px
        ctx.moveTo(ix, iy)
        ctx.lineTo(ix + (hash(c, r, 200 + i) - 0.5) * px * 0.6, iy + (hash(c, r, 210 + i) - 0.5) * px * 0.6)
      }
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fillRect(x, y, px, px * 0.35)
      break
    }
    case 'swamp': {
      // Murky pools with reeds
      for (let i = 0; i < 2; i++) {
        const sx = x + (0.25 + hash(c, r, 220 + i) * 0.5) * px
        const sy = y + (0.25 + hash(c, r, 230 + i) * 0.5) * px
        ctx.fillStyle = 'rgba(40,60,45,0.75)'
        ctx.beginPath(); ctx.ellipse(sx, sy, px * 0.22, px * 0.13, 0, 0, Math.PI * 2); ctx.fill()
      }
      ctx.strokeStyle = 'rgba(150,160,80,0.6)'
      ctx.lineWidth = Math.max(1, px / 45)
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const rx = x + hash(c, r, 240 + i) * px
        const ry = y + hash(c, r, 250 + i) * px
        ctx.moveTo(rx, ry); ctx.lineTo(rx + px * 0.02, ry - px * 0.16)
      }
      ctx.stroke()
      break
    }
    case 'deepwater': {
      const g = ctx.createRadialGradient(x + px / 2, y + px / 2, 0, x + px / 2, y + px / 2, px * 0.7)
      g.addColorStop(0, 'rgba(5,20,35,0.45)')
      g.addColorStop(1, 'rgba(5,20,35,0)')
      ctx.fillStyle = g
      ctx.fillRect(x, y, px, px)
      ctx.strokeStyle = 'rgba(160,200,230,0.18)'
      ctx.lineWidth = Math.max(1, px / 40)
      ctx.beginPath()
      const wy = y + (0.4 + (hash(c, r, 260) - 0.5) * 0.3) * px
      ctx.moveTo(x + px * 0.2, wy); ctx.quadraticCurveTo(x + px * 0.5, wy - px * 0.08, x + px * 0.8, wy)
      ctx.stroke()
      break
    }
    case 'fire': {
      // Charred ground with flames
      speckle(ctx, c, r, x, y, px, 'rgba(0,0,0,0.4)', 8)
      for (let i = 0; i < 3; i++) {
        const fx = x + (0.2 + hash(c, r, 270 + i) * 0.6) * px
        const fy = y + (0.45 + hash(c, r, 280 + i) * 0.4) * px
        const h = px * (0.3 + hash(c, r, 290 + i) * 0.2)
        flame(ctx, fx, fy, h * 0.45, h, 'rgba(230,80,20,0.9)')
        flame(ctx, fx, fy, h * 0.25, h * 0.6, 'rgba(255,200,60,0.95)')
      }
      break
    }
    case 'magma': {
      // Dark crust cracked over glowing rock
      const g = ctx.createRadialGradient(x + px / 2, y + px / 2, px * 0.1, x + px / 2, y + px / 2, px * 0.75)
      g.addColorStop(0, 'rgba(255,120,20,0.85)')
      g.addColorStop(1, 'rgba(160,30,10,0.6)')
      ctx.fillStyle = g
      ctx.fillRect(x, y, px, px)
      ctx.fillStyle = 'rgba(35,18,14,0.92)'
      for (let i = 0; i < 4; i++) {
        const cx = x + (i % 2 ? 0.7 : 0.28) * px + (hash(c, r, 300 + i) - 0.5) * px * 0.12
        const cy = y + (i < 2 ? 0.28 : 0.72) * px + (hash(c, r, 310 + i) - 0.5) * px * 0.12
        ctx.beginPath(); ctx.ellipse(cx, cy, px * 0.2, px * 0.17, hash(c, r, 320 + i) * Math.PI, 0, Math.PI * 2); ctx.fill()
      }
      break
    }
    case 'wall': {
      // Brick courses with a lighter top edge
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'
      ctx.lineWidth = Math.max(1, px / 35)
      ctx.beginPath()
      for (let i = 1; i < 3; i++) { ctx.moveTo(x, y + (px * i) / 3); ctx.lineTo(x + px, y + (px * i) / 3) }
      for (let i = 0; i < 3; i++) {
        const bx = x + (i % 2 ? px / 2 : px / 4)
        ctx.moveTo(bx, y + (px * i) / 3); ctx.lineTo(bx, y + (px * (i + 1)) / 3)
      }
      ctx.stroke()
      speckle(ctx, c, r, x, y, px, 'rgba(255,255,255,0.05)', 6)
      break
    }
    case 'door': {
      const horizontal = doorIsHorizontal(map, c, r)
      const t = px * 0.28
      ctx.fillStyle = '#6b4423'
      ctx.strokeStyle = '#2a1708'
      ctx.lineWidth = Math.max(1, px / 30)
      if (horizontal) {
        ctx.fillRect(x, y + (px - t) / 2, px, t); ctx.strokeRect(x, y + (px - t) / 2, px, t)
        ctx.beginPath(); ctx.moveTo(x + px / 2, y + (px - t) / 2); ctx.lineTo(x + px / 2, y + (px + t) / 2); ctx.stroke()
      } else {
        ctx.fillRect(x + (px - t) / 2, y, t, px); ctx.strokeRect(x + (px - t) / 2, y, t, px)
        ctx.beginPath(); ctx.moveTo(x + (px - t) / 2, y + px / 2); ctx.lineTo(x + (px + t) / 2, y + px / 2); ctx.stroke()
      }
      break
    }
    case 'void':
      break
  }
}

function flame(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x - w / 2, base)
  ctx.quadraticCurveTo(x - w / 2, base - h * 0.55, x, base - h)
  ctx.quadraticCurveTo(x + w / 2, base - h * 0.55, x + w / 2, base)
  ctx.closePath()
  ctx.fill()
}

function speckle(ctx: CanvasRenderingContext2D, c: number, r: number, x: number, y: number, px: number, color: string, n: number) {
  ctx.fillStyle = color
  const s = Math.max(1, px / 25)
  for (let i = 0; i < n; i++) ctx.fillRect(x + hash(c, r, 200 + i) * px, y + hash(c, r, 300 + i) * px, s, s)
}

/** A soft shadow on open cells along their solid neighbours, so walls stand up. */
function drawWallShadows(ctx: CanvasRenderingContext2D, map: BattleMap, px: number) {
  const w = px * 0.18
  const solid = (c: number, r: number) => tileByChar(getTile(map, c, r)).solid
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      if (solid(c, r)) continue
      const x = c * px
      const y = r * px
      const sides: [boolean, number, number, number, number, number, number, number, number][] = [
        [solid(c, r - 1), x, y, px, w, x, y, x, y + w],
        [solid(c, r + 1), x, y + px - w, px, w, x, y + px, x, y + px - w],
        [solid(c - 1, r), x, y, w, px, x, y, x + w, y],
        [solid(c + 1, r), x + px - w, y, w, px, x + px, y, x + px - w, y],
      ]
      for (const [on, rx, ry, rw, rh, gx0, gy0, gx1, gy1] of sides) {
        if (!on) continue
        const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1)
        g.addColorStop(0, 'rgba(0,0,0,0.4)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.fillRect(rx, ry, rw, rh)
      }
    }
  }
}

/** One prop at its place, rotation and flip (skipped while its image isn't loaded). */
export function drawProp(ctx: CanvasRenderingContext2D, p: MapProp, px: number, images?: Map<string, CanvasImageSource>) {
  const img = images?.get(p.image)
  if (!img) return
  ctx.save()
  ctx.translate(p.x * px, p.y * px)
  ctx.rotate((p.rotation * Math.PI) / 180)
  if (p.flip) ctx.scale(-1, 1)
  ctx.drawImage(img, (-p.w / 2) * px, (-p.h / 2) * px, p.w * px, p.h * px)
  ctx.restore()
}

/** The map as a PNG, `px` pixels per cell. */
export function battleMapPng(map: BattleMap, px: number, images?: Map<string, CanvasImageSource>): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = map.cols * px
  canvas.height = map.rows * px
  drawBattleMap(canvas.getContext('2d')!, map, px, { images })
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The map image could not be made'))), 'image/png'))
}
