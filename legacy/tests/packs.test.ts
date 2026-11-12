import { describe, expect, it } from 'vitest'
import { newRulesEntity } from '~/rules/factory'
import { checkHomebrewEntry, readHomebrewText } from '~/rules/homebrew'
import { homebrewFile, NO_PACK, packOf, summarizePacks, withPack } from '~/rules/packs'
import type { RulesEntity } from '~/types/rules'

const entry = (name: string, pack?: string): RulesEntity => {
  const e = { ...newRulesEntity('feat', { origin: 'user', game: 'sf2e', name }), id: `id-${name}` }
  return pack ? withPack(e, pack) : e
}

describe('homebrew packs', () => {
  it('reads, sets and clears an entry\'s pack', () => {
    const e = withPack(entry('A'), '  Homebrew: Conduit ')
    expect(packOf(e)).toBe('Homebrew: Conduit')
    expect(e.publication).toEqual({ title: 'Homebrew: Conduit', remaster: true })
    expect(packOf(withPack(e, ''))).toBe(NO_PACK)
    expect('publication' in withPack(e, '')).toBe(false)
  })

  it('counts packs by name with "no pack" last', () => {
    expect(summarizePacks([entry('A', 'Zeta'), entry('B'), entry('C', 'Alpha'), entry('D', 'Zeta')]))
      .toEqual([{ title: 'Alpha', count: 1 }, { title: 'Zeta', count: 2 }, { title: '', count: 1 }])
  })

  it('exports a file that imports again with the same ids and no fixes', () => {
    const e = { ...entry('Fire Domain', 'Homebrew: Conduit'), img: 'img:abc', isFavorite: true, category: 'classfeature', optionOf: ['conduit-domain'] } as RulesEntity
    const file = homebrewFile([e], 'startome', '2026-10-30T12:00:00.000Z')
    expect(file.rules[0]).not.toHaveProperty('img')
    const read = readHomebrewText(JSON.stringify(file))
    if ('error' in read) throw new Error(read.error)
    const back = checkHomebrewEntry(read.entries[0], 0, { now: '2026-10-31T00:00:00.000Z', game: 'sf2e', newId: () => 'new' })
    expect(back.issues).toEqual([])
    expect(back.entry).toMatchObject({ id: e.id, name: 'Fire Domain', publication: { title: 'Homebrew: Conduit' }, optionOf: ['conduit-domain'] })
  })
})
