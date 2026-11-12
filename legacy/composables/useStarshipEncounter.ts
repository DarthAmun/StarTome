/**
 * Starship encounters (STARFINDER_PLAN.md P5): the ship's interior map (an
 * encounter used as a template, its station markers stored on the ship) and
 * starship battles copied from it (decision 2: the ship keeps its map, every
 * battle gets its own copy with the markers, walls and objects).
 */
import { dbApi, getDb, now, type DbEncounter, type DbStarship } from '~/composables/useDb'
import { useParty, type Character } from '~/composables/useParty'
import { useStarship } from '~/composables/useStarship'
import { freeSquaresNear, markersFromStations, starshipLevel, starshipSheet, type EncounterStarship } from '~/rules/playerStarship'
import { DEFAULT_ZONES } from '~/rules/sensorMap'
import { toPlain } from '~/utils/json'
import { ref } from 'vue'

/**
 * The player ship's AC and saves right now (helmed bonuses, the pilot's
 * Piloting DC, inoperable and off-kilter), set by the encounter's Stations
 * panel. The save prompt uses them; any crew member rolls the ship's saves.
 */
export const playerShipDefenses = ref<{ tokenId: number; ac: number; saves: { fort: number; ref: number; will: number } } | null>(null)

/** Makes an empty encounter the ship's interior map (build it in the map maker, then place the stations). */
export async function createInterior(ship: DbStarship): Promise<number> {
  const enc = await dbApi.encounters.create({ campaignId: ship.campaign_id, name: `${ship.name} (interior)` })
  const id = enc!.id!
  const starship: EncounterStarship = { shipId: ship.id!, role: 'interior', markers: [] }
  await getDb().encounters.update(id, { starship: toPlain(starship) })
  await useStarship().update(ship.id!, { interior_encounter_id: id })
  return id
}

/** Uses an existing encounter's map as the ship's interior. */
export async function useAsInterior(ship: DbStarship, encounterId: number) {
  const starship: EncounterStarship = { shipId: ship.id!, role: 'interior', markers: [] }
  await getDb().encounters.update(encounterId, { starship: toPlain(starship) })
  await useStarship().update(ship.id!, { interior_encounter_id: encounterId })
}

/** The library token a character stands on; made (and linked) when the character has none. */
async function tokenFor(c: Character): Promise<number> {
  if (c.tokenId && await getDb().tokens.get(c.tokenId)) return c.tokenId
  const t = await dbApi.tokens.create({
    name: c.name, linkedEntityId: c.npcEntityId, isPlayerCharacter: c.role === 'pc', syncImage: !!c.npcEntityId,
    linkedRulesId: c.companionRulesId ?? null,
  })
  await useParty().linkToken(c.id, t!.id!)
  return t!.id!
}

/**
 * A new starship battle: a copy of the interior (map, map maker tiles, walls,
 * objects placed on it) with the station markers, and the crew standing at
 * their stations (free crew next to the first station).
 */
export async function startStarshipBattle(ship: DbStarship, name?: string): Promise<number> {
  const db = getDb()
  const party = useParty()
  if (party.loadedCampaign.value !== ship.campaign_id) await party.load(ship.campaign_id)
  const st = useStarship()
  const lookup = st.lookupFor(ship)
  const interior = ship.interior_encounter_id ? await dbApi.encounters.get(ship.interior_encounter_id) : null

  const enc = await dbApi.encounters.create({ campaignId: ship.campaign_id, name: name ?? `${ship.name}: starship battle` })
  const id = enc!.id!
  const markers = markersFromStations(ship.stations ?? [], sid => (sid ? lookup.stations.get(sid)?.name ?? 'Station' : 'Station'))
  const starship: EncounterStarship = { shipId: ship.id!, role: 'battle', markers }
  const copy: Partial<DbEncounter> = { starship: toPlain(starship), sensor_map: { zones: DEFAULT_ZONES }, updated_at: now() }
  if (interior) {
    Object.assign(copy, {
      map_source: interior.map_source, map_type: interior.map_type, grid_size: interior.grid_size,
      grid_offset_x: interior.grid_offset_x, grid_offset_y: interior.grid_offset_y,
      battlemap: interior.battlemap ?? null, fov_enabled: interior.fov_enabled ?? false, party_level: interior.party_level ?? null,
    })
  }
  await db.encounters.update(id, copy)

  if (interior) {
    const walls = await dbApi.walls.list(interior.id!)
    if (walls.length) await db.encounterWalls.bulkAdd(walls.map(({ id: _id, ...w }) => ({ ...w, encounter_id: id })))
    // Objects and NPCs placed on the interior (turrets, crew who aren't PCs) come along; the party is placed below
    const objects = await db.encounterTokens.where('encounter_id').equals(interior.id!).filter(t => !t.is_player_token).toArray()
    for (const { id: _id, ...row } of objects) {
      await db.encounterTokens.add({ ...row, encounter_id: id, initiative: null, conditions: [], timers: [] })
    }
  }

  // The party's ship on the sensor map: zone 3, facing right (move it before the fight starts)
  const sheet = starshipSheet({ stations: ship.stations ?? [], bays: ship.bays ?? [] }, lookup, starshipLevel(ship.level_pinned, party.party.value.level))
  const shipToken = await dbApi.encounterTokens.add({
    encounterId: id, tokenId: null, gridX: -1000, gridY: -1000, size: 1, isVisible: 1, label: ship.name,
    hpCurrent: ship.hp_current ?? sheet.hp, hpMax: sheet.hp, ac: sheet.ac, isAlly: true,
  })
  // The generator begins every encounter with full Shield Points; wrecked and the like stay with the ship
  const hasGenerator = (ship.stations ?? []).some(sl => sl.stationId && lookup.stations.get(sl.stationId)?.name.toLowerCase() === 'generator')
  await db.encounterTokens.update(shipToken.id!, {
    sensor_zone: 2, sensor_heading: 1, sensor_role: 'player-ship',
    shield_points: hasGenerator ? sheet.sp : ship.sp_current ?? sheet.sp, shield_max: sheet.sp,
    conditions: (ship.conditions ?? []).map(c => ({ name: c.name, value: c.value })),
  })

  // The crew at their stations
  const taken = new Set(markers.map(m => `${m.x},${m.y}`))
  const byChar = new Map(party.characters.value.map(c => [c.id, c]))
  const anchor = markers[0] ?? { x: 2, y: 2 }
  const free = (ship.crew ?? []).filter(c => c.slot == null || !markers.some(m => m.slot === c.slot))
  const spots = freeSquaresNear(anchor.x, anchor.y, taken, free.length)
  for (const a of ship.crew ?? []) {
    const c = byChar.get(a.characterId)
    if (!c) continue
    const m = markers.find(x => x.slot === a.slot)
    const p = m ?? spots.shift() ?? { x: anchor.x + 1, y: anchor.y }
    await dbApi.encounterTokens.add({
      encounterId: id, tokenId: await tokenFor(c), gridX: p.x, gridY: p.y, size: 1, isVisible: 1,
      linkedEntityId: c.npcEntityId, linkedRulesId: c.companionRulesId ?? null, isPlayerToken: c.role === 'pc',
    })
  }
  return id
}

export function encounterStarshipOf(row: Pick<DbEncounter, 'starship'> | null | undefined): EncounterStarship | null {
  return row?.starship ?? null
}
