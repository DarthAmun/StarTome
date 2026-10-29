/**
 * Encounter difficulty (FEATURES_PLAN.md §4): XP per creature or hazard, the
 * threat an XP total reaches for a party, and the level warnings. Pure; the
 * builder page and the encounter meter feed it.
 */
import { creatureXp, encounterBudget, simpleHazardXp, type ThreatLevel } from '~/rules/registry'
import type { Adjustment } from '~/rules/combat'
import type { GameId } from '~/types/game'

export const THREATS: ThreatLevel[] = ['trivial', 'low', 'moderate', 'severe', 'extreme']

export type ThreatRating = ThreatLevel | 'beyond'

export const THREAT_LABEL: Record<ThreatRating, string> = {
  trivial: 'Trivial', low: 'Low', moderate: 'Moderate', severe: 'Severe', extreme: 'Extreme', beyond: 'Beyond extreme',
}

/** Party size used when the party tab has no members yet. */
export const DEFAULT_PARTY_SIZE = 4

/** How far above the lowest party member a creature may be before it gets a warning. */
export const MAX_LEVEL_ABOVE = 4

export interface XpEntry {
  level: number
  kind: 'creature' | 'hazard'
  /** Hazards only: complex hazards count like creatures, simple ones at ⅕. */
  complex?: boolean
  adjustment?: Adjustment | null
}

/**
 * The level an entry counts as for XP. GM Core counts elite as one level higher
 * and weak as one lower; unlike the stat-block level (combat.ts adjustedLevel)
 * this never jumps two steps across level 0.
 */
export function xpLevel(level: number, adj: Adjustment | null | undefined): number {
  if (adj === 'elite') return level + 1
  if (adj === 'weak') return level - 1
  return level
}

/** XP one entry is worth against a party of the given level. */
export function entryXp(game: GameId, e: XpEntry, partyLevel: number): number {
  const level = xpLevel(e.level, e.adjustment)
  if (e.kind === 'hazard' && !e.complex) return simpleHazardXp(game, level, partyLevel)
  return creatureXp(game, level, partyLevel)
}

/** True when the entry is more than four levels above the lowest party member. */
export function tooStrong(e: XpEntry, lowestLevel: number | null): boolean {
  return lowestLevel !== null && xpLevel(e.level, e.adjustment) > lowestLevel + MAX_LEVEL_ABOVE
}

export interface EncounterRating {
  xp: number
  /** The highest threat whose budget the XP reaches; trivial below that, `beyond` above extreme. */
  threat: ThreatRating
  budgets: Record<ThreatLevel, number>
}

export function threatBudgets(game: GameId, partySize: number): Record<ThreatLevel, number> {
  const size = partySize > 0 ? partySize : DEFAULT_PARTY_SIZE
  return Object.fromEntries(THREATS.map(t => [t, encounterBudget(game, t, size)])) as Record<ThreatLevel, number>
}

export function rateEncounter(game: GameId, xp: number, partySize: number): EncounterRating {
  const budgets = threatBudgets(game, partySize)
  let threat: ThreatRating = 'trivial'
  for (const t of THREATS) if (xp >= budgets[t]) threat = t
  if (xp > budgets.extreme) threat = 'beyond'
  return { xp, threat, budgets }
}

// ── Tokens on an encounter ─────────────────────────────────────────────────

export interface MeterToken {
  linkedRulesId: string | null
  linkedEntityId: number | null
  adjustment: Adjustment | null
  isPlayerToken: boolean
  isAlly: boolean
}

export interface TokenSides<T> {
  /** Linked to a compendium creature or hazard and fighting the party. */
  enemies: T[]
  /** Not on the party's side, but without a stat block, so they add no XP. */
  unlinked: T[]
}

/**
 * Splits an encounter's tokens. Party tokens (player tokens, or tokens of a
 * party member's NPC entry) and allies are left out of both lists.
 */
export function tokenSides<T extends MeterToken>(tokens: T[], partyNpcIds: Set<number>): TokenSides<T> {
  const enemies: T[] = []
  const unlinked: T[] = []
  for (const t of tokens) {
    if (t.isPlayerToken || t.isAlly) continue
    if (t.linkedEntityId !== null && partyNpcIds.has(t.linkedEntityId)) continue
    if (t.linkedRulesId) enemies.push(t)
    else unlinked.push(t)
  }
  return { enemies, unlinked }
}
