import { describe, expect, it } from 'vitest'
import {
  formatFacts, formatIwrList, formatNumberMap, formatSenses, formatSpeeds, formatSpellList,
  parseFacts, parseIwr, parseNumberMap, parseSenses, parseSpeeds, parseSpellList, parseTraits, splitList,
} from '~/rules/parse'

describe('rules text parsers', () => {
  it('splits lists outside parentheses', () => {
    expect(splitList('fire 5, physical 10 (except adamantine, cold iron), cold 5'))
      .toEqual(['fire 5', 'physical 10 (except adamantine, cold iron)', 'cold 5'])
  })

  it('normalises traits to slugs', () => {
    expect(parseTraits('Versatile P, Agile,  magical')).toEqual(['versatile-p', 'agile', 'magical'])
  })

  it('round-trips skills', () => {
    const skills = parseNumberMap('Acrobatics +7, stealth 5, Lore: underworld −1')
    expect(skills).toEqual({ acrobatics: 7, stealth: 5, 'lore: underworld': -1 })
    expect(parseNumberMap(formatNumberMap(skills, true))).toEqual(skills)
  })

  it('round-trips weaknesses and resistances', () => {
    const iwr = parseIwr('fire 5, physical 10 (except adamantine, cold iron), area damage 15 (splash)')
    expect(iwr).toEqual([
      { type: 'fire', value: 5 },
      { type: 'physical', value: 10, except: ['adamantine', 'cold iron'] },
      { type: 'area damage', value: 15, note: 'splash' },
    ])
    expect(parseIwr(formatIwrList(iwr))).toEqual(iwr)
  })

  it('round-trips senses and speeds', () => {
    const senses = parseSenses('darkvision, scent (imprecise) 30 feet')
    expect(senses).toEqual([{ type: 'darkvision' }, { type: 'scent', acuity: 'imprecise', range: 30 }])
    expect(parseSenses(formatSenses(senses))).toEqual(senses)
    const speeds = parseSpeeds('25 feet, fly 40, swim 20')
    expect(speeds).toEqual({ land: 25, fly: 40, swim: 20 })
    expect(parseSpeeds(formatSpeeds(speeds))).toEqual(speeds)
  })

  it('round-trips spell lists and keeps known spell ids', () => {
    const spells = parseSpellList('3rd: fireball, haste; cantrips: detect magic; 1: fear (×2)', [{ name: 'Fireball', rank: 3, spellId: 'fvtt:pf2e:spells-srd:abc' }])
    expect(spells).toEqual([
      { spellId: 'fvtt:pf2e:spells-srd:abc', name: 'fireball', rank: 3 },
      { name: 'haste', rank: 3 },
      { name: 'detect magic', rank: 0 },
      { name: 'fear', rank: 1, uses: 2 },
    ])
    // formatting lists ranks highest first, so compare contents, not order
    const roundTrip = parseSpellList(formatSpellList(spells), spells)
    expect(roundTrip).toHaveLength(spells.length)
    expect(roundTrip).toEqual(expect.arrayContaining(spells))
    expect(formatSpellList(spells)).toBe('3: fireball, haste; 1: fear (×2); cantrips: detect magic')
  })

  it('round-trips reference facts', () => {
    const facts = parseFacts('HP: 8\nSize: Medium\nLanguages: Common, Goblin\nEmpty:')
    expect(facts).toEqual({ HP: '8', Size: 'Medium', Languages: ['Common', 'Goblin'] })
    expect(parseFacts(formatFacts(facts))).toEqual(facts)
  })
})
