import { describe, expect, it } from 'vitest'
import { checkHomebrewEntry, type CheckOptions } from '~/rules/homebrew'
import {
  expandStarshipImmunities, frameStatsAt, helmedBonuses, parseZones, sensorRangeOf, stationActionsAt, stationGradeAt, STARSHIP_IMMUNITIES,
} from '~/rules/starships'
import type { BattleStation, Starship, StarshipFrame } from '~/types/rules'

/** Invented test data (not the book's numbers). */
const station: Pick<BattleStation, 'advancement' | 'actions'> = {
  advancement: [
    { grade: 'commercial', level: 1, upgrades: 0, helmed: { ac: 0, ref: 0 } },
    { grade: 'tactical', level: 2, upgrades: 1, helmed: { ac: 0, ref: 0 } },
    { grade: 'superior', level: 8, upgrades: 2, helmed: { ac: 1, ref: 1 }, sensors: 2 },
  ],
  actions: [
    { name: 'Thrust', cost: 1, section: 'offensive', traits: ['station'], text: '', grade: 'commercial' },
    { name: 'Juke', cost: 1, section: 'offensive', traits: ['station'], text: '', grade: 'tactical' },
    { name: 'Barrel Roll', cost: 2, section: 'offensive', traits: ['station'], text: '', grade: 'superior' },
    { name: 'Always', cost: 1, section: 'offensive', traits: ['station'], text: '' },
  ],
}
const frame: Pick<StarshipFrame, 'stats' | 'sensorRange'> = {
  sensorRange: 4,
  stats: [
    { level: 2, hp: 40, sp: 12, ac: 18, fort: 10, ref: 8, will: 9, speed: 3 },
    { level: 1, hp: 30, sp: 10, ac: 17, fort: 9, ref: 7, will: 8, speed: 3 },
  ],
}

describe('starship rules', () => {
  it('frame statistics by level, clamped to the rows', () => {
    expect(frameStatsAt(frame, 1)?.hp).toBe(30)
    expect(frameStatsAt(frame, 2)?.hp).toBe(40)
    expect(frameStatsAt(frame, 9)?.hp).toBe(40)
    expect(frameStatsAt({ stats: [] }, 3)).toBeNull()
  })

  it('station grade and actions by starship level', () => {
    expect(stationGradeAt(station, 1)?.grade).toBe('commercial')
    expect(stationGradeAt(station, 5)?.grade).toBe('tactical')
    expect(stationGradeAt(station, 8)?.grade).toBe('superior')
    expect(stationActionsAt(station, 'tactical').map(a => a.name)).toEqual(['Thrust', 'Juke', 'Always'])
    expect(stationActionsAt(station, 'paragon')).toHaveLength(4)
  })

  it('helmed bonuses take the highest of each kind; sensors add up', () => {
    const superior = stationGradeAt(station, 8)
    expect(helmedBonuses([superior, { grade: 'x', level: 1, upgrades: 0, helmed: { will: 2, ac: 0 } }, null])).toEqual({ ac: 1, fort: 0, ref: 1, will: 2 })
    expect(sensorRangeOf(frame, [superior, { grade: 'x', level: 1, upgrades: 0, sensors: 1 }])).toBe(7)
  })

  it('immunities and zones', () => {
    expect(expandStarshipImmunities(['starship immunities', 'fire'])).toEqual([...STARSHIP_IMMUNITIES, 'fire'])
    expect(parseZones('3 zones')).toBe(3)
    expect(parseZones('1-zone')).toBe(1)
    expect(parseZones(2)).toBe(2)
    expect(parseZones('far')).toBeNull()
  })
})

describe('homebrew starship kinds', () => {
  let n = 0
  const opts: CheckOptions = { now: '2026-11-07T12:00:00.000Z', game: 'sf2e', newId: () => `new-${++n}` }
  const errors = (raw: unknown) => checkHomebrewEntry(raw, 0, opts).issues.filter(i => i.level === 'error')

  it('starship: zones as text, default immunities', () => {
    const c = checkHomebrewEntry({
      kind: 'starship', name: 'Test Corvette', level: 3, rarity: 'common', traits: ['tech'], description: '',
      size: 'medium', perception: 9, sensorRange: '4 zones', abilities: { str: 0, dex: 4, con: 2, int: 3, wis: 2, cha: 1 },
      ac: 18, saves: { fort: 9, ref: 11, will: 7 }, hp: 32, shields: { max: 10, fortify: 5 }, speed: '3 zones',
      strikes: [{ name: 'rail', bonus: 10, traits: ['automatic'], rangeZones: '6 zones', damage: ['1d12+3 piercing'] }],
    }, 0, opts)
    expect(c.issues.filter(i => i.level === 'error')).toEqual([])
    const s = c.entry as Starship
    expect(s).toMatchObject({ size: 'med', sensorRange: 4, speed: 3, immunities: ['starship immunities'], shields: { max: 10, fortify: 5 } })
    expect(s.strikes[0]).toMatchObject({ range: 'ranged', rangeZones: 6, damage: [{ formula: '1d12+3', type: 'piercing' }] })
  })

  it('frame, station, upgrade and bay', () => {
    expect(errors({ kind: 'starshipFrame', name: 'Test Frame', level: 0, rarity: 'common', traits: [], description: '', sensorRange: 5, stats: [{ level: 1, hp: 27, sp: 10, ac: 17, fort: 9, ref: 6, will: 8, speed: '2 zones' }] })).toEqual([])
    expect(errors({ kind: 'battleStation', name: 'Test Console', level: 0, rarity: 'common', traits: [], description: '', advancement: [{ grade: 'commercial', level: 1, upgrades: 0 }], actions: [{ name: 'Thrust', cost: 1, text: '', grade: 'commercial' }] })).toEqual([])
    // A bad row is dropped with a warning; the entry still imports
    const bad = checkHomebrewEntry({ kind: 'battleStation', name: 'Bad', level: 0, rarity: 'common', traits: [], description: '', advancement: [{ grade: 'legendary', level: 1 }] }, 0, opts)
    expect(bad.issues.map(i => i.path)).toContain('advancement[0].grade')
    expect((bad.entry as BattleStation).advancement).toEqual([])
    expect(errors({ kind: 'stationUpgrade', name: 'Test Rail', level: 0, rarity: 'common', traits: [], description: '', station: 'gunnery', weapon: { category: 'advanced', damage: { dice: 1, die: 'd12', type: 'piercing' }, range: '6 zones' } })).toEqual([])
    expect(errors({ kind: 'expansionBay', name: 'Test Lab', level: 0, rarity: 'common', traits: [], description: '' })).toEqual([])
  })
})
