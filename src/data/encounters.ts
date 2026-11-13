/**
 * Encounters: the prepared fight (encounters), what changes with every stroke
 * (encounterMaps), the tokens standing in it (combatants) and its log
 * (combatLog, one row per line). Also the token library (actors), which all
 * campaigns share.
 */
import { newId, nowIso } from '@/domain/ids'
import type { AreaOverlay } from '@/domain/rules/areas'
import type { Adjustment } from '@/domain/rules/combat'
import type { TokenCondition, TokenTimer } from '@/domain/rules/conditions'
import { encounterOwner } from '@/domain/rules/inventory'
import type { Wall } from '@/domain/rules/walls'
import { zActor, zCombatLogEntry, zCombatant, zEncounter, zEncounterMap, type Actor, type ActorRef, type CombatLogEntry, type Combatant, type Encounter, type EncounterMap, type ImageRef, type MapAsset, zMapAsset } from '@/domain/schema'
import { getDb } from './db'

const table = () => getDb().rows('encounters')
const maps = () => getDb().rows('encounterMaps')
const tokens = () => getDb().rows('combatants')
const log = () => getDb().rows('combatLog')
const actorTable = () => getDb().rows('actors')

/** A combatant as the encounter works with it: named, pictured, its conditions and timers typed. */
export interface Token extends Omit<Combatant, 'conditions' | 'timers'> {
  name: string
  /** The picture to draw: its own, its library token's, or its entry's. */
  shown: ImageRef | null
  conditions: TokenCondition[]
  timers: TokenTimer[]
}

export interface StatLink { rulesId: string; adjustment: Adjustment | null }

/** The compendium stat block a token uses: what it stands for, or the one given besides. */
export function statLinkOf(t: Pick<Combatant, 'ref' | 'statBlock'>): StatLink | null {
  if (t.ref.kind === 'rules') return { rulesId: t.ref.rulesId, adjustment: t.ref.adjustment }
  return t.statBlock
}

export function imageOfRules(value: string | null | undefined): ImageRef | null {
  if (!value) return null
  const m = /^img:(.+)$/.exec(value)
  return m?.[1] ? { imageId: m[1] } : { url: value }
}

/** Name and picture of what a reference stands for. */
async function describeRef(ref: ActorRef, stat: StatLink | null): Promise<{ name: string | null; image: ImageRef | null }> {
  const db = getDb()
  if (ref.kind === 'character') {
    const c = await db.rows('characters').get(ref.characterId)
    const entry = c?.entryId ? await db.rows('entries').get(c.entryId) : undefined
    return { name: entry?.name ?? c?.name ?? null, image: entry?.type === 'npc' ? entry.data.portrait : null }
  }
  if (ref.kind === 'entry') {
    const entry = await db.rows('entries').get(ref.entryId)
    return { name: entry?.name ?? null, image: entry?.type === 'npc' ? entry.data.portrait : null }
  }
  const id = ref.kind === 'rules' ? ref.rulesId : stat?.rulesId
  const row = id ? await db.rows('rules').get(id) as { name: string; img?: string | null; tokenImg?: string | null } | undefined : undefined
  return { name: row?.name ?? null, image: imageOfRules(row?.tokenImg ?? row?.img) }
}

async function toToken(c: Combatant, actors: Map<string, Actor>): Promise<Token> {
  const actor = c.actorId ? actors.get(c.actorId) : undefined
  const linked = await describeRef(c.ref, statLinkOf(c))
  const adj = c.ref.kind === 'rules' ? c.ref.adjustment : null
  const base = actor?.name ?? linked.name ?? 'Token'
  return {
    ...c,
    name: c.label || (adj && !actor ? `${adj === 'elite' ? 'Elite' : 'Weak'} ${base}` : base),
    shown: c.image ?? (actor && !actor.syncImage ? actor.image : null) ?? linked.image ?? actor?.image ?? null,
    conditions: c.conditions as unknown as TokenCondition[],
    timers: c.timers as unknown as TokenTimer[],
  }
}

// ── Reads ──────────────────────────────────────────────────────────────────

export const encounters = {
  ofCampaign: async (campaignId: string): Promise<Encounter[]> => (await table().where('campaignId').equals(campaignId).toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  get: (id: string): Promise<Encounter | undefined> => table().get(id),
  byName: async (campaignId: string, name: string): Promise<Encounter | undefined> => (await table().where('campaignId').equals(campaignId).toArray()).find(e => e.name.trim().toLowerCase() === name.trim().toLowerCase()),
  /** The map row; an encounter made before it had one gets it here. */
  async map(id: string): Promise<EncounterMap> {
    return (await maps().get(id)) ?? zEncounterMap.parse({ id })
  },
  combatants: (encounterId: string): Promise<Combatant[]> => tokens().where('encounterId').equals(encounterId).toArray(),
  async tokens(encounterId: string): Promise<Token[]> {
    const rows = await encounters.combatants(encounterId)
    const actors = new Map((await actorTable().bulkGet(rows.map(r => r.actorId ?? ''))).filter((a): a is Actor => !!a).map(a => [a.id, a]))
    return Promise.all(rows.map(r => toToken(r, actors)))
  },
  log: (encounterId: string): Promise<CombatLogEntry[]> => log().where('[encounterId+seq]').between([encounterId, -Infinity], [encounterId, Infinity]).toArray(),
  /** Token counts per encounter, for the list. */
  async counts(ids: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    for (const id of ids) out.set(id, await tokens().where('encounterId').equals(id).count())
    return out
  },
}

export const areasOf = (m: EncounterMap): AreaOverlay[] => m.areas as unknown as AreaOverlay[]
export const wallsOf = (m: EncounterMap): Wall[] => m.walls

// ── Encounters ─────────────────────────────────────────────────────────────

export async function createEncounter(campaignId: string, name = 'New encounter', init: Partial<Encounter> = {}): Promise<Encounter> {
  const ts = nowIso()
  const row = zEncounter.parse({ ...init, id: newId(), campaignId, name: name.trim() || 'New encounter', createdAt: ts, updatedAt: ts })
  await getDb().transaction('rw', table(), maps(), async () => {
    await table().put(row)
    await maps().put(zEncounterMap.parse({ id: row.id }))
  })
  return row
}

export type EncounterPatch = Partial<Omit<Encounter, 'id' | 'campaignId' | 'createdAt'>>

export async function patchEncounter(id: string, patch: EncounterPatch): Promise<void> {
  // Read and write in one transaction: two quick changes must not overwrite each other
  await getDb().transaction('rw', table(), async () => {
    const row = await table().get(id)
    if (row) await table().put(zEncounter.parse({ ...row, ...JSON.parse(JSON.stringify(patch)) as EncounterPatch, updatedAt: nowIso() }))
  })
}

export async function patchMap(id: string, patch: Partial<Omit<EncounterMap, 'id'>>): Promise<void> {
  await getDb().transaction('rw', maps(), async () => {
    const row = await encounters.map(id)
    await maps().put(zEncounterMap.parse({ ...row, ...JSON.parse(JSON.stringify(patch)) as Partial<EncounterMap>, id }))
  })
}

/** A copy with its map, walls, fog and tokens, back in preparation and without a log. */
export async function cloneEncounter(id: string): Promise<Encounter | null> {
  const src = await table().get(id)
  if (!src) return null
  const copy = await createEncounter(src.campaignId, `${src.name} (Copy)`, {
    map: src.map, grid: src.grid, fovEnabled: src.fovEnabled, playlistId: src.playlistId, initiativeFormula: src.initiativeFormula, partyLevel: src.partyLevel, starship: src.starship,
  })
  const map = await encounters.map(id)
  const ids = new Map<string, string>()
  const rows = (await encounters.combatants(id)).map((c) => { const next = newId(); ids.set(c.id, next); return { ...c, id: next, encounterId: copy.id } })
  // An emanation follows its token: point it at the copy
  const areas = areasOf(map).map(a => (typeof a.attachedTokenId === 'string' ? { ...a, attachedTokenId: ids.get(a.attachedTokenId) ?? null } : a))
  await maps().put(zEncounterMap.parse({ ...map, id: copy.id, areas: JSON.parse(JSON.stringify(areas)) as unknown[] }))
  await tokens().bulkPut(rows)
  return copy
}

/** Deletes the encounter with its map, tokens, log and planned loot. */
export async function deleteEncounter(id: string): Promise<void> {
  const db = getDb()
  const enc = await table().get(id)
  if (!enc) return
  const owner = encounterOwner(id)
  await db.transaction('rw', [table(), maps(), tokens(), log(), db.rows('inventory'), db.rows('purses')], async () => {
    await tokens().where('encounterId').equals(id).delete()
    await log().where('[encounterId+seq]').between([id, -Infinity], [id, Infinity]).delete()
    await db.rows('inventory').where('[campaignId+ownerKey]').equals([enc.campaignId, owner]).delete()
    await db.rows('purses').where('[campaignId+ownerKey]').equals([enc.campaignId, owner]).delete()
    await maps().delete(id)
    await table().delete(id)
  })
}

// ── Combatants ─────────────────────────────────────────────────────────────

export type CombatantInput = Partial<Omit<Combatant, 'id' | 'encounterId'>> & { x: number; y: number }

export async function addCombatant(encounterId: string, input: CombatantInput): Promise<Combatant> {
  const row = zCombatant.parse({ ...JSON.parse(JSON.stringify(input)) as CombatantInput, id: newId(), encounterId })
  await tokens().put(row)
  return row
}

export type CombatantPatch = Partial<Omit<Token, 'id' | 'encounterId' | 'name' | 'shown'>>

export async function patchCombatant(id: string, patch: CombatantPatch): Promise<void> {
  await getDb().transaction('rw', tokens(), async () => {
    const row = await tokens().get(id)
    if (row) await tokens().put(zCombatant.parse({ ...row, ...JSON.parse(JSON.stringify(patch)) as Partial<Combatant>, id, encounterId: row.encounterId }))
  })
}

export async function removeCombatants(ids: string[]): Promise<void> {
  await tokens().bulkDelete(ids)
}

// ── Combat log ─────────────────────────────────────────────────────────────

export type LogInput = Omit<CombatLogEntry, 'id' | 'encounterId' | 'seq' | 'at'>

export function makeLogEntry(encounterId: string, seq: number, input: LogInput): CombatLogEntry {
  return zCombatLogEntry.parse({ ...input, id: newId(), encounterId, seq, at: nowIso() })
}

export const combatLog = {
  put: (entry: CombatLogEntry) => log().put(JSON.parse(JSON.stringify(entry)) as CombatLogEntry),
  remove: (ids: string[]) => log().bulkDelete(ids),
  clear: (encounterId: string) => log().where('[encounterId+seq]').between([encounterId, -Infinity], [encounterId, Infinity]).delete(),
}

// ── Token library ──────────────────────────────────────────────────────────

export const actors = {
  /** Pinned tokens and party members first, then by name. */
  async list(): Promise<Actor[]> {
    const first = (a: Actor) => (a.pinned || a.ref.kind === 'character' ? 0 : 1)
    return (await actorTable().toArray()).sort((a, b) => first(a) - first(b) || a.name.localeCompare(b.name))
  },
  get: (id: string) => actorTable().get(id),
  async save(input: Partial<Actor> & { name: string }): Promise<Actor> {
    const existing = input.id ? await actorTable().get(input.id) : undefined
    const row = zActor.parse({ ...existing, ...JSON.parse(JSON.stringify(input)) as Partial<Actor>, id: existing?.id ?? newId(), createdAt: existing?.createdAt ?? nowIso() })
    await actorTable().put(row)
    return row
  },
  /** Removes the library token; tokens already placed from it keep their own data. */
  async remove(id: string): Promise<void> {
    await actorTable().delete(id)
  },
  /** With "image follows the entry" on, the picture shown is the linked entry's. */
  async shown(a: Actor): Promise<ImageRef | null> {
    if (!a.syncImage) return a.image
    return (await describeRef(a.ref, a.ref.kind === 'rules' ? a.ref : a.statBlock)).image ?? a.image
  },
  /** The library token of a party member, made from their name and portrait when they have none. */
  async forCharacter(characterId: string): Promise<Actor | null> {
    const db = getDb()
    const c = await db.rows('characters').get(characterId)
    if (!c) return null
    const have = (c.actorId ? await actorTable().get(c.actorId) : undefined)
      ?? (await actorTable().toArray()).find(a => (a.ref.kind === 'character' && a.ref.characterId === c.id) || (a.ref.kind === 'entry' && a.ref.entryId === c.entryId))
    const entry = c.entryId ? await db.rows('entries').get(c.entryId) : undefined
    const actor = have ?? await actors.save({
      name: entry?.name ?? c.name, ref: { kind: 'character', characterId: c.id }, syncImage: !!c.entryId,
      statBlock: c.companionRulesId ? { rulesId: c.companionRulesId, adjustment: null } : null,
    })
    if (c.actorId !== actor.id) await db.rows('characters').update(c.id, { actorId: actor.id })
    return actor
  },
}

export async function playlistNames(): Promise<{ id: string; name: string }[]> {
  return (await getDb().rows('soundPlaylists').toArray()).map(p => ({ id: p.id, name: p.name }))
}

// ── Map maker ──────────────────────────────────────────────────────────────

/**
 * Makes a map maker's map the encounter's map: the rendered image, a grid that
 * fits it, the tiles for editing again, and (when given) the walls derived
 * from the tiles in place of the ones derived before. Walls drawn by hand stay.
 */
export async function applyBattleMap(id: string, battlemap: Record<string, unknown>, image: ImageRef, cellPx: number, walls: { points: { x: number; y: number }[]; kind: Wall['kind'] }[] | null): Promise<void> {
  await patchEncounter(id, { map: image, grid: { size: cellPx, offsetX: 0, offsetY: 0 }, ...(walls ? { fovEnabled: true } : {}) })
  const map = await encounters.map(id)
  const next = walls ? [...map.walls.filter(w => !w.generated), ...walls.map(w => ({ id: newId(), points: w.points, kind: w.kind, open: false, generated: true }))] : map.walls
  await patchMap(id, { battlemap, walls: next, viewport: { x: 0, y: 0, scale: 1 } })
}

export const mapAssets = {
  list: async (): Promise<MapAsset[]> => (await getDb().rows('mapAssets').toArray()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  async add(input: Omit<MapAsset, 'id' | 'createdAt'>): Promise<MapAsset> {
    const row = zMapAsset.parse({ ...input, id: newId(), createdAt: nowIso() })
    await getDb().rows('mapAssets').put(row)
    return row
  },
  /** Removes assets from the library; copies already placed on maps keep their image. */
  remove: (ids: string[]) => getDb().rows('mapAssets').bulkDelete(ids),
}
