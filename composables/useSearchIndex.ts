/**
 * The search index over the app's own data: campaigns, entries (name, tags,
 * text), encounters, graphs and session-board panels. Built on the first
 * search and kept in memory; any write to those tables (from this tab,
 * another one, a worker) marks it stale and the next search rebuilds it (a
 * few thousand rows take milliseconds).
 */
import { getDb } from '~/composables/useDb'
import { onTablesChanged } from '~/db/changes'
import { parseJsonObject } from '~/db/schema'
import {
  attributeText, buildSearchIndex, plainText, searchDocs,
  type SearchDoc, type SearchDocKind, type SearchHit, type SearchIndex,
} from '~/utils/search'

let index: SearchIndex | null = null
let building: Promise<SearchIndex> | null = null
let stale = true
let watching = false

function markStale() { stale = true }

function watchWrites() {
  if (watching) return
  watching = true
  onTablesChanged(['campaigns', 'entities', 'encounters', 'graphLayouts', 'sessionPanels'], markStale, 0)
}

async function readDocs(): Promise<SearchDoc[]> {
  const db = getDb()
  const docs: SearchDoc[] = []

  for (const c of await db.campaigns.toArray()) {
    docs.push({ id: `campaign:${c.id}`, kind: 'campaign', refId: c.id!, name: c.name, text: c.description ?? '' })
  }

  for (const e of await db.entities.toArray()) {
    const attrs = parseJsonObject(e.attributes) as Record<string, unknown>
    const tags = Array.isArray(attrs.tags) ? (attrs.tags as unknown[]).map(String).join(' ') : ''
    docs.push({
      id: `entity:${e.id}`, kind: 'entity', refId: e.id!, name: e.name, type: e.type, campaignId: e.campaign_id,
      tags, text: `${plainText(e.content)} ${attributeText(attrs)}`,
    })
  }

  // Encounter rows carry their maps: read names through the index only
  await db.encounters.orderBy('[campaign_id+name]').eachKey((key, cursor) => {
    const [campaignId, name] = key as unknown as [number, string]
    const id = cursor.primaryKey as number
    docs.push({ id: `encounter:${id}`, kind: 'encounter', refId: id, name: String(name), campaignId })
  })

  for (const g of await db.graphLayouts.toArray()) {
    docs.push({ id: `graph:${g.id}`, kind: 'graph', refId: g.id!, name: g.name ?? 'Default', campaignId: g.campaign_id })
  }

  // Panels in the drawer have no page to open
  for (const p of await db.sessionPanels.toArray()) {
    if (p.session_id == null || p.kind === 'frame') continue
    docs.push({
      id: `panel:${p.id}`, kind: 'panel', refId: p.id!, name: p.title || plainText(p.content).trim().slice(0, 60),
      type: p.kind, campaignId: p.campaign_id, sessionId: p.session_id, tags: (p.tags ?? []).join(' '), text: plainText(p.content),
    })
  }
  return docs
}

async function currentIndex(): Promise<SearchIndex> {
  watchWrites()
  if (index && !stale) return index
  if (!building) {
    stale = false
    building = readDocs()
      .then(docs => (index = buildSearchIndex(docs)))
      .finally(() => { building = null })
  }
  return building
}

/** Hits of one kind, best first. */
export async function searchApp(query: string, kind: SearchDocKind, limit: number): Promise<SearchHit[]> {
  return searchDocs(await currentIndex(), query, { kind, limit })
}

/** Every kind at once: one index read, `limits` per kind. */
export async function searchAppAll(query: string, limits: Record<SearchDocKind, number>): Promise<Record<SearchDocKind, SearchHit[]>> {
  const idx = await currentIndex()
  const out = {} as Record<SearchDocKind, SearchHit[]>
  for (const kind of Object.keys(limits) as SearchDocKind[]) out[kind] = searchDocs(idx, query, { kind, limit: limits[kind] })
  return out
}
