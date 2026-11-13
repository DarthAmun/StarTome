import { describe, expect, it } from 'vitest'
import { checkHomebrewEntry } from '@/domain/rules/homebrew'
import { classProgression, DEFAULT_PROGRESSION, levelPlan, slotOptions, slotTotals } from '@/domain/rules/progression'
import type { Feat, ReferenceEntry } from '@/domain/rules/types'

const cls = (name: string, extra: Partial<ReferenceEntry> = {}): ReferenceEntry => ({
  id: name, origin: 'user', kind: 'class', game: 'pf2e', name, sortName: name.toLowerCase(), level: 0, rarity: 'common',
  traits: [], description: '', sourceRefs: [], createdAt: '', updatedAt: '', facts: {}, ...extra,
})
const feat = (name: string, extra: Partial<Feat>): Feat => ({
  id: name, origin: 'user', kind: 'feat', game: 'pf2e', name, sortName: name.toLowerCase(), level: 1, rarity: 'common',
  traits: [], description: '', sourceRefs: [], createdAt: '', updatedAt: '',
  category: 'class', cost: null, prerequisites: [], ...extra,
})

const fighter = cls('Fighter', { features: [{ level: 1, name: 'Attack of Opportunity' }, { level: 3, name: 'Bravery' }] })
const rogue = cls('Rogue', {
  features: [{ level: 1, name: 'Sneak Attack' }],
  progression: { skillFeats: Array.from({ length: 20 }, (_, i) => i + 1), skillIncreases: Array.from({ length: 19 }, (_, i) => i + 2) },
})

describe('class progression', () => {
  it('falls back to the usual table per list', () => {
    expect(classProgression(cls('Homebrew'))).toEqual(DEFAULT_PROGRESSION)
    const p = classProgression(rogue)
    expect(p.skillFeats).toHaveLength(20)
    expect(p.generalFeats).toEqual([3, 7, 11, 15, 19])
  })

  it('lays out features and slots per level', () => {
    const plan = levelPlan([fighter])
    expect(plan).toHaveLength(20)
    expect(plan[0]).toEqual({
      level: 1,
      features: [{ className: 'Fighter', name: 'Attack of Opportunity' }],
      slots: [{ kind: 'classFeat', className: 'Fighter' }, { kind: 'ancestryFeat' }],
    })
    expect(plan[2].slots.map(s => s.kind)).toEqual(['generalFeat', 'skillIncrease'])
    expect(plan[4].slots.map(s => s.kind)).toEqual(['ancestryFeat', 'skillIncrease', 'attributeBoosts'])
  })

  it('dual-class: a class feat from each class, other slots once', () => {
    const plan = levelPlan([fighter, rogue])
    expect(plan[0].features.map(f => f.name)).toEqual(['Attack of Opportunity', 'Sneak Attack'])
    expect(plan[0].slots).toEqual([
      { kind: 'classFeat', className: 'Fighter' }, { kind: 'classFeat', className: 'Rogue' },
      { kind: 'ancestryFeat' }, { kind: 'skillFeat' },
    ])
    expect(plan[2].slots.filter(s => s.kind === 'skillIncrease')).toHaveLength(1)
  })

  it('counts slots up to a level', () => {
    const totals = slotTotals(levelPlan([fighter, rogue]), 4)
    expect(totals.map(t => [t.slot.kind, t.slot.className, t.count])).toEqual([
      ['classFeat', 'Fighter', 3], ['classFeat', 'Rogue', 3], ['ancestryFeat', undefined, 1],
      ['skillFeat', undefined, 4], ['generalFeat', undefined, 1], ['skillIncrease', undefined, 3],
    ])
  })

  it('a made-up class: the usual slots, no features', () => {
    const plan = levelPlan([{ name: 'Spellblade' }])
    expect(plan[0]).toEqual({ level: 1, features: [], slots: [{ kind: 'classFeat', className: 'Spellblade' }, { kind: 'ancestryFeat' }] })
    expect(slotTotals(plan, 20).find(t => t.slot.kind === 'classFeat')?.count).toBe(11)
  })

  it('shows the generic slots without a class', () => {
    expect(levelPlan([])[0].slots).toEqual([{ kind: 'ancestryFeat' }])
  })
})

describe('slot options', () => {
  const feats = [
    feat('Sudden Charge', { traits: ['fighter'] }),
    feat('Brutish Shove', { traits: ['fighter'], level: 2 }),
    feat('Trick Magic Item', { traits: ['rogue'] }),
    feat('Natural Ambition', { category: 'ancestry', traits: ['human'] }),
    feat('Cat Fall', { category: 'skill', traits: ['general', 'skill'] }),
    feat('Toughness', { category: 'general', traits: ['general'] }),
    feat('Bravery', { category: 'classfeature', traits: ['fighter'] }),
  ]
  const names = (fs: Feat[]) => fs.map(f => f.name)

  it('filters by category, trait and level', () => {
    expect(names(slotOptions(feats, { kind: 'classFeat', className: 'Fighter' }, 1))).toEqual(['Sudden Charge'])
    expect(names(slotOptions(feats, { kind: 'classFeat', className: 'Fighter' }, 2))).toEqual(['Sudden Charge', 'Brutish Shove'])
    expect(names(slotOptions(feats, { kind: 'ancestryFeat' }, 1, 'Human'))).toEqual(['Natural Ambition'])
    expect(names(slotOptions(feats, { kind: 'ancestryFeat' }, 1))).toEqual([])
    expect(names(slotOptions(feats, { kind: 'skillFeat' }, 2))).toEqual(['Cat Fall'])
    expect(names(slotOptions(feats, { kind: 'generalFeat' }, 3))).toEqual(['Cat Fall', 'Toughness'])
  })
})

describe('homebrew progression', () => {
  it('keeps a class progression', () => {
    const r = checkHomebrewEntry({
      id: 'c1', kind: 'class', name: 'Conduit', level: 0, rarity: 'common', traits: [], description: '',
      facts: {}, progression: { skillFeats: [1, 2, 3] },
    }, 0, { now: '2026-11-05T12:00:00.000Z', game: 'pf2e', newId: () => 'x' })
    expect(r.issues.filter(i => i.level === 'error')).toEqual([])
    expect((r.entry as ReferenceEntry).progression).toEqual({ skillFeats: [1, 2, 3] })
  })
})
