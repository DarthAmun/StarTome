/**
 * Areas on the grid (COMBAT_PLAN.md §5): which squares a burst, emanation,
 * cone or line covers, and which tokens stand in it. Pure; the canvas draws
 * the squares and the save prompt uses the tokens.
 *
 * Rules (Player Core "Areas", same in SF2e): a burst spreads from a grid
 * intersection; an emanation from every side of a creature's space (and
 * includes that space); a cone is a quarter circle from the creature's
 * edge or corner; a line is 5 feet wide. Distances count diagonals 5/10/5
 * like movement. A square is in the area when its center is: the centers
 * of a 10-foot burst give the 12-square shape of the book's diagram.
 */

export type AreaKind = 'burst' | 'emanation' | 'cone' | 'line'

export const AREA_KINDS: AreaKind[] = ['burst', 'emanation', 'cone', 'line']
export const FEET_PER_SQUARE = 5

export interface AreaShape {
  kind: AreaKind
  /** Grid coordinates (fractional): a burst's intersection, a cone's or line's starting point. */
  originX: number
  originY: number
  sizeFt: number
  /** Degrees, 0 = east, 90 = south (screen): a cone's or line's direction. */
  angle?: number
  /** An emanation's creature; it follows the token. */
  attachedTokenId?: number | null
}

export interface AreaToken { id: number; gridX: number; gridY: number; size: number }

const EPS = 1e-6

/** Squares between two points on the grid, diagonals 5/10/5: the longer leg plus half the shorter. */
export function gridSteps(dx: number, dy: number): number {
  const a = Math.abs(dx), b = Math.abs(dy)
  return Math.max(a, b) + Math.floor(Math.min(a, b) / 2)
}

/** Squares from a point to a square's center along one axis: half a square counts as one. */
function axisSteps(from: number, center: number): number {
  return Math.ceil(Math.abs(center - from) - EPS)
}

const key = (c: number, r: number) => `${c},${r}`

/** The squares the area covers, as "col,row" keys. */
export function cellsInArea(area: AreaShape, tokens: AreaToken[] = []): Set<string> {
  const size = Math.max(0, Math.floor(area.sizeFt / FEET_PER_SQUARE))
  const out = new Set<string>()
  if (area.kind === 'emanation') {
    const t = area.attachedTokenId != null ? tokens.find(x => x.id === area.attachedTokenId) : undefined
    const x0 = t ? t.gridX : Math.floor(area.originX)
    const y0 = t ? t.gridY : Math.floor(area.originY)
    const s = t ? Math.max(1, t.size) : 1
    for (let c = x0 - size; c < x0 + s + size; c++) {
      for (let r = y0 - size; r < y0 + s + size; r++) {
        const dx = c < x0 ? x0 - c : c >= x0 + s ? c - (x0 + s) + 1 : 0
        const dy = r < y0 ? y0 - r : r >= y0 + s ? r - (y0 + s) + 1 : 0
        if (gridSteps(dx, dy) <= size) out.add(key(c, r))
      }
    }
    return out
  }
  if (area.kind === 'line') {
    const rad = ((area.angle ?? 0) * Math.PI) / 180
    const len = size
    // Every square the 5-foot-wide line's center passes through
    for (let d = 0.01; d <= len; d += 0.05) {
      out.add(key(Math.floor(area.originX + Math.cos(rad) * d), Math.floor(area.originY + Math.sin(rad) * d)))
    }
    return out
  }
  const ox = area.originX, oy = area.originY
  const dir = ((area.angle ?? 0) * Math.PI) / 180
  for (let c = Math.floor(ox) - size - 1; c <= Math.ceil(ox) + size; c++) {
    for (let r = Math.floor(oy) - size - 1; r <= Math.ceil(oy) + size; r++) {
      const cx = c + 0.5, cy = r + 0.5
      if (gridSteps(axisSteps(ox, cx), axisSteps(oy, cy)) > size) continue
      if (area.kind === 'cone') {
        const a = Math.atan2(cy - oy, cx - ox)
        let diff = Math.abs(a - dir) % (2 * Math.PI)
        if (diff > Math.PI) diff = 2 * Math.PI - diff
        if (diff > Math.PI / 4 + EPS) continue
      }
      out.add(key(c, r))
    }
  }
  return out
}

/** Tokens with at least one of their squares in the area. */
export function tokensInArea<T extends AreaToken>(cells: Set<string>, tokens: T[]): T[] {
  return tokens.filter(t => {
    const s = Math.max(1, t.size)
    for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) if (cells.has(key(t.gridX + dx, t.gridY + dy))) return true
    return false
  })
}

/** Whether a token's space touches the area (for "enters" triggers after a move). */
export function tokenInCells(cells: Set<string>, t: AreaToken): boolean {
  return tokensInArea(cells, [t]).length > 0
}

/** "20-foot burst", "30-foot cone", "60-foot line", "10-foot emanation" → kind and size; null otherwise. */
export function parseAreaText(text: string | undefined | null): { kind: AreaKind; sizeFt: number } | null {
  const m = (text ?? '').toLowerCase().match(/(\d+)[-\s]*(?:foot|feet|ft\.?)\s+(burst|emanation|cone|line)/)
  return m ? { kind: m[2] as AreaKind, sizeFt: Number(m[1]) } : null
}

/** Snaps an angle to the nearest 45° (cones are aimed orthogonally or diagonally). */
export function snapAngle45(deg: number): number {
  return ((Math.round(deg / 45) * 45) % 360 + 360) % 360
}

/**
 * Where a cone or line starts when aimed from a token toward a point: the
 * middle of the token's edge (orthogonal) or its corner (diagonal), so the
 * first square touches the creature's space.
 */
export function edgeOrigin(t: AreaToken, angleDeg: number): { x: number; y: number } {
  const s = Math.max(1, t.size)
  const rad = (angleDeg * Math.PI) / 180
  const cx = t.gridX + s / 2, cy = t.gridY + s / 2
  const dx = Math.round(Math.cos(rad)), dy = Math.round(Math.sin(rad))
  return { x: cx + (dx * s) / 2, y: cy + (dy * s) / 2 }
}

export type AreaSave = 'fort' | 'ref' | 'will'
export type AreaTrigger = 'enter' | 'turn-start' | 'turn-end'

/** A condition an area's save gives per degree, e.g. frightened 2 on a critical failure. */
export interface AreaCondition { name: string; value: number | null }

/** What an area does to the creatures in it (COMBAT_PLAN.md §5). */
export interface AreaEffect {
  save: AreaSave
  dc: number
  /** Basic save: damage by degree (0 / ½ / full / ×2). */
  basic: boolean
  /** Rolled once for everyone. */
  damage?: { formula: string; type: string } | null
  onDegree?: Partial<Record<'critical-success' | 'success' | 'failure' | 'critical-failure', AreaCondition[]>>
}

/** An area placed on the encounter map, saved with the encounter. */
export interface AreaOverlay extends AreaShape {
  id: string
  label: string
  /** "#rrggbb". */
  color: string
  /** Shown only to the GM (a trap, a hidden hazard). */
  hidden?: boolean
  effect?: AreaEffect | null
  /** Stays and asks again: when a token enters, or starts or ends its turn inside. */
  lingering?: { trigger: AreaTrigger; untilRound?: number | null } | null
}

export const AREA_SAVE_LABEL: Record<AreaSave, string> = { fort: 'Fortitude', ref: 'Reflex', will: 'Will' }
export const AREA_TRIGGER_LABEL: Record<AreaTrigger, string> = {
  enter: 'enters it', 'turn-start': 'starts its turn in it', 'turn-end': 'ends its turn in it',
}
