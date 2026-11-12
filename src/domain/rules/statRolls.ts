/**
 * Rolls a stat block asks for, and how the dice panel shows a finished roll.
 * Attacks and checks are d20 + modifier; damage is a Strike's damage, doubled
 * on a critical hit. Pure; `rng` returns [0, 1) like Math.random.
 */
import type { GameId } from '@/domain/game'
import type { AreaEffect, AreaKind } from './areas'
import { GAME_RULES } from './registry'
import { rollCheck, rollStrikeDamage } from './rolls'
import type { Strike } from './types'

/**
 * A button on a roll in the dice panel: roll the damage after a hit, apply it
 * to the target … `run` may say what it did ("Applied 12 to Hero"); after one
 * ran, the roll shows that instead of its buttons.
 */
export interface RollAction {
  label: string
  title?: string
  primary?: boolean
  run(): string | void
}

/** A finished roll for the dice panel: a labelled total with its dice. */
export interface ShownRoll {
  label: string
  total: number
  breakdown: string
  isCrit?: boolean
  isFail?: boolean
  /** Hit / Miss, Success … */
  outcome?: string
  /** Colours the roll. */
  tone?: 'critical-success' | 'success' | 'failure' | 'critical-failure'
  /** "vs Hero (AC 18)", what the crit traits added … */
  detail?: string
  actions?: RollAction[]
}

export type StatRoll =
  | { kind: 'attack'; label: string; modifier: number; strike?: Strike }
  | { kind: 'check'; label: string; modifier: number }
  | { kind: 'damage'; label: string; strike: Strike; critical?: boolean; twoHand?: boolean }

/** An area an ability describes: "20-foot burst … DC 22 basic Reflex … 6d6 fire damage". */
export interface AreaSpec { label: string; kind: AreaKind; sizeFt: number; effect: AreaEffect }

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
