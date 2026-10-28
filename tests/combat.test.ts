import { describe, expect, it } from 'vitest'
import { adjustedLevel, applyAdjustment, bumpFormula, rollInitiative, rulesScope, tokenStats } from '~/rules/combat'
import { newRulesEntity } from '~/rules/factory'
import type { Creature, Hazard } from '~/types/rules'

function goblin(level = 1): Creature {
  return {
    ...(newRulesEntity('creature', { name: 'Goblin Warrior', game: 'pf2e' }) as Creature),
    level, size: 'sm', perception: 5, ac: 16, hp: 6,
    saves: { fort: 5, ref: 7, will: 3 },
    skills: { stealth: 8, 'Lore: Goblins': 4 },
    strikes: [{ name: 'Dogslicer', range: 'melee', bonus: 8, traits: [], damage: [{ formula: '1d6', type: 'slashing' }, { formula: '1d4', type: 'fire' }] }],
    spellcasting: [{ name: 'Occult Innate', tradition: 'occult', type: 'innate', dc: 17, attack: 9, spells: [] }],
  }
}

describe('weak/elite', () => {
  it('shifts levels, skipping evenly across 0', () => {
    expect(adjustedLevel(3, 'elite')).toBe(4)
    expect(adjustedLevel(0, 'elite')).toBe(2)
    expect(adjustedLevel(-1, 'elite')).toBe(1)
    expect(adjustedLevel(3, 'weak')).toBe(2)
    expect(adjustedLevel(1, 'weak')).toBe(-1)
    expect(adjustedLevel(3, null)).toBe(3)
  })

  it('bumps flat damage', () => {
    expect(bumpFormula('2d8+5', 2)).toBe('2d8+7')
    expect(bumpFormula('1d4', -2)).toBe('1d4-2')
    expect(bumpFormula('1d6+2', -2)).toBe('1d6')
    expect(bumpFormula('3', -2)).toBe('1')
  })

  it('applies elite: +2 everything, HP by level, first damage roll only', () => {
    const e = applyAdjustment(goblin(), 'elite')
    expect(e.level).toBe(2)
    expect(e.ac).toBe(18)
    expect(e.perception).toBe(7)
    expect(e.saves).toEqual({ fort: 7, ref: 9, will: 5 })
    expect(e.skills.stealth).toBe(10)
    expect(e.hp).toBe(16)
    expect(e.strikes[0].bonus).toBe(10)
    expect(e.strikes[0].damage.map(d => d.formula)).toEqual(['1d6+2', '1d4'])
    expect(e.spellcasting[0]).toMatchObject({ dc: 19, attack: 11 })
  })

  it('applies weak with HP never below 1', () => {
    const w = applyAdjustment(goblin(), 'weak')
    expect(w.level).toBe(-1)
    expect(w.ac).toBe(14)
    expect(w.hp).toBe(1)
    expect(applyAdjustment({ ...goblin(10), hp: 175 }, 'weak').hp).toBe(155)
  })

  it('leaves the source untouched', () => {
    const g = goblin()
    applyAdjustment(g, 'elite')
    expect(g.ac).toBe(16)
  })
})

describe('token stats and initiative', () => {
  it('reads size, HP, AC and Perception', () => {
    expect(tokenStats(goblin())).toEqual({ hpMax: 6, ac: 16, size: 1, perception: 5 })
    expect(tokenStats({ ...goblin(), size: 'huge' }, 'elite')).toEqual({ hpMax: 16, ac: 18, size: 3, perception: 7 })
    expect(tokenStats(null)).toEqual({ hpMax: null, ac: null, size: 1, perception: null })
  })

  it('uses Stealth for hazards', () => {
    const trap = { ...(newRulesEntity('hazard', { name: 'Spear Launcher', game: 'pf2e' }) as Hazard), stealth: { bonus: 7 }, ac: 18, hp: 20 }
    expect(tokenStats(trap).perception).toBe(7)
    expect(rollInitiative(trap, null, () => 10)).toBe(17)
  })

  it('rolls d20 + Perception', () => {
    expect(rollInitiative(goblin(), 'elite', () => 12)).toBe(19)
    expect(rollInitiative(null, null, () => 12)).toBe(12)
  })

  it('builds the formula scope with slugged skill names', () => {
    const s = rulesScope(goblin())
    expect(s).toMatchObject({ perception: 5, level: 1, ac: 16, hp: 6, fort: 5, stealth: 8, lore_goblins: 4 })
  })
})
