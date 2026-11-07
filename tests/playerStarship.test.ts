import { describe, expect, it } from 'vitest'
import {
  activitiesFor, assignCrew, cleanCrew, freeSquaresNear, helmingTokens, markersFromStations, slotHelmedBy, slotsForFrame, starshipLevel, starshipLevelChanges, starshipSheet, type Lookup, type StationSlot,
} from '~/rules/playerStarship'
import type { BattleStation, ExpansionBay, StarshipFrame, StationUpgrade } from '~/types/rules'

/** Invented test data. */
const base = { origin: 'user' as const, game: 'sf2e' as const, rarity: 'common' as const, traits: [], description: '', sourceRefs: [], createdAt: '', updatedAt: '', level: 0 }
const frame: StarshipFrame = {
  ...base, id: 'f', kind: 'starshipFrame', name: 'Test Frame', sortName: 'test frame', size: 'med', sensorRange: 4, expansionBays: 2, customSlots: 2,
  defaultStations: [{ station: "Pilot's Console", upgrades: ['Prow'] }],
  stats: [1, 2, 3].map(l => ({ level: l, hp: 20 + l * 10, sp: 10 + l, ac: 16 + l, fort: 8 + l, ref: 6 + l, will: 7 + l, speed: 3 })),
}
const pilot: BattleStation = {
  ...base, id: 'p', kind: 'battleStation', name: 'Pilot’s Console', sortName: 'pilot’s console',
  advancement: [{ grade: 'commercial', level: 1, upgrades: 0, helmed: { ac: 0 } }, { grade: 'tactical', level: 2, upgrades: 1, helmed: { ac: 1, ref: 1 } }],
  actions: [{ name: 'Thrust', cost: 1, section: 'offensive', traits: ['station'], text: '', grade: 'commercial' }, { name: 'Juke', cost: 1, section: 'offensive', traits: ['station'], text: '', grade: 'tactical' }],
}
const scanners: BattleStation = {
  ...base, id: 's', kind: 'battleStation', name: 'Scanners', sortName: 'scanners',
  advancement: [{ grade: 'commercial', level: 1, upgrades: 0, sensors: 1, helmed: { will: 0 } }, { grade: 'tactical', level: 2, upgrades: 1, sensors: 1, helmed: { will: 0 } }],
  actions: [],
}
const prow: StationUpgrade = { ...base, id: 'u-prow', kind: 'stationUpgrade', name: 'Prow', sortName: 'prow', station: 'pilot’s console', actions: [] }
const cloak: StationUpgrade = { ...base, id: 'u-cloak', kind: 'stationUpgrade', name: 'Cloak', sortName: 'cloak', level: 8, station: 'scanners', actions: [] }
const lab: ExpansionBay = { ...base, id: 'b-lab', kind: 'expansionBay', name: 'Lab', sortName: 'lab', takesSlot: true }
const quarters: ExpansionBay = { ...base, id: 'b-q', kind: 'expansionBay', name: 'Crew Quarters', sortName: 'crew quarters', takesSlot: false, options: [{ name: 'Comfortable', text: '' }] }
const lookup: Lookup = {
  frame,
  stations: new Map([[pilot.id, pilot], [scanners.id, scanners]]),
  upgrades: new Map([[prow.id, prow], [cloak.id, cloak]]),
  bays: new Map([[lab.id, lab], [quarters.id, quarters]]),
}
const find = (list: { id: string; name: string }[]) => (n: string) => list.find(e => e.name.toLowerCase().replace(/'/g, '’') === n.toLowerCase().replace(/'/g, '’'))?.id ?? null

describe('player starship sheet', () => {
  const slots: StationSlot[] = slotsForFrame(frame, find([pilot, scanners]), find([prow]))

  it('builds default and customizable slots from the frame', () => {
    expect(slots).toEqual([
      { slot: 1, stationId: 'p', isDefault: true, upgradeIds: [], builtInUpgradeIds: ['u-prow'] },
      { slot: 2, stationId: null, isDefault: false, upgradeIds: [] },
      { slot: 3, stationId: null, isDefault: false, upgradeIds: [] },
    ])
  })

  it('reads stats by level, grades, sensors and helmed bonuses', () => {
    const ship = { stations: [slots[0], { ...slots[1], stationId: 's' }], bays: [] }
    const s1 = starshipSheet(ship, lookup, 1)
    expect(s1).toMatchObject({ hp: 30, sp: 11, ac: 17, speed: 3, sensorRange: 5 })
    expect(s1.stations[0].grade?.grade).toBe('commercial')
    const s2 = starshipSheet(ship, lookup, 2, new Set([1]))
    expect(s2.ac).toBe(18 + 1)
    expect(s2.saves.ref).toBe(8 + 1)
    expect(s2.stations[0].actions.map(a => a.name)).toEqual(['Thrust', 'Juke'])
    expect(starshipLevelChanges(s1, starshipSheet(ship, lookup, 2))).toEqual([
      'HP 30 → 40', 'SP 11 → 12', 'AC 17 → 18', 'Fort 9 → 10', 'Ref 7 → 8', 'Will 8 → 9',
      'Pilot’s Console: commercial → tactical', 'Pilot’s Console: 1 more upgrade slot', 'Pilot’s Console: new Juke',
      'Scanners: commercial → tactical', 'Scanners: 1 more upgrade slot',
    ])
  })

  it('warns about too many upgrades, wrong stations and levels, and bays', () => {
    const ship = { stations: [{ ...slots[0], upgradeIds: ['u-cloak'] }], bays: [{ bayId: 'b-lab' }, { bayId: 'b-lab' }, { bayId: 'b-lab' }] }
    const s = starshipSheet(ship, lookup, 1)
    expect(s.stations[0].warnings).toEqual(['1 upgrades but 0 at this grade.', 'Cloak installs in a scanners.', 'Cloak is level 8, above the starship.'])
    expect(s.warnings).toContain('3 expansion bays but 2 slots.')
    // comfortable crew quarters: one more slot, and they take none themselves
    const roomy = starshipSheet({ stations: [], bays: [...ship.bays, { bayId: 'b-q', option: 'Comfortable' }] }, lookup, 1)
    expect([roomy.baysUsed, roomy.baysLimit]).toEqual([3, 3])
  })

  it('starship weapons use no upgrade slot; a gunnery holds one (two with secondary armaments)', () => {
    const gun: BattleStation = { ...scanners, id: 'g', name: 'Gunnery', sortName: 'gunnery' }
    const rail: StationUpgrade = { ...prow, id: 'w1', name: 'Rail', station: 'gunnery', weapon: { category: 'martial', damage: { dice: 1, die: 'd8', type: 'piercing' }, range: 3, upgrades: 1 } }
    const cannon: StationUpgrade = { ...rail, id: 'w2', name: 'Cannon' }
    const second: StationUpgrade = { ...prow, id: 'sa', name: 'Secondary Armaments', station: 'gunnery' }
    const l: Lookup = { ...lookup, stations: new Map([...lookup.stations, ['g', gun]]), upgrades: new Map([...lookup.upgrades, ['w1', rail], ['w2', cannon], ['sa', second]]) }
    const one = starshipSheet({ stations: [{ slot: 1, stationId: 'g', isDefault: false, upgradeIds: ['w1'] }], bays: [] }, l, 1)
    expect([one.stations[0].upgradesUsed, one.stations[0].warnings]).toEqual([0, []])
    const two = starshipSheet({ stations: [{ slot: 1, stationId: 'g', isDefault: false, upgradeIds: ['w1', 'w2'] }], bays: [] }, l, 2)
    expect(two.stations[0].warnings).toContain('2 weapons installed: a gunnery holds 1.')
    const both = starshipSheet({ stations: [{ slot: 1, stationId: 'g', isDefault: false, upgradeIds: ['w1', 'w2', 'sa'] }], bays: [] }, l, 2)
    expect(both.stations[0].warnings).toEqual([])
  })

  it('level follows the party unless pinned', () => {
    expect(starshipLevel(null, 4)).toBe(4)
    expect(starshipLevel(7, 4)).toBe(7)
    expect(starshipLevel(null, null)).toBe(1)
    expect(starshipLevel(30, 4)).toBe(20)
  })
})

describe('crew roster', () => {
  it('one character per station; the one already there becomes free crew', () => {
    let crew = assignCrew([], 1, 1)
    crew = assignCrew(crew, 2, 2, 'scan-surroundings')
    crew = assignCrew(crew, 3, 1)
    expect(crew).toEqual([
      { characterId: 3, slot: 1, activity: null },
      { characterId: 2, slot: 2, activity: 'scan-surroundings' },
      { characterId: 1, slot: null, activity: null },
    ])
    // moving keeps the activity unless a new one is given
    expect(assignCrew(crew, 2, 3).find(c => c.characterId === 2)).toEqual({ characterId: 2, slot: 3, activity: 'scan-surroundings' })
  })
  it('drops characters who left and slots that are gone', () => {
    const crew = [{ characterId: 1, slot: 1 }, { characterId: 2, slot: 5 }, { characterId: 9, slot: 2 }]
    expect(cleanCrew(crew, new Set([1, 2]), new Set([1, 2, 3]))).toEqual([{ characterId: 1, slot: 1 }, { characterId: 2, slot: null }])
  })
  it('exploration activities by station', () => {
    expect(activitiesFor('Gunnery').map(a => a.key)).toEqual(['lock-and-load', 'emergency-repairs'])
    expect(activitiesFor("Pilot's Console").map(a => a.key)).toContain('fly-the-ship')
    expect(activitiesFor(null).map(a => a.key)).toEqual(['emergency-repairs'])
  })
})

describe('stations on the map', () => {
  const markers = [{ slot: 1, x: 3, y: 3, name: 'Pilot' }, { slot: 2, x: 6, y: 3, name: 'Gunnery' }, { slot: 3, x: 9, y: 9, name: 'Scanners' }]
  it('a token on a station square helms it; unconscious or dead ones don\'t; the first one wins', () => {
    const tokens = [
      { id: 10, gridX: 3, gridY: 3, size: 1 },
      { id: 11, gridX: 3, gridY: 3, size: 1 },
      { id: 12, gridX: 5, gridY: 2, size: 2 },                                    // a 2×2 token covering (6,3)
      { id: 13, gridX: 9, gridY: 9, size: 1, conditions: [{ name: 'Unconscious' }] },
    ]
    expect([...helmingTokens(markers, tokens)]).toEqual([[1, 10], [2, 12]])
    expect(slotHelmedBy(markers, tokens, 12)).toBe(2)
    expect(slotHelmedBy(markers, tokens, 11)).toBeNull()
  })
  it('free squares ring outward and skip taken ones', () => {
    const taken = new Set(['3,3', '2,2'])
    const spots = freeSquaresNear(3, 3, taken, 3)
    expect(spots).toEqual([{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 2, y: 3 }])
    expect(freeSquaresNear(0, 0, new Set(['0,0']), 2)).toEqual([{ x: 1, y: 0 }, { x: 0, y: 1 }])
  })
  it('battle markers come from the stations that are placed', () => {
    const slots = [
      { slot: 1, stationId: 'p', isDefault: true, upgradeIds: [], marker: { x: 1, y: 2 } },
      { slot: 2, stationId: null, isDefault: false, upgradeIds: [], marker: { x: 5, y: 5 } },
      { slot: 3, stationId: 's', isDefault: false, upgradeIds: [] },
    ]
    expect(markersFromStations(slots, id => (id === 'p' ? 'Pilot' : '?'))).toEqual([{ slot: 1, x: 1, y: 2, name: 'Pilot' }])
  })
})
