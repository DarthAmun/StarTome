/**
 * Rolls from stat blocks (COMBAT_PLAN.md §4): dice expressions, checks with a
 * degree of success, Strikes with the multiple attack penalty, and Strike
 * damage with critical doubling. Pure; `rng` returns [0, 1) like Math.random.
 *
 * Rules: Player Core "Multiple Attack Penalty" (−5/−10, agile −4/−8),
 * "Critical Hits" (double the damage), and the deadly and fatal weapon
 * traits. Deadly's die is rolled after doubling (its trait text says so);
 * fatal's extra die is treated the same way, which its text leaves open.
 * Same in SF2e.
 */
import { checkDegree, type Degree } from '~/rules/dcs'
import type { Strike } from '~/types/rules'

export type Rng = () => number

export interface DiceTerm { count: number; sides: number; sign: 1 | -1 }
export interface ParsedExpression { dice: DiceTerm[]; flat: number }

export interface RolledTerm extends DiceTerm { values: number[] }
export interface ExpressionRoll {
  total: number
  terms: RolledTerm[]
  flat: number
  /** "2d6 [3, 5] + 4". */
  breakdown: string
}

/** "2d6+1d4-1", "d20", "1D8 + 3" → dice and flat bonus; null when nothing in it rolls or adds. */
export function parseExpression(expr: string): ParsedExpression | null {
  const s = expr.replace(/\s/g, '').replace(/D/g, 'd')
  if (!s || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(s)) return null
  const dice: DiceTerm[] = []
  let flat = 0
  for (const m of s.matchAll(/([+-]?)(?:(\d*)d(\d+)|(\d+))/g)) {
    const sign = m[1] === '-' ? -1 : 1
    if (m[3] !== undefined) {
      const count = m[2] ? Number(m[2]) : 1
      const sides = Number(m[3])
      if (count > 0 && sides > 0) dice.push({ count, sides, sign })
    } else {
      flat += sign * Number(m[4])
    }
  }
  return { dice, flat }
}

export function rollDie(sides: number, rng: Rng = Math.random): number {
  return Math.floor(rng() * sides) + 1
}

/** Rolls a parsed expression (or a text one); null for text that doesn't parse. */
export function rollExpression(expr: string | ParsedExpression, rng: Rng = Math.random): ExpressionRoll | null {
  const p = typeof expr === 'string' ? parseExpression(expr) : expr
  if (!p) return null
  const terms = p.dice.map(d => ({ ...d, values: Array.from({ length: d.count }, () => rollDie(d.sides, rng)) }))
  const total = terms.reduce((n, t) => n + t.sign * t.values.reduce((a, b) => a + b, 0), 0) + p.flat
  return { total, terms, flat: p.flat, breakdown: breakdownOf(terms, p.flat) }
}

function breakdownOf(terms: RolledTerm[], flat: number): string {
  const parts = terms.map((t, i) => `${i === 0 ? (t.sign < 0 ? '−' : '') : t.sign < 0 ? '− ' : '+ '}${t.count}d${t.sides} [${t.values.join(', ')}]`)
  if (flat) parts.push(`${parts.length ? (flat < 0 ? '− ' : '+ ') : flat < 0 ? '−' : ''}${Math.abs(flat)}`)
  return parts.join(' ')
}

export interface CheckRoll {
  d20: number
  modifier: number
  total: number
  dc: number | null
  degree: Degree | null
}

/** d20 + modifier, with the degree of success when a DC (or AC) is given. */
export function rollCheck(modifier: number, dc: number | null = null, rng: Rng = Math.random): CheckRoll {
  const d20 = rollDie(20, rng)
  return { d20, modifier, total: d20 + modifier, dc, degree: dc === null ? null : checkDegree(d20, modifier, dc) }
}

export type MapStep = 0 | 1 | 2

/** Multiple attack penalty for the 1st/2nd/3rd attack: −5/−10, agile −4/−8. */
export function mapPenalty(strike: Pick<Strike, 'traits'>, step: MapStep): number {
  const per = strike.traits.includes('agile') ? 4 : 5
  return -per * step
}

export function strikeModifier(strike: Pick<Strike, 'bonus' | 'traits'>, step: MapStep): number {
  return strike.bonus + mapPenalty(strike, step)
}

export interface DamagePartRoll { type: string; total: number; breakdown: string }
export interface DamageRoll {
  total: number
  critical: boolean
  parts: DamagePartRoll[]
  /** What the crit traits added, e.g. "deadly d10: +7". */
  notes: string[]
}

/** The die size of a trait like "deadly-d10" / "fatal-d12"; null when the strike lacks it. */
export function traitDie(traits: string[], trait: string): number | null {
  for (const t of traits) {
    const m = t.match(new RegExp(`^${trait}-d(\\d+)$`))
    if (m) return Number(m[1])
  }
  return null
}

/** Deadly adds 1 die, 2 with 3 weapon dice (greater striking), 3 with 4 or more (major striking). */
export function deadlyDice(weaponDice: number): number {
  return weaponDice >= 4 ? 3 : weaponDice === 3 ? 2 : 1
}

/**
 * A Strike's damage. On a critical hit the total of every part doubles;
 * fatal first raises the weapon's dice to its size, then fatal and deadly add
 * their extra die after doubling (when the game has those traits).
 */
export function rollStrikeDamage(strike: Pick<Strike, 'damage' | 'traits'>, critical: boolean, rng: Rng = Math.random, critTraits: readonly string[] = ['deadly', 'fatal']): DamageRoll {
  const notes: string[] = []
  const fatal = critical && critTraits.includes('fatal') ? traitDie(strike.traits, 'fatal') : null
  const deadly = critical && critTraits.includes('deadly') ? traitDie(strike.traits, 'deadly') : null
  const parts = strike.damage.map((d, i): DamagePartRoll => {
    const parsed = parseExpression(d.formula)
    if (!parsed) return { type: d.type, total: 0, breakdown: d.formula }
    // Fatal changes the weapon's own dice: the first damage roll's
    if (fatal && i === 0) parsed.dice = parsed.dice.map(t => ({ ...t, sides: fatal }))
    const r = rollExpression(parsed, rng)!
    const total = Math.max(0, critical ? r.total * 2 : r.total)
    return { type: d.type, total, breakdown: critical ? `(${r.breakdown}) × 2` : r.breakdown }
  })
  const weapon = parts[0]
  const weaponDice = parseExpression(strike.damage[0]?.formula ?? '')?.dice.reduce((n, t) => n + t.count, 0) ?? 0
  if (weapon && fatal) {
    const v = rollDie(fatal, rng)
    weapon.total += v
    weapon.breakdown += ` + 1d${fatal} [${v}]`
    notes.push(`fatal d${fatal}: +${v}`)
  }
  if (weapon && deadly) {
    const n = deadlyDice(weaponDice)
    const values = Array.from({ length: n }, () => rollDie(deadly, rng))
    const sum = values.reduce((a, b) => a + b, 0)
    weapon.total += sum
    weapon.breakdown += ` + ${n}d${deadly} [${values.join(', ')}]`
    notes.push(`deadly d${deadly}: +${sum}`)
  }
  return { total: parts.reduce((n, p) => n + p.total, 0), critical, parts, notes }
}

export const DEGREE_LABEL: Record<Degree, string> = {
  'critical-success': 'Critical success',
  success: 'Success',
  failure: 'Failure',
  'critical-failure': 'Critical failure',
}

/** Attack wording for a degree against AC. */
export const ATTACK_LABEL: Record<Degree, string> = {
  'critical-success': 'Critical hit',
  success: 'Hit',
  failure: 'Miss',
  'critical-failure': 'Critical miss',
}
