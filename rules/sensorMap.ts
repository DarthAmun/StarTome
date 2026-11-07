/**
 * The sensor map (STARFINDER_PLAN.md P6; Tech Core pp. 170–171): a row of
 * zones. Starships and hazards stand in zones (any number per zone) and face
 * left (−1) or right (+1). Distance is counted in zones. Pure.
 *
 * - Range r: the target's zone is at most r zones away (0 = same zone).
 * - Off-guard: attacks from the opposite direction of the target's heading;
 *   starships in the same zone always count as in front.
 * - Cone n: the origin zone and n zones in one direction; never the origin starship.
 * - Emanation n: the origin zone and n zones to either side.
 * - Line n: like a cone, but only one target per zone (the attacker picks).
 * - Burst n: starts on the line between two zones and spreads n zones both
 *   ways; a 0-zone burst is one zone. Its border must be within the range.
 */

export type Heading = 1 | -1
export type ZoneAreaKind = 'cone' | 'emanation' | 'line' | 'burst'
export type SensorRole = 'player-ship' | 'ship' | 'hazard'

export const DEFAULT_ZONES = 12

export interface SensorMap {
  /** Number of zones in the row. */
  zones: number
}

export interface ZoneToken { id: number; zone: number; heading: Heading }

export function zoneDistance(a: number, b: number): number {
  return Math.abs(a - b)
}

export function inRange(from: number, to: number, range: number): boolean {
  return zoneDistance(from, to) <= range
}

/** Whether an attack from `attackerZone` comes from behind the target (off-guard). */
export function fromBehind(target: ZoneToken, attackerZone: number): boolean {
  if (attackerZone === target.zone) return false
  return Math.sign(attackerZone - target.zone) === -target.heading
}

export function clampZone(zone: number, zones: number): number {
  return Math.max(0, Math.min(zones - 1, Math.round(zone)))
}

export interface ZoneArea {
  kind: ZoneAreaKind
  /** The zone it starts from (the attacker's). */
  origin: number
  /** Cone / line direction. */
  direction?: Heading
  /** Value of the area in zones. */
  size: number
  /** Burst: index of the border, between zone `border − 1` and zone `border`. A 0-zone burst uses `zone` instead. */
  border?: number
  zone?: number
}

/** The zones an area covers, in order, clamped to the map. */
export function areaZones(area: ZoneArea, zones: number): number[] {
  const out: number[] = []
  const add = (z: number) => { if (z >= 0 && z < zones && !out.includes(z)) out.push(z) }
  const n = Math.max(0, Math.floor(area.size))
  const dir = area.direction ?? 1
  if (area.kind === 'cone' || area.kind === 'line') {
    for (let i = 0; i <= n; i++) add(area.origin + i * dir)
  } else if (area.kind === 'emanation') {
    for (let z = area.origin - n; z <= area.origin + n; z++) add(z)
  } else if (n === 0) {
    add(area.zone ?? area.origin)
  } else {
    const b = area.border ?? area.origin
    for (let z = b - n; z <= b + n - 1; z++) add(z)
  }
  return out.sort((a, b) => a - b)
}

/** Whether a burst's border (or a 0-zone burst's zone) is within `range` zones of the origin. */
export function burstInRange(area: ZoneArea, range: number): boolean {
  if (area.kind !== 'burst') return true
  if (Math.floor(area.size) === 0) return inRange(area.origin, area.zone ?? area.origin, range)
  const b = area.border ?? area.origin
  return Math.min(zoneDistance(area.origin, b - 1), zoneDistance(area.origin, b)) <= range
}

/** Tokens in an area; a cone never hits the starship it comes from. */
export function tokensInZones<T extends ZoneToken>(area: ZoneArea, zonesCovered: number[], tokens: T[], sourceId: number | null): T[] {
  const set = new Set(zonesCovered)
  return tokens.filter(t => set.has(t.zone) && !((area.kind === 'cone' || area.kind === 'line') && t.id === sourceId))
}

/** "3-zone cone", "1-zone burst", "6-zone line", "2-zone emanation" in an ability's text → kind and size. */
export function parseZoneArea(text: string): { kind: ZoneAreaKind; size: number } | null {
  const m = (text ?? '').toLowerCase().match(/(\d+)[-\s]*zones?\s+(cone|burst|line|emanation)/)
  return m ? { kind: m[2] as ZoneAreaKind, size: Number(m[1]) } : null
}
