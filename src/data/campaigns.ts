/**
 * Whole campaigns: what belongs to one, changing its settings, copying it and
 * deleting it with everything in it. The token library, the compendium,
 * images and sounds belong to no campaign and are never touched here.
 */
import { newId, nowIso } from '@/domain/ids'
import { CAMPAIGN_SCOPED, COLLECTIONS, zCampaign, type Campaign, type CollectionName, type EntryType } from '@/domain/schema'
import { getDb } from './db'

type Rows = Partial<Record<CollectionName, Record<string, unknown>[]>>

/** Every row of a campaign, by collection: its own rows and what hangs on them. */
async function rowsOf(campaignId: string): Promise<Rows> {
  const db = getDb()
  const out: Rows = {}
  for (const name of [...Object.keys(CAMPAIGN_SCOPED), 'linkOutbox'] as CollectionName[]) out[name] = await db.table(name).where('campaignId').equals(campaignId).toArray()
  const entryIds = (out.entries ?? []).map(e => String(e.id)), encounterIds = (out.encounters ?? []).map(e => String(e.id))
  const sessionIds = (out.entries ?? []).filter(e => e.type === 'session').map(e => String(e.id))
  out.links = await db.rows('links').where('sourceId').anyOf(entryIds).toArray()
  out.entryVersions = await db.rows('entryVersions').where('entryId').anyOf(entryIds).toArray()
  out.sessionEdges = await db.rows('sessionEdges').where('sessionId').anyOf(sessionIds).toArray()
  out.encounterMaps = await db.rows('encounterMaps').bulkGet(encounterIds).then(list => list.filter((m): m is NonNullable<typeof m> => !!m))
  out.combatants = await db.rows('combatants').where('encounterId').anyOf(encounterIds).toArray()
  out.combatLog = (await Promise.all(encounterIds.map(id => db.rows('combatLog').where('[encounterId+seq]').between([id, -Infinity], [id, Infinity]).toArray()))).flat()
  return out
}

export interface CampaignStats { entries: number; byType: Partial<Record<EntryType, number>>; encounters: number; characters: number }

export async function campaignStats(campaignId: string): Promise<CampaignStats> {
  const db = getDb()
  const entries = await db.rows('entries').where('campaignId').equals(campaignId).toArray()
  const byType: Partial<Record<EntryType, number>> = {}
  for (const e of entries) byType[e.type] = (byType[e.type] ?? 0) + 1
  return { entries: entries.length, byType, encounters: await db.rows('encounters').where('campaignId').equals(campaignId).count(), characters: await db.rows('characters').where('campaignId').equals(campaignId).count() }
}

export type CampaignPatch = Partial<Pick<Campaign, 'name' | 'description' | 'game' | 'banner'>> & { rules?: Partial<Campaign['rules']> }

export async function updateCampaign(id: string, patch: CampaignPatch): Promise<void> {
  const db = getDb()
  await db.transaction('rw', db.rows('campaigns'), async () => {
    const c = await db.rows('campaigns').get(id)
    if (!c) return
    const rules = { ...c.rules, ...(patch.rules ?? {}), automation: { ...c.rules.automation, ...(patch.rules?.automation ?? {}) } }
    await db.rows('campaigns').put(zCampaign.parse({ ...c, ...JSON.parse(JSON.stringify(patch)) as CampaignPatch, name: patch.name?.trim() || c.name, rules, updatedAt: nowIso() }))
  })
}

/** Deletes the campaign with every entry, session, encounter, party member, item and layout in it. */
export async function deleteCampaign(id: string): Promise<void> {
  const db = getDb()
  const rows = await rowsOf(id)
  const names = Object.keys(rows) as CollectionName[]
  await db.transaction('rw', [db.rows('campaigns'), ...names.map(n => db.table(n))], async () => {
    for (const n of names) await db.table(n).bulkDelete((rows[n] ?? []).map(r => r.id as string))
    await db.rows('campaigns').delete(id)
  })
}

/** Every id of the copy is new; an id inside an owner key ("character:<id>") or a workspace key ("<campaign>|<key>") follows. */
function remap(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === 'string') {
    const hit = ids.get(value)
    if (hit) return hit
    const colon = value.indexOf(':'), bar = value.indexOf('|')
    if (colon > 0 && ids.has(value.slice(colon + 1))) return `${value.slice(0, colon + 1)}${ids.get(value.slice(colon + 1))}`
    if (bar > 0 && ids.has(value.slice(0, bar))) return `${ids.get(value.slice(0, bar))}${value.slice(bar)}`
    return value
  }
  if (Array.isArray(value)) return value.map(v => remap(v, ids))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [ids.get(k) ?? k, remap(v, ids)]))
  return value
}

/** A copy named "… (Copy)". It shares the token library and images; the ledger, combat logs and character-app links are not copied. */
export async function cloneCampaign(id: string): Promise<Campaign | null> {
  const db = getDb()
  const source = await db.rows('campaigns').get(id)
  if (!source) return null
  const rows = await rowsOf(id)
  for (const drop of ['partyLedger', 'combatLog', 'linkOutbox'] as CollectionName[]) delete rows[drop]
  const ids = new Map<string, string>([[id, newId()]])
  for (const list of Object.values(rows)) for (const r of list ?? []) if (typeof r.id === 'string' && !r.id.includes('|') && !ids.has(r.id)) ids.set(r.id, newId())
  const ts = nowIso()
  const copy = zCampaign.parse({ ...source, id: ids.get(id), name: `${source.name} (Copy)`, characterLink: null, createdAt: ts, updatedAt: ts })
  const names = Object.keys(rows) as CollectionName[]
  const next = Object.fromEntries(names.map(n => [n, (rows[n] ?? []).map((r) => {
    const row = remap(r, ids) as Record<string, unknown>
    // Encounters come back unresolved and characters unlinked: the copy has no history
    if (n === 'encounters' && row.status === 'resolved') Object.assign(row, { status: 'prepared', resolvedAt: null, xpTotal: null, xpAwarded: null, partyLevelAtResolve: null })
    if (n === 'characters') row.link = null
    if (n === 'inventory' && row.link) row.link = null
    return COLLECTIONS[n].parse(row) as Record<string, unknown>
  })])) as Rows
  await db.transaction('rw', [db.rows('campaigns'), ...names.map(n => db.table(n))], async () => {
    await db.rows('campaigns').put(copy)
    for (const n of names) await db.table(n).bulkPut(next[n] ?? [])
  })
  return copy
}
