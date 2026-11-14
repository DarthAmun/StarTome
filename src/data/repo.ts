/**
 * Repositories: the only way the rest of the app reads and writes rows.
 * Every write goes through the collection's schema, so the database never
 * holds a row its type doesn't describe.
 */
import { liveQuery, type Observable } from 'dexie'
import { COLLECTIONS, DEFAULT_SETTINGS, workspaceId, zSettings, type Campaign, type CollectionName, type Entry, type EntryType, type ImageRow, type RowOf, type RulesRow, type Settings } from '@/domain/schema'
import { nowIso } from '@/domain/ids'
import { getDb, onDatabaseChange } from './db'

export { onDatabaseChange }

export function parseRow<C extends CollectionName>(name: C, row: unknown): RowOf<C> {
  return COLLECTIONS[name].parse(row) as RowOf<C>
}

export async function getRow<C extends CollectionName>(name: C, id: string): Promise<RowOf<C> | undefined> {
  return getDb().rows(name).get(id)
}

export async function putRow<C extends CollectionName>(name: C, row: unknown): Promise<RowOf<C>> {
  const checked = parseRow(name, row)
  await getDb().rows(name).put(checked)
  return checked
}

export async function removeRow(name: CollectionName, id: string): Promise<void> {
  await getDb().rows(name).delete(id)
}

/** A query that re-runs when the rows it read change, in this tab or another. */
export function live<T>(query: () => Promise<T>): Observable<T> {
  return liveQuery(query)
}

// ── Campaigns ──────────────────────────────────────────────────────────────

export const campaigns = {
  list: (): Promise<Campaign[]> => getDb().rows('campaigns').orderBy('updatedAt').reverse().toArray(),
  get: (id: string) => getRow('campaigns', id),
}

// ── Entries ────────────────────────────────────────────────────────────────

export const entries = {
  ofCampaign: (campaignId: string): Promise<Entry[]> => getDb().rows('entries').where('campaignId').equals(campaignId).toArray(),
  ofType: (campaignId: string, type: EntryType): Promise<Entry[]> =>
    getDb().rows('entries').where('[campaignId+type]').equals([campaignId, type]).toArray(),
  get: (id: string) => getRow('entries', id),
  recent: (campaignId: string, limit: number): Promise<Entry[]> =>
    getDb().rows('entries').where('[campaignId+updatedAt]').between([campaignId, ''], [campaignId, '\uffff']).reverse().limit(limit).toArray(),
  linksFrom: (id: string) => getDb().rows('links').where('sourceId').equals(id).toArray(),
  linksTo: (id: string) => getDb().rows('links').where('targetEntryId').equals(id).toArray(),
}

// ── Settings, workspace, meta ──────────────────────────────────────────────

export const settings = {
  async get(): Promise<Settings> {
    return (await getDb().rows('settings').get('app')) ?? DEFAULT_SETTINGS
  },
  async patch(change: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
    const next = zSettings.parse({ ...(await settings.get()), ...change, id: 'app' })
    await getDb().rows('settings').put(next)
    return next
  },
}

export const workspace = {
  async get<T>(campaignId: string, key: string, fallback: T): Promise<T> {
    const row = await getDb().rows('workspace').get(workspaceId(campaignId, key))
    return row ? row.value as T : fallback
  },
  async set(campaignId: string, key: string, value: unknown): Promise<void> {
    await getDb().rows('workspace').put({ id: workspaceId(campaignId, key), campaignId, key, value, updatedAt: nowIso() })
  },
}

export const meta = {
  async get<T>(key: string, fallback: T): Promise<T> {
    const row = await getDb().rows('meta').get(key)
    return row ? row.value as T : fallback
  },
  async set(key: string, value: unknown): Promise<void> {
    await getDb().rows('meta').put({ key, value })
  },
}

// ── Images and device handles ──────────────────────────────────────────────

export const images = {
  get: (id: string): Promise<ImageRow | undefined> => getDb().images.get(id),
  put: (row: ImageRow) => getDb().images.put(row),
  all: (): Promise<ImageRow[]> => getDb().images.toArray(),
  ids: (): Promise<string[]> => getDb().images.toCollection().primaryKeys(),
}

export const deviceHandles = {
  async get<T>(key: string): Promise<T | null> {
    return ((await getDb().deviceHandles.get(key))?.handle as T | undefined) ?? null
  },
  set: (key: string, handle: unknown) => getDb().deviceHandles.put({ key, handle }),
  remove: (key: string) => getDb().deviceHandles.delete(key),
}

// ── Writes the shell needs in Phase 1 ──────────────────────────────────────

export async function createCampaign(input: { id: string; name: string; description: string; game: 'pf2e' | 'sf2e' }): Promise<Campaign> {
  const ts = nowIso()
  return putRow('campaigns', { ...input, rules: {}, createdAt: ts, updatedAt: ts })
}

/** Compendium entries whose name starts with the text, for the command bar. */
export async function rulesByPrefix(text: string, limit: number): Promise<{ id: string; name: string; kind: string; level: number }[]> {
  const q = text.trim().toLowerCase()
  if (q.length < 2) return []
  const rows = await getDb().rows('rules').where('sortName').startsWith(q).limit(limit).toArray()
  return rows.map(r => ({ id: r.id, name: r.name, kind: r.kind, level: r.level }))
}

export async function rulesCount(): Promise<number> {
  return getDb().rows('rules').count()
}

export async function findEntryByName(campaign: string, type: EntryType, name: string): Promise<Entry | undefined> {
  const wanted = name.trim().toLowerCase()
  return (await entries.ofType(campaign, type)).find(e => e.name.trim().toLowerCase() === wanted)
}

export async function rulesByName(name: string, kind?: string): Promise<RulesRow | undefined> {
  const rows = await getDb().rows('rules').where('sortName').equals(name.trim().toLowerCase()).toArray()
  return rows.find(r => !kind || r.kind.toLowerCase() === kind.toLowerCase()) ?? (kind ? undefined : rows[0])
}

export const characters = {
  ofCampaign: (campaignId: string) => getDb().rows('characters').where('campaignId').equals(campaignId).toArray(),
}

/** Compendium entries of a kind whose name contains the text, for link completion. */
export async function rulesNamesLike(kind: string, text: string, limit: number): Promise<string[]> {
  const q = text.trim().toLowerCase()
  const rows = await getDb().rows('rules').where('[kind+sortName]').between([kind, q], [kind, `${q}\uffff`]).limit(limit).toArray()
  return rows.map(r => r.name)
}

export async function sessionPanelsOf(sessionId: string) {
  return (await getDb().rows('sessionPanels').where('sessionId').equals(sessionId).toArray()).filter(p => p.kind !== 'frame').sort((a, b) => a.y - b.y || a.x - b.x)
}

/** The locations whose maps carry a pin for this entry. */
export async function mapsPinning(entryId: string): Promise<Entry[]> {
  const pins = await getDb().rows('mapPins').where('entryId').equals(entryId).toArray()
  const maps = await Promise.all([...new Set(pins.map(p => p.mapEntryId))].map(id => entries.get(id)))
  return maps.filter((e): e is Entry => !!e)
}

export async function encounterNames(campaignId: string): Promise<string[]> {
  return (await getDb().rows('encounters').where('campaignId').equals(campaignId).toArray()).map(e => e.name)
}
