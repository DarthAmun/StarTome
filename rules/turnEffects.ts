/**
 * Conditions that change by themselves in combat (FEATURES_PLAN.md §10.2).
 * Pure: every function takes a token's conditions and returns the new list
 * plus the changes made, so the encounter store can log and undo them.
 *
 * Rules: Player Core p. 410 (Knocked Out and Dying, recovery checks, wounded,
 * doomed), the condition entries for frightened, stunned, slowed and quickened,
 * and persistent damage (DC 15 flat check, DC 10 when assisted). Checked on
 * Archives of Nethys 2026-10-29.
 */
import { conditionInfo, getConditionColor } from '~/composables/useConditions'
import type { TokenCondition } from '~/stores/encounter'
import { DEFAULT_AUTOMATION, type AutomationSettings } from '~/types/game'

export { DEFAULT_AUTOMATION, type AutomationSettings }

/** One condition's value before and after; `undefined` = the token didn't have it, `null` = present without a value. */
export interface ConditionChange {
  name: string
  from: number | null | undefined
  to: number | null | undefined
  /** The condition as it was, so an undo restores its look and hidden flag. */
  before?: TokenCondition
  /** Where it stood in the list, so an undo puts it back there. */
  index?: number
}

export type TurnPromptSeed =
  | { kind: 'recovery'; dying: number; dc: number }
  | { kind: 'persistent'; condition: string; formula: string }

export interface EffectResult {
  conditions: TokenCondition[]
  changes: ConditionChange[]
  /** The token died (dying reached its limit) or, without dying rules, was defeated. */
  dead: boolean
  prompts: TurnPromptSeed[]
  /** One-line reminders for the GM (actions lost or gained). */
  notes: string[]
  /** A token without dying rules came back above 0 HP. */
  revived?: boolean
}

export type Degree = 'critical-success' | 'success' | 'failure' | 'critical-failure'

export const RECOVERY_DC_BASE = 10
export const PERSISTENT_DC = 15
export const PERSISTENT_ASSISTED_DC = 10
const DEATH_AT = 4
const ACTIONS_PER_TURN = 3

// ── Condition list helpers ─────────────────────────────────────────────────

function find(conds: TokenCondition[], name: string): TokenCondition | undefined {
  const n = name.toLowerCase()
  return conds.find(c => c.name.toLowerCase() === n)
}

/** The condition's value, 0 when absent; a condition without a value counts as 1. */
export function conditionValue(conds: TokenCondition[], name: string): number {
  const c = find(conds, name)
  return c ? (c.value ?? 1) : 0
}

export function hasCondition(conds: TokenCondition[], name: string): boolean {
  return !!find(conds, name)
}

export function isPersistent(c: TokenCondition): boolean {
  return /^persistent\b/i.test(c.name)
}

/** "Persistent fire 2d6" typed as a condition → name "Persistent fire", formula "2d6". */
export function parsePersistent(text: string): { name: string; formula: string } | null {
  const m = text.trim().match(/^persistent\s+([a-z][a-z -]*?)\s+(\d*d\d+(?:\s*[+-]\s*\d+)?|\d+)$/i)
  if (!m) return null
  return { name: `Persistent ${m[1].toLowerCase()}`, formula: m[2].replace(/\s+/g, '') }
}

class Editor {
  conditions: TokenCondition[]
  changes: ConditionChange[] = []
  constructor(conds: TokenCondition[]) { this.conditions = [...conds] }

  value(name: string) { return conditionValue(this.conditions, name) }
  has(name: string) { return hasCondition(this.conditions, name) }

  /** Sets a condition's value; `undefined` removes it. Keeps its look and hidden flag. */
  set(name: string, to: number | null | undefined) {
    const i = this.conditions.findIndex(c => c.name.toLowerCase() === name.toLowerCase())
    const prev = i >= 0 ? this.conditions[i] : undefined
    const from = prev ? prev.value : undefined
    if (from === to) return
    if (to === undefined) this.conditions.splice(i, 1)
    else if (prev) this.conditions[i] = { ...prev, value: to }
    else {
      const info = conditionInfo(name)
      this.conditions.push({ name, value: to, color: info?.color ?? getConditionColor(name), icon: info?.icon })
    }
    this.changes.push({ name: prev?.name ?? name, from, to, before: prev, index: prev ? i : undefined })
  }

  result(extra: Partial<EffectResult> = {}): EffectResult {
    return { conditions: this.conditions, changes: this.changes, dead: false, prompts: [], notes: [], ...extra }
  }
}

/** Dying at which this token dies: 4, lowered by doomed. */
export function deathThreshold(conds: TokenCondition[]): number {
  return DEATH_AT - conditionValue(conds, 'Doomed')
}

/** Raises dying by `by`; returns whether the token died. */
function raiseDying(ed: Editor, by: number): boolean {
  const next = ed.value('Dying') + by
  const limit = deathThreshold(ed.conditions)
  ed.set('Dying', Math.min(next, Math.max(limit, 1)))
  return next >= limit
}

/** Dying ends: wounded goes up by 1 (the token stays unconscious at 0 HP). */
function loseDying(ed: Editor) {
  if (!ed.has('Dying')) return
  ed.set('Dying', undefined)
  ed.set('Wounded', ed.value('Wounded') + 1)
}

// ── Turn boundaries ────────────────────────────────────────────────────────

/** End of the token's turn: frightened goes down, persistent damage asks for its roll. */
export function endOfTurn(conds: TokenCondition[], settings: AutomationSettings): EffectResult {
  const ed = new Editor(conds)
  const prompts: TurnPromptSeed[] = []
  if (settings.tickDown) {
    const f = find(ed.conditions, 'Frightened')
    if (f) ed.set(f.name, (f.value ?? 1) > 1 ? (f.value ?? 1) - 1 : undefined)
  }
  if (settings.persistent) {
    for (const c of ed.conditions) if (isPersistent(c)) prompts.push({ kind: 'persistent', condition: c.name, formula: c.formula ?? '' })
  }
  return ed.result({ prompts })
}

/** Start of the token's turn: the recovery check prompt and the action reminders; stunned is used up. */
export function startOfTurn(conds: TokenCondition[], settings: AutomationSettings, usesDying: boolean): EffectResult {
  const ed = new Editor(conds)
  const prompts: TurnPromptSeed[] = []
  const notes: string[] = []
  if (settings.dying && usesDying && ed.has('Dying')) {
    const dying = ed.value('Dying')
    prompts.push({ kind: 'recovery', dying, dc: RECOVERY_DC_BASE + dying })
  }
  if (settings.tickDown) {
    const quickened = ed.has('Quickened')
    let actions = ACTIONS_PER_TURN + (quickened ? 1 : 0)
    const stunned = find(ed.conditions, 'Stunned')
    if (stunned?.value) {
      const lost = Math.min(stunned.value, actions)
      actions -= lost
      ed.set(stunned.name, stunned.value - lost > 0 ? stunned.value - lost : undefined)
      notes.push(`Stunned: loses ${lost} action${lost === 1 ? '' : 's'}${stunned.value - lost > 0 ? ` (stunned ${stunned.value - lost} left)` : ''}`)
    } else if (stunned) {
      notes.push('Stunned: loses its actions for the duration')
    }
    const slowed = conditionValue(ed.conditions, 'Slowed')
    if (slowed && !stunned) notes.push(`Slowed ${slowed}: loses ${slowed} action${slowed === 1 ? '' : 's'}`)
    if (quickened) notes.push('Quickened: 1 extra action (limited uses)')
  }
  return ed.result({ prompts, notes })
}

// ── Prompt results ─────────────────────────────────────────────────────────

/** Degree of success of a flat check: ±10 for criticals, a natural 20/1 steps up/down. */
export function flatCheckDegree(roll: number, dc: number): Degree {
  const order: Degree[] = ['critical-failure', 'failure', 'success', 'critical-success']
  let i = roll >= dc + 10 ? 3 : roll >= dc ? 2 : roll <= dc - 10 ? 0 : 1
  if (roll === 20) i = Math.min(3, i + 1)
  if (roll === 1) i = Math.max(0, i - 1)
  return order[i]
}

const RECOVERY_DELTA: Record<Degree, number> = { 'critical-success': -2, success: -1, failure: 1, 'critical-failure': 2 }

/** Applies a recovery check's result. */
export function recoveryCheck(conds: TokenCondition[], degree: Degree): EffectResult {
  const ed = new Editor(conds)
  const delta = RECOVERY_DELTA[degree]
  if (delta > 0) return ed.result({ dead: raiseDying(ed, delta) })
  const next = ed.value('Dying') + delta
  if (next <= 0) loseDying(ed)
  else ed.set('Dying', next)
  return ed.result()
}

/** Persistent damage after its flat check: ends on a success. */
export function persistentCheck(conds: TokenCondition[], condition: string, recovered: boolean): EffectResult {
  const ed = new Editor(conds)
  if (recovered) ed.set(condition, undefined)
  return ed.result()
}

// ── HP changes ─────────────────────────────────────────────────────────────

export interface HpChange {
  from: number | null
  to: number | null
  /** The damage was a critical hit (or the token's own critical failure). */
  critical?: boolean
  /** Hits taken while already at 0 HP (each raises dying). */
  hitsAtZero?: number
}

/**
 * Dying, wounded and unconscious from an HP change. A token without dying rules
 * is defeated when it drops to 0.
 */
export function hpChangeEffects(conds: TokenCondition[], change: HpChange, usesDying: boolean, settings: AutomationSettings): EffectResult {
  const ed = new Editor(conds)
  if (!settings.dying || change.from === null || change.to === null) return ed.result()
  const dropped = change.from > 0 && change.to <= 0
  if (!usesDying) return ed.result({ dead: dropped, revived: change.from <= 0 && change.to > 0 })
  const step = change.critical ? 2 : 1
  if (dropped) {
    const dead = raiseDying(ed, step + ed.value('Wounded'))
    ed.set('Unconscious', null)
    return ed.result({ dead })
  }
  if (change.from <= 0 && change.to > 0) {
    loseDying(ed)
    ed.set('Unconscious', undefined)
    return ed.result()
  }
  if (change.to <= 0 && change.hitsAtZero && ed.has('Dying')) {
    return ed.result({ dead: raiseDying(ed, step * change.hitsAtZero) })
  }
  return ed.result()
}

/** Reverts changes made earlier (newest first), touching only those conditions. */
export function revertChanges(conds: TokenCondition[], changes: ConditionChange[]): TokenCondition[] {
  const ed = new Editor(conds)
  for (const ch of [...changes].reverse()) {
    if (ch.before && !ed.has(ch.name)) ed.conditions.splice(Math.min(ch.index ?? Infinity, ed.conditions.length), 0, { ...ch.before })
    else ed.set(ch.name, ch.from)
  }
  return ed.conditions
}
