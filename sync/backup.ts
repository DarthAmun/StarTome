/**
 * Backups, campaign export/import and campaign clone (FORK_PLAN.md §14 BUG-01–03).
 *
 * Files keep DM's Tome's `version: 1` shape (raw rows per table, compendium
 * data under `rules`/`rulesOverlays`/`images`, see converters/export.ts).
 *
 * Import has two modes:
 * - **merge** (default): every row gets a new id and every reference is
 *   remapped, so nothing already in this browser is touched. Clone uses it too.
 * - **replace**: the campaign tables are cleared first and the rows are written
 *   with their ids — restoring a full backup exactly.
 * Both run in one transaction: a failure leaves the database as it was.
 *
 * Export builds the file from one string per row, so a backup is never one
 * giant string (V8 caps strings at ~512 MB).
 */
import {
  encounterText, encounterValues, getDb, now, parseJsonObject, placementText, placementValues,
  type DbCampaign, type DbCharacter, type DbEncounter, type DbEncounterToken, type DbEncounterWall, type DbEntity,
  type DbEntityConnection, type DbEntityLink, type DbEntitySnapshot, type DbGraphLayout, type DbInventory, type DbLevelUp,
  type DbPurse, type DbToken, type DbTreasureAward, type DbXpAward,
} from '~/composables/useDb'
import { imageIdsOf, planRulesImport, rulesForExport, type ExportedImage, type RulesOverlay } from '~/converters/export'
import { blobToDataUrl, dataUrlToBlob, isImageRef, resolveImageDataUrl } from '~/rules/images'
import type { RulesEntity } from '~/types/rules'
import { APP_NS } from '~/utils/appNamespace'
import { parseJson } from '~/utils/json'

export interface CampaignRows {
  campaigns: DbCampaign[]
  encounters: DbEncounter[]
  encounterTokens: DbEncounterToken[]
  encounterWalls: DbEncounterWall[]
  entities: DbEntity[]
  entityLinks: DbEntityLink[]
  entitySnapshots: DbEntitySnapshot[]
  entityConnections: DbEntityConnection[]
  graphLayouts: DbGraphLayout[]
  tokens: DbToken[]
  characters: DbCharacter[]
  levelUps: DbLevelUp[]
  xpAwards: DbXpAward[]
  treasureAwards: DbTreasureAward[]
  inventory: DbInventory[]
  purses: DbPurse[]
}
export type CampaignTable = keyof CampaignRows

/** Write order: every table comes after the tables its references point to. */
export const CAMPAIGN_TABLES: CampaignTable[] = [
  'campaigns', 'entities', 'tokens', 'encounters', 'encounterTokens', 'encounterWalls',
  'entityLinks', 'entitySnapshots', 'entityConnections', 'graphLayouts',
  'characters', 'levelUps', 'xpAwards', 'treasureAwards', 'inventory', 'purses',
]

export const TABLE_LABELS: Record<CampaignTable | 'rules' | 'rulesOverlays', string> = {
  campaigns: 'Campaigns', encounters: 'Encounters', encounterTokens: 'Encounter Tokens', encounterWalls: 'Encounter Walls',
  entities: 'Notes & Entities', entityLinks: 'Entity Links', entitySnapshots: 'Entity Snapshots', entityConnections: 'Entity Connections',
  graphLayouts: 'Graphs', tokens: 'Tokens', characters: 'Party members', levelUps: 'Level-ups', xpAwards: 'XP awards',
  treasureAwards: 'Treasure awards', inventory: 'Inventory', purses: 'Purses',
  rules: 'Own compendium entries', rulesOverlays: 'Portraits, notes & edits on synced entries',
}

export interface BackupPayload extends Partial<CampaignRows> {
  version: 1
  app: string
  type: 'all' | 'campaigns' | 'tokens' | string
  exportedAt: string
  rules?: RulesEntity[]
  rulesOverlays?: RulesOverlay[]
  images?: ExportedImage[]
  [key: string]: unknown
}

// ── Export ─────────────────────────────────────────────────────────────────

/** A JSON file built from one string per array row, never one big string. */
export function jsonBlob(payload: Record<string, unknown>): Blob {
  const parts: string[] = ['{']
  let first = true
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue
    parts.push(`${first ? '' : ','}\n${JSON.stringify(key)}:`)
    first = false
    if (Array.isArray(value)) {
      parts.push('[')
      value.forEach((row, i) => parts.push(`${i ? ',' : ''}\n${JSON.stringify(row)}`))
      parts.push(']')
    } else {
      parts.push(JSON.stringify(value))
    }
  }
  parts.push('\n}\n')
  return new Blob(parts, { type: 'application/json' })
}

function header(type: BackupPayload['type']) {
  return { version: 1 as const, app: APP_NS, type, exportedAt: now() }
}

/** Everything: all campaign tables, own compendium entries, overlays and their images. */
export async function exportAllPayload(): Promise<BackupPayload> {
  const db = getDb()
  const rows = Object.fromEntries(await Promise.all(CAMPAIGN_TABLES.map(async t => [t, await db.table(t).toArray()] as const))) as unknown as CampaignRows
  const { entries: rules, overlays: rulesOverlays } = rulesForExport(await db.rules.toArray())
  const imageRows = await db.images.bulkGet(imageIdsOf([...rules, ...rulesOverlays] as unknown as Record<string, unknown>[]))
  const images: ExportedImage[] = []
  for (const r of imageRows) if (r) images.push({ id: r.id, mime: r.mime, data: await blobToDataUrl(r.blob) })
  rows.encounters = (await inlineMaps(rows.encounters)).map(encounterText)
  rows.encounterTokens = rows.encounterTokens.map(placementText)
  return { ...header('all'), ...rows, rules, rulesOverlays, images, syncState: await db.syncState.toArray() }
}

/**
 * Files carry maps inline, as DM's Tome and older StarTome files do; in this
 * browser they live in the image store (PERF-03).
 */
async function inlineMaps(encounters: DbEncounter[]): Promise<DbEncounter[]> {
  return Promise.all(encounters.map(async e => (isImageRef(e.map_source) ? { ...e, map_source: await resolveImageDataUrl(e.map_source) } : e)))
}

/** The rows of some campaigns (all when `campaignIds` is omitted), plus the library tokens they place. */
export async function collectCampaignRows(campaignIds?: number[]): Promise<CampaignRows> {
  const db = getDb()
  const campaigns = campaignIds ? (await db.campaigns.bulkGet(campaignIds)).filter((c): c is DbCampaign => !!c) : await db.campaigns.toArray()
  const ids = campaigns.map(c => c.id!)
  const byCampaign = <T>(table: string) => (ids.length ? db.table(table).where('campaign_id').anyOf(ids).toArray() : Promise.resolve([])) as Promise<T[]>
  const [encounters, entities, entityConnections, graphLayouts, characters, levelUps, xpAwards, treasureAwards, inventory, purses] = await Promise.all([
    byCampaign<DbEncounter>('encounters'), byCampaign<DbEntity>('entities'), byCampaign<DbEntityConnection>('entityConnections'),
    byCampaign<DbGraphLayout>('graphLayouts'), byCampaign<DbCharacter>('characters'), byCampaign<DbLevelUp>('levelUps'),
    byCampaign<DbXpAward>('xpAwards'), byCampaign<DbTreasureAward>('treasureAwards'), byCampaign<DbInventory>('inventory'), byCampaign<DbPurse>('purses'),
  ])
  const encIds = encounters.map(e => e.id!)
  const entIds = entities.map(e => e.id!)
  const [encounterTokens, encounterWalls, entityLinks, entitySnapshots] = await Promise.all([
    encIds.length ? db.encounterTokens.where('encounter_id').anyOf(encIds).toArray() : [],
    encIds.length ? db.encounterWalls.where('encounter_id').anyOf(encIds).toArray() : [],
    entIds.length ? db.entityLinks.where('source_id').anyOf(entIds).toArray() : [],
    entIds.length ? db.entitySnapshots.where('entity_id').anyOf(entIds).toArray() : [],
  ])
  // Library tokens the placements and party members stand on (BUG-03)
  const tokenIds = [...new Set([...encounterTokens.map(t => t.token_id), ...characters.map(c => c.token_id)].filter((id): id is number => id != null))]
  const tokens = (await db.tokens.bulkGet(tokenIds)).filter((t): t is DbToken => !!t)
  return {
    campaigns, encounters, encounterTokens, encounterWalls, entities, entityLinks, entitySnapshots,
    entityConnections, graphLayouts, tokens, characters, levelUps, xpAwards, treasureAwards, inventory, purses,
  }
}

export async function exportCampaignsPayload(campaignIds?: number[]): Promise<BackupPayload> {
  const rows = await collectCampaignRows(campaignIds)
  // Files keep DM's Tome's JSON text in the combat columns
  return { ...header('campaigns'), ...rows, encounters: (await inlineMaps(rows.encounters)).map(encounterText), encounterTokens: rows.encounterTokens.map(placementText) }
}

export async function exportTokensPayload(): Promise<BackupPayload> {
  return { ...header('tokens'), tokens: await getDb().tokens.toArray() }
}

// ── Import ─────────────────────────────────────────────────────────────────

export type ImportMode = 'merge' | 'replace'

export interface MergeOptions {
  /** 'copy' gives library tokens new ids; 'share' points at the existing ones (clone in the same browser). */
  tokens: 'copy' | 'share'
  /** Level-ups, XP and treasure logs and the encounters' resolution records. */
  history: boolean
  rename?: (name: string) => string
}

export interface ImportCounts { [table: string]: number }

type IdMap = Map<number, number>

function withoutId<T extends { id?: unknown }>(row: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = row
  return rest
}

const remapIds = (ids: unknown, map: IdMap): number[] =>
  (Array.isArray(ids) ? ids : []).map(id => map.get(Number(id))).filter((v): v is number => v != null)

/** Entity ids inside lore attributes: map pins, quest giver, a region's location. */
function remapAttributes(raw: unknown, entities: IdMap): string {
  const a = typeof raw === 'string' ? parseJsonObject(raw) : { ...((raw as Record<string, unknown>) ?? {}) }
  if (Array.isArray(a.mapPins)) {
    a.mapPins = a.mapPins
      .filter((p: { entityId: number }) => entities.has(p.entityId))
      .map((p: { entityId: number }) => ({ ...p, entityId: entities.get(p.entityId) }))
  }
  for (const key of ['questGiverId', 'locationEntityId']) {
    if (typeof a[key] === 'number') a[key] = entities.get(a[key]) ?? null
  }
  return JSON.stringify(a)
}

function remapPositions(json: string, entities: IdMap): string {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(parseJson<Record<string, unknown>>(json, {}))) {
    const id = entities.get(Number(key))
    if (id != null) out[id] = val
  }
  return JSON.stringify(out)
}

/**
 * Writes campaign rows with fresh ids and every reference remapped. Rows that
 * point at something not in `rows` lose that link (or are skipped when they
 * can't exist without it). Must run inside a transaction over CAMPAIGN_TABLES.
 */
async function writeMerged(rows: Partial<CampaignRows>, opts: MergeOptions, counts: ImportCounts) {
  const db = getDb()
  const camp: IdMap = new Map(), ent: IdMap = new Map(), tok: IdMap = new Map(), enc: IdMap = new Map()
  const chr: IdMap = new Map(), xp: IdMap = new Map(), inv: IdMap = new Map()
  const owners = new Map<string, string>([['stash', 'stash']])
  const add = async <T>(table: CampaignTable, row: T): Promise<number> => {
    counts[table] = (counts[table] ?? 0) + 1
    return await db.table(table).add(row) as number
  }
  const tokenRef = (id: number | null | undefined) => (id == null ? null : tok.get(id) ?? (opts.tokens === 'share' ? id : null))

  for (const c of rows.campaigns ?? []) {
    camp.set(c.id!, await add('campaigns', { ...withoutId(c), name: opts.rename ? opts.rename(c.name) : c.name }))
  }
  const entities = (rows.entities ?? []).filter(e => camp.has(e.campaign_id))
  for (const e of entities) ent.set(e.id!, await add('entities', { ...withoutId(e), campaign_id: camp.get(e.campaign_id)! }))
  // Attributes can point at other entities, so they're remapped once all have ids
  for (const e of entities) await db.entities.update(ent.get(e.id!)!, { attributes: remapAttributes(e.attributes, ent) })

  if (opts.tokens === 'copy') {
    // A tokens-only file keeps its NPC links: they point at this browser's entities
    const keepLinks = !rows.entities?.length
    for (const t of rows.tokens ?? []) {
      const linked = t.linked_entity_id != null ? ent.get(t.linked_entity_id) ?? (keepLinks ? t.linked_entity_id : null) : null
      tok.set(t.id!, await add('tokens', { ...withoutId(t), linked_entity_id: linked }))
    }
  }

  for (const e of (rows.encounters ?? []).filter(e => camp.has(e.campaign_id))) {
    const id = await add('encounters', { ...withoutId(e), campaign_id: camp.get(e.campaign_id)!, resolution: opts.history ? e.resolution ?? null : null })
    enc.set(e.id!, id)
    owners.set(`encounter:${e.id}`, `encounter:${id}`)
  }
  for (const t of (rows.encounterTokens ?? []).filter(t => enc.has(t.encounter_id))) {
    await add('encounterTokens', {
      ...withoutId(t), encounter_id: enc.get(t.encounter_id)!, token_id: tokenRef(t.token_id),
      linked_entity_id: t.linked_entity_id != null ? ent.get(t.linked_entity_id) ?? null : null,
    })
  }
  for (const w of (rows.encounterWalls ?? []).filter(w => enc.has(w.encounter_id))) {
    await add('encounterWalls', { ...withoutId(w), encounter_id: enc.get(w.encounter_id)! })
  }
  for (const l of (rows.entityLinks ?? []).filter(l => ent.has(l.source_id))) {
    await add('entityLinks', { ...withoutId(l), source_id: ent.get(l.source_id)! })
  }
  for (const s of (rows.entitySnapshots ?? []).filter(s => ent.has(s.entity_id))) {
    await add('entitySnapshots', { ...withoutId(s), entity_id: ent.get(s.entity_id)!, event_id: s.event_id != null ? ent.get(s.event_id) ?? null : null })
  }
  for (const c of (rows.entityConnections ?? []).filter(c => camp.has(c.campaign_id) && ent.has(c.source_entity_id) && ent.has(c.target_entity_id))) {
    await add('entityConnections', {
      ...withoutId(c), campaign_id: camp.get(c.campaign_id)!,
      source_entity_id: ent.get(c.source_entity_id)!, target_entity_id: ent.get(c.target_entity_id)!,
    })
  }
  for (const g of (rows.graphLayouts ?? []).filter(g => camp.has(g.campaign_id))) {
    await add('graphLayouts', {
      ...withoutId(g), campaign_id: camp.get(g.campaign_id)!,
      positions: remapPositions(g.positions, ent),
      hidden_nodes: JSON.stringify(remapIds(parseJson(g.hidden_nodes, []), ent)),
      player_hidden_nodes: g.player_hidden_nodes != null ? JSON.stringify(remapIds(parseJson(g.player_hidden_nodes, []), ent)) : g.player_hidden_nodes,
    })
  }
  for (const c of (rows.characters ?? []).filter(c => camp.has(c.campaign_id))) {
    const id = await add('characters', {
      ...withoutId(c), campaign_id: camp.get(c.campaign_id)!,
      npc_entity_id: c.npc_entity_id != null ? ent.get(c.npc_entity_id) ?? null : null, token_id: tokenRef(c.token_id),
    })
    chr.set(c.id!, id)
    owners.set(`character:${c.id}`, `character:${id}`)
  }

  if (opts.history) {
    const refOf = (type: string | null, id: number | null) => (id == null ? null : type === 'quest' ? ent.get(id) ?? null : type === 'encounter' ? enc.get(id) ?? null : null)
    for (const u of (rows.levelUps ?? []).filter(u => camp.has(u.campaign_id))) {
      const changes = parseJson<{ characterId: number }[]>(u.changes, [])
        .filter(ch => chr.has(ch.characterId)).map(ch => ({ ...ch, characterId: chr.get(ch.characterId)! }))
      await add('levelUps', { ...withoutId(u), campaign_id: camp.get(u.campaign_id)!, ref_id: refOf(u.trigger, u.ref_id), changes: JSON.stringify(changes) })
    }
    for (const a of (rows.xpAwards ?? []).filter(a => camp.has(a.campaign_id))) {
      xp.set(a.id!, await add('xpAwards', {
        ...withoutId(a), campaign_id: camp.get(a.campaign_id)!, ref_id: refOf(a.ref_type, a.ref_id),
        character_ids: JSON.stringify(remapIds(parseJson(a.character_ids, []), chr)),
      }))
    }
    for (const a of (rows.treasureAwards ?? []).filter(a => camp.has(a.campaign_id))) {
      await add('treasureAwards', { ...withoutId(a), campaign_id: camp.get(a.campaign_id)! })
    }
  }

  const items = (rows.inventory ?? []).filter(e => camp.has(e.campaign_id) && owners.has(e.owner))
  for (const e of items) inv.set(e.id!, await add('inventory', { ...withoutId(e), campaign_id: camp.get(e.campaign_id)!, owner: owners.get(e.owner)! }))
  for (const e of items) {
    if (e.container_id != null) await db.inventory.update(inv.get(e.id!)!, { container_id: inv.get(e.container_id) ?? null })
  }
  for (const p of (rows.purses ?? []).filter(p => camp.has(p.campaign_id) && owners.has(p.owner))) {
    await add('purses', { ...withoutId(p), campaign_id: camp.get(p.campaign_id)!, owner: owners.get(p.owner)! })
  }

  // Resolution records point at characters, the XP log and inventory rows
  if (opts.history) {
    for (const e of rows.encounters ?? []) {
      const id = enc.get(e.id!)
      const record = e.resolution ? parseJson<Record<string, any> | null>(e.resolution, null) : null
      if (id == null || !record) continue
      const loot = record.loot ?? { entries: [], cp: 0 }
      const next = {
        ...record,
        participants: remapIds(record.participants, chr),
        xpAwardId: record.xpAwardId != null ? xp.get(record.xpAwardId) ?? null : null,
        loot: {
          ...loot,
          entries: (loot.entries ?? []).map((r: DbInventory) => ({
            ...r, campaign_id: camp.get(r.campaign_id) ?? r.campaign_id, owner: owners.get(r.owner) ?? r.owner,
            container_id: r.container_id != null ? inv.get(r.container_id) ?? null : null,
          })),
        },
      }
      await db.encounters.update(id, { resolution: JSON.stringify(next) })
    }
  }
  return camp
}

function campaignTables() {
  const db = getDb()
  return CAMPAIGN_TABLES.map(t => db.table(t))
}

/** Copies a campaign in this browser. Library tokens are shared, the logs stay with the original. */
export async function cloneCampaign(id: number): Promise<DbCampaign | undefined> {
  const rows = await collectCampaignRows([id])
  if (!rows.campaigns.length) throw new Error(`cloneCampaign: campaign ${id} not found`)
  const ts = now()
  rows.campaigns = rows.campaigns.map(c => ({ ...c, created_at: ts, updated_at: ts }))
  const db = getDb()
  const camp = await db.transaction('rw', campaignTables(), () =>
    writeMerged(rows, { tokens: 'share', history: false, rename: n => `${n} (Copy)` }, {}))
  return db.campaigns.get(camp.get(id)!)
}

export interface ImportOptions {
  mode: ImportMode
  /** Payload keys to import; others are ignored. */
  sections: Set<string>
}

export interface ImportResult {
  counts: ImportCounts
  /** Overlays whose synced entry this browser doesn't have. */
  missingOverlays: number
  skippedLegacyLibrary: number
}

/** Imports a backup or campaign file in one transaction (BUG-01). */
export async function importPayload(payload: BackupPayload, opts: ImportOptions): Promise<ImportResult> {
  const db = getDb()
  const rows: Partial<CampaignRows> = {}
  for (const t of CAMPAIGN_TABLES) {
    if (opts.sections.has(t) && Array.isArray(payload[t])) (rows as Record<string, unknown[]>)[t] = payload[t] as unknown[]
  }
  for (const e of rows.entities ?? []) {
    if (typeof e.attributes !== 'string') e.attributes = JSON.stringify(e.attributes ?? {})
  }
  // Combat columns arrive as JSON text; this database keeps values (v12)
  if (rows.encounters) rows.encounters = rows.encounters.map(encounterValues)
  if (rows.encounterTokens) rows.encounterTokens = rows.encounterTokens.map(placementValues)
  // Inline maps go to the image store; the rows keep a ref
  const mapImages: { id: string; blob: Blob; mime: string; createdAt: string }[] = []
  if (rows.encounters) {
    rows.encounters = rows.encounters.map(e => {
      if (!e.map_source?.startsWith('data:')) return e
      const blob = dataUrlToBlob(e.map_source)
      const id = crypto.randomUUID()
      mapImages.push({ id, blob, mime: blob.type, createdAt: now() })
      return { ...e, map_source: `img:${id}` }
    })
  }

  // Compendium: entries by their string id, overlays onto synced rows
  const rulesEntries: RulesEntity[] = opts.sections.has('rules') ? payload.rules ?? [] : []
  const rulesOverlays: RulesOverlay[] = opts.sections.has('rulesOverlays') ? payload.rulesOverlays ?? [] : []
  const wanted = new Set(imageIdsOf([...rulesEntries, ...rulesOverlays] as unknown as Record<string, unknown>[]))
  const images = (payload.images ?? []).filter(img => wanted.has(img.id)).map(img => {
    const blob = dataUrlToBlob(img.data)
    return { id: img.id, blob, mime: img.mime || blob.type, createdAt: now() }
  })
  const existing = new Map((await db.rules.bulkGet(rulesOverlays.map(o => o.id))).filter((r): r is RulesEntity => !!r).map(r => [r.id, r]))
  const plan = planRulesImport(existing, rulesEntries, rulesOverlays, now())

  const counts: ImportCounts = {}
  await db.transaction('rw', [...campaignTables(), db.rules, db.images], async () => {
    if (opts.mode === 'replace') {
      for (const t of CAMPAIGN_TABLES) await db.table(t).clear()
      for (const t of CAMPAIGN_TABLES) {
        const list = rows[t] ?? []
        if (list.length) await db.table(t).bulkPut(list)
        counts[t] = list.length
      }
    } else {
      await writeMerged(rows, { tokens: 'copy', history: true }, counts)
    }
    if (images.length || mapImages.length) await db.images.bulkPut([...images, ...mapImages])
    if (plan.put.length) await db.rules.bulkPut(plan.put)
    counts.rules = rulesEntries.length
    counts.rulesOverlays = rulesOverlays.length - plan.missing.length
  })
  const legacy = (Array.isArray(payload.systems) ? payload.systems.length : 0) + (Array.isArray(payload.records) ? payload.records.length : 0)
  return { counts, missingOverlays: plan.missing.length, skippedLegacyLibrary: legacy }
}
