/**
 * The party's starships: frame, battle stations, upgrades, expansion bays,
 * current Hull and Shield Points, conditions, the crew roster with its
 * presets, the interior map and the battles copied from it. The rules (sheet,
 * crew, combat) are in domain/rules.
 */
import { nowIso, newId } from '@/domain/ids'
import { partyLevel } from '@/domain/rules/party'
import {
  assignCrew, cleanCrew, freeSquaresNear, markersFromStations, slotsForFrame, starshipLevel, starshipSheet, stationKey,
  type BaySlot, type CrewAssignment, type EncounterStarship, type Lookup, type StarshipSheet, type StationSlot,
} from '@/domain/rules/playerStarship'
import { DEFAULT_ZONES } from '@/domain/rules/sensorMap'
import type { BattleStation, ExpansionBay, RulesEntity, StarshipFrame, StationUpgrade } from '@/domain/rules/types'
import { zStarship, type Starship } from '@/domain/schema'
import { getDb } from './db'
import { actors, addCombatant, createEncounter, encounters, patchMap } from './encounters'
import { partyOf } from './party'
import { rulesGetMany, rulesQuery } from './rules'

const table = () => getDb().rows('starships')
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
export const stationsOf = (s: Starship): StationSlot[] => s.stations as unknown as StationSlot[]
export const baysOf = (s: Starship): BaySlot[] => s.bays as unknown as BaySlot[]
export const shipInfo = (e: { starship: Record<string, unknown> | null } | null | undefined): EncounterStarship | null => (e?.starship && typeof e.starship.shipId === 'string' ? e.starship as unknown as EncounterStarship : null)

export interface StarshipCatalog { frames: StarshipFrame[]; stations: BattleStation[]; upgrades: StationUpgrade[]; bays: ExpansionBay[] }

async function all<T extends RulesEntity>(kind: 'starshipFrame' | 'battleStation' | 'stationUpgrade' | 'expansionBay'): Promise<T[]> {
  return (await rulesQuery({ kind, games: ['sf2e'], limit: 2000, sort: 'name' })).items as T[]
}
export async function loadCatalog(): Promise<StarshipCatalog> {
  const [frames, stations, upgrades, bays] = await Promise.all([all<StarshipFrame>('starshipFrame'), all<BattleStation>('battleStation'), all<StationUpgrade>('stationUpgrade'), all<ExpansionBay>('expansionBay')])
  return { frames, stations, upgrades, bays }
}

/** What the sheet rules need for one ship: its frame and every entry it could use, also ones the catalog lacks (removed, other game). */
export async function lookupFor(ship: Starship | null | undefined, catalog: StarshipCatalog): Promise<Lookup> {
  const ids = new Set<string>()
  if (ship) {
    if (ship.frameId) ids.add(ship.frameId)
    for (const st of stationsOf(ship)) { if (st.stationId) ids.add(st.stationId); for (const u of [...st.upgradeIds, ...(st.builtInUpgradeIds ?? [])]) ids.add(u) }
    for (const b of baysOf(ship)) ids.add(b.bayId)
  }
  const known = new Set([...catalog.frames, ...catalog.stations, ...catalog.upgrades, ...catalog.bays].map(e => e.id))
  const extra = await rulesGetMany([...ids].filter(id => !known.has(id)))
  const byId = <T extends RulesEntity>(list: T[], kind: string) => new Map([...list, ...extra.filter(e => e.kind === kind) as T[]].map(e => [e.id, e]))
  const frames = byId(catalog.frames, 'starshipFrame')
  return { frame: ship?.frameId ? frames.get(ship.frameId) ?? null : null, stations: byId(catalog.stations, 'battleStation'), upgrades: byId(catalog.upgrades, 'stationUpgrade'), bays: byId(catalog.bays, 'expansionBay') }
}

const byName = <T extends RulesEntity>(list: T[], name: string) => list.find(e => stationKey(e.name) === stationKey(name))?.id ?? null

export const starships = {
  /** The campaign's ships, the active one first. */
  ofCampaign: async (campaignId: string): Promise<Starship[]> => (await table().where('campaignId').equals(campaignId).toArray()).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
  get: (id: string) => table().get(id),
  active: async (campaignId: string): Promise<Starship | null> => (await starships.ofCampaign(campaignId))[0] ?? null,
}

/** A new ship with the frame's stations and the bays every ship has. The first one becomes the active one. */
export async function createStarship(campaignId: string, name: string, frameId: string | null): Promise<Starship> {
  const catalog = await loadCatalog()
  const frame = catalog.frames.find(f => f.id === frameId) ?? null
  const stations = frame ? slotsForFrame(frame, n => byName(catalog.stations, n), n => byName(catalog.upgrades, n)) : []
  const bays: BaySlot[] = catalog.bays.filter(b => !b.takesSlot && ['crew quarters', 'lounge', 'mess bay'].includes(b.name.toLowerCase())).map(b => ({ bayId: b.id, option: b.options?.[0]?.name ?? null }))
  const ts = nowIso()
  const row = zStarship.parse(plain({ id: newId(), campaignId, name: name.trim() || 'Starship', active: !(await table().where('campaignId').equals(campaignId).count()), frameId, stations, bays, createdAt: ts, updatedAt: ts }))
  await table().put(row)
  return row
}

async function edit(id: string, change: (s: Starship) => Partial<Starship>): Promise<void> {
  await getDb().transaction('rw', table(), async () => {
    const row = await table().get(id)
    if (row) await table().put(zStarship.parse(plain({ ...row, ...change(row), updatedAt: nowIso() })))
  })
}

export type ShipPatch = Partial<Pick<Starship, 'name' | 'levelPinned' | 'hpCurrent' | 'spCurrent' | 'conditions' | 'notes' | 'interiorEncounterId' | 'image'>>
export const updateStarship = (id: string, patch: ShipPatch) => edit(id, () => patch)
const editStations = (id: string, fn: (slots: StationSlot[]) => StationSlot[]) => edit(id, s => ({ stations: fn(plain(stationsOf(s))) as unknown as Starship['stations'] }))
const editBays = (id: string, fn: (bays: BaySlot[]) => BaySlot[]) => edit(id, s => ({ bays: fn(plain(baysOf(s))) as unknown as Starship['bays'] }))
const editCrew = (id: string, fn: (crew: CrewAssignment[]) => CrewAssignment[]) => edit(id, s => ({ crew: fn(plain(s.crew) as CrewAssignment[]) as Starship['crew'] }))

/** Changes the frame: its default stations are rebuilt, the stations you chose are kept where they fit. */
export async function setFrame(id: string, frameId: string): Promise<void> {
  const catalog = await loadCatalog()
  const frame = catalog.frames.find(f => f.id === frameId)
  if (!frame) return
  await edit(id, (s) => {
    const old = stationsOf(s).filter(x => !x.isDefault)
    const slots = slotsForFrame(frame, n => byName(catalog.stations, n), n => byName(catalog.upgrades, n)).map((x) => { if (x.isDefault) return x; const keep = old.shift(); return keep ? { ...keep, slot: x.slot } : x })
    const crew = cleanCrew(s.crew as CrewAssignment[], new Set(s.crew.map(c => c.characterId)), new Set(slots.map(x => x.slot)))
    return { frameId, stations: slots as unknown as Starship['stations'], crew: crew as Starship['crew'] }
  })
}
/** Puts a battle station in a slot you can choose (null empties it); its upgrades go. */
export const setStation = (id: string, slot: number, stationId: string | null) => editStations(id, slots => slots.map(s => (s.slot === slot && !s.isDefault ? { ...s, stationId, upgradeIds: [] } : s)))
export const addUpgrade = (id: string, slot: number, upgradeId: string) => editStations(id, slots => slots.map(s => (s.slot === slot && !s.upgradeIds.includes(upgradeId) ? { ...s, upgradeIds: [...s.upgradeIds, upgradeId] } : s)))
export const removeUpgrade = (id: string, slot: number, upgradeId: string) => editStations(id, slots => slots.map(s => (s.slot === slot ? { ...s, upgradeIds: s.upgradeIds.filter(u => u !== upgradeId) } : s)))
/** Where a station stands on the interior map; null removes the marker. */
export const setMarker = (id: string, slot: number, marker: { x: number; y: number } | null) => editStations(id, slots => slots.map(s => (s.slot === slot ? { ...s, marker } : s)))
export const addBay = (id: string, bayId: string, option: string | null = null) => editBays(id, b => [...b, { bayId, option }])
export const removeBay = (id: string, index: number) => editBays(id, b => b.filter((_, i) => i !== index))
export const setBayOption = (id: string, index: number, option: string | null) => editBays(id, b => b.map((x, i) => (i === index ? { ...x, option } : x)))
/** Puts a character on a station (null = free crew); whoever was there becomes free crew. */
export const assign = (id: string, characterId: string, slot: number | null) => editCrew(id, c => assignCrew(c, characterId, slot))
export const setActivity = (id: string, characterId: string, activity: string | null) => editCrew(id, c => assignCrew(c, characterId, c.find(x => x.characterId === characterId)?.slot ?? null, activity))
export const unassign = (id: string, characterId: string) => editCrew(id, c => c.filter(x => x.characterId !== characterId))
export const setCrew = (id: string, crew: CrewAssignment[]) => editCrew(id, () => crew)
export const savePreset = (id: string, name: string) => edit(id, s => (name.trim() ? { presets: [...s.presets.filter(p => p.name !== name.trim()), { name: name.trim(), crew: s.crew }] } : {}))
export const deletePreset = (id: string, name: string) => edit(id, s => ({ presets: s.presets.filter(p => p.name !== name) }))
export async function applyPreset(id: string, name: string): Promise<void> {
  const ship = await table().get(id)
  if (!ship) return
  const members = new Set((await partyOf(ship.campaignId)).map(c => c.id))
  await edit(id, (s) => { const p = s.presets.find(x => x.name === name); return p ? { crew: cleanCrew(p.crew as CrewAssignment[], members, new Set(stationsOf(s).map(x => x.slot))) as Starship['crew'] } : {} })
}

/** Makes this the party's ship; the others stay in the hangar. */
export async function setActive(id: string): Promise<void> {
  const ship = await table().get(id)
  if (!ship) return
  await getDb().transaction('rw', table(), async () => { await table().where('campaignId').equals(ship.campaignId).modify({ active: false }); await table().update(id, { active: true }) })
}
export async function removeStarship(id: string): Promise<void> {
  const ship = await table().get(id)
  if (!ship) return
  await table().delete(id)
  const next = ship.active ? (await starships.ofCampaign(ship.campaignId))[0] : null
  if (next) await table().update(next.id, { active: true })
}

/** The ship's sheet at its level (pinned, or the party's). */
export async function sheetOf(ship: Starship, helmed?: Set<number>): Promise<{ sheet: StarshipSheet; lookup: Lookup; level: number }> {
  const lookup = await lookupFor(ship, await loadCatalog())
  const level = starshipLevel(ship.levelPinned, partyLevel(await partyOf(ship.campaignId)).level)
  return { sheet: starshipSheet({ stations: stationsOf(ship), bays: baysOf(ship) }, lookup, level, helmed), lookup, level }
}

// ── On the map ─────────────────────────────────────────────────────────────

/** Makes an empty encounter the ship's interior map: build it in the map maker, then place the stations. */
export async function createInterior(ship: Starship): Promise<string> {
  const enc = await createEncounter(ship.campaignId, `${ship.name} (interior)`, { starship: { shipId: ship.id, role: 'interior', markers: [] } })
  await updateStarship(ship.id, { interiorEncounterId: enc.id })
  return enc.id
}

/**
 * A new starship battle: a copy of the interior (map, tiles, walls, what
 * stands on it besides the party) with the station markers, the ship on the
 * sensor map, and the crew at their stations (free crew beside the first).
 */
export async function startStarshipBattle(ship: Starship, name?: string, init: { partyLevel?: number | null; concierge?: boolean } = {}): Promise<string> {
  const { sheet, lookup } = await sheetOf(ship)
  const interior = ship.interiorEncounterId ? await encounters.get(ship.interiorEncounterId) : undefined
  const markers = markersFromStations(stationsOf(ship), sid => (sid ? lookup.stations.get(sid)?.name ?? 'Station' : 'Station'))
  const info: EncounterStarship = { shipId: ship.id, role: 'battle', markers, ...(init.concierge ? { concierge: true } : {}) }
  const enc = await createEncounter(ship.campaignId, name ?? `${ship.name}: starship battle`, {
    starship: info as unknown as Record<string, unknown>, partyLevel: init.partyLevel ?? interior?.partyLevel ?? null,
    ...(interior ? { map: interior.map, grid: interior.grid, fovEnabled: interior.fovEnabled } : {}),
  })
  await patchMap(enc.id, { sensorMap: { zones: DEFAULT_ZONES } })
  if (interior) {
    const map = await encounters.map(interior.id)
    await patchMap(enc.id, { walls: map.walls.map(w => ({ ...w, id: newId() })), battlemap: map.battlemap })
    for (const { id: _id, encounterId: _e, ...row } of (await encounters.combatants(interior.id)).filter(t => !t.playerToken && !t.sensor)) await addCombatant(enc.id, { ...row, initiative: null, conditions: [], timers: [] })
  }
  // The party's ship on the sensor map: zone 3, facing right. The generator starts every encounter with full Shield Points; wrecked and the like stay with the ship.
  const hasGenerator = stationsOf(ship).some(sl => sl.stationId && lookup.stations.get(sl.stationId)?.name.toLowerCase() === 'generator')
  await addCombatant(enc.id, {
    x: -1000, y: -1000, label: ship.name, image: ship.image, hp: { current: ship.hpCurrent ?? sheet.hp, max: sheet.hp, temp: 0 }, ac: sheet.ac, ally: true, conditions: ship.conditions,
    sensor: { zone: 2, heading: 1, role: 'player-ship', shields: hasGenerator ? sheet.sp : ship.spCurrent ?? sheet.sp, shieldsMax: sheet.sp },
  })
  const taken = new Set(markers.map(m => `${m.x},${m.y}`))
  const anchor = markers[0] ?? { x: 2, y: 2 }
  const free = freeSquaresNear(anchor.x, anchor.y, taken, ship.crew.filter(c => c.slot == null || !markers.some(m => m.slot === c.slot)).length)
  const members = new Map((await partyOf(ship.campaignId)).map(c => [c.id, c]))
  for (const a of ship.crew) {
    const c = members.get(a.characterId), actor = c ? await actors.forCharacter(c.id) : null
    if (!c || !actor) continue
    const at = markers.find(m => m.slot === a.slot) ?? free.shift() ?? { x: anchor.x + 1, y: anchor.y }
    await addCombatant(enc.id, { x: at.x, y: at.y, actorId: actor.id, ref: { kind: 'character', characterId: c.id }, statBlock: actor.statBlock, playerToken: c.role === 'pc' })
  }
  return enc.id
}

/** Writes an encounter's battle state back to the ship: Hull and Shield Points and the conditions that last. */
export async function writeBackShip(shipId: string, state: { hp: number | null; sp: number | null; conditions: { name: string; value: number | null }[] }): Promise<void> {
  const keep = ['compromised', 'wrecked', 'inoperable', 'off-kilter']
  await updateStarship(shipId, { hpCurrent: state.hp, spCurrent: state.sp, conditions: state.conditions.filter(c => keep.includes(c.name.toLowerCase())).map(c => ({ name: c.name, value: c.value })) })
}
