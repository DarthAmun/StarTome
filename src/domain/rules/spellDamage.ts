/**
 * A spell's damage at the rank it is cast at. Foundry heightens damage two
 * ways: by an interval ("Heightened (+1) The damage increases by 2d6") or at
 * fixed ranks ("Heightened (9th) 5d8 piercing and 5d4 void"). Homebrew spells
 * without that data are read from their "Heightened (+N)" text. Cantrips and
 * focus spells are cast at half the caster's level, rounded up (Player Core
 * "Heightened Spells"). Pure.
 */
import { parseExpression, type DiceTerm } from './rolls'
import type { DamageRoll, Spell, SpellHeightening } from './types'

type SpellLike = Pick<Spell, 'level' | 'traits' | 'damage' | 'heightened' | 'heightening' | 'spellType'>

export const MAX_RANK = 10

/** Cantrips and focus spells are heightened to half the caster's level, rounded up. */
export function autoHeightenRank(level: number): number {
  return Math.max(1, Math.min(MAX_RANK, Math.ceil(level / 2)))
}

export function heightensAutomatically(spell: Pick<Spell, 'traits' | 'spellType'>): boolean {
  return spell.traits.includes('cantrip') || spell.spellType === 'focus'
}

/** The lowest rank the spell can be cast at (a cantrip's is 1). */
export function baseRank(spell: Pick<Spell, 'level'>): number {
  return Math.max(1, Math.min(MAX_RANK, spell.level || 1))
}

/** Adds `add` to `formula` `times` times, dice of a size together: ("6d6", "2d6", 2) → "10d6". */
export function addDice(formula: string, add: string, times: number): string {
  const base = parseExpression(formula), extra = add.trim() ? parseExpression(add) : null
  if (!base || !extra || times <= 0) return formula
  const dice: DiceTerm[] = base.dice.map(d => ({ ...d }))
  for (const d of extra.dice) {
    const same = dice.find(x => x.sides === d.sides && x.sign === d.sign)
    if (same) same.count += d.count * times
    else dice.push({ ...d, count: d.count * times })
  }
  return formatExpression(dice, base.flat + extra.flat * times)
}

function formatExpression(dice: DiceTerm[], flat: number): string {
  const parts = dice.filter(d => d.count > 0).map((d, i) => `${d.sign < 0 ? '-' : i ? '+' : ''}${d.count}d${d.sides}`)
  if (flat) parts.push(`${flat < 0 ? '-' : parts.length ? '+' : ''}${Math.abs(flat)}`)
  return parts.join('') || '0'
}

/** Foundry's heightening, or what the "Heightened (+N)" text says ("… increases by 1d6"). */
export function heighteningOf(spell: SpellLike): SpellHeightening | null {
  if (spell.heightening) return spell.heightening
  const parts = spell.damage?.length ?? 0
  for (const h of spell.heightened ?? []) {
    const step = /^\+(\d+)$/.exec(h.trigger.trim())
    const dice = /increases? by (\d*d\d+(?:\s*[+-]\s*\d+)?)/i.exec(h.text)
    if (step && dice && parts) return { type: 'interval', interval: Number(step[1]), damage: [dice[1]!.replace(/\s/g, ''), ...Array<string>(parts - 1).fill('')] }
  }
  return null
}

/** The spell's damage parts cast at `rank`; [] for a spell without damage. */
export function spellDamageAt(spell: SpellLike, rank: number): DamageRoll[] {
  const base = spell.damage ?? []
  if (!base.length) return []
  const from = baseRank(spell), at = Math.max(from, Math.min(MAX_RANK, rank))
  const h = heighteningOf(spell)
  if (!h || at === from) return base.map(d => ({ ...d }))
  if (h.type === 'fixed') {
    const level = [...h.levels].filter(l => l.rank <= at).sort((a, b) => b.rank - a.rank)[0]
    return (level?.damage ?? base).map(d => ({ ...d }))
  }
  const steps = h.interval > 0 ? Math.floor((at - from) / h.interval) : 0
  return base.map((d, i) => ({ ...d, formula: addDice(d.formula, h.damage[i] ?? '', steps) }))
}

/** "6d6 fire plus 2d6 persistent fire". */
export function damageText(parts: DamageRoll[]): string {
  return parts.map(d => `${d.formula}${d.type ? ` ${d.type}` : ''}`).join(' plus ')
}
