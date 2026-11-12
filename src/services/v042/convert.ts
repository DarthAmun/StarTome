/**
 * v0.42 → the new model (REWORK_PLAN.md §10).
 *
 * Pure: old rows in (a `version: 2` backup or campaign file, or the same rows
 * read from the old database), new rows and a report out. Nothing is written
 * here; the caller validates the result and writes it in one transaction.
 *
 * Every old row gets its new id first (`allocate`), so any row can point at
 * any other while it is converted, including the ids v0.42 kept inside
 * attributes, layouts, logs and resolution records.
 */
import { nowIso, type IdSource } from '@/domain/ids'
import type { CollectionName } from '@/domain/schema'
import { allocate, numOrNull, rowsOf, str, type Ctx, type InlineImage, type LegacyPayload, type LegacyReport } from './context'
import { convertActors, convertEncounters } from './encounters'
import { convertLocalState, convertMapAssets, convertRules, convertSounds } from './library'
import { convertCampaigns, convertEntries, convertGraphs, convertLinks, convertPanels } from './lore'
import { convertCharacters, convertInventory, convertLedger, convertStarships } from './party'

export interface LegacyResult {
  /** New rows per collection, not yet validated against the schemas. */
  rows: Partial<Record<CollectionName, unknown[]>>
  /** Images that were inline data URLs in old rows. */
  inlineImages: InlineImage[]
  /** Ids of stored images the new rows point at; the caller brings those blobs over. */
  imageIds: Set<string>
  report: LegacyReport
}

/** True for what v0.42 (and its predecessors back to DM's Tome's campaign tables) wrote. */
export function isLegacyPayload(v: unknown): v is LegacyPayload {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  if (o.format === 'startome-backup') return false
  return o.version === 2 || o.version === 1 || Array.isArray(o.campaigns) || Array.isArray(o.entities)
}

export function convertLegacy(payload: LegacyPayload, ids: IdSource, now: string = nowIso()): LegacyResult {
  const map = () => new Map<number, string>()
  const ctx: Ctx = {
    ids, now, payload,
    map: { camp: map(), ent: map(), tok: map(), enc: map(), encTok: map(), chr: map(), inv: map(), ship: map(), track: map(), list: map(), xp: map(), lvl: map(), treasure: map(), graph: map(), asset: map() },
    panel: new Map(), entType: new Map(), entCampaign: new Map(),
    out: {}, inline: [], imageIds: new Set(), report: { tables: {}, notes: [] },
  }

  allocate(ctx, 'campaigns', ctx.map.camp)
  allocate(ctx, 'entities', ctx.map.ent)
  allocate(ctx, 'tokens', ctx.map.tok)
  allocate(ctx, 'encounters', ctx.map.enc)
  allocate(ctx, 'encounterTokens', ctx.map.encTok)
  allocate(ctx, 'characters', ctx.map.chr)
  allocate(ctx, 'inventory', ctx.map.inv)
  allocate(ctx, 'starships', ctx.map.ship)
  allocate(ctx, 'soundTracks', ctx.map.track)
  allocate(ctx, 'soundPlaylists', ctx.map.list)
  allocate(ctx, 'xpAwards', ctx.map.xp)
  allocate(ctx, 'levelUps', ctx.map.lvl)
  allocate(ctx, 'treasureAwards', ctx.map.treasure)
  allocate(ctx, 'graphLayouts', ctx.map.graph)
  allocate(ctx, 'mapAssets', ctx.map.asset)
  for (const e of rowsOf(ctx, 'entities')) {
    const id = numOrNull(e.id)
    if (id === null) continue
    ctx.entType.set(id, str(e.type))
    const campaign = numOrNull(e.campaign_id)
    if (campaign !== null) ctx.entCampaign.set(id, campaign)
  }

  convertCampaigns(ctx)
  convertPanels(ctx)
  convertEntries(ctx)
  convertLinks(ctx)
  convertGraphs(ctx)
  const characterOfToken = convertActors(ctx)
  convertEncounters(ctx, characterOfToken)
  convertCharacters(ctx)
  convertLedger(ctx)
  convertInventory(ctx)
  convertStarships(ctx)
  convertSounds(ctx)
  convertMapAssets(ctx)
  convertRules(ctx)
  convertLocalState(ctx)

  return { rows: ctx.out, inlineImages: ctx.inline, imageIds: ctx.imageIds, report: ctx.report }
}
