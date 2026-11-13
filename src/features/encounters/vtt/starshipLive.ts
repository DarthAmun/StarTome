/**
 * Starships in the open encounter: the party's ship (its sheet, who helms
 * which station, its defenses right now), tokens on the sensor map, and
 * starship damage: Shield Points first, then the hull; the party's ship at 0
 * Hull Points becomes compromised instead of dying.
 */
import { computed, reactive, watch } from 'vue'
import { conditionInfo, type TokenCondition } from '@/domain/rules/conditions'
import type { Degree } from '@/domain/rules/dcs'
import { helmingTokens, starshipSheet, stationKey, crewSkill, type EncounterStarship, type Lookup, type StationMarker, type StarshipSheet } from '@/domain/rules/playerStarship'
import { clampZone, DEFAULT_ZONES, type Heading, type SensorRole } from '@/domain/rules/sensorMap'
import { hullIntegrityCheck, playerShipHpChange, shipDamage, shipStateOf, withShipState, type ShipStateChange } from '@/domain/rules/starshipCombat'
import { tokenStats } from '@/domain/rules/combat'
import type { Character, Starship as ShipRow } from '@/domain/schema'
import { addCombatant, imageOfRules, patchCombatant, type CombatantPatch, type Token } from '@/data/encounters'
import { partyOf } from '@/data/party'
import { rulesGet } from '@/data/rules'
import { baysOf, setMarker, sheetOf, shipInfo, starships, stationsOf, writeBackShip } from '@/data/starships'
import { reportError } from '@/ui/dialogs'
import { getToken, live, logLine, mapTokens, refreshTokens, saveEncounter, saveMap, shipHooks, updateToken } from './live'

export const ship = reactive({ row: null as ShipRow | null, lookup: null as Lookup | null, level: 1, party: [] as Character[] })
export const info = computed<EncounterStarship | null>(() => shipInfo(live.encounter))
export const zones = computed(() => Number((live.map?.sensorMap as { zones?: number } | null)?.zones) || DEFAULT_ZONES)
export const sensorTokens = computed(() => live.tokens.filter(t => t.sensor))
export const shipToken = computed(() => live.tokens.find(t => t.sensor?.role === 'player-ship') ?? null)

/** Reads the ship of the open encounter (after loading it, and when the ship changes elsewhere). */
export async function loadShip(): Promise<void> {
  const row = info.value ? (await starships.get(info.value.shipId)) ?? null : null
  if (!row) { Object.assign(ship, { row: null, lookup: null, party: [] }); return }
  const { lookup, level } = await sheetOf(row)
  Object.assign(ship, { row, lookup, level, party: await partyOf(row.campaignId) })
}

/** The markers this map uses: the ship's own for its interior, the encounter's copy for a battle. */
export const markers = computed<StationMarker[]>(() => {
  const i = info.value, row = ship.row
  if (!i) return []
  if (i.role === 'battle') return i.markers
  return row ? stationsOf(row).flatMap(s => (s.marker && s.stationId ? [{ slot: s.slot, x: s.marker.x, y: s.marker.y, name: ship.lookup?.stations.get(s.stationId)?.name ?? 'Station' }] : [])) : []
})
/** Slot → the token standing on its station. */
export const helm = computed(() => helmingTokens(markers.value, mapTokens()))
const plainSheet = (helmed?: Set<number>): StarshipSheet | null => (ship.row && ship.lookup ? starshipSheet({ stations: stationsOf(ship.row), bays: baysOf(ship.row) }, ship.lookup, ship.level, helmed) : null)
export const sheet = computed(() => plainSheet(new Set(helm.value.keys())))
export const shipState = computed(() => shipStateOf(shipToken.value?.conditions ?? []))
export const malfunctioning = (slot: number): boolean => (info.value?.malfunctioning ?? []).includes(slot)

/** The pilot's Piloting DC stands in for the AC when it is higher (a helmed pilot's console). */
export const pilotDc = computed(() => {
  for (const [slot, tokenId] of helm.value) {
    const stationId = ship.row ? stationsOf(ship.row).find(s => s.slot === slot)?.stationId : null
    if (stationKey(ship.lookup?.stations.get(stationId ?? '')?.name ?? '') !== 'pilot’s console') continue
    const ref = getToken(tokenId)?.ref
    const mod = crewSkill(ship.party.find(c => ref?.kind === 'character' && c.id === ref.characterId), 'piloting')
    return mod != null ? 10 + mod : null
  }
  return null
})
/** The ship's AC and saves right now: helmed bonuses, the pilot's DC, inoperable and off-kilter. */
export const defenses = computed(() => {
  const now = sheet.value, base = plainSheet()
  if (!now || !base) return null
  const bonus = now.ac - base.ac
  let ac = pilotDc.value != null ? Math.max(base.ac, pilotDc.value) + bonus : now.ac
  let ref = now.saves.ref
  if (shipState.value.inoperable) { ac -= 4; ref -= 4 }
  if (shipToken.value?.conditions.some(c => c.name.toLowerCase() === 'off-kilter')) ref -= 2
  return { ac, saves: { ...now.saves, ref } }
})

const look = (name: string, value: number | null): TokenCondition => { const i = conditionInfo(name); return { name, value, ...(i ? { color: i.color, icon: i.icon } : {}) } }

function setInfo(patch: Partial<EncounterStarship>): void {
  if (info.value) saveEncounter({ starship: { ...info.value, ...patch } as unknown as Record<string, unknown> })
}
/** Marks battle stations malfunctioning (or repaired); 'all' = every station on the map. */
export function setMalfunctioning(slots: number[] | 'all', on: boolean): void {
  const i = info.value
  if (!i) return
  const now = new Set(i.malfunctioning ?? [])
  for (const slot of slots === 'all' ? i.markers.map(m => m.slot) : slots) { if (on) now.add(slot); else now.delete(slot) }
  setInfo({ malfunctioning: [...now].sort((a, b) => a - b) })
}

/** What a change of the ship's state does to its token; malfunctions and notes are applied here. */
function stateChange(token: Token, change: ShipStateChange): CombatantPatch {
  const out: CombatantPatch = {}
  const conditions = withShipState(token.conditions, change, look)
  if (JSON.stringify(conditions) !== JSON.stringify(token.conditions)) out.conditions = conditions
  // It takes its turns right before the turn in which it was reduced to 0
  if (change.initiative === true && token.initiative === null) out.initiative = (getToken(live.activeId)?.initiative ?? 0) + 0.5
  if (change.initiative === false) out.initiative = null
  if (change.destroyed) out.dead = true
  if (change.malfunctionAll) setMalfunctioning('all', true)
  for (const note of change.notes) logLine(token, 'note', { note, auto: true })
  return out
}

shipHooks.hpChange = (token, next, opts) => stateChange(token, playerShipHpChange(shipStateOf(token.conditions), token.hp.current ?? 0, next.hp?.current ?? 0, { critical: opts.critical, nonlethal: opts.nonlethal, hullDamage: opts.hullDamage }))
shipHooks.damage = (t, amount, opts) => {
  const s = t.sensor
  if (!s || t.hp.current === null) return
  const r = shipDamage({ sp: s.shields ?? 0, hp: t.hp.current }, amount, opts.bypassing)
  if (r.absorbed) { t.sensor = { ...s, shields: r.sp }; patchCombatant(t.id, { sensor: t.sensor }).catch(err => reportError('Saving the shields', err)) }
  updateToken(t.id, { hp: { ...t.hp, current: r.hp } }, { ...opts, absorbed: r.absorbed, hullDamage: Math.max(0, Math.round(amount) - r.absorbed) })
}

/** The compromised ship's hull integrity check on its turn. */
export function hullIntegrity(degree: Degree): void {
  const t = shipToken.value
  if (!t) return
  logLine(t, 'roll', { note: 'Hull integrity check', degree })
  updateToken(t.id, stateChange(t, hullIntegrityCheck(shipStateOf(t.conditions), degree)))
}

export function setShields(t: Token, value: number): void {
  if (!t.sensor) return
  t.sensor = { ...t.sensor, shields: Math.max(0, Math.min(t.sensor.shieldsMax ?? value, Math.round(value))) }
  patchCombatant(t.id, { sensor: t.sensor }).catch(err => reportError('Saving the shields', err))
}

export function moveSensor(t: Token, zone: number | null, heading?: Heading): void {
  if (!t.sensor) return
  t.sensor = { ...t.sensor, ...(zone != null ? { zone: clampZone(zone, zones.value) } : {}), ...(heading ? { heading } : {}) }
  patchCombatant(t.id, { sensor: t.sensor }).catch(err => reportError('Moving the starship', err))
}

export const setZones = (n: number) => { if (Number.isFinite(n)) saveMap({ sensorMap: { zones: Math.max(3, Math.min(30, Math.round(n))) } }, true) }

/** Puts a starship or starship hazard from the compendium on the sensor map, or the party's own ship (no rules id). */
export async function addSensorToken(input: { rulesId: string | null; zone: number; heading: Heading; role: SensorRole }): Promise<void> {
  if (!live.encounter) return
  if (!input.rulesId) {
    const row = ship.row, sh = plainSheet()
    if (!row || !sh) return
    await addCombatant(live.encounter.id, { x: -1000, y: -1000, label: row.name, image: row.image, hp: { current: row.hpCurrent ?? sh.hp, max: sh.hp, temp: 0 }, ac: sh.ac, ally: true, conditions: row.conditions, sensor: { zone: input.zone, heading: input.heading, role: 'player-ship', shields: row.spCurrent ?? sh.sp, shieldsMax: sh.sp } })
  } else {
    const entry = await rulesGet(input.rulesId)
    if (!entry) return
    const stats = tokenStats(entry), sp = entry.kind === 'starship' ? entry.shields?.max ?? null : null
    await addCombatant(live.encounter.id, { x: -1000, y: -1000, ref: { kind: 'rules', rulesId: entry.id, adjustment: null }, image: imageOfRules((entry as { img?: string | null }).img), hp: { current: stats.hpMax, max: stats.hpMax, temp: 0 }, ac: stats.ac, sensor: { zone: input.zone, heading: input.heading, role: input.role, shields: sp, shieldsMax: sp } })
  }
  await refreshTokens()
}

/** Saves where a station stands: on the ship for its interior, on the encounter for a battle. */
export async function placeMarker(slot: number, at: { x: number; y: number } | null): Promise<void> {
  const i = info.value, row = ship.row
  if (!i || !row) return
  if (i.role === 'interior') { await setMarker(row.id, slot, at); await loadShip(); return }
  const name = ship.lookup?.stations.get(stationsOf(row).find(s => s.slot === slot)?.stationId ?? '')?.name ?? 'Station'
  setInfo({ markers: [...i.markers.filter(m => m.slot !== slot), ...(at ? [{ slot, ...at, name }] : [])].sort((a, b) => a.slot - b.slot) })
}

/** Follows the party's ship while a battle is open: its AC on the token, and its state written back to the ship. Returns the stop function. */
export function followShip(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const stopAc = watch([defenses, shipToken], ([d, t]) => { if (d && t && info.value?.role === 'battle' && t.ac !== d.ac) updateToken(t.id, { ac: d.ac }) })
  const stopState = watch(() => [shipToken.value?.hp.current, shipToken.value?.sensor?.shields, JSON.stringify(shipToken.value?.conditions ?? [])], () => {
    const t = shipToken.value, row = ship.row
    if (!t || !row || info.value?.role !== 'battle') return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void writeBackShip(row.id, { hp: t.hp.current, sp: t.sensor?.shields ?? null, conditions: t.conditions }), 400)
  })
  return () => { stopAc(); stopState(); if (timer) clearTimeout(timer) }
}
