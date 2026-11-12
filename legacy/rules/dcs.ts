/**
 * Difficulty classes (FEATURES_PLAN.md §10.1): DCs by level, simple DCs, the
 * difficulty adjustments and Recall Knowledge for creatures and hazards.
 * Tables live per game in `GAME_RULES` (rules/registry.ts).
 */
import { GAME_RULES } from '~/rules/registry'
import type { GameId } from '~/types/game'
import type { Rarity } from '~/types/rules'

export type DcStep = 'incredibly-easy' | 'very-easy' | 'easy' | 'normal' | 'hard' | 'very-hard' | 'incredibly-hard'
export type Proficiency = 'untrained' | 'trained' | 'expert' | 'master' | 'legendary'

/** GM Core Table 10-6 (DC Adjustments). */
export const DC_STEPS: { key: DcStep; label: string; adjust: number }[] = [
  { key: 'incredibly-easy', label: 'Incredibly easy', adjust: -10 },
  { key: 'very-easy', label: 'Very easy', adjust: -5 },
  { key: 'easy', label: 'Easy', adjust: -2 },
  { key: 'normal', label: 'Normal', adjust: 0 },
  { key: 'hard', label: 'Hard', adjust: 2 },
  { key: 'very-hard', label: 'Very hard', adjust: 5 },
  { key: 'incredibly-hard', label: 'Incredibly hard', adjust: 10 },
]

/** GM Core Table 10-4 (Simple DCs). */
export const SIMPLE_DCS: Record<Proficiency, number> = { untrained: 10, trained: 15, expert: 20, master: 30, legendary: 40 }
export const PROFICIENCIES = Object.keys(SIMPLE_DCS) as Proficiency[]

export type Degree = 'critical-success' | 'success' | 'failure' | 'critical-failure'

/** Degree of success of a check: ±10 for criticals, a natural 20/1 one step up/down. */
export function checkDegree(d20: number, modifier: number, dc: number): Degree {
  const order: Degree[] = ['critical-failure', 'failure', 'success', 'critical-success']
  const total = d20 + modifier
  let i = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1
  if (d20 === 20) i = Math.min(3, i + 1)
  if (d20 === 1) i = Math.max(0, i - 1)
  return order[i]
}

export const MIN_DC_LEVEL = -1
export const MAX_DC_LEVEL = 25

const RARITY_STEP: Record<Rarity, DcStep> = { common: 'normal', uncommon: 'hard', rare: 'very-hard', unique: 'incredibly-hard' }

export function clampDcLevel(level: number): number {
  return Math.max(MIN_DC_LEVEL, Math.min(MAX_DC_LEVEL, Math.round(level)))
}

/** DC for a task, creature or item of `level` (clamped to −1…25). */
export function levelDc(level: number, game: GameId = 'pf2e'): number {
  return GAME_RULES[game].dcByLevel[clampDcLevel(level) - MIN_DC_LEVEL]
}

export function simpleDc(rank: Proficiency): number {
  return SIMPLE_DCS[rank]
}

export function stepAdjust(step: DcStep): number {
  return DC_STEPS.find(s => s.key === step)!.adjust
}

export function adjustDc(dc: number, step: DcStep): number {
  return dc + stepAdjust(step)
}

/** Uncommon is hard, rare very hard, unique incredibly hard. */
export function rarityStep(rarity: Rarity): DcStep {
  return RARITY_STEP[rarity] ?? 'normal'
}

export interface RecallKnowledge {
  dc: number
  /** The level DC before the rarity step. */
  baseDc: number
  rarity: Rarity
  /** Skills from the creature's traits, each once, in trait order. Empty = GM's choice. */
  skills: string[]
  /** Applicable Lore: easy and very easy, after the rarity step. */
  loreDcs: { specific: number; verySpecific: number }
}

/**
 * Recall Knowledge to identify a creature or hazard: the level DC adjusted for
 * rarity, the skills its traits call for, and the Lore DCs. An entry for both
 * games uses `game`'s trait map.
 */
export function recallKnowledge(
  entry: { level: number; rarity: Rarity; traits: string[]; game: GameId | 'both' },
  game: GameId = 'pf2e',
): RecallKnowledge {
  const g = entry.game === 'both' ? game : entry.game
  const baseDc = levelDc(entry.level, g)
  const dc = adjustDc(baseDc, rarityStep(entry.rarity))
  const map = GAME_RULES[g].identification
  const skills: string[] = []
  for (const t of entry.traits) {
    for (const s of map[t.toLowerCase()] ?? []) if (!skills.includes(s)) skills.push(s)
  }
  return {
    dc, baseDc, rarity: entry.rarity, skills,
    loreDcs: { specific: adjustDc(dc, 'easy'), verySpecific: adjustDc(dc, 'very-easy') },
  }
}

// ── Command palette ────────────────────────────────────────────────────────

export type DcQuery =
  | { kind: 'level'; level: number; step: DcStep | null; dc: number }
  | { kind: 'simple'; rank: Proficiency; step: DcStep | null; dc: number }

const STEP_WORDS: [RegExp, DcStep][] = [
  [/^incredibly[\s-]*easy$/, 'incredibly-easy'],
  [/^very[\s-]*easy$/, 'very-easy'],
  [/^easy$/, 'easy'],
  [/^(normal|common)$/, 'normal'],
  [/^(hard|uncommon)$/, 'hard'],
  [/^(very[\s-]*hard|rare)$/, 'very-hard'],
  [/^(incredibly[\s-]*hard|unique)$/, 'incredibly-hard'],
]

/** null = no step given, undefined = not a step. */
function readStep(rest: string | undefined): DcStep | null | undefined {
  if (!rest) return null
  return STEP_WORDS.find(([re]) => re.test(rest))?.[1]
}

/**
 * Reads what follows "DC" in the palette: `7`, `level 7 hard`, `l7 very hard`,
 * `7 rare`, `trained`, `expert easy`. Null when it isn't a DC question.
 */
export function parseDcQuery(text: string, game: GameId = 'pf2e'): DcQuery | null {
  const q = text.trim().toLowerCase().replace(/\s+/g, ' ')
  const m = q.match(/^(?:(?:level|lvl|lv|l) ?)?(-?\d+)(?: (.*))?$/)
  if (m) {
    const step = readStep(m[2])
    if (step === undefined) return null
    const level = clampDcLevel(Number(m[1]))
    const base = levelDc(level, game)
    return { kind: 'level', level, step, dc: step ? adjustDc(base, step) : base }
  }
  const [word, ...rest] = q.split(' ')
  const rank = word.length >= 2 ? PROFICIENCIES.find(r => r.startsWith(word)) : undefined
  const step = readStep(rest.join(' '))
  if (!rank || step === undefined) return null
  const base = simpleDc(rank)
  return { kind: 'simple', rank, step, dc: step ? adjustDc(base, step) : base }
}
