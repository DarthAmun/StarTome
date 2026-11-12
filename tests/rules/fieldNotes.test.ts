import { describe, expect, it } from 'vitest'
import { averageDamage, columnOf } from '@/domain/rules/creatureBuilding'
import { fieldNotes, fieldNotesText, subjectName } from '@/domain/rules/fieldNotes'
import type { Creature } from '@/domain/rules/types'

function creature(p: Partial<Creature> = {}): Creature {
  return {
    id: 'test-beast', origin: 'user', kind: 'creature', game: 'pf2e', name: 'swamp drake', sortName: 'swamp drake',
    level: 8, rarity: 'common', traits: ['dragon', 'amphibious'], description: '', sourceRefs: [],
    size: 'lg', perception: 16, senses: [], languages: [], skills: {},
    abilities: { str: 6, dex: 2, con: 5, int: -2, wis: 2, cha: 0 },
    ac: 27, saves: { fort: 18, ref: 15, will: 14 }, hp: 140,
    immunities: [], weaknesses: [], resistances: [], speeds: { land: 30, swim: 30 },
    strikes: [{ name: 'Jaws', range: 'melee', bonus: 20, traits: ['reach-10'], damage: [{ formula: '2d10+9', type: 'piercing' }], effects: ['Grab'] }],
    actions: [
      { name: 'Attack of Opportunity', cost: 'reaction', section: 'defensive', traits: [], text: 'It lashes out.' },
      { name: 'Breath Weapon', cost: 2, section: 'offensive', traits: ['acid'], frequency: 'once per minute', text: 'It breathes **acid** in a @Template[cone|distance:30].' },
    ],
    spellcasting: [], inventory: [],
    ...p,
  } as Creature
}

describe('columnOf', () => {
  it('rates values against the table for the level', () => {
    // Level 8 saves: extreme 21, high 19, moderate 16, low 13, terrible 11
    expect(columnOf('fort', 21, 8)).toBe('extreme')
    expect(columnOf('fort', 18, 8)).toBe('high')
    expect(columnOf('ref', 15, 8)).toBe('moderate')
    expect(columnOf('will', 14, 8)).toBe('low')
    expect(columnOf('will', 5, 8)).toBe('terrible')
    expect(columnOf('will', 40, 8)).toBe('extreme')
  })

  it('handles the tables without every column', () => {
    expect(columnOf('ac', 10, 8)).toBe('low')          // AC has no terrible column
    expect(columnOf('hp', 170, 8)).toBe('high')        // high 173–165, moderate 139–131
    expect(columnOf('hp', 100, 8)).toBe('low')
    expect(columnOf('spell', 29, 8)).toBe('extreme')
    expect(columnOf('spell', 15, 8)).toBe('low')       // well under moderate (22)
    expect(columnOf('damage', averageDamage('2d10+9'), 8)).toBe('high')
  })

  it('averages damage formulas', () => {
    expect(averageDamage('2d8+5')).toBe(14)
    expect(averageDamage('1d6-1')).toBe(2.5)
    expect(averageDamage('1d6+2 1d4')).toBe(8)
  })
})

describe('fieldNotes', () => {
  it('gives the four lines in page order', () => {
    expect(fieldNotes(creature()).map(n => n.label)).toEqual(['Identity', 'Defenses', 'Weaknesses', 'Abilities'])
  })

  it('names the weakest and strongest save without numbers', () => {
    const def = fieldNotes(creature()).find(n => n.line === 'defenses')!.text
    expect(def).toContain('The swamp drake is low on willpower but can take a beating.')
    expect(def).toContain('Effects that target its Will are your best bet')
    expect(def).not.toMatch(/\d/)
  })

  it('says so when every save is the same', () => {
    const def = fieldNotes(creature({ saves: { fort: 16, ref: 16, will: 16 } }))[1]!.text
    expect(def).toContain('no weak spot among its saves')
  })

  it('gives the exact level and traits in Identity', () => {
    const id = fieldNotes(creature({ rarity: 'uncommon' }))[0]!.text
    expect(id).toBe('The swamp drake is a level 8 Large creature with the dragon and amphibious traits. It is an uncommon creature.')
  })

  it('describes weaknesses in words only', () => {
    const w = fieldNotes(creature({
      weaknesses: [{ type: 'cold-iron', value: 10 }],
      resistances: [{ type: 'fire', value: 7, except: ['magical'] }],
      immunities: ['paralyzed', 'sleep'],
    }))[2]!.text
    expect(w).toBe('The swamp drake is badly hurt by cold iron. It resists fire (except magical). It is immune to paralyzed and sleep.')
    expect(fieldNotes(creature())[2]!.text).toContain('no special weaknesses, resistances or immunities')
  })

  it('describes attacks, reactions, abilities and movement', () => {
    const a = fieldNotes(creature())[3]!.text
    expect(a).toContain('Jaws (melee, reach 10): hits often and deals heavy piercing damage, plus Grab.')
    expect(a).toContain('Watch out for its reaction: Attack of Opportunity.')
    expect(a).toContain('Breath Weapon (2 actions, limited uses)')
    expect(a).toContain('It can swim.')
    expect(a).not.toContain('+20')
  })

  it('describes spellcasting by tradition and how hard it is to resist', () => {
    const a = fieldNotes(creature({
      spellcasting: [{ name: 'Arcane Innate Spells', tradition: 'arcane', type: 'innate', dc: 26, spells: [{ name: 'fireball', rank: 3 }, { name: 'light', rank: 1 }] }],
    }))[3]!.text
    expect(a).toContain('It casts innate arcane spells that are hard to resist, including fireball and light.')
  })

  it('adds the stat block text only when asked', () => {
    expect(fieldNotes(creature())[3]!.text).not.toContain('Melee Jaws')
    const a = fieldNotes(creature(), { statBlockText: true })[3]!.text
    expect(a).toContain('Melee Jaws +20 (reach 10), Damage 2d10+9 piercing plus Grab')
    expect(a).toContain('Breath Weapon [2 actions] (acid) It breathes acid in a cone.')
  })

  it('builds the copy-all text and subject names', () => {
    expect(subjectName('The Wyvern of Hollow Pass')).toBe('The Wyvern of Hollow Pass')
    expect(subjectName('goblin warrior')).toBe('The goblin warrior')
    const all = fieldNotesText('Swamp Drake', fieldNotes(creature()))
    expect(all.startsWith('Swamp Drake: field notes\n\nIdentity\n')).toBe(true)
  })
})
