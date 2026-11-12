import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { StarTomeDb, getDb, useDbForTests } from '@/data/db'
import {
  notifyRulesChanged, rulesCreate, rulesDelete, rulesDeleteMany, rulesQuery, rulesSaveUser,
  rulesSearch, rulesUpdate,
} from '@/data/rules'
import { newRulesEntity } from '@/domain/rules/factory'
import type { RulesEntity } from '@/domain/rules/types'
import { rulesTable } from '@/data/rules'
import type { Table } from 'dexie'
import type { SyncState } from '@/data/rules'
const syncTable = () => getDb().rows('syncState') as unknown as Table<SyncState, string>
let dbN = 0
useDbForTests(new StarTomeDb(`rules-${process.pid}-${Math.random()}-${++dbN}`))
void syncTable


const names = async (q: Parameters<typeof rulesQuery>[0]) => (await rulesQuery(q)).items.map(i => i.name)

async function foundry(kind: RulesEntity['kind'], name: string, extra: Partial<RulesEntity> = {}) {
  const e = { ...newRulesEntity(kind, { name, game: 'pf2e' }), origin: 'foundry', ...extra } as RulesEntity
  await rulesTable().add(e)
  return e
}

describe('compendium kind index', () => {
  beforeEach(async () => { await rulesTable().clear(); notifyRulesChanged() })

  it('sees single-entry writes right away', async () => {
    const a = await rulesCreate('item', { name: 'Bravo', game: 'pf2e' })
    expect(await names({ kind: 'item' })).toEqual(['Bravo'])          // index built
    await rulesCreate('item', { name: 'Alpha', game: 'pf2e' })
    await rulesCreate('item', { name: 'Charlie', game: 'pf2e' })
    expect(await names({ kind: 'item' })).toEqual(['Alpha', 'Bravo', 'Charlie'])

    await rulesUpdate(a.id, 'name', 'Zulu')                            // renamed: moves to its new place
    expect(await names({ kind: 'item' })).toEqual(['Alpha', 'Charlie', 'Zulu'])
    await rulesUpdate(a.id, 'level', 7)
    expect(await names({ kind: 'item', levelMin: 5 })).toEqual(['Zulu'])
    await rulesUpdate(a.id, 'isFavorite', true)
    expect(await names({ kind: 'item', favoritesOnly: true })).toEqual(['Zulu'])

    await rulesDelete(a.id)
    expect(await names({ kind: 'item' })).toEqual(['Alpha', 'Charlie'])
  })

  it('sees local edits of synced entries', async () => {
    const e = await foundry('creature', 'Goblin Warrior', { level: -1, traits: ['goblin'] })
    expect(await names({ kind: 'creature', traits: ['goblin'] })).toEqual(['Goblin Warrior'])
    await rulesUpdate(e.id, 'level', 3)
    expect(await names({ kind: 'creature', levelMin: 3 })).toEqual(['Goblin Warrior'])
    expect(await names({ kind: 'creature', levelMax: 0 })).toEqual([])
  })

  it('sorts by level then name, both directions', async () => {
    for (const [name, level] of [['Bat', 1], ['Ape', 1], ['Cat', 0], ['Dog', 2]] as const) {
      await rulesSaveUser({ ...newRulesEntity('creature', { name, game: 'pf2e' }), level } as RulesEntity)
    }
    expect(await names({ kind: 'creature', sort: 'level' })).toEqual(['Cat', 'Ape', 'Bat', 'Dog'])
    expect(await names({ kind: 'creature', sort: 'level', dir: 'desc' })).toEqual(['Dog', 'Bat', 'Ape', 'Cat'])
    expect(await names({ kind: 'creature', dir: 'desc' })).toEqual(['Dog', 'Cat', 'Bat', 'Ape'])
  })

  it('shows one of the two games’ copies of a condition', async () => {
    await rulesTable().bulkAdd([
      { ...newRulesEntity('condition', { name: 'Frightened', game: 'sf2e' }), id: 'fvtt:sf2e:conditions:abc', origin: 'foundry' },
      { ...newRulesEntity('condition', { name: 'Frightened', game: 'pf2e' }), id: 'fvtt:pf2e:conditions:abc', origin: 'foundry' },
    ] as RulesEntity[])
    const page = await rulesQuery({ kind: 'condition' })
    expect(page.items.map(i => i.id)).toEqual(['fvtt:pf2e:conditions:abc'])
  })

  it('a bulk write outside the repository needs notifyRulesChanged, then shows', async () => {
    await rulesCreate('spell', { name: 'Light', game: 'pf2e' })
    expect(await names({ kind: 'spell' })).toEqual(['Light'])
    await rulesTable().add(newRulesEntity('spell', { name: 'Fear', game: 'pf2e' }))
    notifyRulesChanged()
    expect(await names({ kind: 'spell' })).toEqual(['Fear', 'Light'])
    const ids = (await rulesTable().toArray()).filter(e => e.origin === 'user').map(e => e.id)
    expect(await rulesDeleteMany(ids)).toBe(2)
    expect(await names({ kind: 'spell' })).toEqual([])
  })
})

describe('global search from the name index', () => {
  beforeEach(async () => { await rulesTable().clear(); notifyRulesChanged() })

  it('prefix matches first, then contains; skips superseded, removed and other games', async () => {
    await rulesCreate('spell', { name: 'Fireball', game: 'pf2e' })
    await rulesCreate('hazard', { name: 'Fireball Rune', game: 'pf2e' })
    await rulesCreate('item', { name: 'Wand of Fireball', game: 'pf2e' })
    await rulesCreate('item', { name: 'Fireball Pistol', game: 'sf2e' })
    await foundry('spell', 'Fireball (Legacy)', { supersededBy: 'x' })
    await foundry('item', 'Gone Fireball', { upstream: { removed: true } } as Partial<RulesEntity>)
    expect((await rulesSearch('fireball', 8, ['pf2e'])).map(h => h.name)).toEqual(['Fireball', 'Fireball Rune', 'Wand of Fireball'])
    expect((await rulesSearch('fireball', 2)).map(h => h.name)).toEqual(['Fireball', 'Fireball Pistol'])
    expect(await rulesSearch('nothing like it')).toEqual([])
  })

  it('finds entries written after the index loaded', async () => {
    await rulesCreate('feat', { name: 'Power Attack', game: 'pf2e' })
    expect((await rulesSearch('attack')).map(h => h.name)).toEqual(['Power Attack'])
  })
})
