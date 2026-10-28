import { describe, expect, it } from 'vitest'
import { convertLegacyRecord, legacyText, parseAbilitiesText, parseFavoredWeapon, traitSlug } from '~/converters/legacy/records'
import type { Creature, Hazard, Item, ReferenceEntry, Spell } from '~/types/rules'

const rec = (entityTypeId: string, name: string, data: Record<string, unknown>) => ({ id: 7, entityTypeId, name, data: JSON.stringify(data) })

describe('legacy record conversion', () => {
  it('converts pf2etools markup and trait spellings', () => {
    expect(legacyText('Cast {@spell fireball|CRB} as {@as 2}, {@dc 18} or {@trait fire}')).toBe('Cast {{spell: fireball}} as ◆◆, DC 18 or fire')
    expect(traitSlug('two-hand <d10>')).toBe('two-hand-d10')
    expect(traitSlug('reach <10 feet>')).toBe('reach-10')
    expect(traitSlug('Versatile <p>')).toBe('versatile-p')
    expect(parseFavoredWeapon("{'weapons': ['falcata|TV']}")).toBe('falcata')
    expect(parseFavoredWeapon('longsword')).toBe('longsword')
  })

  it('parses strikes and abilities out of the abilities text', () => {
    const { strikes, actions } = parseAbilitiesText([
      '**greataxe** Melee +14/+9/+4 to hit (reach <10 feet>, sweep)',
      '  Damage: 1d12+8 slashing',
      '',
      '**wax glob** Ranged +8/+3/-2 to hit (magical, range increment <20 feet>)',
      '  Damage: 1d4 persistent damage plus Grab',
      '',
      '---',
      '',
      '**Natural Cunning**',
      'Never gets lost.',
      '',
      '**Axe Swipe** ◆◆',
      'Two foes at once.',
      '',
      '**Ferocity** ↺ (emotion)',
      'Stays up.',
    ].join('\n'))
    expect(strikes).toEqual([
      { name: 'greataxe', range: 'melee', bonus: 14, traits: ['reach-10', 'sweep'], damage: [{ formula: '1d12+8', type: 'slashing' }] },
      { name: 'wax glob', range: 'ranged', bonus: 8, traits: ['magical', 'range-increment-20'], damage: [{ formula: '1d4', type: 'persistent' }], effects: ['Grab'] },
    ])
    expect(actions.map(a => [a.name, a.cost, a.traits, a.text])).toEqual([
      ['Natural Cunning', null, [], 'Never gets lost.'],
      ['Axe Swipe', 2, [], 'Two foes at once.'],
      ['Ferocity', 'reaction', ['emotion'], 'Stays up.'],
    ])
  })

  it('fixes creature size and alignment from the traits', () => {
    const c = convertLegacyRecord(rec('creature', 'Brute', {
      level: 4, rarity: 'Common', size: 'Medium', traits: ['ce', 'large', 'humanoid'],
      abilityScores: { STR: 6, DEX: 0, CON: 3, INT: -2, WIS: 2, CHA: -1 }, hp: { current: 70, max: 70 }, ac: 20, hardness: 0,
      speed: { Land: 25, Swim: 10 }, saves: { Fortitude: 13, Reflex: 8, Will: 10 }, immunities: [], resistances: 'fire 5',
      weaknesses: 'cold iron 3', perception: 12, senses: ['darkvision'], languages: ['jotun'], skills: { Athletics: 14 },
      abilities: '', spells: '__\n**0:** detect magic, shield\n**3:** fireball, harm ×3', source: 'Bestiary p.237',
    })) as Creature
    expect(c).toMatchObject({
      origin: 'legacy', kind: 'creature', size: 'lg', traits: ['humanoid'], level: 4, hp: 70, ac: 20,
      abilities: { str: 6, dex: 0, con: 3, int: -2, wis: 2, cha: -1 }, saves: { fort: 13, ref: 8, will: 10 },
      speeds: { land: 25, swim: 10 }, skills: { athletics: 14 }, senses: [{ type: 'darkvision' }],
      resistances: [{ type: 'fire', value: 5 }], weaknesses: [{ type: 'cold iron', value: 3 }],
      publication: { title: 'Bestiary', remaster: false }, legacy: { recordId: 7, source: 'Bestiary p.237' },
    })
    expect(c.hardness).toBeUndefined()
    expect(c.spellcasting[0].spells).toEqual([
      { name: 'detect magic', rank: 0 }, { name: 'shield', rank: 0 }, { name: 'fireball', rank: 3 }, { name: 'harm', rank: 3, uses: 3 },
    ])
  })

  it('converts homebrew items with price, bulk and weapon data', () => {
    const i = convertLegacyRecord(rec('item', 'Eiserne Schneide', {
      itemType: 'Weapon', level: 5, rarity: 'Unique', price: { amount: 2, denomination: 'gp' }, bulk: 'L', traits: ['monk', 'two-hand <d10>'],
      hands: '1', damage: [{ dice: '1d6', type: 'S', condition: '' }], weaponCategory: 'Martial', weaponGroup: 'Sword',
      description: 'Eine Klinge.', activation: '', source: 'Selfmade', carried: 'Me',
    })) as Item
    expect(i).toMatchObject({
      kind: 'item', category: 'weapon', level: 5, rarity: 'unique', price: { cp: 200 }, bulk: 1, hands: '1',
      traits: ['monk', 'two-hand-d10'], weapon: { category: 'martial', group: 'sword', damage: { dice: 1, die: 'd6', type: 'slashing' } },
      description: 'Eine Klinge.', legacy: { recordId: 7, source: 'Selfmade', carried: 'Me' },
    })
    expect((convertLegacyRecord(rec('item', 'Kit', { itemType: 'Other', bulk: 'varies by armor' })) as Item)).toMatchObject({ bulk: null, bulkNote: 'varies by armor' })
  })

  it('converts spells, hazards and deities', () => {
    const s = convertLegacyRecord(rec('spell', 'Burning Hands', {
      spellLevel: '1', spellType: 'Spell', tradition: ['Arcane', 'Primal'], cast: 'two', castNote: '', traits: ['fire'],
      area: '15-foot cone', savingThrow: 'Reflex (basic)', description: 'Flames.', heightening: [{ trigger: '+1', effect: '+2d6.' }],
    })) as Spell
    expect(s).toMatchObject({ level: 1, cast: 2, traditions: ['arcane', 'primal'], defense: { save: 'ref', basic: true }, heightened: [{ trigger: '+1', text: '+2d6.' }] })
    const cantrip = convertLegacyRecord(rec('spell', 'Spark', { spellLevel: 'Cantrip', spellType: 'Cantrip', cast: 'one', savingThrow: 'AC' })) as Spell
    expect(cantrip).toMatchObject({ level: 1, traits: ['cantrip'], defense: { ac: true } })

    const h = convertLegacyRecord(rec('hazard', 'Falling Ceiling', {
      level: 1, complexity: 'Simple', stealth: '+10 (trained)', disable: 'DC 18 Thievery', ac: 0, saves: { Fortitude: 0, Reflex: 0, Will: 0 },
      hp: { current: 0, max: 0 }, hardness: 0, immunities: [], effect: 'A heavy trap.\n\n**Falling Stones** ↺\nStones fall.', routine: '', reset: '',
    })) as Hazard
    expect(h).toMatchObject({ complex: false, stealth: { bonus: 10, note: 'trained' }, description: 'A heavy trap.', actions: [{ name: 'Falling Stones', cost: 'reaction' }] })
    expect(h.ac).toBeUndefined()
    expect(h.saves).toBeUndefined()

    const d = convertLegacyRecord(rec('deity', 'Kitumu', {
      edicts: 'feed nature', anathema: '', domains: ['swarm'], divineFont: ['Harm'], favoredWeapon: "{'weapons': ['dagger']}", spells: '**1:** sleep',
    })) as ReferenceEntry
    expect(d.facts).toEqual({ edicts: 'feed nature', domains: ['swarm'], 'divine font': ['Harm'], 'favored weapon': 'dagger' })
  })
})
