import { describe, expect, it } from 'vitest'
import {
  CompendiumNameIndex, isRemasterSource, legacySourceTitle, nameVariants, normalizeName, sameSource, type MatchTarget,
} from '~/converters/legacy/match'

const t = (id: string, kind: MatchTarget['kind'], name: string, extra: Partial<MatchTarget> = {}): MatchTarget =>
  ({ id, kind, name, level: 0, game: 'pf2e', remaster: true, superseded: false, ...extra })

describe('legacy name matching', () => {
  it('normalises punctuation, accents and apostrophes', () => {
    expect(normalizeName("Will-O'-Wisp")).toBe('will o wisp')
    expect(normalizeName('Pactmasters’ Grace')).toBe('pactmasters grace')
    expect(normalizeName('Déjà Vu')).toBe('deja vu')
  })

  it('derives name variants', () => {
    expect(nameVariants('creature', 'Clockwork Assassin (AoE5 p.50)')).toContain('clockwork assassin')
    expect(nameVariants('creature', 'Cat, Leopard')).toEqual(['leopard cat', 'leopard'])
    expect(nameVariants('creature', 'Elemental Vessel, Water')[0]).toBe('water elemental vessel')
    expect(nameVariants('item', 'Studded Leather')).toContain('studded leather armor')
    expect(nameVariants('spell', 'Ki Form')).toContain('qi form')
  })

  it('reads legacy sources', () => {
    expect(legacySourceTitle('Core Rulebook p.288')).toBe('Core Rulebook')
    expect(legacySourceTitle('LOGM p.128')).toBe('Gods & Magic')
    expect(isRemasterSource('Player Core p.291')).toBe(true)
    expect(isRemasterSource('Bestiary p.237')).toBe(false)
    expect(sameSource('Core Rulebook p.288', 'Pathfinder Core Rulebook')).toBe(true)
    expect(sameSource('LOGM p.128', 'Pathfinder Lost Omens Gods & Magic')).toBe(true)
    expect(sameSource('G&G p.151', 'Pathfinder Guns & Gears')).toBe(true)
    expect(sameSource('Bestiary p.237', 'Pathfinder Bestiary 2')).toBe(false)
  })

  const index = new CompendiumNameIndex([
    t('mc', 'creature', 'Minotaur', { level: 4, pubTitle: 'Pathfinder Monster Core' }),
    t('b1', 'creature', 'Minotaur', { level: 4, pubTitle: 'Pathfinder Bestiary', remaster: false, superseded: true }),
    t('leo', 'creature', 'Leopard', { level: 2 }),
    t('bf', 'spell', 'Breathe Fire', { level: 1 }),
    t('og', 'condition', 'Off-Guard'),
    t('sla', 'item', 'Studded Leather Armor', { level: 0 }),
    t('fb', 'spell', 'Fireball', { level: 3 }),
    t('bda', 'creature', 'Black Dragon (Adult)', { level: 11 }),
    t('bdas', 'creature', 'Black Dragon (Adult, Spellcaster)', { level: 11 }),
  ])

  it('prefers the printing the record came from', () => {
    const legacy = index.match({ kind: 'creature', name: 'Minotaur', level: 4, source: 'Bestiary p.237' })
    expect(legacy.via).toBe('exact')
    expect(legacy.candidates.map(c => c.id)).toEqual(['b1', 'mc'])
    const remaster = index.match({ kind: 'creature', name: 'Minotaur', level: 4, source: 'Monster Core p.240' })
    expect(remaster.candidates[0].id).toBe('mc')
  })

  it('finds variants and remaster renames, and nothing for unknown names', () => {
    expect(index.match({ kind: 'creature', name: 'Cat, Leopard', level: 2, source: '' })).toMatchObject({ via: 'variant', candidates: [{ id: 'leo' }] })
    expect(index.match({ kind: 'item', name: 'Studded Leather', level: 0, source: '' })).toMatchObject({ via: 'variant', candidates: [{ id: 'sla' }] })
    expect(index.match({ kind: 'spell', name: 'Burning Hands', level: 1, source: '' })).toMatchObject({ via: 'alias', candidates: [{ id: 'bf' }] })
    expect(index.match({ kind: 'condition', name: 'Flat-Footed', level: 0, source: '' })).toMatchObject({ via: 'alias', candidates: [{ id: 'og' }] })
    expect(index.match({ kind: 'creature', name: 'Adult Black Dragon', level: 11, source: '' })).toMatchObject({ via: 'variant', candidates: [{ id: 'bda' }] })
    expect(index.match({ kind: 'item', name: 'Sturmperle', level: 5, source: 'Selfmade' }).via).toBeNull()
  })

  it('suggests close names of the same kind', () => {
    const s = index.suggest({ kind: 'spell', name: 'Fireballs', level: 3, source: '' })
    expect(s.map(c => c.id)).toEqual(['fb'])
    expect(index.suggest({ kind: 'creature', name: 'Minotaurs', level: 4, source: 'Bestiary' }).map(c => c.id)).toEqual(['b1'])
  })
})
