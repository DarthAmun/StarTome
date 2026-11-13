/** Drawing one token: ring, portrait or initial, HP arc, condition ring, badges. */
import * as PIXI from 'pixi.js'
import type { Grid, SceneToken } from './types'

const TEMP_HP = 0x4a90d9
/** Degrees → canvas radians (0° = top, clockwise). */
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180

export function hpColorHex(f: number): number {
  return f <= 0.25 ? 0xd04a4a : f <= 0.5 ? 0xc9973a : 0x1a9a80
}

function dashedArc(g: PIXI.Graphics, cx: number, cy: number, r: number, from: number, to: number, color: number, width: number): void {
  const len = Math.abs(((to - from) * Math.PI) / 180) * r
  for (let pos = 0; pos < len; pos += 7) {
    const a0 = rad(from + (pos / len) * (to - from)), a1 = rad(from + (Math.min(len, pos + 3) / len) * (to - from))
    g.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0)).arc(cx, cy, r, a0, a1)
  }
  g.stroke({ color, alpha: 0.7, width, cap: 'round' })
}

function badge(c: PIXI.Container, x: number, y: number, text: string, color: number, fill: number): void {
  const bg = new PIXI.Graphics()
  bg.circle(x, y, 7.5).fill({ color: fill, alpha: 0.92 }).stroke({ color, width: 1, alpha: 0.95 })
  const t = new PIXI.Text({ text, style: { fontSize: 8.5, fill: color, fontFamily: 'system-ui', fontWeight: 'bold', stroke: { color: 0x000000, width: 2 } } })
  t.anchor.set(0.5)
  t.position.set(x, y)
  c.addChild(bg, t)
}

export interface TokenDrawOptions { gm: boolean; active: boolean; /** Pixels a square takes on screen: small tokens drop their nameplate. */ screenCell: number }

export function drawToken(t: SceneToken, grid: Grid, texture: PIXI.Texture | null, opts: TokenDrawOptions): PIXI.Container {
  const size = grid.size * t.size, R = size / 2
  const c = new PIXI.Container()
  c.position.set(grid.offsetX + t.x * grid.size, grid.offsetY + t.y * grid.size)
  c.label = t.id

  const ringColor = t.dead ? 0x8b2030 : !t.visible ? 0x2d2d50 : t.party ? 0x1a8070 : 0xc0392b
  const ring = new PIXI.Graphics()
  ring.circle(R, R, R).fill({ color: ringColor, alpha: 0.3 }).stroke({ color: ringColor, width: t.dead ? 3 : 2, alpha: 0.9 })
  c.addChild(ring)

  if (texture) {
    const sprite = new PIXI.Sprite(texture)
    sprite.scale.set((size - 4) / Math.min(texture.width, texture.height))
    sprite.position.set((size - sprite.width) / 2, (size - sprite.height) / 2)
    const mask = new PIXI.Graphics()
    mask.circle(R, R, R - 2).fill(0xffffff)
    sprite.mask = mask
    if (t.dead) sprite.tint = 0x662222
    if (!t.visible) sprite.alpha = 0.5
    c.addChild(mask, sprite)
  } else {
    const initial = new PIXI.Text({ text: t.name.charAt(0).toUpperCase(), style: { fontSize: size * 0.45, fill: 0xc8c8e8, fontFamily: 'Cinzel, serif', fontWeight: '600' } })
    initial.anchor.set(0.5)
    initial.position.set(R, R)
    c.addChild(initial)
  }

  // Players see how hurt an enemy is as a shade, never as numbers
  const shade = t.dead ? 0 : t.health === 'critical' ? 0.45 : t.health === 'bloodied' ? 0.28 : 0
  if (shade) c.addChild(new PIXI.Graphics().circle(R, R, R - 2).fill({ color: 0x780f19, alpha: shade }))

  if (t.dead) {
    const s = R * 0.3, x = new PIXI.Graphics()
    x.moveTo(R - s, R - s).lineTo(R + s, R + s).moveTo(R + s, R - s).lineTo(R - s, R + s).stroke({ color: 0xe8d5d5, width: 2.5, alpha: 0.85, cap: 'round' })
    c.addChild(x)
  }

  if (!t.dead && t.hp !== null) {
    const f = Math.max(0, Math.min(1, t.hp)), arc = new PIXI.Graphics()
    if (f < 0.999) {
      arc.arc(R, R, R - 4.5, rad(1), rad(359)).stroke({ color: 0x05050f, alpha: 0.55, width: 3 })
      if (f > 0.01) arc.arc(R, R, R - 4.5, rad(1), rad(1 + 358 * f)).stroke({ color: hpColorHex(f), alpha: 0.95, width: 3, cap: 'round' })
    }
    if (t.temp > 0) arc.arc(R, R, R - 8.5, rad(1), rad(1 + 358 * Math.min(1, t.temp))).stroke({ color: TEMP_HP, alpha: 0.95, width: 3, cap: 'round' })
    c.addChild(arc)
  }

  // Conditions: one segment of an outer ring each; GM-only ones dashed
  const n = t.conditions.length
  if (n) {
    const ringR = R + 4, gap = n > 1 ? 10 : 0, seg = 360 / n, width = opts.screenCell < 32 ? 3 : 4.5
    const inset = n > 1 ? (Math.asin(width / 2 / ringR) * 180) / Math.PI : 0
    t.conditions.forEach((cond, i) => {
      const a0 = i * seg + gap / 2 + inset, a1 = (i + 1) * seg - gap / 2 - inset, g = new PIXI.Graphics()
      if (cond.hidden) dashedArc(g, R, R, ringR, a0, a1, cond.color, width)
      else g.arc(R, R, ringR, rad(a0), rad(a1)).stroke({ color: cond.color, alpha: 0.95, width, cap: 'round' })
      c.addChild(g)
    })
  }

  if (opts.screenCell >= 32) {
    const label = new PIXI.Text({ text: t.name, style: { fontSize: 10, fill: 0xc8c8e8, fontFamily: 'system-ui', stroke: { color: 0x000000, width: 3 } } })
    label.anchor.set(0.5, 0)
    label.position.set(R, size + 2)
    c.addChild(label)
  }
  if (opts.gm && !t.visible) badge(c, size - 8, 8, '◌', 0x8888aa, 0x333355)
  if (t.elevation !== null) {
    const up = t.elevation >= 0, color = up ? 0x88ccff : 0xffaa55
    const bg = new PIXI.Graphics()
    bg.roundRect(1, size - 15, 22, 13, 3).fill({ color: 0x0a1a2a, alpha: 0.88 }).stroke({ color, width: 1, alpha: 0.8 })
    const text = new PIXI.Text({ text: `${up ? '↑' : '↓'}${Math.abs(t.elevation)}`, style: { fontSize: 8, fill: color, fontFamily: 'system-ui', fontWeight: 'bold', stroke: { color: 0x000000, width: 2 } } })
    text.anchor.set(0.5)
    text.position.set(12, size - 9)
    c.addChild(bg, text)
  }
  if (t.timers.length) {
    const up = t.timers.some(r => r <= 0)
    badge(c, 8, 8, up ? '✓' : String(Math.min(...t.timers.filter(r => r > 0))), up ? 0xffd24a : 0xd9a066, up ? 0x3a2a05 : 0x1a1208)
  }
  if (opts.active) {
    const g = new PIXI.Graphics()
    g.circle(R, R, R + 10).stroke({ color: 0xffd700, width: 3, alpha: 0.95 }).circle(R, R, R + 15).stroke({ color: 0xffd700, width: 1.5, alpha: 0.3 })
    c.addChild(g)
  }
  return c
}
