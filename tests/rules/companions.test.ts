import { describe, expect, it } from 'vitest'
import { blankCompanionBase, companionStats, customizationAllowance, stageLabel, type CompanionBuild } from '@/domain/rules/companions'

/** A test chassis (numbers like the book's sturdier chassis, not a copy of one). */
const chassis = (): CompanionBuild => ({
  kind: 'robot',
  base: {
    typeName: 'Test chassis', size: 'med', hp: 8, skill: 'intimidation', senses: ['low-light vision'], speeds: { land: 30 },
    abilities: { str: 3, dex: 1, con: 2, int: -4, wis: 2, cha: -1 },
    attacks: [{ name: 'fist', range: 'melee', die: 'd8', type: 'bludgeoning', traits: [] }],
    supportBenefit: 'Helps.', advancedManeuver: { name: 'Flip', cost: 2, text: 'Knocks prone.' },
  },
  stage: 'young', path: null, specialization: null, customizations: [],
})

describe('robot companions', () => {
  it('young (commercial) at level 1', () => {
    const s = companionStats(chassis(), 1)
    expect(s.hp).toBe(8 + (6 + 2) * 1)
    expect(s.ac).toBe(10 + 1 + 3)
    expect(s.saves).toEqual({ fort: 5, ref: 4, will: 5 })
    expect(s.perception).toBe(5)
    expect(s.strikes[0]).toMatchObject({ bonus: 6, damage: [{ formula: '1d8+3', type: 'bludgeoning' }] })
    expect(s.skills.intimidation).toBe(-1 + 3)
    expect(s.weaknesses).toEqual([{ type: 'electricity', value: 1 }])
    expect(s.immunities).toContain('mental')
    expect(s.traits).toEqual(['construct', 'robot', 'tech', 'minion'])
    expect(s.actions.map(a => a.name)).not.toContain('Flip')
  })

  it('mature (tactical) at level 5: +1 attributes, expert saves, two dice; robots keep their size', () => {
    const s = companionStats({ ...chassis(), stage: 'mature' }, 5)
    expect(s.abilities).toMatchObject({ str: 4, dex: 2, con: 3, wis: 3 })
    expect(s.hp).toBe(8 + 9 * 5)
    expect(s.saves.fort).toBe(3 + 5 + 4)
    expect(s.strikes[0]).toMatchObject({ bonus: 4 + 7, damage: [{ formula: '2d8+4' }] })
    // the type's skill was intimidation: trained → expert
    expect(s.skills.intimidation).toBe(-1 + 5 + 4)
    expect(s.skills.stealth).toBe(2 + 5 + 2)
    expect(s.size).toBe('med')
    expect(s.weaknesses[0].value).toBe(3)
  })

  it('burly (advanced) at level 8: +2 Str, expert Athletics, +3 damage, magical, the maneuver', () => {
    const s = companionStats({ ...chassis(), stage: 'burly' }, 8)
    expect(s.abilities).toMatchObject({ str: 6, dex: 3, con: 4, wis: 4 })
    expect(s.strikes[0]).toMatchObject({ bonus: 6 + 10, damage: [{ formula: '2d8+9' }] })
    expect(s.strikes[0].traits).toContain('magical')
    expect(s.skills.athletics).toBe(6 + 8 + 4)
    expect(s.actions.map(a => a.name)).toContain('Flip')
  })

  it('specialized (superior) drone with customizations at level 14', () => {
    const s = companionStats({ ...chassis(), kind: 'drone', stage: 'specialized', path: 'deft', specialization: 'racer', customizations: ['armored plates', 'flier', 'grounded', 'hardened chassis'] }, 14)
    // deft path then specialized: Dex 1+1+2+1 = 5
    expect(s.abilities.dex).toBe(5)
    expect(s.abilities.con).toBe(2 + 1 + 1 + 1)
    expect(s.ac).toBe(10 + 5 + (14 + 2) + 2)
    expect(s.saves.fort).toBe(5 + 14 + 8)        // racer: legendary Fortitude
    expect(s.saves.ref).toBe(5 + 14 + 6)         // master
    expect(s.speeds).toEqual({ land: 40, fly: 20 })
    expect(s.weaknesses).toEqual([])
    expect(s.hp).toBe(8 + (6 + 5 + 2) * 14)
    // Str 3 + 1 (mature) + 1 (deft) = 5, plus the specialized deft bonus 4
    expect(s.strikes[0].damage[0].formula).toBe("3d8+9")
  })

  it('stage names and customization counts', () => {
    expect(stageLabel('robot', 'mature')).toBe('tactical')
    expect(stageLabel('drone', 'burly')).toBe('advanced (burly)')
    expect(stageLabel('animal', 'specialized', 'deft')).toBe('specialized (deft)')
    expect(customizationAllowance('robot', 'young')).toBe(1)
    expect(customizationAllowance('drone', 'young')).toBe(3)
    expect(customizationAllowance('animal', 'burly')).toBe(0)
  })
})

describe('animal companions', () => {
  it('grow a size at mature and burly while Medium or smaller, and have no construct traits', () => {
    const base = { ...blankCompanionBase('animal'), size: 'sm' as const }
    expect(companionStats({ kind: 'animal', base, stage: 'young', customizations: [] }, 1).size).toBe('sm')
    expect(companionStats({ kind: 'animal', base, stage: 'mature', customizations: [] }, 4).size).toBe('med')
    expect(companionStats({ kind: 'animal', base, stage: 'burly', customizations: [] }, 7).size).toBe('lg')
    const s = companionStats({ kind: 'animal', base, stage: 'young', customizations: [] }, 1)
    expect(s.immunities).toEqual([])
    expect(s.weaknesses).toEqual([])
    expect(s.traits).toEqual(['animal', 'minion'])
  })
})
