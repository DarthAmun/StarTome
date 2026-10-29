/**
 * Wealth and gear check (FEATURES_PLAN.md §3, §5 "treasure pace", §9.1, P5).
 * Pure; useWealth.ts does the IO.
 *
 * - The wealth % compares treasure *awarded* (the baseline plus resolved loot
 *   and manual awards since) with the running total of GM Core's
 *   *Party Treasure by Level* from level 1 to the party's level.
 * - The pace hint compares what was awarded since the last level-up with the
 *   current level's row: that is the "behind / ahead" signal.
 * - The gear check compares each character's best weapon and armor with the
 *   runes (PF2e) or grade (SF2e) expected at their level.
 */
import { GAME_RULES, SF2E_GRADES, levelTreasure } from '~/rules/registry'
import { effective, entryValue, type InventoryEntry } from '~/rules/inventory'
import { MAX_LEVEL } from '~/rules/party'
import type { GameId } from '~/types/game'
import type { Item } from '~/types/rules'

// ── Award values ──────────────────────────────────────────────────────────

/** Value of some treasure in cp, with the consumable part on its own. */
export interface TreasureValue { value: number; consumables: number }

type ItemLike = Parameters<typeof effective>[1]

/** GM value of a set of entries plus coins (resolved loot, a manual award). */
export function lootValue(entries: InventoryEntry[], items: Map<string, NonNullable<ItemLike>>, cp = 0): TreasureValue {
  let value = Math.max(0, Math.floor(cp))
  let consumables = 0
  for (const e of entries) {
    const item = e.itemId ? items.get(e.itemId) : undefined
    const v = entryValue(e, item)
    value += v
    if (effective(e, item).consumable) consumables += v
  }
  return { value, consumables }
}

// ── Expected treasure ─────────────────────────────────────────────────────

/** Median cp price of a consumable per item level, from the compendium. */
export type ConsumablePrices = Record<number, number>

/** Consumable share of one level's row: its consumable counts priced at the median. */
export function consumableShare(game: GameId, level: number, prices: ConsumablePrices): number {
  const row = GAME_RULES[game].treasure[Math.max(1, Math.min(MAX_LEVEL, level)) - 1]
  return Object.entries(row.consumables).reduce((sum, [l, n]) => sum + n * (prices[Number(l)] ?? 0), 0)
}

/**
 * Expected treasure per level 1…20 (index 0 = level 1), adjusted for party
 * size. With `prices` the consumable share is taken out (count consumables: off).
 */
export function levelSteps(game: GameId, partySize: number, prices?: ConsumablePrices): number[] {
  return Array.from({ length: MAX_LEVEL }, (_, i) => {
    const full = levelTreasure(game, i + 1, partySize)
    return prices ? Math.max(0, full - consumableShare(game, i + 1, prices)) : full
  })
}

/** Running total expected at `level`, `progress` (0–1) of the way through it. */
export function cumulativeExpected(steps: number[], level: number, progress = 0): number {
  const l = Math.max(1, Math.min(steps.length, Math.round(level)))
  let sum = 0
  for (let i = 0; i < l - 1; i++) sum += steps[i]
  return Math.round(sum + Math.max(0, Math.min(1, progress)) * steps[l - 1])
}

/**
 * The level whose running total an amount matches: "matches level 5, 40% of
 * the way through". Beyond level 20 the progress goes above 1.
 */
export function matchLevel(steps: number[], amount: number): { level: number; progress: number } {
  let left = Math.max(0, amount)
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (left < step || i === steps.length - 1) return { level: i + 1, progress: step > 0 ? left / step : 0 }
    left -= step
  }
  return { level: 1, progress: 0 }
}

export interface WealthInput {
  game: GameId
  partyLevel: number
  /** 0–1 through the current level (XP, or the milestone pacing). */
  progress: number
  partySize: number
  /** The baseline: what the party owned when tracking started. */
  starting: TreasureValue
  /** Awards since the baseline. */
  awards: TreasureValue[]
  countConsumables: boolean
  /** Needed when `countConsumables` is off. */
  prices?: ConsumablePrices
}

export interface WealthReadout {
  awarded: number
  expected: number
  /** awarded / expected; null without an expectation (level 1, no progress). */
  ratio: number | null
  matches: { level: number; progress: number }
  /** The consumable share was priced from the compendium: an estimate. */
  estimate: boolean
}

export function wealthReadout(input: WealthInput): WealthReadout {
  const size = input.partySize > 0 ? input.partySize : 4
  const leaveOut = !input.countConsumables
  const steps = levelSteps(input.game, size, leaveOut ? (input.prices ?? {}) : undefined)
  const count = (t: TreasureValue) => (leaveOut ? Math.max(0, t.value - t.consumables) : t.value)
  const awarded = count(input.starting) + input.awards.reduce((n, a) => n + count(a), 0)
  const expected = cumulativeExpected(steps, input.partyLevel, input.progress)
  return {
    awarded,
    expected,
    ratio: expected > 0 ? awarded / expected : null,
    matches: matchLevel(steps, awarded),
    estimate: leaveOut,
  }
}

// ── Pace during the current level ─────────────────────────────────────────

export interface TreasurePace {
  /** The level's Party Treasure row, adjusted for party size. */
  expected: number
  awarded: number
  fraction: number
  /** What's left of the row; negative when ahead. */
  remaining: number
}

/** Treasure awarded since the last level-up against the current level's row (§5). */
export function treasurePace(game: GameId, level: number, partySize: number, awarded: number): TreasurePace {
  const expected = levelTreasure(game, level, partySize > 0 ? partySize : 4)
  return { expected, awarded, fraction: expected > 0 ? awarded / expected : 0, remaining: expected - awarded }
}

// ── Gear check ────────────────────────────────────────────────────────────

export type GearKind = 'weapon' | 'armor'

/** One weapon or armor a character carries, with its effective runes or grade. */
export interface GearPiece {
  name: string
  kind: GearKind
  potency: number
  /** Striking (weapons) or resilient (armor): 1 base, 2 greater, 3 major. */
  fundamental: number
  /** SF2e grade rank: 0 commercial … 6 paragon. */
  grade: number
}

export type GearStatus = 'ok' | 'behind' | 'ahead' | 'none'

export interface GearLine {
  kind: GearKind
  /** Best piece of that kind; null if the character carries none. */
  piece: GearPiece | null
  have: string
  expected: string
  status: GearStatus
}

export function gradeRank(grade: string | null | undefined): number {
  const i = SF2E_GRADES.indexOf((grade ?? '').toLowerCase() as typeof SF2E_GRADES[number])
  return i < 0 ? 0 : i
}

/** A character's weapon or armor entry as a gear piece; entry runes/grade beat the item's. */
export function gearPiece(entry: InventoryEntry, item: Pick<Item, 'name' | 'category' | 'weapon' | 'armor'> | undefined): GearPiece | null {
  const kind = item?.category
  if (kind !== 'weapon' && kind !== 'armor') return null
  const runes = entry.runes ?? (kind === 'weapon' ? item?.weapon?.runes : item?.armor?.runes) ?? null
  const grade = entry.grade ?? (kind === 'weapon' ? item?.weapon?.grade : item?.armor?.grade) ?? null
  return {
    name: entry.nameOverride?.trim() || item?.name || 'Unnamed item',
    kind,
    potency: runes?.potency ?? 0,
    fundamental: (kind === 'weapon' ? runes?.striking : runes?.resilient) ?? 0,
    grade: gradeRank(grade),
  }
}

const steps = (levels: number[], level: number) => levels.filter(l => l <= level).length
const cmp = (have: number, want: number) => Math.sign(have - want)

const FUNDAMENTAL: Record<GearKind, string[]> = {
  weapon: ['striking', 'greater striking', 'major striking'],
  armor: ['resilient', 'greater resilient', 'major resilient'],
}

export function runeLabel(kind: GearKind, potency: number, fundamental: number): string {
  const parts = [potency ? `+${potency}` : '', fundamental ? FUNDAMENTAL[kind][fundamental - 1] : ''].filter(Boolean)
  return parts.length ? parts.join(' ') : 'no runes'
}

/**
 * Best weapon and armor against the level's expectation. PF2e: potency and
 * striking/resilient each; one step short is "behind". SF2e: the grade.
 * With ABP the PF2e rune part is skipped (returns no lines).
 */
export function gearCheck(game: GameId, level: number, pieces: GearPiece[], abp: boolean): GearLine[] {
  const schedule = GAME_RULES[game].gear
  if (schedule.kind === 'runes' && abp) return []
  return (['weapon', 'armor'] as const).map(kind => {
    const own = pieces.filter(p => p.kind === kind)
    if (schedule.kind === 'grades') {
      const want = steps(schedule.grades[kind], level)
      const best = own.reduce<GearPiece | null>((b, p) => (!b || p.grade > b.grade ? p : b), null)
      const status: GearStatus = !best ? (want ? 'none' : 'ok') : (['behind', 'ok', 'ahead'] as const)[cmp(best.grade, want) + 1]
      return { kind, piece: best, have: best ? SF2E_GRADES[best.grade] : '—', expected: SF2E_GRADES[want], status }
    }
    const wantPot = steps(schedule[kind].potency, level)
    const wantFund = steps(schedule[kind].fundamental, level)
    const best = own.reduce<GearPiece | null>((b, p) => (!b || p.potency + p.fundamental > b.potency + b.fundamental ? p : b), null)
    let status: GearStatus
    if (!best) status = wantPot || wantFund ? 'none' : 'ok'
    else {
      const c = [cmp(best.potency, wantPot), cmp(best.fundamental, wantFund)]
      status = c.includes(-1) ? 'behind' : c.includes(1) ? 'ahead' : 'ok'
    }
    return {
      kind, piece: best,
      have: best ? runeLabel(kind, best.potency, best.fundamental) : '—',
      expected: runeLabel(kind, wantPot, wantFund),
      status,
    }
  })
}

// ── Progress through a level ──────────────────────────────────────────────

/** XP campaigns: the members' average XP toward 1,000, capped just below a full level. */
export function xpProgress(xps: number[], xpPerLevel = 1000): number {
  if (!xps.length) return 0
  const avg = xps.reduce((a, x) => a + Math.min(xpPerLevel, Math.max(0, x)), 0) / xps.length
  return Math.min(0.99, avg / xpPerLevel)
}
