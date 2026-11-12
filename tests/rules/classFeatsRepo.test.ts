import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { StarTomeDb, getDb, useDbForTests } from '@/data/db'
import { rulesClassFeats } from '@/data/rules'
import { newRulesEntity } from '@/domain/rules/factory'
import { classOptionGroups } from '@/domain/rules/subclasses'
import type { Feat } from '@/domain/rules/types'
import { rulesTable } from '@/data/rules'
import type { Table } from 'dexie'
import type { SyncState } from '@/data/rules'
const syncTable = () => getDb().rows('syncState') as unknown as Table<SyncState, string>
let dbN = 0
useDbForTests(new StarTomeDb(`rules-${process.pid}-${Math.random()}-${++dbN}`))
void syncTable


const feat = (name: string, traits: string[], extra: Partial<Feat>): Feat =>
  ({ ...(newRulesEntity('feat', { name, game: 'pf2e', origin: 'foundry' }) as Feat), id: name, traits, category: 'classfeature', ...extra })

describe('class features of a class', () => {
  beforeEach(() => rulesTable().clear())

  it('finds subclass options without the class trait by the tag the class chooses from', async () => {
    // As in Foundry: Kinetic Gate carries 'kineticist'; the gates carry no trait at all
    await rulesTable().bulkAdd([
      feat('Kinetic Gate', ['kineticist'], { choices: ['kineticist-kinetic-gate'] }),
      feat('Fire Gate', [], { optionOf: ['kineticist-kinetic-gate'] }),
      feat('Water Gate', [], { optionOf: ['kineticist-kinetic-gate'] }),
      feat('Muses', ['bard'], { choices: ['bard-muse'] }),
      feat('Maestro', ['bard'], { optionOf: ['bard-muse'] }),
    ])
    const feats = await rulesClassFeats('kineticist', 'pf2e')
    expect(feats.map(f => f.name).sort()).toEqual(['Fire Gate', 'Kinetic Gate', 'Water Gate'])
    expect(classOptionGroups({ name: 'Kineticist' }, feats)).toMatchObject([{ tag: 'kineticist-kinetic-gate', label: 'Kinetic Gate', options: [{ name: 'Fire Gate' }, { name: 'Water Gate' }] }])
  })
})

describe('deleting many entries', () => {
  beforeEach(() => rulesTable().clear())

  it('deletes own entries in one go and never synced ones', async () => {
    const { rulesDeleteMany } = await import('@/data/rules')
    const own = (name: string) => ({ ...(newRulesEntity('feat', { name, game: 'pf2e' }) as Feat), id: name })
    await rulesTable().bulkAdd([own('A'), own('B'), feat('Synced', [], {})])
    expect(await rulesDeleteMany(['A', 'B', 'Synced', 'gone'])).toBe(2)
    expect((await rulesTable().toArray()).map(r => r.id)).toEqual(['Synced'])
  })
})
