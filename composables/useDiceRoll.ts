import { inject, ref, type InjectionKey } from 'vue'
import { rollCheck, rollStrikeDamage } from '~/rules/rolls'
import { GAME_RULES } from '~/rules/registry'
import type { GameId } from '~/types/game'
import type { Strike } from '~/types/rules'
import type { AreaEffect, AreaKind } from '~/rules/areas'

/**
 * A button on a roll in the dice panel: roll the damage after a hit, apply
 * it to the target … `run` may say what it did ("Applied 12 to Hero"); after
 * one ran, the roll shows that instead of its buttons.
 */
export interface RollAction {
  label: string
  title?: string
  primary?: boolean
  run(): string | void
}

/** A finished roll for the dice panel: a labeled total with its dice. */
export interface ShownRoll {
  label: string
  total: number
  breakdown: string
  isCrit?: boolean
  isFail?: boolean
  /** Hit / Miss, Success … */
  outcome?: string
  /** Critical success … critical failure: colors the roll. */
  tone?: 'critical-success' | 'success' | 'failure' | 'critical-failure'
  /** "vs Hero (AC 18)", the crit traits that added … */
  detail?: string
  actions?: RollAction[]
}

/**
 * A roll asked for by a stat block (COMBAT_PLAN.md §4). Attacks and checks are
 * d20 + modifier; damage is a Strike's damage, doubled on a crit.
 */
export type StatRoll =
  | { kind: 'attack'; label: string; modifier: number; strike?: Strike }
  | { kind: 'check'; label: string; modifier: number }
  | { kind: 'damage'; label: string; strike: Strike; critical?: boolean; twoHand?: boolean }

/**
 * Who handles a stat block's rolls. The encounter's stat-block panel provides
 * one (targets, apply damage, combat log); elsewhere the dice panel shows them.
 */
export interface RollContext {
  roll(r: StatRoll): void
  /** Starts placing an area with this effect on the map (COMBAT_PLAN.md §5); only on the encounter map. */
  placeArea?(spec: AreaSpec): void
}

/** An area an ability describes: "20-foot burst … DC 22 basic Reflex … 6d6 fire damage". */
export interface AreaSpec { label: string; kind: AreaKind; sizeFt: number; effect: AreaEffect }
export const ROLL_CONTEXT: InjectionKey<RollContext> = Symbol('roll-context')

// Module-level so all components share the same instance
const pendingRoll = ref<string | null>(null)
/** Finished rolls waiting for the dice panel, oldest first. */
const shownRolls = ref<ShownRoll[]>([])

export function useDiceRoll() {
  function triggerRoll(expression: string) {
    pendingRoll.value = expression
  }
  function clearPendingRoll() {
    pendingRoll.value = null
  }
  /** Shows a finished roll in the dice panel. */
  function showRoll(r: ShownRoll) {
    shownRolls.value = [...shownRolls.value, r]
  }
  /** The dice panel takes the waiting rolls. */
  function takeShownRolls(): ShownRoll[] {
    const list = shownRolls.value
    shownRolls.value = []
    return list
  }
  return { pendingRoll, triggerRoll, clearPendingRoll, shownRolls, showRoll, takeShownRolls }
}

/** The roll context of the surrounding component, or the dice panel. */
export function useStatRolls(game: () => GameId | undefined) {
  const ctx = inject(ROLL_CONTEXT, null)
  const { showRoll } = useDiceRoll()
  function roll(r: StatRoll) {
    if (ctx) return ctx.roll(r)
    showRoll(resolveStatRoll(r, game() ?? 'pf2e'))
  }
  const canPlaceArea = !!ctx?.placeArea
  function placeArea(spec: AreaSpec) {
    ctx?.placeArea?.(spec)
  }
  return { roll, canPlaceArea, placeArea }
}

/** A stat-block roll without a target, as the dice panel shows it. */
export function resolveStatRoll(r: StatRoll, game: GameId, rng: () => number = Math.random): ShownRoll {
  if (r.kind === 'damage') {
    const d = rollStrikeDamage(r.strike, !!r.critical, rng, GAME_RULES[game].critTraits, { twoHand: r.twoHand })
    return {
      label: r.label, total: d.total,
      breakdown: d.parts.map(p => `${p.breakdown} ${p.type}`).join(' + '),
      outcome: r.critical ? 'Critical' : undefined,
      detail: d.notes.join(' · ') || undefined,
    }
  }
  const c = rollCheck(r.modifier, null, rng)
  return {
    label: r.label, total: c.total,
    breakdown: `d20 [${c.d20}] ${r.modifier < 0 ? '−' : '+'} ${Math.abs(r.modifier)}`,
    isCrit: c.d20 === 20, isFail: c.d20 === 1,
  }
}

