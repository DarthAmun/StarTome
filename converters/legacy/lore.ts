/**
 * DM's Tome campaign data → StarTome rows with fresh ids (FORK_PLAN.md §8.1, §8.5).
 *
 * Only ids change, because the target database may already hold campaigns.
 * Every table gets a contiguous id block starting at `start[table]`, and every
 * reference is rewritten — including the ones inside JSON (map pins, regions,
 * quest givers, graph positions, combat-log token ids). JSON text becomes
 * values. Entry images (NPC portraits, faction and location images) are part
 * of the entries and come along.
 *
 * DM's Tome's rules library isn't imported: links to its records are dropped,
 * and library tokens that only stood for a record (monsters, not NPCs or PCs)
 * are left out; their placements keep the token's name and image. Pure: no
 * database.
 */
import type {
  DbCampaign, DbEncounter, DbEncounterToken, DbEncounterWall, DbEntity, DbEntityConnection, DbEntityLink,
  DbEntitySnapshot, DbGraphLayout, DbToken,
} from '~/composables/useDb'

export interface LoreTables {
  campaigns: DbCampaign[]
  entities: DbEntity[]
  entityLinks: DbEntityLink[]
  entitySnapshots: DbEntitySnapshot[]
  entityConnections: DbEntityConnection[]
  graphLayouts: DbGraphLayout[]
  tokens: DbToken[]
  encounters: DbEncounter[]
  encounterTokens: DbEncounterToken[]
  encounterWalls: DbEncounterWall[]
}

export const LORE_TABLES = [
  'campaigns', 'entities', 'entityLinks', 'entitySnapshots', 'entityConnections', 'graphLayouts',
  'tokens', 'encounters', 'encounterTokens', 'encounterWalls',
] as const satisfies readonly (keyof LoreTables)[]

export type LoreTable = typeof LORE_TABLES[number]

/** DM's Tome rows still carry the link to a library record, which StarTome doesn't store. */
type WithRecordLink<T> = T & { linked_record_id?: number | null }

/** Lore as DM's Tome exports it. */
export interface LegacyLoreTables extends Omit<LoreTables, 'tokens' | 'encounterTokens'> {
  tokens: WithRecordLink<DbToken>[]
  encounterTokens: WithRecordLink<DbEncounterToken>[]
  /**
   * Name and picture of the library records that placements point at: a
   * placement made straight from DM's Tome's library showed the record's name
   * and portrait. Only those two values are used; the records aren't imported.
   */
  recordLabels?: Map<number, { name: string; image: string | null }>
}

/** A DM's Tome library record's name and portrait (or image), for `recordLabels`. */
export function recordLabel(rec: { name?: string; data?: unknown }): { name: string; image: string | null } {
  const d = json<Record<string, any>>(rec.data, {})
  const img = d.portrait || d.image
  return { name: rec.name ?? '', image: typeof img === 'string' && img.startsWith('data:image/') ? img : null }
}

export interface RemapIssue { table: string; id: number; detail: string }

export interface RemapResult {
  tables: LoreTables
  ids: Record<LoreTable, Map<number, number>>
  /** Library tokens left out (monster tokens), see monsterTokenIds. */
  monsterTokens: number
  issues: RemapIssue[]
}

/**
 * Library tokens that only stood for a rules-library record: a monster or
 * other stat block, not linked to an NPC and not a player character.
 */
export function monsterTokenIds(tokens: WithRecordLink<DbToken>[]): Set<number> {
  return new Set(tokens
    .filter(t => t.linked_record_id != null && t.linked_entity_id == null && !t.is_player_character)
    .map(t => t.id!))
}

function json<T>(s: unknown, fallback: T): T {
  if (typeof s !== 'string') return (s as T) ?? fallback
  try { return JSON.parse(s) } catch { return fallback }
}

/** Assigns new ids in input order. */
function allocate(rows: { id?: number }[], start: number): Map<number, number> {
  const map = new Map<number, number>()
  let next = start
  for (const r of rows) if (r.id !== undefined && !map.has(r.id)) map.set(r.id, next++)
  return map
}

export function remapLore(src: LegacyLoreTables, start: Record<LoreTable, number>): RemapResult {
  const issues: RemapIssue[] = []
  const monsters = monsterTokenIds(src.tokens)
  const keptTokens = src.tokens.filter(t => !monsters.has(t.id!))
  const ids = Object.fromEntries(LORE_TABLES.map(t => [t, allocate(t === 'tokens' ? keptTokens : src[t], start[t])])) as Record<LoreTable, Map<number, number>>
  const ent = (id: number | null | undefined) => (id === null || id === undefined ? id : ids.entities.get(id) ?? null)

  /** Rows whose parent was not exported are dropped and reported. */
  function owned<T extends { id?: number }>(table: string, rows: T[], parentOf: (r: T) => number | null | undefined, parents: Map<number, number>) {
    return rows.filter(r => {
      const p = parentOf(r)
      if (p !== null && p !== undefined && parents.has(p)) return true
      issues.push({ table, id: r.id ?? -1, detail: `parent ${p} is missing — row skipped` })
      return false
    })
  }

  const campaigns = src.campaigns.map(c => {
    // The campaign's DM's Tome system has no counterpart: the game decides which compendium it uses
    const { system_id: _system, ...rest } = c as DbCampaign & { system_id?: number | null }
    return {
      ...rest, id: ids.campaigns.get(c.id!)!, game: c.game ?? 'pf2e', rules: c.rules ?? {},
      description: c.description ?? '',
    } as DbCampaign
  })

  const entities = owned('entities', src.entities, e => e.campaign_id, ids.campaigns).map(e => {
    const attrs = { ...json<Record<string, any>>(e.attributes, {}) }
    if (Array.isArray(attrs.mapPins)) {
      attrs.mapPins = attrs.mapPins
        .map((p: any) => ({ ...p, entityId: ent(p.entityId) }))
        .filter((p: any) => {
          if (p.entityId !== null) return true
          issues.push({ table: 'entities', id: e.id!, detail: 'map pin to a missing entry removed' })
          return false
        })
    }
    if (typeof attrs.locationEntityId === 'number') attrs.locationEntityId = ent(attrs.locationEntityId)
    if (typeof attrs.questGiverId === 'number') {
      attrs.questGiverId = ent(attrs.questGiverId) ?? undefined
      if (attrs.questGiverId === undefined) delete attrs.questGiverId
    }
    return {
      ...e, id: ids.entities.get(e.id!)!, campaign_id: ids.campaigns.get(e.campaign_id)!,
      content: e.content ?? '', attributes: attrs,
    }
  })

  const entityLinks = owned('entityLinks', src.entityLinks, l => l.source_id, ids.entities)
    .map(l => ({ ...l, id: ids.entityLinks.get(l.id!)!, source_id: ids.entities.get(l.source_id)!, metadata: json<Record<string, string>>(l.metadata, {}) }))

  const entitySnapshots = owned('entitySnapshots', src.entitySnapshots, s => s.entity_id, ids.entities)
    .map(s => ({
      ...s, id: ids.entitySnapshots.get(s.id!)!, entity_id: ids.entities.get(s.entity_id)!,
      event_id: ent(s.event_id) ?? null, content: s.content ?? '', attributes: json<Record<string, any>>(s.attributes, {}),
    }))

  const entityConnections = owned('entityConnections', src.entityConnections, c => c.campaign_id, ids.campaigns)
    .filter(c => {
      if (ids.entities.has(c.source_entity_id) && ids.entities.has(c.target_entity_id)) return true
      issues.push({ table: 'entityConnections', id: c.id!, detail: 'connection to a missing entry skipped' })
      return false
    })
    .map(c => ({
      ...c, id: ids.entityConnections.get(c.id!)!, campaign_id: ids.campaigns.get(c.campaign_id)!,
      source_entity_id: ids.entities.get(c.source_entity_id)!, target_entity_id: ids.entities.get(c.target_entity_id)!,
    }))

  const nodeIds = (s: unknown) => json<number[]>(s, []).map(n => ent(n)).filter((n): n is number => n !== null && n !== undefined)
  const graphLayouts = owned('graphLayouts', src.graphLayouts, g => g.campaign_id, ids.campaigns).map(g => {
    const positions: Record<string, { x: number; y: number }> = {}
    for (const [k, v] of Object.entries(json<Record<string, unknown>>(g.positions, {}))) {
      const n = ent(Number(k))
      if (n !== null && n !== undefined) positions[String(n)] = v as { x: number; y: number }
    }
    return {
      ...g, id: ids.graphLayouts.get(g.id!)!, campaign_id: ids.campaigns.get(g.campaign_id)!,
      positions, hidden_nodes: nodeIds(g.hidden_nodes),
      ...(g.player_hidden_nodes !== undefined ? { player_hidden_nodes: nodeIds(g.player_hidden_nodes) } : {}),
    }
  })

  const entityLink = (id: number | null | undefined) => (id !== null && id !== undefined ? ent(id) ?? null : id)

  // Links to library records have no counterpart: the compendium comes from the Foundry sync
  const tokens = keptTokens.map(({ linked_record_id: _rec, ...t }) => ({
    ...t, id: ids.tokens.get(t.id!)!, linked_rules_id: null, linked_entity_id: entityLink(t.linked_entity_id) ?? null,
  }))
  if (monsters.size) issues.push({ table: 'tokens', id: -1, detail: `${monsters.size} monster token(s) left out — they stood for DM's Tome library records` })

  const byOldToken = new Map(src.tokens.map(t => [t.id!, t]))
  const encounterTokens = owned('encounterTokens', src.encounterTokens, t => t.encounter_id, ids.encounters).map(({ linked_record_id: _rec, ...t }) => {
    // A placement of a left-out (or deleted) library token keeps its name and
    // image on the placement; one placed straight from the library takes the record's
    const old = t.token_id != null ? byOldToken.get(t.token_id) : undefined
    const tokenId = t.token_id != null ? ids.tokens.get(t.token_id) ?? null : null
    const rec = _rec != null ? src.recordLabels?.get(_rec) : undefined
    const name = old?.name || rec?.name || null
    const image = t.image_source ?? old?.image_source ?? rec?.image ?? null
    const own = tokenId === null ? {
      label: t.label || name,
      image_source: image,
      image_type: t.image_source ? t.image_type : (old?.image_source ? old.image_type : (rec?.image ? 'file' as const : t.image_type)),
    } : {}
    return {
      ...t, ...own, id: ids.encounterTokens.get(t.id!)!, encounter_id: ids.encounters.get(t.encounter_id)!, token_id: tokenId,
      linked_rules_id: null, linked_entity_id: entityLink(t.linked_entity_id) ?? null,
      conditions: json<unknown[]>(t.conditions, []), timers: json<unknown[]>(t.timers, []),
    }
  })

  const encounters = owned('encounters', src.encounters, e => e.campaign_id, ids.campaigns).map(e => {
    const log = json<any[]>(e.combat_log, [])
    const combatLog = Array.isArray(log)
      ? log.map(entry => (typeof entry?.tokenId === 'number' ? { ...entry, tokenId: ids.encounterTokens.get(entry.tokenId) ?? entry.tokenId } : entry))
      : log
    return {
      ...e, id: ids.encounters.get(e.id!)!, campaign_id: ids.campaigns.get(e.campaign_id)!,
      combat_log: combatLog, fog_data: json<Record<string, string>>(e.fog_data, {}), viewport: json(e.viewport, { x: 0, y: 0, scale: 1 }),
      // Sound playlists are not part of DM's Tome exports
      sound_playlist_id: null,
    }
  })

  const encounterWalls = owned('encounterWalls', src.encounterWalls, w => w.encounter_id, ids.encounters)
    .map(w => ({ ...w, id: ids.encounterWalls.get(w.id!)!, encounter_id: ids.encounters.get(w.encounter_id)!, points: json<{ x: number; y: number }[]>(w.points, []) }))

  return {
    tables: { campaigns, entities, entityLinks, entitySnapshots, entityConnections, graphLayouts, tokens, encounters, encounterTokens, encounterWalls },
    ids,
    monsterTokens: monsters.size,
    issues,
  }
}

