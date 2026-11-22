import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { StarTomeDb, useDbForTests } from '@/data/db'
import { notifyRulesChanged, rulesQuery, rulesTable } from '@/data/rules'
import { newRulesEntity } from '@/domain/rules/factory'
import type { RulesEntity } from '@/domain/rules/types'
import { nameMatchTier } from '@/domain/search'

useDbForTests(new StarTomeDb(`ranking-${process.pid}-${Math.random()}`))

describe('name match tiers', () => {
  it('ranks whole name, start, whole word, word start, anywhere, elsewhere', () => {
    expect(nameMatchTier('Knight', 'knight')).toBe(0)
    expect(nameMatchTier('Knight Errant', 'Knight')).toBe(1)
    expect(nameMatchTier('Bone Knight', 'knight')).toBe(2)
    expect(nameMatchTier('Graveknight (Remaster)', 'knight')).toBe(4)
    expect(nameMatchTier('Grave Knightmare', 'knight')).toBe(3)
    expect(nameMatchTier('Night Hag', 'knight')).toBe(5)
    expect(nameMatchTier('Élan', 'elan')).toBe(0)
  })
})

describe('ranked compendium search', () => {
  beforeEach(async () => { await rulesTable().clear(); notifyRulesChanged() })

  it('puts the closest names first and pages through the rest', async () => {
    const names = ['Bone Knight', 'Graveknight', 'Hellknight Armiger', 'Knight', 'Knight Errant', 'Abyssal Knight', 'Knights Ghost', 'Night Hag']
    for (const [i, name] of names.entries()) {
      await rulesTable().add({ ...newRulesEntity('creature', { name, game: 'pf2e' }), origin: 'foundry', level: 10 - i } as RulesEntity)
    }
    const first = await rulesQuery({ kind: 'creature', text: 'Knight', sort: 'name', rank: true, limit: 3 })
    expect(first.items.map(e => e.name)).toEqual(['Knight', 'Knight Errant', 'Knights Ghost'])
    expect(first.total).toBeGreaterThanOrEqual(7)
    const rest = await rulesQuery({ kind: 'creature', text: 'Knight', sort: 'name', rank: true, offset: 3, limit: 20 })
    expect(rest.items.map(e => e.name).slice(0, 4)).toEqual(['Abyssal Knight', 'Bone Knight', 'Graveknight', 'Hellknight Armiger'])
    // Within a tier the chosen sort stays: by level here
    const byLevel = await rulesQuery({ kind: 'creature', text: 'knight', sort: 'level', rank: true })
    expect(byLevel.items.map(e => e.name).slice(0, 5)).toEqual(['Knight', 'Knights Ghost', 'Knight Errant', 'Abyssal Knight', 'Bone Knight'])
    // Unranked keeps the old alphabetical contains list
    expect((await rulesQuery({ kind: 'creature', text: 'knight', sort: 'name' })).items[0]?.name).toBe('Abyssal Knight')
  })
})
