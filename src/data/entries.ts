/**
 * Writes to lore entries. Each runs in one transaction and keeps what hangs
 * on an entry in step: its links, the text of entries that name it (a rename
 * rewrites them), pins, graph nodes, history.
 */
import { extractRefs, isEntryTypeName, renameRefs, uniqueName } from '@/domain/links'
import { newId, nowIso } from '@/domain/ids'
import { ENTRY_DATA, npcFactions, zEntry, type Entry, type EntryType, type EntryVersion, type Link } from '@/domain/schema'
import { getDb } from './db'

const LABEL: Record<EntryType, string> = {
  npc: 'NPC', location: 'Location', faction: 'Faction', quest: 'Quest', event: 'Event', session: 'Session', note: 'Note',
  'random-table': 'Table', rumor: 'Rumor', region: 'Region',
}

/** Text of an entry that can hold references: the body, a quest's reward, a table's results. */
function textsOf(e: Entry): string[] {
  if (e.type === 'quest') return [e.body, e.data.reward]
  if (e.type === 'random-table') return [e.body, ...e.data.rows.map(r => r.result)]
  return [e.body]
}

async function linksFor(e: Entry): Promise<Link[]> {
  const db = getDb()
  const refs = extractRefs(textsOf(e).join('\n'))
  const out: Link[] = []
  for (const r of refs) {
    let targetEntryId: string | null = null
    if (isEntryTypeName(r.type)) {
      const wanted = r.name.toLowerCase()
      const match = await db.rows('entries').where('[campaignId+type]').equals([e.campaignId, r.type]).filter(x => x.name.trim().toLowerCase() === wanted).first()
      targetEntryId = match?.id ?? null
    }
    out.push({ id: newId(), sourceId: e.id, targetType: r.type, targetName: r.name, targetEntryId, meta: r.meta })
  }
  return out
}

async function syncLinks(e: Entry): Promise<void> {
  const db = getDb()
  await db.rows('links').where('sourceId').equals(e.id).delete()
  const links = await linksFor(e)
  if (links.length) await db.rows('links').bulkPut(links)
}

function entryTables() {
  const db = getDb()
  return [db.rows('entries'), db.rows('links'), db.rows('entryVersions'), db.rows('mapPins'), db.rows('graphs'), db.rows('graphEdges'), db.rows('characters'), db.rows('sessionPanels'), db.rows('sessionEdges')]
}

export async function createEntry(campaignId: string, type: EntryType, name?: string): Promise<Entry> {
  const db = getDb()
  return db.transaction('rw', entryTables(), async () => {
    const taken = (await db.rows('entries').where('[campaignId+type]').equals([campaignId, type]).toArray()).map(e => e.name)
    const ts = nowIso()
    const entry = zEntry.parse({ id: newId(), campaignId, type, name: uniqueName(name?.trim() || `New ${LABEL[type]}`, taken), data: ENTRY_DATA[type].parse({}), createdAt: ts, updatedAt: ts })
    await db.rows('entries').put(entry)
    // Names that were waiting for this entry now resolve
    await adoptWaitingLinks(entry)
    return entry
  })
}

/** Links by name that had no target and now match this entry. */
async function adoptWaitingLinks(e: Entry): Promise<void> {
  const db = getDb()
  const wanted = e.name.trim().toLowerCase()
  const waiting = await db.rows('links').where('[targetType+targetName]').between([e.type, ''], [e.type, '\uffff']).filter(l => l.targetEntryId === null && l.targetName.trim().toLowerCase() === wanted).toArray()
  for (const l of waiting) {
    const source = await db.rows('entries').get(l.sourceId)
    if (source?.campaignId === e.campaignId) await db.rows('links').update(l.id, { targetEntryId: e.id })
  }
}

export interface EntryPatch { name?: string; body?: string; tags?: string[]; favorite?: boolean; data?: Record<string, unknown> }

/** Saves a change. `data` is merged onto the stored data, so a field changed elsewhere meanwhile is not overwritten. */
export async function saveEntry(id: string, patch: EntryPatch): Promise<Entry | null> {
  const db = getDb()
  return db.transaction('rw', entryTables(), async () => {
    const old = await db.rows('entries').get(id)
    if (!old) return null
    const name = patch.name !== undefined ? patch.name.trim() || old.name : old.name
    const next = zEntry.parse({ ...old, ...patch, name, data: { ...old.data, ...(patch.data ?? {}) }, updatedAt: nowIso() })
    await db.rows('entries').put(next)
    if (textsOf(next).join('\n') !== textsOf(old).join('\n')) await syncLinks(next)
    if (next.name !== old.name) await renamed(old, next)
    return next
  })
}

/** After a rename: the entries that name it are rewritten, and names that matched the new name start resolving. */
async function renamed(old: Entry, next: Entry): Promise<void> {
  const db = getDb()
  const incoming = await db.rows('links').where('targetEntryId').equals(next.id).toArray()
  for (const sourceId of new Set(incoming.map(l => l.sourceId))) {
    const source = await db.rows('entries').get(sourceId)
    if (!source) continue
    const fix = (text: string) => renameRefs(text, next.type, old.name, next.name)
    const data = source.type === 'quest' ? { ...source.data, reward: fix(source.data.reward) }
      : source.type === 'random-table' ? { ...source.data, rows: source.data.rows.map(r => ({ ...r, result: fix(r.result) })) }
        : source.data
    await db.rows('entries').put(zEntry.parse({ ...source, body: fix(source.body), data }))
  }
  // Session panels and the drawer hold text of their own (a session's body is only their sum)
  await db.rows('sessionPanels').where('campaignId').equals(next.campaignId).modify((panel) => {
    const title = renameRefs(panel.title, next.type, old.name, next.name), body = renameRefs(panel.body, next.type, old.name, next.name)
    if (title !== panel.title || body !== panel.body) { panel.title = title; panel.body = body }
  })
  for (const l of incoming) await db.rows('links').update(l.id, { targetName: next.name })
  // A quest keeps its giver's name beside the id
  await db.rows('entries').where('[campaignId+type]').equals([next.campaignId, 'quest']).modify((q) => {
    if (q.type === 'quest' && q.data.giver.entryId === next.id) q.data.giver.name = next.name
  })
  await adoptWaitingLinks(next)
}

export async function deleteEntry(id: string): Promise<void> {
  const db = getDb()
  await db.transaction('rw', entryTables(), async () => {
    const e = await db.rows('entries').get(id)
    if (!e) return
    await db.rows('links').where('sourceId').equals(id).delete()
    // What named it keeps its text; the link just has no target any more
    await db.rows('links').where('targetEntryId').equals(id).modify({ targetEntryId: null })
    await db.rows('entryVersions').where('entryId').equals(id).delete()
    await db.rows('mapPins').where('mapEntryId').equals(id).delete()
    await db.rows('mapPins').where('entryId').equals(id).delete()
    await db.rows('graphEdges').where('campaignId').equals(e.campaignId).filter(g => g.sourceEntryId === id || g.targetEntryId === id).delete()
    await db.rows('graphs').where('campaignId').equals(e.campaignId).modify((g) => { g.nodes = g.nodes.filter(n => n.entryId !== id) })
    await db.rows('characters').where('entryId').equals(id).modify({ entryId: null })
    await db.rows('entries').where('campaignId').equals(e.campaignId).modify((x) => {
      if (x.type === 'quest' && x.data.giver.entryId === id) x.data.giver.entryId = null
      if (x.type === 'region' && x.data.mapEntryId === id) x.data.mapEntryId = null
      if (x.type === 'npc' && npcFactions(x).includes(id)) x.data.factions = npcFactions(x).filter(f => f !== id)
    })
    if (e.type === 'session') {
      await db.rows('sessionPanels').where('sessionId').equals(id).delete()
      await db.rows('sessionEdges').where('sessionId').equals(id).delete()
    }
    await db.rows('entries').delete(id)
  })
}

// ── History ────────────────────────────────────────────────────────────────

export const versions = {
  of: (entryId: string): Promise<EntryVersion[]> => getDb().rows('entryVersions').where('entryId').equals(entryId).sortBy('createdAt'),
  async record(entryId: string, label: string, note: string): Promise<EntryVersion | null> {
    const db = getDb()
    const e = await db.rows('entries').get(entryId)
    if (!e) return null
    const v: EntryVersion = { id: newId(), entryId, label: label.trim() || new Date().toLocaleDateString(), note: note.trim(), name: e.name, body: e.body, data: { ...e.data }, eventId: null, createdAt: nowIso() }
    await db.rows('entryVersions').put(v)
    return v
  },
  /** Puts a recorded state back as the entry's present (the present is recorded first, so nothing is lost). */
  async restore(versionId: string): Promise<void> {
    const v = await getDb().rows('entryVersions').get(versionId)
    if (!v) return
    await versions.record(v.entryId, `Before restoring “${v.label}”`, '')
    await saveEntry(v.entryId, { name: v.name, body: v.body, data: v.data })
  },
  remove: (versionId: string) => getDb().rows('entryVersions').delete(versionId),
}

/** Entries of some types, for pickers. */
export async function entriesNamed(campaignId: string, types: EntryType[]): Promise<Pick<Entry, 'id' | 'name' | 'type'>[]> {
  const db = getDb()
  const out: Pick<Entry, 'id' | 'name' | 'type'>[] = []
  for (const type of types) {
    await db.rows('entries').where('[campaignId+type]').equals([campaignId, type]).each((e) => { out.push({ id: e.id, name: e.name, type: e.type }) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
