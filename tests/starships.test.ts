import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { StarTomeDb, useDbForTests } from '@/data/db'
import { createEncounterFromBuild } from '@/data/encounterBuild'
import { addCombatant, encounters } from '@/data/encounters'
import { addCharacter } from '@/data/party'
import { createCampaign } from '@/data/repo'
import { notifyRulesChanged, rulesTable } from '@/data/rules'
import { applyPreset, assign, addUpgrade, createInterior, createStarship, removeStarship, savePreset, setActive, setActivity, setMarker, setStation, sheetOf, shipInfo, starships, startStarshipBattle, stationsOf, unassign, updateStarship, writeBackShip } from '@/data/starships'
import { newRulesEntity } from '@/domain/rules/factory'
import { DEFAULT_PLAYER_PREFS, toPlayerScene, type PlayerSource } from '@/domain/rules/playerView'
import type { RulesEntity } from '@/domain/rules/types'

const C = 'camp-sf'
let n = 0
const rule = (kind: Parameters<typeof newRulesEntity>[0], name: string, extra: Record<string, unknown>) => ({ ...newRulesEntity(kind, { name, game: 'sf2e' }), ...extra }) as RulesEntity
let frame: RulesEntity, pilot: RulesEntity, gunnery: RulesEntity, generator: RulesEntity, turret: RulesEntity

beforeEach(async () => {
  useDbForTests(new StarTomeDb(`ship-${++n}`))
  await createCampaign({ id: C, name: 'Anvil', description: '', game: 'sf2e' })
  const adv = [{ grade: 'commercial', level: 1, upgrades: 1, helmed: { ac: 1 } }, { grade: 'tactical', level: 5, upgrades: 2, helmed: { ac: 2 } }]
  pilot = rule('battleStation', 'Pilot’s Console', { advancement: adv, actions: [{ name: 'Evade', cost: 1, text: 'Dodge.' }] })
  gunnery = rule('battleStation', 'Gunnery', { advancement: adv, actions: [] })
  generator = rule('battleStation', 'Generator', { advancement: adv, actions: [] })
  turret = rule('stationUpgrade', 'Laser Turret', { station: 'gunnery', level: 1, actions: [], weapon: { range: 4 } })
  frame = rule('starshipFrame', 'Explorer', {
    size: 'medium', sensorRange: 6, expansionBays: 2, customSlots: 1, defaultStations: [{ station: "Pilot's Console", upgrades: [] }, { station: 'Generator', upgrades: [] }],
    stats: [{ level: 1, hp: 60, sp: 15, ac: 16, fort: 6, ref: 8, will: 4, speed: 4 }, { level: 5, hp: 120, sp: 30, ac: 21, fort: 11, ref: 13, will: 9, speed: 5 }],
  })
  await rulesTable().bulkPut([frame, pilot, gunnery, generator, turret, rule('starship', 'Pirate Cutter', { level: 2, hp: 40, ac: 17, perception: 6, sensorRange: 5, saves: { fort: 6, ref: 9, will: 5 }, shields: { max: 10, fortify: 3 }, speed: 4, traits: [] })])
  notifyRulesChanged()
})

describe('starships', () => {
  it('builds a ship from its frame, follows the party level, and keeps one active', async () => {
    const ship = await createStarship(C, ' Sunrise ', frame.id)
    expect(ship).toMatchObject({ name: 'Sunrise', active: true })
    expect(stationsOf(ship).map(s => [s.slot, s.isDefault, s.stationId])).toEqual([[1, true, pilot.id], [2, true, generator.id], [3, false, null]])
    expect((await sheetOf(ship)).sheet).toMatchObject({ level: 1, hp: 60, sp: 15, ac: 16, speed: 4 })
    await addCharacter({ campaignId: C, name: 'Zo', role: 'pc', level: 5 })
    expect((await sheetOf(ship)).sheet).toMatchObject({ level: 5, hp: 120, ac: 21 })
    await updateStarship(ship.id, { levelPinned: 1 })
    expect((await sheetOf((await starships.get(ship.id))!)).sheet.hp).toBe(60)

    const second = await createStarship(C, 'Dusk', null)
    expect(second.active).toBe(false)
    await setActive(second.id)
    expect((await starships.ofCampaign(C)).map(s => [s.name, s.active])).toEqual([['Dusk', true], ['Sunrise', false]])
    await removeStarship(second.id)
    expect((await starships.active(C))?.name).toBe('Sunrise')
  })

  it('installs a station and its upgrades, and warns about what does not fit', async () => {
    const ship = await createStarship(C, 'Sunrise', frame.id)
    await setStation(ship.id, 3, gunnery.id)
    await addUpgrade(ship.id, 3, turret.id)
    await addUpgrade(ship.id, 1, turret.id)
    await setStation(ship.id, 1, gunnery.id)   // a frame's own station cannot be swapped
    const { sheet } = await sheetOf((await starships.get(ship.id))!)
    expect(sheet.stations.map(r => r.station?.name)).toEqual(['Pilot’s Console', 'Generator', 'Gunnery'])
    expect(sheet.stations[2]).toMatchObject({ upgradesUsed: 0, upgradeLimit: 1, warnings: [] })
    expect(sheet.stations[0]?.warnings).toEqual(['Laser Turret installs in a gunnery.'])
    // Helming the pilot's console adds its bonus
    expect((await sheetOf((await starships.get(ship.id))!, new Set([1]))).sheet.ac).toBe(17)
  })

  it('seats the crew, one per station, and brings a saved seating back', async () => {
    const ship = await createStarship(C, 'Sunrise', frame.id)
    const zo = await addCharacter({ campaignId: C, name: 'Zo', role: 'pc' }), kip = await addCharacter({ campaignId: C, name: 'Kip', role: 'pc' })
    await assign(ship.id, zo.id, 1)
    await assign(ship.id, kip.id, 1)
    await setActivity(ship.id, kip.id, 'fly-the-ship')
    const crew = async () => (await starships.get(ship.id))!.crew.map(c => [c.characterId === zo.id ? 'Zo' : 'Kip', c.slot, c.activity ?? null])
    expect(await crew()).toEqual([['Kip', 1, 'fly-the-ship'], ['Zo', null, null]])
    await savePreset(ship.id, 'Travel')
    await unassign(ship.id, kip.id)
    await assign(ship.id, zo.id, 2)
    await applyPreset(ship.id, 'Travel')
    expect(await crew()).toEqual([['Kip', 1, 'fly-the-ship'], ['Zo', null, null]])
  })

  it('starts a battle as a copy of the interior with the ship on the sensor map and the crew at their stations', async () => {
    const ship = await createStarship(C, 'Sunrise', frame.id)
    const zo = await addCharacter({ campaignId: C, name: 'Zo', role: 'pc' }), kip = await addCharacter({ campaignId: C, name: 'Kip', role: 'pc' })
    const interiorId = await createInterior(ship)
    expect(shipInfo(await encounters.get(interiorId))).toMatchObject({ shipId: ship.id, role: 'interior' })
    await addCombatant(interiorId, { x: 9, y: 9, label: 'Turret drone' })
    await setMarker(ship.id, 1, { x: 4, y: 2 })
    await assign(ship.id, zo.id, 1)
    await assign(ship.id, kip.id, null)
    await updateStarship(ship.id, { hpCurrent: 41, spCurrent: 3, conditions: [{ name: 'Wrecked', value: 1 }] })

    const id = await startStarshipBattle((await starships.get(ship.id))!)
    expect(shipInfo(await encounters.get(id))).toMatchObject({ role: 'battle', markers: [{ slot: 1, x: 4, y: 2, name: 'Pilot’s Console' }] })
    expect((await encounters.map(id)).sensorMap).toEqual({ zones: 12 })
    const tokens = await encounters.tokens(id)
    const own = tokens.find(t => t.sensor?.role === 'player-ship')
    // Its hull as it was; the generator starts every fight with full shields; wrecked stays
    expect(own).toMatchObject({ name: 'Sunrise', hp: { current: 41, max: 60 }, sensor: { zone: 2, heading: 1, shields: 15, shieldsMax: 15 }, conditions: [{ name: 'Wrecked', value: 1 }] })
    expect(tokens.find(t => t.name === 'Zo')).toMatchObject({ x: 4, y: 2, playerToken: true })
    const free = tokens.find(t => t.name === 'Kip')
    expect(free && Math.max(Math.abs(free.x - 4), Math.abs(free.y - 2))).toBe(1)
    expect(tokens.some(t => t.name === 'Turret drone')).toBe(true)

    await writeBackShip(ship.id, { hp: 0, sp: 0, conditions: [{ name: 'Compromised', value: 2 }, { name: 'Frightened', value: 1 }] })
    expect(await starships.get(ship.id)).toMatchObject({ hpCurrent: 0, spCurrent: 0, conditions: [{ name: 'Compromised', value: 2 }] })
  })

  it('builds a starship encounter: ships on the sensor map facing the party, boarders on the interior', async () => {
    const ship = await createStarship(C, 'Sunrise', frame.id)
    const cutter = (await rulesTable().toArray()).find(r => r.name === 'Pirate Cutter')!
    const boarder = rule('creature', 'Boarder', { level: 1, hp: 20, ac: 15, perception: 4, size: 'medium' })
    await rulesTable().put(boarder)
    notifyRulesChanged()
    const res = await createEncounterFromBuild(C, { name: 'Raid', partyLevel: 2, starship: true, concierge: true, slots: [{ rulesId: cutter.id, count: 2, adjustment: null }, { rulesId: boarder.id, count: 1, adjustment: null }] })
    expect(shipInfo(await encounters.get(res.encounterId))).toMatchObject({ shipId: ship.id, role: 'battle', concierge: true })
    const tokens = await encounters.tokens(res.encounterId)
    expect(tokens.filter(t => t.sensor?.role === 'ship').map(t => [t.name, t.sensor?.zone, t.sensor?.heading, t.sensor?.shields])).toEqual([['Pirate Cutter 1', 10, -1, 10], ['Pirate Cutter 2', 9, -1, 10]])
    expect(tokens.find(t => t.name === 'Boarder')).toMatchObject({ sensor: null, x: 10 })
  })
})

describe('the players\' view of a sensor map', () => {
  it('shows their own ship in numbers and the others as a word, hidden ships not at all', () => {
    const src = (over: Partial<PlayerSource>): PlayerSource => ({ id: 'a', name: 'A', shown: null, x: -1000, y: -1000, size: 1, visible: true, dead: false, playerToken: false, ally: false, actsWhileHidden: false, hp: { current: 10, max: 40, temp: 0 }, elevation: null, conditions: [], timers: [], sensor: null, ...over })
    const tokens = [
      src({ id: 'own', name: 'Sunrise', ally: true, sensor: { zone: 2, heading: 1, role: 'player-ship', shields: 5, shieldsMax: 15 }, conditions: [{ name: 'Wrecked', value: 1 }] }),
      src({ id: 'foe', name: 'Cutter', sensor: { zone: 9, heading: -1, role: 'ship', shields: 8, shieldsMax: 10 } }),
      src({ id: 'lurk', name: 'Cloaked', visible: false, sensor: { zone: 5, heading: -1, role: 'ship', shields: 0, shieldsMax: 0 } }),
    ]
    const scene = toPlayerScene({ encounterId: 'e', map: null, grid: { size: 50, offsetX: 0, offsetY: 0 }, fog: {}, tokens, order: [], areas: [], lit: [], running: true, round: 1, activeId: null, zones: 12, prefs: DEFAULT_PLAYER_PREFS })
    expect(scene.tokens).toEqual([])
    expect(scene.sensor?.ships).toEqual([
      { id: 'own', name: 'Sunrise', zone: 2, heading: 1, side: 'party', hp: { current: 10, max: 40 }, shields: { current: 5, max: 15 }, health: null, conditions: ['Wrecked 1'] },
      { id: 'foe', name: 'Cutter', zone: 9, heading: -1, side: 'enemy', hp: null, shields: null, health: 'critical', conditions: [] },
    ])
    expect(JSON.stringify(scene)).not.toContain('Cloaked')
  })
})
