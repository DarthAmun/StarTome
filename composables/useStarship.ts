/**
 * Starship repository (STARFINDER_PLAN.md P4): the party's starships, their
 * stations, upgrades, bays, current HP/SP and conditions, and the crew roster
 * with its presets. The only module that writes `starships`. The rules (sheet,
 * crew) are in rules/playerStarship.ts.
 */
import { computed, ref, shallowRef } from 'vue'
import { getDb, now, type DbStarship } from '~/composables/useDb'
import { onTablesChanged } from '~/db/changes'
import { rulesGetMany, rulesQuery } from '~/composables/useRules'
import {
  assignCrew, cleanCrew, slotsForFrame, stationKey, type BaySlot, type CrewAssignment, type Lookup, type StationSlot,
} from '~/rules/playerStarship'
import { toPlain } from '~/utils/json'
import type { BattleStation, ExpansionBay, RulesEntity, StarshipFrame, StationUpgrade } from '~/types/rules'

export interface StarshipCatalog {
  frames: StarshipFrame[]
  stations: BattleStation[]
  upgrades: StationUpgrade[]
  bays: ExpansionBay[]
}

const ships = ref<DbStarship[]>([])
const loadedCampaign = ref<number | null>(null)
const catalog = shallowRef<StarshipCatalog>({ frames: [], stations: [], upgrades: [], bays: [] })
/** Entries the ships point at that the catalog query didn't return (other game, removed …). */
const extra = shallowRef<Map<string, RulesEntity>>(new Map())

async function all<K extends 'starshipFrame' | 'battleStation' | 'stationUpgrade' | 'expansionBay'>(kind: K) {
  return (await rulesQuery({ kind, games: ['sf2e'], limit: 2000, sort: 'name' })).items
}

async function loadCatalog() {
  const [frames, stations, upgrades, bays] = await Promise.all([all('starshipFrame'), all('battleStation'), all('stationUpgrade'), all('expansionBay')])
  catalog.value = { frames: frames as StarshipFrame[], stations: stations as BattleStation[], upgrades: upgrades as StationUpgrade[], bays: bays as ExpansionBay[] }
}

async function load(campaignId: number) {
  const rows = await getDb().starships.where('campaign_id').equals(campaignId).toArray()
  await loadCatalog()
  // Entries a ship uses that the catalog lacks
  const known = new Set([...catalog.value.frames, ...catalog.value.stations, ...catalog.value.upgrades, ...catalog.value.bays].map(e => e.id))
  const ids = new Set<string>()
  for (const s of rows) {
    if (s.frame_id) ids.add(s.frame_id)
    for (const st of s.stations ?? []) { if (st.stationId) ids.add(st.stationId); for (const u of [...st.upgradeIds, ...(st.builtInUpgradeIds ?? [])]) ids.add(u) }
    for (const b of s.bays ?? []) ids.add(b.bayId)
  }
  const missing = [...ids].filter(id => !known.has(id))
  extra.value = new Map((missing.length ? await rulesGetMany(missing) : []).map(e => [e.id, e]))
  loadedCampaign.value = campaignId
  ships.value = rows.sort((a, b) => b.active - a.active || a.name.localeCompare(b.name))
}

async function reloadIfLoaded(campaignId: number) {
  if (loadedCampaign.value === campaignId) await load(campaignId)
}

onTablesChanged(['starships'], () => {
  if (loadedCampaign.value != null) void load(loadedCampaign.value)
})

/** Lookups for rules/playerStarship.ts. */
function lookupFor(ship: DbStarship | null | undefined): Lookup {
  const c = catalog.value
  const byId = <T extends RulesEntity>(list: T[], kind: string) => {
    const m = new Map(list.map(e => [e.id, e]))
    for (const e of extra.value.values()) if (e.kind === kind) m.set(e.id, e as T)
    return m
  }
  const frames = byId(c.frames, 'starshipFrame')
  return {
    frame: ship?.frame_id ? frames.get(ship.frame_id) ?? null : null,
    stations: byId(c.stations, 'battleStation'),
    upgrades: byId(c.upgrades, 'stationUpgrade'),
    bays: byId(c.bays, 'expansionBay'),
  }
}

const findByName = <T extends RulesEntity>(list: T[], name: string) => list.find(e => stationKey(e.name) === stationKey(name))?.id ?? null

/** A new ship with the frame's stations and the bays every Medium+ ship has. Becomes the active one if it's the first. */
async function create(campaignId: number, name: string, frameId: string | null): Promise<number> {
  await loadCatalog()
  const frame = catalog.value.frames.find(f => f.id === frameId) ?? null
  const stations = frame
    ? slotsForFrame(frame, n => findByName(catalog.value.stations, n), n => findByName(catalog.value.upgrades, n))
    : []
  const universal = ['crew quarters', 'lounge', 'mess bay']
  const bays: BaySlot[] = catalog.value.bays.filter(b => !b.takesSlot && universal.includes(b.name.toLowerCase()))
    .map(b => ({ bayId: b.id, option: b.options?.[0]?.name ?? null }))
  const existing = await getDb().starships.where('campaign_id').equals(campaignId).count()
  const ts = now()
  const id = await getDb().starships.add({
    campaign_id: campaignId, name: name.trim() || 'Starship', active: existing ? 0 : 1, frame_id: frameId, level_pinned: null,
    stations: toPlain(stations), bays: toPlain(bays), hp_current: null, sp_current: null, conditions: [], crew: [], presets: [],
    interior_encounter_id: null, notes: '', img: null, created_at: ts, updated_at: ts,
  }) as number
  await reloadIfLoaded(campaignId)
  return id
}

type ShipPatch = Partial<Pick<DbStarship, 'name' | 'level_pinned' | 'hp_current' | 'sp_current' | 'conditions' | 'notes' | 'interior_encounter_id' | 'img'>>

async function update(id: number, patch: ShipPatch) {
  const row = await getDb().starships.get(id)
  if (!row) return
  await getDb().starships.update(id, { ...toPlain(patch), updated_at: now() })
  await reloadIfLoaded(row.campaign_id)
}

/** Changes the frame: default stations are rebuilt, customizable stations kept where they fit. */
async function setFrame(id: number, frameId: string) {
  const row = await getDb().starships.get(id)
  const frame = catalog.value.frames.find(f => f.id === frameId)
  if (!row || !frame) return
  const fresh = slotsForFrame(frame, n => findByName(catalog.value.stations, n), n => findByName(catalog.value.upgrades, n))
  const oldCustom = (row.stations ?? []).filter(s => !s.isDefault)
  const slots = fresh.map(s => {
    if (s.isDefault) return s
    const keep = oldCustom.shift()
    return keep ? { ...keep, slot: s.slot } : s
  })
  const crew = cleanCrew(row.crew ?? [], new Set((row.crew ?? []).map(c => c.characterId)), new Set(slots.map(s => s.slot)))
  await getDb().starships.update(id, { frame_id: frameId, stations: toPlain(slots), crew: toPlain(crew), updated_at: now() })
  await reloadIfLoaded(row.campaign_id)
}

async function editStations(id: number, edit: (slots: StationSlot[]) => StationSlot[]) {
  const row = await getDb().starships.get(id)
  if (!row) return
  await getDb().starships.update(id, { stations: toPlain(edit(structuredClone(row.stations ?? []))), updated_at: now() })
  await reloadIfLoaded(row.campaign_id)
}

/** Puts a battle station in a customizable slot (null empties it); its upgrades go. */
function setStation(id: number, slot: number, stationId: string | null) {
  return editStations(id, slots => slots.map(s => (s.slot === slot && !s.isDefault ? { ...s, stationId, upgradeIds: [] } : s)))
}
function addUpgrade(id: number, slot: number, upgradeId: string) {
  return editStations(id, slots => slots.map(s => (s.slot === slot && !s.upgradeIds.includes(upgradeId) ? { ...s, upgradeIds: [...s.upgradeIds, upgradeId] } : s)))
}
function removeUpgrade(id: number, slot: number, upgradeId: string) {
  return editStations(id, slots => slots.map(s => (s.slot === slot ? { ...s, upgradeIds: s.upgradeIds.filter(u => u !== upgradeId) } : s)))
}
/** Where a station stands on the interior map (P5); null removes the marker. */
function setMarker(id: number, slot: number, marker: { x: number; y: number } | null) {
  return editStations(id, slots => slots.map(s => (s.slot === slot ? { ...s, marker } : s)))
}

async function editBays(id: number, edit: (bays: BaySlot[]) => BaySlot[]) {
  const row = await getDb().starships.get(id)
  if (!row) return
  await getDb().starships.update(id, { bays: toPlain(edit([...(row.bays ?? [])])), updated_at: now() })
  await reloadIfLoaded(row.campaign_id)
}
const addBay = (id: number, bayId: string, option?: string | null) => editBays(id, b => [...b, { bayId, option: option ?? null }])
const removeBay = (id: number, index: number) => editBays(id, b => b.filter((_, i) => i !== index))
const setBayOption = (id: number, index: number, option: string | null) => editBays(id, b => b.map((x, i) => (i === index ? { ...x, option } : x)))

async function editCrew(id: number, edit: (crew: CrewAssignment[]) => CrewAssignment[]) {
  const row = await getDb().starships.get(id)
  if (!row) return
  await getDb().starships.update(id, { crew: toPlain(edit([...(row.crew ?? [])])), updated_at: now() })
  await reloadIfLoaded(row.campaign_id)
}
/** Puts a character on a station (null = free crew); whoever was there becomes free crew. */
const assign = (id: number, characterId: number, slot: number | null) => editCrew(id, c => assignCrew(c, characterId, slot))
const setActivity = (id: number, characterId: number, activity: string | null) =>
  editCrew(id, c => assignCrew(c, characterId, c.find(x => x.characterId === characterId)?.slot ?? null, activity))
const unassign = (id: number, characterId: number) => editCrew(id, c => c.filter(x => x.characterId !== characterId))

async function savePreset(id: number, name: string) {
  const row = await getDb().starships.get(id)
  if (!row || !name.trim()) return
  const presets = [...(row.presets ?? []).filter(p => p.name !== name.trim()), { name: name.trim(), crew: row.crew ?? [] }]
  await getDb().starships.update(id, { presets: toPlain(presets), updated_at: now() })
  await reloadIfLoaded(row.campaign_id)
}
async function applyPreset(id: number, name: string, characterIds: Set<number>) {
  const row = await getDb().starships.get(id)
  const p = row?.presets?.find(x => x.name === name)
  if (!row || !p) return
  const crew = cleanCrew(p.crew, characterIds, new Set((row.stations ?? []).map(s => s.slot)))
  await getDb().starships.update(id, { crew: toPlain(crew), updated_at: now() })
  await reloadIfLoaded(row.campaign_id)
}
async function deletePreset(id: number, name: string) {
  const row = await getDb().starships.get(id)
  if (!row) return
  await getDb().starships.update(id, { presets: toPlain((row.presets ?? []).filter(p => p.name !== name)), updated_at: now() })
  await reloadIfLoaded(row.campaign_id)
}

/** Makes this the party's ship; the others stay in the hangar. */
async function setActive(id: number) {
  const row = await getDb().starships.get(id)
  if (!row) return
  await getDb().transaction('rw', getDb().starships, async () => {
    await getDb().starships.where('campaign_id').equals(row.campaign_id).modify({ active: 0 })
    await getDb().starships.update(id, { active: 1, updated_at: now() })
  })
  await reloadIfLoaded(row.campaign_id)
}

async function remove(id: number) {
  const row = await getDb().starships.get(id)
  if (!row) return
  await getDb().starships.delete(id)
  if (row.active) {
    const next = await getDb().starships.where('campaign_id').equals(row.campaign_id).first()
    if (next) await getDb().starships.update(next.id!, { active: 1 })
  }
  await reloadIfLoaded(row.campaign_id)
}

/** The campaign's active ship, for the encounter and the GM screen. */
export async function activeStarship(campaignId: number): Promise<DbStarship | undefined> {
  const rows = await getDb().starships.where('campaign_id').equals(campaignId).toArray()
  return rows.find(r => r.active) ?? rows[0]
}

export function useStarship() {
  return {
    ships, catalog, loadedCampaign,
    active: computed(() => ships.value.find(s => s.active) ?? ships.value[0] ?? null),
    load, lookupFor, create, update, setFrame, setStation, addUpgrade, removeUpgrade, setMarker,
    addBay, removeBay, setBayOption, assign, setActivity, unassign, savePreset, applyPreset, deletePreset, setActive, remove,
    reload: reloadIfLoaded,
  }
}
