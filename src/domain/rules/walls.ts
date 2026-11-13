/**
 * Walls on an encounter map and what they do to sight: a wall is a run of
 * points in grid units; windows and open doors let sight through. The
 * visibility polygon is what a token at a point can see.
 */
export const WALL_KINDS = ['full', 'greater', 'standard', 'lesser', 'window', 'door', 'secret'] as const
export type WallKind = (typeof WALL_KINDS)[number]

export const WALL_LABEL: Record<WallKind, string> = {
  full: 'Wall', greater: 'Greater cover', standard: 'Standard cover', lesser: 'Lesser cover', window: 'Window', door: 'Door', secret: 'Hidden door',
}

export interface Point { x: number; y: number }
export interface Wall { id: string; points: Point[]; kind: WallKind; open: boolean; generated: boolean }
export interface WallSegment { x1: number; y1: number; x2: number; y2: number; blocking: boolean }

/** Doors and hidden doors open and close; everything else stays shut. */
export function isDoorWall(kind: string): boolean {
  return kind === 'door' || kind === 'secret'
}

export function wallsToSegments(walls: Wall[]): WallSegment[] {
  const out: WallSegment[] = []
  for (const w of walls) {
    const open = (isDoorWall(w.kind) && w.open) || w.kind === 'window'
    for (let i = 0; i < w.points.length - 1; i++) {
      const a = w.points[i]!, b = w.points[i + 1]!
      out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, blocking: !open })
    }
  }
  return out
}

/** Distance along the ray to the segment, or null when they do not meet. */
function rayHit(rx: number, ry: number, rdx: number, rdy: number, s: WallSegment): number | null {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1
  const denom = rdx * dy - rdy * dx
  if (Math.abs(denom) < 1e-10) return null
  const t = ((s.x1 - rx) * dy - (s.y1 - ry) * dx) / denom
  const u = ((s.x1 - rx) * rdy - (s.y1 - ry) * rdx) / denom
  return t >= 0 && u >= 0 && u <= 1 ? t : null
}

/**
 * What can be seen from `origin` (grid units): the polygon's corners in order
 * of angle. `maxRange` in squares; without one, sight ends at the map's edge.
 */
export function visibilityPolygon(origin: Point, segments: WallSegment[], maxRange = Infinity, mapSize?: { w: number; h: number }): Point[] {
  const byMap = maxRange === Infinity && mapSize != null
  const range = byMap ? Math.max(mapSize.w, mapSize.h) : maxRange === Infinity ? 10000 : maxRange
  const near = segments.filter(s => s.blocking
    && !(Math.max(s.x1, s.x2) < origin.x - range || Math.min(s.x1, s.x2) > origin.x + range
      || Math.max(s.y1, s.y2) < origin.y - range || Math.min(s.y1, s.y2) > origin.y + range))
  const [l, t, r, b] = byMap ? [0, 0, mapSize.w, mapSize.h] : [origin.x - range, origin.y - range, origin.x + range, origin.y + range]
  const all: WallSegment[] = [...near,
    { x1: l, y1: t, x2: r, y2: t, blocking: true }, { x1: r, y1: t, x2: r, y2: b, blocking: true },
    { x1: r, y1: b, x2: l, y2: b, blocking: true }, { x1: l, y1: b, x2: l, y2: t, blocking: true }]
  // Three rays per corner (at it and just past either side), plus the four axes for open ground
  const EPS = 0.0001
  const angles: number[] = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
  for (const s of all) {
    for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]] as const) {
      const a = Math.atan2(y - origin.y, x - origin.x)
      angles.push(a - EPS, a, a + EPS)
    }
  }
  const hits: { angle: number; point: Point }[] = []
  for (const angle of angles) {
    const dx = Math.cos(angle), dy = Math.sin(angle)
    let min = Infinity
    for (const s of all) {
      const d = rayHit(origin.x, origin.y, dx, dy, s)
      if (d !== null && d < min) min = d
    }
    if (min < Infinity) hits.push({ angle, point: { x: origin.x + dx * min, y: origin.y + dy * min } })
  }
  return hits.sort((a, z) => a.angle - z.angle).map(h => h.point)
}

/** Distance from a point to a segment, for picking a wall under the pointer. */
export function distanceToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = dx * dx + dy * dy
  if (len === 0) return Math.hypot(px - a.x, py - a.y)
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

/** The wall nearest the point within `threshold` (grid units), or null. */
export function wallAt(walls: Wall[], x: number, y: number, threshold: number): Wall | null {
  for (const w of walls) {
    for (let i = 0; i < w.points.length - 1; i++) if (distanceToSegment(x, y, w.points[i]!, w.points[i + 1]!) <= threshold) return w
  }
  return null
}
