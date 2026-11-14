/** What links (and factions picked on an NPC) say about an entry: an NPC's factions, places and last session; a faction's members. Derived, never stored. */
import { npcFactions, type Entry, type EntryOf } from '@/domain/schema'
import { getDb } from './db'

export interface Relations { factions: Entry[]; locations: Entry[]; members: Entry[]; lastSession: EntryOf<'session'> | null }

/** Entries linked with this one in either direction. */
async function linked(entry: Entry): Promise<Entry[]> {
  const db = getDb()
  const [out, into] = await Promise.all([db.rows('links').where('sourceId').equals(entry.id).toArray(), db.rows('links').where('targetEntryId').equals(entry.id).toArray()])
  const ids = new Set([...out.map(l => l.targetEntryId), ...into.map(l => l.sourceId)].filter((id): id is string => !!id && id !== entry.id))
  return (await db.rows('entries').bulkGet([...ids])).filter((e): e is Entry => !!e)
}

export async function relationsOf(entry: Entry): Promise<Relations> {
  const db = getDb()
  const around = await linked(entry)
  const pinnedOn = entry.type === 'npc'
    ? (await db.rows('entries').bulkGet((await db.rows('mapPins').where('entryId').equals(entry.id).toArray()).map(p => p.mapEntryId))).filter((e): e is Entry => !!e)
    : []
  // Factions picked on the NPC count like links, both ways
  if (npcFactions(entry).length) around.push(...(await db.rows('entries').bulkGet(npcFactions(entry))).filter((e): e is Entry => !!e))
  if (entry.type === 'faction') around.push(...await db.rows('entries').where('campaignId').equals(entry.campaignId).filter(e => npcFactions(e).includes(entry.id)).toArray())
  const sessions = around.filter((e): e is EntryOf<'session'> => e.type === 'session').sort((a, b) => (Number(b.data.number) || 0) - (Number(a.data.number) || 0) || b.updatedAt.localeCompare(a.updatedAt))
  const unique = (list: Entry[]) => [...new Map(list.map(e => [e.id, e])).values()].sort((a, b) => a.name.localeCompare(b.name))
  return {
    factions: unique(around.filter(e => e.type === 'faction')),
    locations: unique([...around.filter(e => e.type === 'location'), ...pinnedOn]),
    members: unique(around.filter(e => e.type === 'npc')),
    lastSession: sessions[0] ?? null,
  }
}

/**
 * For the World list's filters: every NPC of the campaign with the names of the factions it is
 * linked with and the locations it is found at (linked either way, or pinned on the location's map).
 */
export async function npcPlaces(campaignId: string): Promise<Record<string, { Faction: string[]; Location: string[] }>> {
  const db = getDb()
  const entries = await db.rows('entries').where('campaignId').equals(campaignId).toArray()
  const byId = new Map(entries.map(e => [e.id, e]))
  const out: Record<string, { Faction: string[]; Location: string[] }> = {}
  const note = (npcId: string, other: Entry | undefined) => {
    if (!other || (other.type !== 'faction' && other.type !== 'location')) return
    const row = out[npcId] ??= { Faction: [], Location: [] }
    const list = other.type === 'faction' ? row.Faction : row.Location
    if (!list.includes(other.name)) list.push(other.name)
  }
  const links = await db.rows('links').where('sourceId').anyOf([...byId.keys()]).toArray()
  for (const l of links) {
    if (!l.targetEntryId) continue
    const a = byId.get(l.sourceId), b = byId.get(l.targetEntryId)
    if (a?.type === 'npc') note(a.id, b)
    if (b?.type === 'npc') note(b.id, a)
  }
  for (const e of entries) for (const id of npcFactions(e)) note(e.id, byId.get(id))
  for (const p of await db.rows('mapPins').where('campaignId').equals(campaignId).toArray()) {
    if (p.entryId && byId.get(p.entryId)?.type === 'npc') note(p.entryId, byId.get(p.mapEntryId))
  }
  return out
}
