/**
 * Combat numbers of compendium entries for the VTT: weak/elite adjustments,
 * token stats and the formula scope for initiative.
 *
 * Adjustments follow GM Core ("Elite and Weak Adjustments"): ±2 to AC, attacks,
 * DCs, saves, Perception and skills, ±2 Strike damage, HP by starting level,
 * and the level shift (two steps across 0, since level 0 doesn't stack evenly).
 */
import { SIZE_SQUARES } from '~/rules/format'
import type { Creature, Hazard, RulesEntity, Strike } from '~/types/rules'

export type Adjustment = 'weak' | 'elite'

export const ADJUSTMENT_LABEL: Record<Adjustment, string> = { weak: 'Weak', elite: 'Elite' }

export function isAdjustment(v: unknown): v is Adjustment {
  return v === 'weak' || v === 'elite'
}

export function eliteHp(level: number): number {
  if (level <= 1) return 10
  if (level <= 4) return 15
  if (level <= 19) return 20
  return 30
}

export function weakHp(level: number): number {
  if (level <= 2) return 10
  if (level <= 5) return 15
  if (level <= 20) return 20
  return 30
}

export function adjustedLevel(level: number, adj: Adjustment | null | undefined): number {
  if (adj === 'elite') return level <= 0 ? level + 2 : level + 1
  if (adj === 'weak') return level === 1 ? -1 : level - 1
  return level
}

/** "2d8+5" + 2 → "2d8+7"; "1d4" − 2 → "1d4-2". */
export function bumpFormula(formula: string, delta: number): string {
  if (!delta) return formula
  if (/^\s*\d+\s*$/.test(formula)) return String(Math.max(0, Number(formula) + delta))
  const m = formula.match(/^(.*?)([+-]\s*\d+)\s*$/)
  const base = m ? m[1].trimEnd() : formula.trim()
  const flat = (m ? Number(m[2].replace(/\s/g, '')) : 0) + delta
  if (!/\d+d\d+/i.test(base)) return String(Math.max(0, flat))
  return flat === 0 ? base : `${base}${flat > 0 ? '+' : ''}${flat}`
}

function adjustStrike(s: Strike, d: number): Strike {
  return { ...s, bonus: s.bonus + d, damage: s.damage.map((r, i) => (i === 0 ? { ...r, formula: bumpFormula(r.formula, d) } : r)) }
}

function mapValues<T extends Record<string, number>>(obj: T, d: number): T {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v + d])) as T
}

/** The entry as a weak/elite version; other kinds and no adjustment pass through unchanged. */
export function applyAdjustment<T extends RulesEntity>(entity: T, adj: Adjustment | null | undefined): T {
  if (!adj) return entity
  const d = adj === 'elite' ? 2 : -2
  if (entity.kind === 'creature') {
    const c = entity as Creature
    const hp = adj === 'elite' ? c.hp + eliteHp(c.level) : Math.max(1, c.hp - weakHp(c.level))
    return {
      ...c,
      level: adjustedLevel(c.level, adj),
      perception: c.perception + d,
      skills: mapValues(c.skills, d),
      ac: c.ac + d,
      saves: mapValues(c.saves, d),
      hp,
      strikes: c.strikes.map(s => adjustStrike(s, d)),
      spellcasting: c.spellcasting.map(sc => ({ ...sc, dc: sc.dc + d, attack: sc.attack === undefined ? undefined : sc.attack + d })),
    } as T
  }
  if (entity.kind === 'hazard') {
    const h = entity as Hazard
    return {
      ...h,
      level: adjustedLevel(h.level, adj),
      stealth: { ...h.stealth, bonus: h.stealth.bonus === null ? null : h.stealth.bonus + d },
      ac: h.ac === undefined ? undefined : h.ac + d,
      saves: h.saves && mapValues(h.saves as Record<string, number>, d),
      hp: h.hp === undefined ? undefined : adj === 'elite' ? h.hp + eliteHp(h.level) : Math.max(1, h.hp - weakHp(h.level)),
      strikes: h.strikes?.map(s => adjustStrike(s, d)),
    } as T
  }
  return entity
}

export function adjustedName(name: string, adj: Adjustment | null | undefined): string {
  return adj ? `${ADJUSTMENT_LABEL[adj]} ${name}` : name
}

export interface TokenStats {
  hpMax: number | null
  ac: number | null
  size: number
  perception: number | null
}

/** What a placed token takes over from its compendium entry. */
export function tokenStats(entity: RulesEntity | null | undefined, adj?: Adjustment | null): TokenStats {
  if (!entity) return { hpMax: null, ac: null, size: 1, perception: null }
  const e = applyAdjustment(entity, adj)
  if (e.kind === 'creature') return { hpMax: e.hp, ac: e.ac, size: SIZE_SQUARES[e.size] ?? 1, perception: e.perception }
  if (e.kind === 'hazard') return { hpMax: e.hp ?? null, ac: e.ac ?? null, size: 1, perception: e.stealth.bonus }
  return { hpMax: null, ac: null, size: 1, perception: null }
}

/**
 * Variables for the initiative formula: `perception`, `level`, `ac`, `hp`,
 * `fort`/`ref`/`will`, ability modifiers and skills by slug (`stealth`, …).
 * Hazards roll Stealth, so `perception` holds their Stealth bonus.
 */
export function rulesScope(entity: RulesEntity | null | undefined, adj?: Adjustment | null): Record<string, number> {
  if (!entity) return {}
  const e = applyAdjustment(entity, adj)
  const scope: Record<string, number> = { level: e.level }
  if (e.kind === 'creature') {
    Object.assign(scope, e.abilities, e.saves)
    for (const [k, v] of Object.entries(e.skills)) scope[k.toLowerCase().replace(/[^a-z0-9]+/g, '_')] = v
    scope.perception = e.perception
    scope.ac = e.ac
    scope.hp = e.hp
  } else if (e.kind === 'hazard') {
    if (e.stealth.bonus !== null) { scope.perception = e.stealth.bonus; scope.stealth = e.stealth.bonus }
    if (e.ac !== undefined) scope.ac = e.ac
    if (e.hp !== undefined) scope.hp = e.hp
    Object.assign(scope, e.saves)
  }
  return scope
}

/** Default PF2e initiative: d20 + Perception (Stealth for hazards). */
export function rollInitiative(entity: RulesEntity | null | undefined, adj?: Adjustment | null, d20 = () => Math.floor(Math.random() * 20) + 1): number {
  return d20() + (tokenStats(entity, adj).perception ?? 0)
}
