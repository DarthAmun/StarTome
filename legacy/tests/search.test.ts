import { describe, expect, it } from 'vitest'
import {
  attributeText, buildNameIndex, buildSearchIndex, foldTerm, plainText, searchDocs, searchNames,
  type SearchDoc,
} from '~/utils/search'

const doc = (kind: SearchDoc['kind'], refId: number, name: string, extra: Partial<SearchDoc> = {}): SearchDoc =>
  ({ id: `${kind}:${refId}`, kind, refId, name, ...extra })

const DOCS: SearchDoc[] = [
  doc('entity', 1, 'Aldric Vane', { type: 'npc', text: 'A fugitive from the Obsidian Circle.' }),
  doc('entity', 2, 'The Obsidian Circle', { type: 'faction', tags: 'cult villains' }),
  doc('entity', 3, 'Goblin Warren', { type: 'location', text: 'Aldric knows the cave routes.' }),
  doc('entity', 4, 'Élan the Bard', { type: 'npc' }),
  doc('entity', 5, 'Aldricson', { type: 'npc' }),
  doc('campaign', 1, 'Welcome to StarTome'),
  doc('panel', 7, 'The Hearing', { type: 'scene', sessionId: 9, text: 'Talia will question the party.' }),
]
const index = buildSearchIndex(DOCS)
const names = (q: string, kind?: SearchDoc['kind']) => searchDocs(index, q, { kind }).map(h => h.name)

describe('searchDocs', () => {
  it('ranks the whole name, then names starting with it, then text mentions', () => {
    expect(names('aldric vane')[0]).toBe('Aldric Vane')
    const hits = names('aldric', 'entity')
    expect(hits.slice(0, 2).sort()).toEqual(['Aldric Vane', 'Aldricson'])
    expect(hits).toContain('Goblin Warren')   // mentioned in its text
    expect(hits.indexOf('Goblin Warren')).toBeGreaterThan(hits.indexOf('Aldricson'))
  })

  it('finds word starts and small typos', () => {
    expect(names('gob')).toContain('Goblin Warren')
    expect(names('obsidan')).toContain('The Obsidian Circle')   // a letter missing
    expect(names('aldirc')).toContain('Aldric Vane')            // two letters swapped
  })

  it('does not guess at short words', () => {
    expect(names('alx')).toEqual([])
  })

  it('still finds a name containing the text mid-word', () => {
    expect(names('blin')).toEqual(['Goblin Warren'])
  })

  it('ignores accents and case', () => {
    expect(names('elan')).toEqual(['Élan the Bard'])
    expect(foldTerm('Élan')).toBe('elan')
  })

  it('matches tags and says where it matched', () => {
    const hit = searchDocs(index, 'villains')[0]!
    expect(hit.name).toBe('The Obsidian Circle')
    expect(hit.match).toBe('tags')
    expect(searchDocs(index, 'aldric vane')[0]!.match).toBe('name')
  })

  it('keeps to one kind and carries what a result needs to open', () => {
    const [hit] = searchDocs(index, 'question', { kind: 'panel' })
    expect(hit).toMatchObject({ kind: 'panel', refId: 7, type: 'scene', sessionId: 9, match: 'text' })
    expect(searchDocs(index, 'question', { kind: 'entity' })).toEqual([])
  })

  it('needs every word', () => {
    expect(names('aldric circle')).toEqual(['Aldric Vane'])   // name + text
  })
})

describe('plainText and attributeText', () => {
  it('reads entity refs as their names and drops markdown', () => {
    expect(plainText('**{{npc: Aldric Vane | entry}}** meets [the council](https://x.y) ![map](img:1)').replace(/\s+/g, ' ').trim())
      .toBe('Aldric Vane meets the council')
  })

  it('takes text attributes, not images, ids or structure', () => {
    expect(attributeText({ role: 'Scout', portraitSource: 'img:abc', questGiverId: 4, board: { edges: [] }, tags: ['x'], motto: 'data:image/png' }))
      .toBe('Scout')
  })
})

describe('searchNames (compendium)', () => {
  const idx = buildNameIndex(['creature:goblin warrior', 'creature:goblin', 'item:hobgoblin helm', 'spell:fireball', 'feat:power attack'])

  it('ranks the whole name first, then name starts, then names containing it', () => {
    expect(searchNames(idx, 'goblin')).toEqual(['creature:goblin', 'creature:goblin warrior', 'item:hobgoblin helm'])
  })

  it('finds typos', () => {
    expect(searchNames(idx, 'firebal')).toContain('spell:fireball')
    expect(searchNames(idx, 'fierball')).toContain('spell:fireball')
  })

  it('builds and searches a full compendium quickly', () => {
    const keys = Array.from({ length: 40_000 }, (_, i) => `creature:monster ${i} of the ${['deep', 'high', 'far'][i % 3]} wilds`)
    const t0 = performance.now()
    const big = buildNameIndex(keys)
    const built = performance.now() - t0
    const t1 = performance.now()
    searchNames(big, 'monster 123')
    const searched = performance.now() - t1
    expect(built).toBeLessThan(3000)
    expect(searched).toBeLessThan(300)
  })
})
