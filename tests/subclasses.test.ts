import { describe, expect, it } from 'vitest'
import { convertFoundryDoc, type FoundryDoc } from '~/converters/foundry'
import { checkHomebrewEntry } from '~/rules/homebrew'
import { classOptionGroups, featuresByLevel, tagLabel } from '~/rules/subclasses'
import type { Feat, ReferenceEntry } from '~/types/rules'

// Shapes as in the sf2e release's classes / class-features packs
const ctx = { game: 'sf2e' as const, version: '1.6.1', pack: 'class-features', resolveUuid: () => null, localize: () => null }
const doc = (d: Partial<FoundryDoc> & { system: any }) => ({ _id: d.name, ...d }) as FoundryDoc
const convert = <T>(d: FoundryDoc) => convertFoundryDoc(d, ctx).entity as T

const connection = doc({
  name: 'Connection', type: 'feat',
  system: {
    category: 'classfeature', level: { value: 1 }, traits: { value: ['mystic'], rarity: 'common' },
    rules: [
      { key: 'ChoiceSet', flag: 'connection', choices: { filter: ['item:tag:mystic-connection'] } },
      { key: 'GrantItem', uuid: '{item|flags.system.rulesSelections.connection}' },
    ],
  },
})
const elemental = doc({
  name: 'Elemental', type: 'feat',
  system: { category: 'classfeature', level: { value: 1 }, traits: { value: ['mystic'], rarity: 'common', otherTags: ['mystic-connection'] } },
})
const mystic = doc({
  name: 'Mystic', type: 'class',
  system: {
    hp: 6, traits: { value: [], rarity: 'common' },
    items: { a: { name: 'Mystic Bond', level: 1 }, b: { name: 'Expert Spellcaster', level: 7 }, c: { name: 'Connection', level: 1 } },
  },
})

const feat = (name: string, extra: Partial<Feat>): Feat => ({
  id: name, origin: 'user', kind: 'feat', game: 'sf2e', name, sortName: name.toLowerCase(), level: 1, rarity: 'common',
  traits: ['conduit'], description: '', sourceRefs: [], createdAt: '', updatedAt: '',
  category: 'classfeature', cost: null, prerequisites: [], ...extra,
})

describe('subclasses', () => {
  it('converts Foundry choices, options and a class\'s features', () => {
    expect(convert<Feat>(connection).choices).toEqual(['mystic-connection'])
    expect(convert<Feat>(elemental).optionOf).toEqual(['mystic-connection'])
    expect(convert<ReferenceEntry>(mystic).features).toEqual([
      { level: 1, name: 'Connection' }, { level: 1, name: 'Mystic Bond' }, { level: 7, name: 'Expert Spellcaster' },
    ])
  })

  it('groups a class\'s options under the feature that chooses them', () => {
    const groups = classOptionGroups({ name: 'Mystic' }, [convert<Feat>(connection), convert<Feat>(elemental)])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ tag: 'mystic-connection', label: 'Connection', level: 1 })
    expect(groups[0].options.map(o => o.name)).toEqual(['Elemental'])
  })

  it('groups homebrew options by their class-prefixed tag without a choosing feature', () => {
    const groups = classOptionGroups({ name: 'Conduit' }, [
      feat('Void Domain', { optionOf: ['conduit-domain'] }),
      feat('Fire Domain', { optionOf: ['conduit-domain'] }),
      feat('Stray', { optionOf: ['melee'] }),
    ])
    expect(groups.map(g => [g.label, g.options.map(o => o.name)])).toEqual([['Domain', ['Fire Domain', 'Void Domain']]])
    expect(tagLabel('exemplar-weapon-ikon', 'exemplar')).toBe('Weapon Ikon')
  })

  it('lists features by level', () => {
    expect(featuresByLevel({ features: [{ level: 3, name: 'B' }, { level: 1, name: 'A' }, { level: 1, name: 'C' }] }))
      .toEqual([{ level: 1, names: ['A', 'C'] }, { level: 3, names: ['B'] }])
  })

  it('accepts subclass fields in homebrew files', () => {
    const opts = { now: '2026-10-30T12:00:00.000Z', game: 'sf2e' as const, newId: () => 'x' }
    const option = checkHomebrewEntry({
      id: 'd1', kind: 'feat', name: 'Fire Domain', level: 1, rarity: 'common', traits: ['conduit'], description: '',
      category: 'classfeature', cost: null, prerequisites: [], optionOf: ['Conduit Domain'],
    }, 0, opts)
    expect((option.entry as Feat).optionOf).toEqual(['conduit-domain'])
    const cls = checkHomebrewEntry({
      id: 'c1', kind: 'class', name: 'Conduit', level: 0, rarity: 'common', traits: [], description: '',
      facts: { 'HP per level': 8 }, features: [{ level: 1, name: 'Domain' }],
    }, 0, opts)
    expect(cls.issues.filter(i => i.level === 'error')).toEqual([])
    expect((cls.entry as ReferenceEntry).features).toEqual([{ level: 1, name: 'Domain' }])
  })
})
