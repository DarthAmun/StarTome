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

/** One row of GM Core's *Party Treasure by Level* (party of four). Values in cp. */
export interface TreasureRow {
  level: number
  total: number
  currency: number
  /** Currency added per character above four (removed per character below). */
  perExtraPc: number
  /** Item level → count of permanent items / consumables in the row. */
  permanent: Record<number, number>
  consumables: Record<number, number>
}

export interface GameRules {
  currency: { denominations: Denomination[]; display: 'coins' | 'credits' }
  encounter: EncounterBudget
  /** XP for a creature or complex hazard by (its level − party level), clamped to −4…+4. */
  creatureXp: Record<number, number>
  /** XP for a simple hazard by level difference. */
  simpleHazardXp: Record<number, number>
  xpPerLevel: number
  /** Party Treasure by Level, index 0 = level 1. */
  treasure: TreasureRow[]
  /** False until the treasure item counts are checked against this game's book. */
  treasureCountsVerified: boolean
  verified: boolean
}

const PF2E_ENCOUNTER: EncounterBudget = {
  threat: { trivial: 40, low: 60, moderate: 80, severe: 120, extreme: 160 },
  perCharacter: { trivial: 10, low: 20, moderate: 20, severe: 30, extreme: 40 },
}

const CREATURE_XP: Record<number, number> = { [-4]: 10, [-3]: 15, [-2]: 20, [-1]: 30, 0: 40, 1: 60, 2: 80, 3: 120, 4: 160 }
const SIMPLE_HAZARD_XP: Record<number, number> = { [-4]: 2, [-3]: 3, [-2]: 4, [-1]: 6, 0: 8, 1: 12, 2: 16, 3: 24, 4: 32 }

// Party Treasure by Level, levels 1–20. PF2e: GM Core p. 58 (values in gp, from the
// GM's Wealth_by_Level sheet). SF2e: GM Core p. 58 (values in credits),
// https://2e.aonsrd.com/rules/731-treasure-by-level. Both tables have the same shape;
// SF2e's credit values are PF2e's gp × 10, which is the same in cp (1 cr = 10 cp).
const TREASURE_TOTAL_GP = [175, 300, 500, 850, 1350, 2000, 2900, 4000, 5700, 8000, 11500, 16500, 25000, 36500, 54500, 82500, 128000, 208000, 355000, 490000]
const TREASURE_CURRENCY_GP = [40, 70, 120, 200, 320, 500, 720, 1000, 1400, 2000, 2800, 4000, 6000, 9000, 13000, 20000, 30000, 48000, 80000, 140000]
const TREASURE_EXTRA_PC_GP = [10, 18, 30, 50, 80, 125, 180, 250, 350, 500, 700, 1000, 1500, 2250, 3250, 5000, 7500, 12000, 20000, 35000]
const TREASURE_TOTAL_CR = [1750, 3000, 5000, 8500, 13500, 20000, 29000, 40000, 57000, 80000, 115000, 165000, 250000, 365000, 545000, 825000, 1280000, 2080000, 3550000, 4900000]
const TREASURE_CURRENCY_CR = [400, 700, 1200, 2000, 3200, 5000, 7200, 10000, 14000, 20000, 28000, 40000, 60000, 90000, 130000, 200000, 300000, 480000, 800000, 1400000]
const TREASURE_EXTRA_PC_CR = [100, 180, 300, 500, 800, 1250, 1800, 2500, 3500, 5000, 7000, 10000, 15000, 22500, 32500, 50000, 75000, 120000, 200000, 350000]

/** Item counts per row: level L gives permanent items of L+1 and L, consumables of L+1, L and L−1. */
function treasureCounts(level: number): Pick<TreasureRow, 'permanent' | 'consumables'> {
  if (level === 20) return { permanent: { 20: 4 }, consumables: { 20: 4, 19: 2 } }
  const consumables: Record<number, number> = { [level + 1]: 2, [level]: 2 }
  if (level === 1) consumables[1] = 3
  else consumables[level - 1] = 2
  return { permanent: { [level + 1]: 2, [level]: 2 }, consumables }
}

function treasureTable(total: number[], currency: number[], extra: number[], cpPerUnit: number): TreasureRow[] {
  return total.map((t, i) => ({
    level: i + 1,
    total: t * cpPerUnit,
    currency: currency[i] * cpPerUnit,
    perExtraPc: extra[i] * cpPerUnit,
    ...treasureCounts(i + 1),
  }))
}

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
    treasure: treasureTable(TREASURE_TOTAL_GP, TREASURE_CURRENCY_GP, TREASURE_EXTRA_PC_GP, 100),
    // Item counts were taken from the SF2e table; same layout, not yet checked in PF2e GM Core
    treasureCountsVerified: false,
    verified: true,
  },
  sf2e: {
    // Foundry stores SF2e prices in `sp`; one credit is worth one silver piece.
    currency: { display: 'credits', denominations: [{ key: 'credits', label: 'cr', cp: 10 }] },
    encounter: PF2E_ENCOUNTER,
    creatureXp: CREATURE_XP,
    simpleHazardXp: SIMPLE_HAZARD_XP,
    xpPerLevel: 1000,
    treasure: treasureTable(TREASURE_TOTAL_CR, TREASURE_CURRENCY_CR, TREASURE_EXTRA_PC_CR, 10),
    treasureCountsVerified: true,
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

function treasureRow(game: GameId, level: number): TreasureRow {
  const table = GAME_RULES[game].treasure
  return table[Math.max(1, Math.min(table.length, Math.round(level))) - 1]
}

/** Treasure for one level, adjusted for party size (currency per character above or below four). */
export function levelTreasure(game: GameId, level: number, partySize: number): number {
  const row = treasureRow(game, level)
  return Math.max(0, row.total + (partySize - 4) * row.perExtraPc)
}

/**
 * Treasure a party is expected to have been given from `fromLevel` up to `level`,
 * plus `progress` (0–1) of the current level's row.
 */
export function expectedTreasure(game: GameId, opts: { fromLevel: number; level: number; progress?: number; partySize: number }): number {
  let sum = 0
  for (let l = opts.fromLevel; l < opts.level; l++) sum += levelTreasure(game, l, opts.partySize)
  return sum + Math.round((opts.progress ?? 0) * levelTreasure(game, opts.level, opts.partySize))
}
