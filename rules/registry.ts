/**
 * Game-specific rules tables. Everything that differs between PF2e and SF2e
 * lives here so the entity model stays shared (FORK_PLAN.md §5).
 *
 * `verified: false` marks numbers not yet checked against the published book.
 */
import type { GameId } from '~/types/game'

export interface Denomination { key: 'pp' | 'gp' | 'sp' | 'cp' | 'credits'; label: string; cp: number }

export interface EncounterBudget {
  /** XP budget for a party of four, per threat level. */
  threat: Record<ThreatLevel, number>
  /** Budget change per character above or below four. */
  perCharacter: Record<ThreatLevel, number>
}

export type ThreatLevel = 'trivial' | 'low' | 'moderate' | 'severe' | 'extreme'

export interface GameRules {
  currency: { denominations: Denomination[]; display: 'coins' | 'credits' }
  encounter: EncounterBudget
  /** XP for a creature or complex hazard by (its level − party level), clamped to −4…+4. */
  creatureXp: Record<number, number>
  /** XP for a simple hazard by level difference. */
  simpleHazardXp: Record<number, number>
  xpPerLevel: number
  verified: boolean
}

const PF2E_ENCOUNTER: EncounterBudget = {
  threat: { trivial: 40, low: 60, moderate: 80, severe: 120, extreme: 160 },
  perCharacter: { trivial: 10, low: 20, moderate: 20, severe: 30, extreme: 40 },
}

const CREATURE_XP: Record<number, number> = { [-4]: 10, [-3]: 15, [-2]: 20, [-1]: 30, 0: 40, 1: 60, 2: 80, 3: 120, 4: 160 }
const SIMPLE_HAZARD_XP: Record<number, number> = { [-4]: 2, [-3]: 3, [-2]: 4, [-1]: 6, 0: 8, 1: 12, 2: 16, 3: 24, 4: 32 }

export const GAME_RULES: Record<GameId, GameRules> = {
  pf2e: {
    currency: {
      display: 'coins',
      denominations: [
        { key: 'pp', label: 'pp', cp: 1000 },
        { key: 'gp', label: 'gp', cp: 100 },
        { key: 'sp', label: 'sp', cp: 10 },
        { key: 'cp', label: 'cp', cp: 1 },
      ],
    },
    encounter: PF2E_ENCOUNTER,
    creatureXp: CREATURE_XP,
    simpleHazardXp: SIMPLE_HAZARD_XP,
    xpPerLevel: 1000,
    verified: true,
  },
  sf2e: {
    // Foundry stores SF2e prices in `sp`; one credit is worth one silver piece.
    currency: { display: 'credits', denominations: [{ key: 'credits', label: 'cr', cp: 10 }] },
    encounter: PF2E_ENCOUNTER,
    creatureXp: CREATURE_XP,
    simpleHazardXp: SIMPLE_HAZARD_XP,
    xpPerLevel: 1000,
    verified: false,
  },
}

function clampDiff(diff: number) {
  return Math.max(-4, Math.min(4, Math.round(diff)))
}

/** XP a creature (or complex hazard) is worth against a party of the given level.
 *  Below −4 it is worth nothing; above +4 it is off the table and capped. */
export function creatureXp(game: GameId, creatureLevel: number, partyLevel: number): number {
  const diff = creatureLevel - partyLevel
  if (diff < -4) return 0
  return GAME_RULES[game].creatureXp[clampDiff(diff)]
}

export function simpleHazardXp(game: GameId, hazardLevel: number, partyLevel: number): number {
  const diff = hazardLevel - partyLevel
  if (diff < -4) return 0
  return GAME_RULES[game].simpleHazardXp[clampDiff(diff)]
}

/** Budget for a threat level adjusted for party size. */
export function encounterBudget(game: GameId, threat: ThreatLevel, partySize: number): number {
  const e = GAME_RULES[game].encounter
  return e.threat[threat] + (partySize - 4) * e.perCharacter[threat]
}
