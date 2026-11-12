/** What links say about an entry: an NPC's factions, places and last session; a faction's members. Derived, never stored. */
import type { Entry, EntryOf } from '@/domain/schema'
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
  const sessions = around.filter((e): e is EntryOf<'session'> => e.type === 'session').sort((a, b) => (Number(b.data.number) || 0) - (Number(a.data.number) || 0) || b.updatedAt.localeCompare(a.updatedAt))
  const unique = (list: Entry[]) => [...new Map(list.map(e => [e.id, e])).values()].sort((a, b) => a.name.localeCompare(b.name))
  return {
    factions: unique(around.filter(e => e.type === 'faction')),
    locations: unique([...around.filter(e => e.type === 'location'), ...pinnedOn]),
    members: unique(around.filter(e => e.type === 'npc')),
    lastSession: sessions[0] ?? null,
  }
}
