/**
 * The dice panel's state: one roll history for the whole app. Rolls from text
 * (`::dice[2d6]`), from stat blocks and from the command bar all land here,
 * with the buttons for what comes next (roll the damage, apply it).
 */
import type { ZoneAreaSpec } from '@/domain/rules/sensorMap'
import { computed, inject, reactive, shallowRef, type InjectionKey } from 'vue'
import type { GameId } from '@/domain/game'
import { rollExpression } from '@/domain/rules/rolls'
import { resolveStatRoll, type AreaSpec, type RollAction, type ShownRoll, type StatRoll } from '@/domain/rules/statRolls'

export interface LoggedRoll extends ShownRoll { id: number; done?: string }

const HISTORY = 30
let nextId = 1

export const dice = reactive({ open: false, history: [] as LoggedRoll[] })

/** Shows a finished roll in the dice panel and opens it. */
export function showRoll(r: ShownRoll): void {
  dice.history = [{ ...r, id: nextId++ }, ...dice.history].slice(0, HISTORY)
  dice.open = true
}

/** Rolls a dice expression ("2d6+3"). False when the text is not one. */
export function rollDice(expr: string, label?: string): boolean {
  const r = rollExpression(expr)
  if (!r) return false
  const d20 = r.terms.filter(t => t.sides === 20)
  const single = d20.length === 1 && d20[0]?.count === 1 ? d20[0].values[0] : undefined
  showRoll({ label: label ? `${label} (${expr})` : expr, total: r.total, breakdown: r.breakdown, isCrit: single === 20, isFail: single === 1 })
  return true
}

export function runRollAction(roll: LoggedRoll, action: RollAction): void {
  const what = action.run()
  const entry = dice.history.find(h => h.id === roll.id)
  if (entry) entry.done = what || `${action.label} ✓`
}

export function clearRolls(): void {
  dice.history = []
}

/**
 * Who handles a stat block's rolls. The encounter provides one (targets, apply
 * damage, combat log, areas on the map); elsewhere the dice panel shows them.
 */
export interface RollContext {
  roll(r: StatRoll): void
  placeArea?(spec: AreaSpec): void
  /** A starship battle's sensor map takes zone areas (a 3-zone cone). */
  zoneArea?(spec: ZoneAreaSpec): void
}
export const ROLL_CONTEXT: InjectionKey<RollContext> = Symbol('roll-context')

/** The open encounter takes the rolls of stat blocks wherever they are shown (the dock is outside its page). */
export const activeRollContext = shallowRef<RollContext | null>(null)

export function useStatRolls(game: () => GameId | undefined) {
  const injected = inject(ROLL_CONTEXT, null)
  const ctx = () => injected ?? activeRollContext.value
  return {
    roll: (r: StatRoll) => { const c = ctx(); if (c) c.roll(r); else showRoll(resolveStatRoll(r, game() ?? 'pf2e')) },
    canPlaceArea: computed(() => !!ctx()?.placeArea),
    placeArea: (spec: AreaSpec) => ctx()?.placeArea?.(spec),
    canZoneArea: computed(() => !!ctx()?.zoneArea),
    zoneArea: (spec: ZoneAreaSpec) => ctx()?.zoneArea?.(spec),
  }
}
