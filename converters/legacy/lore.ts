/**
 * Legacy DM's Tome campaign data → StarTome rows with fresh ids (FORK_PLAN.md §8.1).
 *
 * Lore shapes are the same in both apps; only ids change, because the target
 * database may already hold campaigns. Every table gets a contiguous id block
 * starting at `start[table]`, and every reference is rewritten — including the
 * ones hidden in JSON (map pins, regions, quest givers, graph positions,
 * combat-log token ids). Token links to old library records also get the
 * compendium entry they were reconciled to. Pure: no database.
 */
import type {
  DbCampaign, DbEncounter, DbEncounterToken, DbEncounterWall, DbEntity, DbEntityConnection, DbEntityLink,
  DbEntitySnapshot, DbGraphLayout, DbRecord, DbSystem, DbToken,
} from '~/composables/useDb'
import { isRulesKind } from '~/types/rules'

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

/** DM's Tome's rules library: read for matching (sync/legacyImport.ts), never imported as is. */
export interface LibraryTables { systems: DbSystem[]; records: DbRecord[] }

export interface RemapOptions {
  /** Old record id → compendium entry it was reconciled to. */
  rulesLinks: Map<number, string>
  /** "kind:normalised legacy name" → compendium name, for {{kind: Name}} refs whose entry was renamed. */
  refRenames?: Map<string, string>
}

export interface RemapIssue { table: string; id: number; detail: string }

export interface RemapResult {
  tables: LoreTables
  ids: Record<LoreTable, Map<number, number>>
  issues: RemapIssue[]
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

const REF = /\{\{(\w+):\s*([^}]+?)\s*\}\}/g

/** Rewrites {{kind: Old Name}} refs to the compendium name they were reconciled to. */
export function rewriteRulesRefs(text: string, renames: Map<string, string> | undefined, normalize: (s: string) => string): string {
  if (!renames?.size || !text.includes('{{')) return text
  return text.replace(REF, (m, type: string, name: string) => {
    const kind = type.toLowerCase()
    if (!isRulesKind(kind)) return m
    const to = renames.get(`${kind}:${normalize(name)}`)
    return to ? `{{${type}: ${to}}}` : m
  })
}

/** Applies `fn` to every string inside a JSON value. */
function mapStrings(v: unknown, fn: (s: string) => string): unknown {
  if (typeof v === 'string') return fn(v)
  if (Array.isArray(v)) return v.map(x => mapStrings(x, fn))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, fn)]))
  return v
}

export function remapLore(
  src: LoreTables,
  start: Record<LoreTable, number>,
  opts: RemapOptions,
  normalize: (s: string) => string,
): RemapResult {
  const issues: RemapIssue[] = []
  const ids = Object.fromEntries(LORE_TABLES.map(t => [t, allocate(src[t], start[t])])) as Record<LoreTable, Map<number, number>>
  const refs = (s: string) => rewriteRulesRefs(s, opts.refRenames, normalize)
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
      description: refs(c.description ?? ''),
    } as DbCampaign
  })

  const entities = owned('entities', src.entities, e => e.campaign_id, ids.campaigns).map(e => {
    const attrs = mapStrings(json<Record<string, any>>(e.attributes, {}), refs) as Record<string, any>
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
      content: refs(e.content ?? ''), attributes: JSON.stringify(attrs),
    }
  })

  const entityLinks = owned('entityLinks', src.entityLinks, l => l.source_id, ids.entities)
    .map(l => ({ ...l, id: ids.entityLinks.get(l.id!)!, source_id: ids.entities.get(l.source_id)! }))

  const entitySnapshots = owned('entitySnapshots', src.entitySnapshots, s => s.entity_id, ids.entities)
    .map(s => ({
      ...s, id: ids.entitySnapshots.get(s.id!)!, entity_id: ids.entities.get(s.entity_id)!,
      event_id: ent(s.event_id) ?? null, content: refs(s.content ?? ''),
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

  const nodeIds = (s: string | undefined) => JSON.stringify(json<number[]>(s, []).map(n => ent(n)).filter(n => n !== null))
  const graphLayouts = owned('graphLayouts', src.graphLayouts, g => g.campaign_id, ids.campaigns).map(g => {
    const positions: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(json<Record<string, unknown>>(g.positions, {}))) {
      const n = ent(Number(k))
      if (n !== null && n !== undefined) positions[String(n)] = v
    }
    return {
      ...g, id: ids.graphLayouts.get(g.id!)!, campaign_id: ids.campaigns.get(g.campaign_id)!,
      positions: JSON.stringify(positions), hidden_nodes: nodeIds(g.hidden_nodes),
      ...(g.player_hidden_nodes !== undefined ? { player_hidden_nodes: nodeIds(g.player_hidden_nodes) } : {}),
    }
  })

  /** Token → compendium link (from the record it pointed at) and campaign-entry link, remapped. */
  function links<T extends { id?: number; linked_record_id: number | null; linked_entity_id?: number | null }>(table: string, t: T) {
    const rec = t.linked_record_id
    const rulesId = rec !== null && rec !== undefined ? opts.rulesLinks.get(rec) ?? null : null
    if (rec !== null && rec !== undefined && rulesId === null) {
      issues.push({ table, id: t.id ?? -1, detail: `link to record ${rec} cleared — the record is gone or was dropped` })
    }
    const entityId = t.linked_entity_id !== null && t.linked_entity_id !== undefined ? ent(t.linked_entity_id) ?? null : t.linked_entity_id
    return { linked_record_id: null, linked_rules_id: rulesId, ...(entityId !== undefined ? { linked_entity_id: entityId } : {}) }
  }

  const tokens = src.tokens.map(t => ({ ...t, id: ids.tokens.get(t.id!)!, ...links('tokens', t) }))

  const encounterTokens = owned('encounterTokens', src.encounterTokens, t => t.encounter_id, ids.encounters).map(t => {
    // A library token deleted in DM's Tome renders exactly like none: name and image come from the placement
    const tokenId = t.token_id !== null && t.token_id !== undefined ? ids.tokens.get(t.token_id) ?? null : null
    return {
      ...t, id: ids.encounterTokens.get(t.id!)!, encounter_id: ids.encounters.get(t.encounter_id)!, token_id: tokenId,
      ...links('encounterTokens', t),
    }
  })

  const encounters = owned('encounters', src.encounters, e => e.campaign_id, ids.campaigns).map(e => {
    const log = json<any[]>(e.combat_log, [])
    const combatLog = Array.isArray(log)
      ? log.map(entry => (typeof entry?.tokenId === 'number' ? { ...entry, tokenId: ids.encounterTokens.get(entry.tokenId) ?? entry.tokenId } : entry))
      : log
    return {
      ...e, id: ids.encounters.get(e.id!)!, campaign_id: ids.campaigns.get(e.campaign_id)!,
      combat_log: JSON.stringify(combatLog),
      // Sound playlists are not part of DM's Tome exports
      sound_playlist_id: null,
    }
  })

  const encounterWalls = owned('encounterWalls', src.encounterWalls, w => w.encounter_id, ids.encounters)
    .map(w => ({ ...w, id: ids.encounterWalls.get(w.id!)!, encounter_id: ids.encounters.get(w.encounter_id)! }))

  return {
    tables: { campaigns, entities, entityLinks, entitySnapshots, entityConnections, graphLayouts, tokens, encounters, encounterTokens, encounterWalls },
    ids,
    issues,
  }
}

