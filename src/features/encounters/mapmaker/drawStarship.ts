/** Starship tiles for the map maker's drawing (draw.ts): deck plates, grating, hazard stripes, hull, airlock, viewport, force field. */
import { doorIsHorizontal, type BattleMap, type TileDef } from '@/domain/rules/battlemap'

/** Draws a starship tile's texture on its square; false for any other tile. */
export function drawStarshipTile(ctx: CanvasRenderingContext2D, map: BattleMap, tile: TileDef, c: number, r: number, x: number, y: number, px: number): boolean {
  switch (tile.id) {
    case 'steel':
      plates(ctx, x, y, px)
      return true
    case 'grating': {
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'
      ctx.lineWidth = Math.max(1, px / 30)
      ctx.beginPath()
      for (let i = 1; i < 6; i++) { ctx.moveTo(x + (px * i) / 6, y); ctx.lineTo(x + (px * i) / 6, y + px); ctx.moveTo(x, y + (px * i) / 6); ctx.lineTo(x + px, y + (px * i) / 6) }
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.strokeRect(x + 0.5, y + 0.5, px - 1, px - 1)
      return true
    }
    case 'hazard': {
      ctx.save()
      ctx.beginPath(); ctx.rect(x, y, px, px); ctx.clip()
      ctx.fillStyle = '#c9a227'
      for (let i = -1; i < 4; i++) {
        const o = x + i * (px / 2)
        ctx.beginPath(); ctx.moveTo(o, y + px); ctx.lineTo(o + px / 4, y + px); ctx.lineTo(o + px / 4 + px, y); ctx.lineTo(o + px, y); ctx.closePath(); ctx.fill()
      }
      ctx.restore()
      return true
    }
    case 'hull': {
      // Panels with a lit seam and bolts
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.lineWidth = Math.max(1, px / 30)
      ctx.strokeRect(x + px * 0.08, y + px * 0.08, px * 0.84, px * 0.84)
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      for (const [bx, by] of [[0.16, 0.16], [0.84, 0.16], [0.16, 0.84], [0.84, 0.84]]) { ctx.beginPath(); ctx.arc(x + px * bx!, y + px * by!, Math.max(1, px / 24), 0, Math.PI * 2); ctx.fill() }
      return true
    }
    case 'airlock': {
      const horizontal = doorIsHorizontal(map, c, r), t = px * 0.3
      ctx.fillStyle = '#3d444c'
      if (horizontal) ctx.fillRect(x, y + px / 2 - t / 2, px, t); else ctx.fillRect(x + px / 2 - t / 2, y, t, px)
      ctx.fillStyle = '#c9a227'
      if (horizontal) { ctx.fillRect(x, y + px / 2 - t / 2, px * 0.12, t); ctx.fillRect(x + px * 0.88, y + px / 2 - t / 2, px * 0.12, t) } else { ctx.fillRect(x + px / 2 - t / 2, y, t, px * 0.12); ctx.fillRect(x + px / 2 - t / 2, y + px * 0.88, t, px * 0.12) }
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = Math.max(1, px / 35)
      ctx.beginPath()
      if (horizontal) { ctx.moveTo(x + px / 2, y + px / 2 - t / 2); ctx.lineTo(x + px / 2, y + px / 2 + t / 2) } else { ctx.moveTo(x + px / 2 - t / 2, y + px / 2); ctx.lineTo(x + px / 2 + t / 2, y + px / 2) }
      ctx.stroke()
      return true
    }
    case 'viewport':
    case 'forcefield': {
      const horizontal = doorIsHorizontal(map, c, r), t = px * 0.22
      ctx.fillStyle = tile.id === 'viewport' ? 'rgba(150,200,230,0.85)' : 'rgba(90,200,255,0.45)'
      if (horizontal) ctx.fillRect(x, y + px / 2 - t / 2, px, t); else ctx.fillRect(x + px / 2 - t / 2, y, t, px)
      ctx.strokeStyle = tile.id === 'viewport' ? '#262b31' : 'rgba(160,230,255,0.95)'
      ctx.lineWidth = Math.max(1, px / 30)
      if (horizontal) ctx.strokeRect(x, y + px / 2 - t / 2, px, t); else ctx.strokeRect(x + px / 2 - t / 2, y, t, px)
      return true
    }
    default:
      return false
  }
}

/** Deck plates: four panels with seams and a few rivets. */
export function plates(ctx: CanvasRenderingContext2D, x: number, y: number, px: number) {
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = Math.max(1, px / 40)
  ctx.beginPath()
  ctx.moveTo(x + px / 2, y); ctx.lineTo(x + px / 2, y + px)
  ctx.moveTo(x, y + px / 2); ctx.lineTo(x + px, y + px / 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  const s = Math.max(1, px / 28)
  for (const [bx, by] of [[0.1, 0.1], [0.6, 0.1], [0.1, 0.6], [0.6, 0.6]]) ctx.fillRect(x + px * bx!, y + px * by!, s, s)
}
