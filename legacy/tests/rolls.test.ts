import { describe, expect, it } from 'vitest'
import { basicSaveDamage, deadlyDice, twoHandFormula, mapPenalty, parseExpression, rollCheck, rollExpression, rollStrikeDamage, strikeModifier, traitDie } from '~/rules/rolls'
import { resolveStatRoll } from '~/composables/useDiceRoll'
import type { Strike } from '~/types/rules'

/** Fixed faces per call: each call returns the next value as a fraction of the die rolled. */
function seq(...pairs: [number, number][]) {
  let i = 0
  return () => { const [v, sides] = pairs[i++]; return (v - 1) / sides + 1e-9 }
}

const sword = (traits: string[] = []): Strike => ({
  name: 'Longsword', range: 'melee', bonus: 12, traits,
  damage: [{ formula: '2d8+5', type: 'slashing' }, { formula: '1d6', type: 'fire' }],
})

describe('dice expressions', () => {
  it('parse dice, signs and flat bonuses, and reject text', () => {
    expect(parseExpression('2d6+1d4-1')).toEqual({ dice: [{ count: 2, sides: 6, sign: 1 }, { count: 1, sides: 4, sign: 1 }], flat: -1 })
    expect(parseExpression('d20')).toEqual({ dice: [{ count: 1, sides: 20, sign: 1 }], flat: 0 })
    expect(parseExpression('1D8 + 3')).toEqual({ dice: [{ count: 1, sides: 8, sign: 1 }], flat: 3 })
    expect(parseExpression('5')).toEqual({ dice: [], flat: 5 })
    expect(parseExpression('fire')).toBeNull()
    expect(parseExpression('')).toBeNull()
  })

  it('roll every die and add the flat bonus', () => {
    const r = rollExpression('2d6+1d4-1', seq([3, 6], [5, 6], [2, 4]))!
    expect(r.total).toBe(9)
    expect(r.breakdown).toBe('2d6 [3, 5] + 1d4 [2] − 1')
  })
})

describe('checks', () => {
  it('give the degree against a DC, with natural 20 and 1 a step up or down', () => {
    expect(rollCheck(10, 20, seq([10, 20]))).toMatchObject({ d20: 10, total: 20, degree: 'success' })
    expect(rollCheck(10, 20, seq([20, 20]))).toMatchObject({ total: 30, degree: 'critical-success' })
    expect(rollCheck(10, 30, seq([20, 20]))).toMatchObject({ total: 30, degree: 'critical-success' })
    expect(rollCheck(15, 20, seq([1, 20]))).toMatchObject({ total: 16, degree: 'critical-failure' })
    expect(rollCheck(5, null, seq([7, 20]))).toMatchObject({ total: 12, degree: null })
  })
})

describe('Strikes', () => {
  it('take the multiple attack penalty, smaller for agile', () => {
    expect([0, 1, 2].map(s => strikeModifier(sword(), s as 0 | 1 | 2))).toEqual([12, 7, 2])
    expect([0, 1, 2].map(s => strikeModifier(sword(['agile']), s as 0 | 1 | 2))).toEqual([12, 8, 4])
    expect(mapPenalty(sword(), 0)).toBe(-0)
  })

  it('roll normal damage per part', () => {
    const r = rollStrikeDamage(sword(), false, seq([4, 8], [6, 8], [3, 6]))
    expect(r.parts.map(p => [p.type, p.total])).toEqual([['slashing', 15], ['fire', 3]])
    expect(r.total).toBe(18)
  })

  it('double every part on a critical hit', () => {
    const r = rollStrikeDamage(sword(), true, seq([4, 8], [6, 8], [3, 6]))
    expect(r.parts.map(p => p.total)).toEqual([30, 6])
    expect(r.parts[0].breakdown).toBe('(2d8 [4, 6] + 5) × 2')
  })

  it('add deadly dice after doubling, more with more weapon dice', () => {
    const r = rollStrikeDamage(sword(['deadly-d10']), true, seq([4, 8], [6, 8], [3, 6], [7, 10]))
    expect(r.parts[0].total).toBe(30 + 7)
    expect(r.notes).toEqual(['deadly d10: +7'])
    expect([1, 2, 3, 4].map(deadlyDice)).toEqual([1, 1, 2, 3])
    // No crit, no deadly
    expect(rollStrikeDamage(sword(['deadly-d10']), false, seq([4, 8], [6, 8], [3, 6])).notes).toEqual([])
  })

  it('raise the weapon dice with fatal and add one more die', () => {
    const r = rollStrikeDamage(sword(['fatal-d12']), true, seq([10, 12], [11, 12], [3, 6], [12, 12]))
    // (10 + 11 + 5) × 2 + 12
    expect(r.parts[0].total).toBe(64)
    expect(r.parts[1].total).toBe(6)
    expect(traitDie(['fatal-d12'], 'fatal')).toBe(12)
    expect(traitDie(['agile'], 'fatal')).toBeNull()
  })

  it('leave crit traits out in a game that has none', () => {
    const r = rollStrikeDamage(sword(['deadly-d10']), true, seq([4, 8], [6, 8], [3, 6]), [])
    expect(r.notes).toEqual([])
  })
})

describe('stat-block rolls without a target (dice panel)', () => {
  it('show a check with its d20 and a natural 20', () => {
    expect(resolveStatRoll({ kind: 'check', label: 'Goblin: Perception', modifier: -1 }, 'pf2e', seq([20, 20]))).toMatchObject({
      label: 'Goblin: Perception', total: 19, breakdown: 'd20 [20] − 1', isCrit: true, isFail: false,
    })
  })

  it('show damage per type, critical when asked', () => {
    const r = resolveStatRoll({ kind: 'damage', label: 'Longsword damage', strike: sword(['deadly-d10']), critical: true }, 'pf2e', seq([4, 8], [6, 8], [3, 6], [7, 10]))
    expect(r.total).toBe(37 + 6)
    expect(r.breakdown).toBe('(2d8 [4, 6] + 5) × 2 + 1d10 [7] slashing + (1d6 [3]) × 2 fire')
    expect(r.outcome).toBe('Critical')
    expect(r.detail).toBe('deadly d10: +7')
  })
})

describe('basic saves', () => {
  it('take none, half (rounded down), full or double damage', () => {
    expect((['critical-success', 'success', 'failure', 'critical-failure'] as const).map(d => basicSaveDamage(25, d))).toEqual([0, 12, 25, 50])
    expect(basicSaveDamage(1, 'success')).toBe(0)
  })
})

describe('two-hand', () => {
  const bastard: Strike = { name: 'Bastard Sword', range: 'melee', bonus: 18, traits: ['magical', 'two-hand-d12'], damage: [{ formula: '1d8+10', type: 'slashing' }] }

  it('changes the weapon dice when wielded in two hands', () => {
    expect(twoHandFormula(bastard)).toBe('1d12+10')
    expect(twoHandFormula({ ...bastard, traits: ['magical'] })).toBeNull()
    const r = rollStrikeDamage(bastard, false, seq([11, 12]), ['deadly', 'fatal'], { twoHand: true })
    expect(r.total).toBe(21)
    expect(r.parts[0].breakdown).toBe('1d12 [11] + 10')
    // One-handed it stays a d8
    expect(rollStrikeDamage(bastard, false, seq([8, 8])).parts[0].breakdown).toBe('1d8 [8] + 10')
  })

  it('doubles in two hands on a crit, and fatal still sets the die', () => {
    expect(rollStrikeDamage(bastard, true, seq([12, 12]), ['deadly', 'fatal'], { twoHand: true }).total).toBe(44)
    const both: Strike = { ...bastard, traits: ['two-hand-d10', 'fatal-d12'] }
    const r = rollStrikeDamage(both, true, seq([12, 12], [5, 12]), ['deadly', 'fatal'], { twoHand: true })
    // (12 + 10) × 2 + fatal 5
    expect(r.total).toBe(49)
    expect(r.notes).toEqual(['two-handed d10', 'fatal d12: +5'])
  })
})

