/**
 * The party's own starship : the sheet computed from
 * its frame, battle stations, upgrades and expansion bays at its level, and
 * the crew roster (who is at which station). Pure; data/starships.ts does the IO.
 *
 * Rules: Tech Core "Creating Starships" pp. 196–199 (frame + 4 customizable
 * stations + 4 expansion bays; default stations and their built-in upgrades
 * can't be removed and don't count against the limit; crew quarters, lounge
 * and mess bay take no slot; comfortable crew quarters give one more bay),
 * "Exploration Activities" pp. 174–175.
 */
import { frameStatsAt, helmedBonuses, sensorRangeOf, stationActionsAt, stationGradeAt, type HelmedBonuses } from '@/domain/rules/starships'
import type { BattleStation, ExpansionBay, StarshipFrame, StationAction, StationAdvancement, StationUpgrade } from '@/domain/rules/types'

export interface StationSlot {
  /** 1-based slot number, also the marker number on the interior map. */
  slot: number
  /** Battle station entry; null = an empty customizable slot. */
  stationId: string | null
  /** A frame's default station: can't be changed or emptied. */
  isDefault: boolean
  /** Installed upgrades (station upgrade entries). */
  upgradeIds: string[]
  /** Built into the default station by the frame; not counted against the limit. */
  builtInUpgradeIds?: string[]
  /** Where the station stands on the interior map (grid square), P5. */
  marker?: { x: number; y: number } | null
}

export interface BaySlot { bayId: string; option?: string | null }

export interface CrewAssignment {
  characterId: string
  /** Station slot; null = free crew (boarding defense, repairs, anything else). */
  slot: number | null
  /** Exploration activity key (EXPLORATION_ACTIVITIES), decides the start of a starship encounter. */
  activity?: string | null
}

export interface CrewPreset { name: string; crew: CrewAssignment[] }

export interface ExplorationActivity {
  key: string
  name: string
  /** Station it requires (lower-case station name), or null for any. */
  station: string | null
  /** One-line reminder, not the rules text. */
  summary: string
}

/** Tech Core pp. 174–175, summarized. */
export const EXPLORATION_ACTIVITIES: ExplorationActivity[] = [
  { key: 'fly-the-ship', name: 'Fly the Ship', station: "pilot’s console", summary: 'Evade for free when initiative is rolled; the first Evade on your first turn is +1 better.' },
  { key: 'lock-and-load', name: 'Lock and Load', station: 'gunnery', summary: 'Lock On for free when initiative is rolled.' },
  { key: 'power-up', name: 'Power Up', station: 'generator', summary: 'Boost Battle Station for free when initiative is rolled.' },
  { key: 'operate-drone', name: 'Operate Drone', station: 'drone console', summary: 'Deploy Drone for free when initiative is rolled.' },
  { key: 'scan-for-magic', name: 'Scan for Magic', station: 'magic conduit', summary: 'Scan for Magic at regular intervals while travelling.' },
  { key: 'scan-surroundings', name: 'Scan Surroundings', station: 'scanners', summary: 'At the start of an encounter, Seek Starships, then Scan Target one starship.' },
  { key: 'emergency-repairs', name: 'Emergency Repairs', station: null, summary: '1 hour, Crafting: restores Hull Points and removes wrecked on a success.' },
]

/**
 * A suggested skill for initiative at a station. The book only says "a skill
 * associated with the battle station"; these are the skills its actions use.
 */
export const STATION_INITIATIVE_SKILL: Record<string, string> = {
  "pilot’s console": 'Piloting',
  scanners: 'Computers',
  generator: 'Crafting',
  'drone console': 'Crafting',
  'magic conduit': 'your tradition’s skill (Arcana, Nature, Occultism or Religion)',
  gunnery: 'Perception',
}

/** "Pilot's Console" / "pilot’s console" → one key. */
export function stationKey(name: string): string {
  return name.trim().toLowerCase().replace(/'/g, '’')
}

export interface Lookup {
  frame: StarshipFrame | null
  stations: Map<string, BattleStation>
  upgrades: Map<string, StationUpgrade>
  bays: Map<string, ExpansionBay>
}

export interface StationRow {
  slot: StationSlot
  station: BattleStation | null
  grade: StationAdvancement | null
  actions: StationAction[]
  upgradeLimit: number
  upgradesUsed: number
  warnings: string[]
}

export interface StarshipSheet {
  level: number
  hp: number
  sp: number
  ac: number
  saves: { fort: number; ref: number; will: number }
  speed: number
  sensorRange: number
  stations: StationRow[]
  /** Bays that take a slot / slots available. */
  baysUsed: number
  baysLimit: number
  warnings: string[]
}

/** The level the ship is at: pinned, or the party level. */
export function starshipLevel(pinned: number | null | undefined, partyLevel: number | null | undefined): number {
  return Math.max(1, Math.min(20, Math.round(pinned ?? partyLevel ?? 1)))
}

/** The sheet at `level`. With `helmed` (slot numbers), helmed bonuses are added to AC and saves. */
export function starshipSheet(
  ship: { stations: StationSlot[]; bays: BaySlot[] },
  lookup: Lookup,
  level: number,
  helmed?: Set<number>,
): StarshipSheet {
  const warnings: string[] = []
  const stats = lookup.frame ? frameStatsAt(lookup.frame, level) : null
  if (!lookup.frame) warnings.push('No frame chosen.')

  const stations: StationRow[] = [...ship.stations].sort((a, b) => a.slot - b.slot).map(slot => {
    const station = slot.stationId ? lookup.stations.get(slot.stationId) ?? null : null
    const grade = station ? stationGradeAt(station, level) : null
    const limit = grade?.upgrades ?? 0
    // A gunnery's weapon is installed, not an upgrade: it doesn't use an upgrade slot
    const installed = slot.upgradeIds.map(id => lookup.upgrades.get(id))
    const weapons = installed.filter(u => u?.weapon).length
    const used = installed.filter(u => !u?.weapon).length
    const w: string[] = []
    if (slot.stationId && !station) w.push('The battle station entry is missing; import or create it.')
    if (used > limit) w.push(`${used} upgrades but ${limit} at this grade.`)
    const weaponSlots = 1 + (installed.some(u => u?.name.toLowerCase() === 'secondary armaments') ? 1 : 0)
    if (weapons > weaponSlots) w.push(`${weapons} weapons installed: a gunnery holds ${weaponSlots}.`)
    for (const id of slot.upgradeIds) {
      const u = lookup.upgrades.get(id)
      if (!u) { w.push('An upgrade entry is missing.'); continue }
      if (station && u.station !== 'any' && stationKey(u.station) !== stationKey(station.name)) w.push(`${u.name} installs in a ${u.station}.`)
      if (u.level > level) w.push(`${u.name} is level ${u.level}, above the starship.`)
    }
    return { slot, station, grade, actions: station ? stationActionsAt(station, grade?.grade) : [], upgradeLimit: limit, upgradesUsed: used, warnings: w }
  })

  const names = stations.map(r => r.station?.name).filter((n): n is string => !!n).map(stationKey)
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
  // Several gunneries are normal; the book doesn't forbid duplicates, so this only notes them
  if (dupes.length && dupes.some(d => d !== 'gunnery')) warnings.push(`More than one ${dupes.filter(d => d !== 'gunnery').join(', ')}.`)

  const bays = ship.bays.map(b => lookup.bays.get(b.bayId)).filter((b): b is ExpansionBay => !!b)
  const baysUsed = bays.filter(b => b.takesSlot).length
  const comfortable = ship.bays.some(b => b.option?.toLowerCase() === 'comfortable' && lookup.bays.get(b.bayId)?.name.toLowerCase() === 'crew quarters')
  const baysLimit = (lookup.frame?.expansionBays ?? 0) + (comfortable ? 1 : 0)
  if (baysUsed > baysLimit) warnings.push(`${baysUsed} expansion bays but ${baysLimit} slots.`)

  const bonus: HelmedBonuses = helmed
    ? helmedBonuses(stations.filter(r => helmed.has(r.slot.slot)).map(r => r.grade))
    : { ac: 0, fort: 0, ref: 0, will: 0 }
  return {
    level,
    hp: stats?.hp ?? 0,
    sp: stats?.sp ?? 0,
    ac: (stats?.ac ?? 10) + bonus.ac,
    saves: { fort: (stats?.fort ?? 0) + bonus.fort, ref: (stats?.ref ?? 0) + bonus.ref, will: (stats?.will ?? 0) + bonus.will },
    speed: stats?.speed ?? 0,
    sensorRange: lookup.frame ? sensorRangeOf(lookup.frame, stations.map(r => r.grade)) : 0,
    stations,
    baysUsed,
    baysLimit,
    warnings,
  }
}

/** The frame's default stations as slots 1…n, the customizable ones after them. */
export function slotsForFrame(frame: StarshipFrame, findStation: (name: string) => string | null, findUpgrade: (name: string) => string | null): StationSlot[] {
  const defaults = frame.defaultStations.map((d, i): StationSlot => {
    const built = d.upgrades.map(findUpgrade).filter((id): id is string => !!id)
    return { slot: i + 1, stationId: findStation(d.station), isDefault: true, upgradeIds: [], builtInUpgradeIds: built }
  })
  const custom = Array.from({ length: frame.customSlots }, (_, i): StationSlot => ({ slot: defaults.length + i + 1, stationId: null, isDefault: false, upgradeIds: [] }))
  return [...defaults, ...custom]
}

/**
 * Puts a character on a station slot (or makes them free crew with null). A
 * station holds one character: whoever was there becomes free crew.
 */
export function assignCrew(crew: CrewAssignment[], characterId: string, slot: number | null, activity?: string | null): CrewAssignment[] {
  const out = crew.filter(c => c.characterId !== characterId).map(c => (slot != null && c.slot === slot ? { ...c, slot: null } : c))
  const prev = crew.find(c => c.characterId === characterId)
  out.push({ characterId, slot, activity: activity !== undefined ? activity : prev?.activity ?? null })
  return out.sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99) || a.characterId.localeCompare(b.characterId))
}

/** Drops assignments of characters that left the party and of slots that no longer exist. */
export function cleanCrew(crew: CrewAssignment[], characterIds: Set<string>, slots: Set<number>): CrewAssignment[] {
  return crew.filter(c => characterIds.has(c.characterId)).map(c => (c.slot != null && !slots.has(c.slot) ? { ...c, slot: null } : c))
}

/** Exploration activities a character at this station can take. */
export function activitiesFor(stationName: string | null | undefined): ExplorationActivity[] {
  const key = stationName ? stationKey(stationName) : null
  return EXPLORATION_ACTIVITIES.filter(a => a.station === null || a.station === key)
}

/** What changed from `before` to `now` (a level-up): stats, grades and upgrade slots, as short lines. */
export function starshipLevelChanges(before: StarshipSheet, now: StarshipSheet): string[] {
  const out: string[] = []
  const stat = (label: string, a: number, b: number) => { if (b !== a) out.push(`${label} ${a} → ${b}`) }
  stat('HP', before.hp, now.hp)
  stat('SP', before.sp, now.sp)
  stat('AC', before.ac, now.ac)
  stat('Fort', before.saves.fort, now.saves.fort)
  stat('Ref', before.saves.ref, now.saves.ref)
  stat('Will', before.saves.will, now.saves.will)
  stat('Speed', before.speed, now.speed)
  stat('Sensor range', before.sensorRange, now.sensorRange)
  for (const r of now.stations) {
    const prev = before.stations.find(p => p.slot.slot === r.slot.slot)
    if (!r.station || !prev || prev.station?.id !== r.station.id) continue
    if (r.grade?.grade !== prev.grade?.grade) out.push(`${r.station.name}: ${prev.grade?.grade ?? '—'} → ${r.grade?.grade ?? '—'}`)
    if (r.upgradeLimit > prev.upgradeLimit) out.push(`${r.station.name}: ${r.upgradeLimit - prev.upgradeLimit} more upgrade slot${r.upgradeLimit - prev.upgradeLimit === 1 ? '' : 's'}`)
    const newActions = r.actions.filter(a => !prev.actions.some(p => p.name === a.name)).map(a => a.name)
    if (newActions.length) out.push(`${r.station.name}: new ${newActions.join(', ')}`)
  }
  return out
}

// ── On the map (P5) ───────────────────────────────────────────────────────

export interface StationMarker { slot: number; x: number; y: number; name: string }

/**
 * What makes an encounter a starship encounter: its ship, whether it's the
 * ship's interior template or a battle copied from it, and the battle
 * stations on its map (the interior's markers live on the ship).
 */
export interface EncounterStarship {
  shipId: string
  role: 'interior' | 'battle'
  markers: StationMarker[]
  /** Battle: slots of the player ship's malfunctioning battle stations (P7). */
  malfunctioning?: number[]
  /** Battle: the concierge upgrade variant rule (no small-crew budget cut), P8. */
  concierge?: boolean
}

export interface MapTokenLike { id: string; x: number; y: number; size: number; dead?: boolean; conditions?: { name: string }[] }

const OUT = /^(unconscious|dying|dead)$/i

/** Slot → the token helming it: on the station's square, not unconscious; the first one wins. */
export function helmingTokens(markers: StationMarker[], tokens: MapTokenLike[]): Map<number, string> {
  const out = new Map<number, string>()
  for (const m of markers) {
    const t = tokens.find(t => !t.dead && !(t.conditions ?? []).some(c => OUT.test(c.name))
      && m.x >= t.x && m.x < t.x + Math.max(1, t.size) && m.y >= t.y && m.y < t.y + Math.max(1, t.size))
    if (t) out.set(m.slot, t.id)
  }
  return out
}

/** The slot a token helms, if any. */
export function slotHelmedBy(markers: StationMarker[], tokens: MapTokenLike[], tokenId: string): number | null {
  for (const [slot, id] of helmingTokens(markers, tokens)) if (id === tokenId) return slot
  return null
}

/** Free squares around a point, nearest first (ring by ring), skipping taken ones. */
export function freeSquaresNear(x: number, y: number, taken: Set<string>, count: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let r = 1; out.length < count && r < 30; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const p = { x: x + dx, y: y + dy }
        if (p.x < 0 || p.y < 0 || taken.has(`${p.x},${p.y}`)) continue
        taken.add(`${p.x},${p.y}`)
        out.push(p)
        if (out.length >= count) return out
      }
    }
  }
  return out
}

/** Markers for a battle copied from the ship's stations. */
export function markersFromStations(slots: StationSlot[], nameOf: (stationId: string | null) => string): StationMarker[] {
  return slots.flatMap(s => (s.marker && s.stationId ? [{ slot: s.slot, x: s.marker.x, y: s.marker.y, name: nameOf(s.stationId) }] : []))
}

/** A crew member's skill modifier as entered by hand on the Starship page (lower-case skill → modifier), or null. */
export function crewSkill(c: { skills?: Record<string, number> | null } | null | undefined, skill: string): number | null {
  const own = c?.skills?.[skill.toLowerCase()]
  return typeof own === 'number' ? own : null
}
