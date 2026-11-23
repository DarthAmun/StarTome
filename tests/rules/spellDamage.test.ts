import { describe, expect, it } from 'vitest'
import { addDice, autoHeightenRank, damageText, heighteningOf, spellDamageAt } from '@/domain/rules/spellDamage'
import type { Spell } from '@/domain/rules/types'

type S = Parameters<typeof spellDamageAt>[0]
const spell = (s: Partial<Spell>): S => ({ level: 1, traits: [], spellType: 'spell', ...s })

const fireball = spell({ level: 3, damage: [{ formula: '6d6', type: 'fire' }], heightening: { type: 'interval', interval: 1, damage: ['2d6'] } })
const electricArc = spell({ level: 1, traits: ['cantrip'], damage: [{ formula: '2d4', type: 'electricity' }], heightening: { type: 'interval', interval: 1, damage: ['1d4'] } })

describe('spell damage by rank', () => {
  it('Fireball: 6d6 at 3rd rank, 2d6 more per rank', () => {
    expect(damageText(spellDamageAt(fireball, 3))).toBe('6d6 fire')
    expect(damageText(spellDamageAt(fireball, 4))).toBe('8d6 fire')
    expect(damageText(spellDamageAt(fireball, 5))).toBe('10d6 fire')
    expect(damageText(spellDamageAt(fireball, 10))).toBe('20d6 fire')
  })

  it('never below the spell\'s own rank, never above 10th', () => {
    expect(spellDamageAt(fireball, 1)[0]!.formula).toBe('6d6')
    expect(spellDamageAt(fireball, 12)[0]!.formula).toBe('20d6')
  })

  it('a cantrip with an interval, at half the caster\'s level', () => {
    expect(autoHeightenRank(1)).toBe(1)
    expect(autoHeightenRank(5)).toBe(3)
    expect(autoHeightenRank(20)).toBe(10)
    expect(spellDamageAt(electricArc, 1)[0]!.formula).toBe('2d4')
    expect(spellDamageAt(electricArc, autoHeightenRank(5))[0]!.formula).toBe('4d4')
  })

  it('intervals of 2 ranks, flat parts and several parts', () => {
    const insult = spell({ level: 2, damage: [{ formula: '2d6', type: 'mental' }, { formula: '1', type: 'persistent mental' }], heightening: { type: 'interval', interval: 2, damage: ['4d6', '1'] } })
    expect(damageText(spellDamageAt(insult, 3))).toBe('2d6 mental plus 1 persistent mental')
    expect(damageText(spellDamageAt(insult, 4))).toBe('6d6 mental plus 2 persistent mental')
    expect(damageText(spellDamageAt(insult, 7))).toBe('10d6 mental plus 3 persistent mental')
    const burst = spell({ level: 7, damage: [{ formula: '8d10', type: 'fire' }, { formula: '1d4', type: 'persistent fire' }], heightening: { type: 'interval', interval: 1, damage: ['1d10', ''] } })
    expect(damageText(spellDamageAt(burst, 9))).toBe('10d10 fire plus 1d4 persistent fire')
  })

  it('fixed ranks: the highest at or below the rank cast at', () => {
    const depths = spell({
      level: 6, damage: [{ formula: '4d8', type: 'piercing' }, { formula: '4d4', type: 'void' }],
      heightening: { type: 'fixed', levels: [{ rank: 9, damage: [{ formula: '5d8', type: 'piercing' }, { formula: '5d4', type: 'void' }] }] },
    })
    expect(damageText(spellDamageAt(depths, 8))).toBe('4d8 piercing plus 4d4 void')
    expect(damageText(spellDamageAt(depths, 9))).toBe('5d8 piercing plus 5d4 void')
    expect(damageText(spellDamageAt(depths, 10))).toBe('5d8 piercing plus 5d4 void')
  })

  it('homebrew: read from the "Heightened (+N)" text', () => {
    const brew = spell({ level: 2, damage: [{ formula: '3d8', type: 'cold' }], heightened: [{ trigger: '+1', text: 'The damage increases by 1d8.' }] })
    expect(heighteningOf(brew)).toEqual({ type: 'interval', interval: 1, damage: ['1d8'] })
    expect(spellDamageAt(brew, 4)[0]!.formula).toBe('5d8')
    expect(heighteningOf(spell({ damage: [{ formula: '1d6', type: 'fire' }], heightened: [{ trigger: '3rd', text: 'You can target two creatures.' }] }))).toBeNull()
  })

  it('no damage, nothing to roll', () => {
    expect(spellDamageAt(spell({}), 5)).toEqual([])
  })

  it('adds dice of a size together', () => {
    expect(addDice('6d6', '2d6', 2)).toBe('10d6')
    expect(addDice('1d4+1', '1d4+1', 2)).toBe('3d4+3')
    expect(addDice('2d6', '1d8', 1)).toBe('2d6+1d8')
    expect(addDice('2d6', '', 3)).toBe('2d6')
  })
})
