/**
 * Starship rules (STARFINDER_PLAN.md P3): a frame's statistics at a level, a
 * battle station's grade at a level, helmed bonuses and the standard starship
 * immunities. Pure. The numbers themselves live in the frame and station
 * entries (imported from the book as homebrew); this module only reads them.
 *
 * Rules: Starfinder Tech Core "Tactical Starship Rules" pp. 166–177 and
 * "Creating Starships" pp. 196–199.
 */
import type { BattleStation, StarshipFrame, StationAction, StationAdvancement } from '@/domain/rules/types'

/** Tech Core p. 172: most starships are objects immune to these; never doomed or unconscious. */
export const STARSHIP_IMMUNITIES = [
  'bleed', 'death effects', 'disease', 'drained', 'fatigued', 'paralyzed', 'poison', 'sickened', 'spirit', 'vitality', 'void',
  'doomed', 'unconscious',
]

/** "starship immunities" in a stat block → the list; other entries stay as they are. */
export function expandStarshipImmunities(list: string[]): string[] {
  const out: string[] = []
  for (const i of list) {
    if (/^starship immunities$/i.test(i.trim())) out.push(...STARSHIP_IMMUNITIES)
    else out.push(i)
  }
  return [...new Set(out)]
}

export const STATION_GRADES = ['commercial', 'tactical', 'advanced', 'superior', 'elite', 'ultimate', 'paragon'] as const

function gradeRank(grade: string | undefined): number {
  const i = STATION_GRADES.indexOf((grade ?? 'commercial').toLowerCase() as typeof STATION_GRADES[number])
  return i < 0 ? 0 : i
}

/** The frame's row for a starship level (clamped to the rows it has). */
export function frameStatsAt(frame: Pick<StarshipFrame, 'stats'>, level: number): StarshipFrame['stats'][number] | null {
  if (!frame.stats.length) return null
  const rows = [...frame.stats].sort((a, b) => a.level - b.level)
  return [...rows].reverse().find(r => r.level <= level) ?? rows[0] ?? null
}

/** The station's advancement row at a starship level: the highest grade reached. */
export function stationGradeAt(station: Pick<BattleStation, 'advancement'>, level: number): StationAdvancement | null {
  const rows = [...station.advancement].sort((a, b) => a.level - b.level)
  return [...rows].reverse().find(r => r.level <= level) ?? null
}

/** Station actions available at a grade (everything granted at that grade or below). */
export function stationActionsAt(station: Pick<BattleStation, 'actions'>, grade: string | null | undefined): StationAction[] {
  const rank = gradeRank(grade ?? 'commercial')
  return station.actions.filter(a => gradeRank(a.grade) <= rank)
}

export interface HelmedBonuses { ac: number; fort: number; ref: number; will: number }

/** Item bonuses from the stations being helmed: the highest bonus of each kind applies (item bonuses don't stack). */
export function helmedBonuses(rows: (StationAdvancement | null)[]): HelmedBonuses {
  const out: HelmedBonuses = { ac: 0, fort: 0, ref: 0, will: 0 }
  for (const r of rows) {
    for (const k of ['ac', 'fort', 'ref', 'will'] as const) out[k] = Math.max(out[k], r?.helmed?.[k] ?? 0)
  }
  return out
}

/** Sensor range: the frame's plus every installed station's increase (scanners). */
export function sensorRangeOf(frame: Pick<StarshipFrame, 'sensorRange'>, rows: (StationAdvancement | null)[]): number {
  return frame.sensorRange + rows.reduce((n, r) => n + (r?.sensors ?? 0), 0)
}

/** "3 zones", "3-zone", "3" → 3; null otherwise. */
export function parseZones(text: string | number | null | undefined): number | null {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null
  const m = (text ?? '').match(/(-?\d+)\s*(?:-?\s*zones?)?/i)
  return m ? Number(m[1]) : null
}
