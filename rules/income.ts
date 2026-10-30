/**
 * Earn Income (FEATURES_PLAN.md §10.4): pay per day by task level, proficiency
 * and result. Values in cp.
 *
 * PF2e: Player Core p. 228, https://2e.aonprd.com/Actions.aspx?ID=2364.
 * SF2e: Player Core p. 186, https://2e.aonsrd.com/skill-general-actions/2-earn-income
 * (whole credits, so task levels 0–4 differ from PF2e's copper). Both checked 2026-10-29.
 */
import { levelDc, type Degree } from '~/rules/dcs'
import type { GameId } from '~/types/game'

export type IncomeRank = 'trained' | 'expert' | 'master' | 'legendary'
export const INCOME_RANKS: IncomeRank[] = ['trained', 'expert', 'master', 'legendary']
export const MAX_TASK_LEVEL = 20

// Rows: task level 0…20, then the "20 (critical success)" row. Columns: failed, trained, expert, master, legendary.
const PF2E_CP: number[][] = [
  [1, 5, 5, 5, 5], [2, 20, 20, 20, 20], [4, 30, 30, 30, 30], [8, 50, 50, 50, 50], [10, 70, 80, 80, 80],
  [20, 90, 100, 100, 100], [30, 150, 200, 200, 200], [40, 200, 250, 250, 250], [50, 250, 300, 300, 300],
  [60, 300, 400, 400, 400], [70, 400, 500, 600, 600], [80, 500, 600, 800, 800], [90, 600, 800, 1000, 1000],
  [100, 700, 1000, 1500, 1500], [150, 800, 1500, 2000, 2000], [200, 1000, 2000, 2800, 2800],
  [250, 1300, 2500, 3600, 4000], [300, 1500, 3000, 4500, 5500], [400, 2000, 4500, 7000, 9000],
  [600, 3000, 6000, 10000, 13000], [800, 4000, 7500, 15000, 20000],
  [0, 5000, 9000, 17500, 30000],
]
// SF2e in credits (1 credit = 10 cp)
const SF2E_CREDITS: number[][] = [
  [1, 1, 1, 1, 1], [1, 2, 2, 2, 2], [1, 3, 3, 3, 3], [1, 5, 5, 5, 5], [1, 7, 8, 8, 8],
  [2, 9, 10, 10, 10], [3, 15, 20, 20, 20], [4, 20, 25, 25, 25], [5, 25, 30, 30, 30], [6, 30, 40, 40, 40],
  [7, 40, 50, 60, 60], [8, 50, 60, 80, 80], [9, 60, 80, 100, 100], [10, 70, 100, 150, 150],
  [15, 80, 150, 200, 200], [20, 100, 200, 280, 280], [25, 130, 250, 360, 400], [30, 150, 300, 450, 550],
  [40, 200, 450, 700, 900], [60, 300, 600, 1000, 1300], [80, 400, 750, 1500, 2000],
  [0, 500, 900, 1750, 3000],
]

const TABLES: Record<GameId, number[][]> = {
  pf2e: PF2E_CP,
  sf2e: SF2E_CREDITS.map(r => r.map(v => v * 10)),
}

export function clampTaskLevel(level: number): number {
  return Math.max(0, Math.min(MAX_TASK_LEVEL, Math.round(level)))
}

/** The task's DC: the DC for its level. */
export function taskDc(taskLevel: number, game: GameId = 'pf2e'): number {
  return levelDc(clampTaskLevel(taskLevel), game)
}

/** Pay for one day. A critical success pays the next task level's row (at 20, the critical row). */
export function incomePerDay(game: GameId, taskLevel: number, rank: IncomeRank, degree: Degree): number {
  const table = TABLES[game]
  const level = clampTaskLevel(taskLevel)
  const col = 1 + INCOME_RANKS.indexOf(rank)
  if (degree === 'critical-failure') return 0
  if (degree === 'failure') return table[level][0]
  if (degree === 'critical-success') return table[level + 1][col]
  return table[level][col]
}

/** Total pay for runs of days with their results. */
export function incomeTotal(game: GameId, taskLevel: number, rank: IncomeRank, days: { degree: Degree; days: number }[]): number {
  return days.reduce((sum, d) => sum + Math.max(0, Math.floor(d.days)) * incomePerDay(game, taskLevel, rank, d.degree), 0)
}

