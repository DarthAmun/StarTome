/**
 * Dexie (IndexedDB) database — replaces electron/main.js + better-sqlite3
 *
 * Schema mirrors the SQLite tables exactly so the store layer barely changes.
 * Images are stored as base64 data URLs instead of file paths.
 */

/**
 * DATA MODEL NOTE — campaign lore and rules data are separate:
 *
 * 1. DbEntity (entities table) — campaign-scoped notes and lore (npc, location,
 *    quest, …): markdown content + typed attributes, linked by DbEntityLink.
 * 2. RulesEntity (rules table, types/rules.ts) — the typed PF2e/SF2e compendium,
 *    synced from Foundry or user-made. Read and written only via useRules.ts.
 *
 * DM's Tome's generic rules library (`systems`/`records`) was dropped in v4;
 * a copy of its rows survives in `legacyLibrary` until the user deletes it.
 */
import Dexie, { type Table } from 'dexie'
import { DB_NAME, channelName, windowName } from '~/utils/appNamespace'
import type { CampaignRules, GameId } from '~/types/game'
import type { RulesEntity, Runes } from '~/types/rules'
import type { Adjustment } from '~/rules/combat'
import { resolveImageDataUrl } from '~/rules/images'

// ── Types ──────────────────────────────────────────────────────────────────
export interface DbCampaign {
  id?: number
  name: string
  description: string
  banner_source?: string | null  // base64 data URL or http URL
  banner_type?: 'file' | 'url'
  game?: GameId                  // missing on campaigns imported from DM's Tome → read via campaignGame()
  rules?: Partial<CampaignRules> // read via campaignRules()
  created_at: string
  updated_at: string
}

export interface DbEncounter {
  id?: number
  campaign_id: number
  name: string
  map_source: string | null   // base64 data URL or http URL
  map_type: 'file' | 'url'
  grid_size: number
  grid_offset_x: number
  grid_offset_y: number
  fog_data: string            // JSON
  viewport: string            // JSON
  combat_log: string          // JSON: CombatLogEntry[]
  status?: string             // 'prepared' | 'active'
  current_turn_index?: number
  round_number?: number
  fov_enabled?: boolean
  sound_playlist_id?: number | null
  initiative_formula?: string | null
  party_level?: number | null // overrides the party tab's level for this encounter's meter
  // Resolution (FEATURES_PLAN.md P4); status 'resolved'. Non-indexed, no version bump.
  defeated?: string            // JSON DefeatedEnemy[]: enemies removed in Run mode, XP kept
  resolved_at?: string | null
  xp_total?: number | null     // XP of the enemies counted, against party_level_at_resolve
  xp_awarded?: number | null   // per participant, as for four PCs, incl. accomplishment XP
  party_level_at_resolve?: number | null
  resolution?: string | null   // JSON ResolutionRecord, for the undo
  created_at: string
  updated_at: string
}

export interface DbToken {
  id?: number
  name: string
  image_source: string | null // base64 data URL or http URL
  image_type: 'file' | 'url'
  is_template: number
  is_player_character: number  // 0 | 1
  linked_rules_id?: string | null   // compendium entry (types/rules.ts) the token stands for
  rules_adjustment?: Adjustment | null
  linked_entity_id?: number | null  // campaign entity (NPC) this token represents
  sync_image?: number               // 0 | 1 — token image mirrors the linked entry's image
  created_at: string
}

export interface DbEncounterToken {
  id?: number
  encounter_id: number
  token_id: number | null      // null = placed directly from a compendium creature
  grid_x: number
  grid_y: number
  size: number
  is_visible: number
  is_dead: number
  label: string | null
  conditions: string          // JSON
  hp_current: number | null
  hp_max: number | null
  ac: number | null
  initiative: number | null
  notes: string | null
  linked_rules_id?: string | null
  rules_adjustment?: Adjustment | null  // weak/elite version of the linked creature
  linked_entity_id?: number | null
  vision_range: number | null // tiles, null = infinite
  is_player_token: number     // 0 | 1
  image_source: string | null // for creature-direct tokens (token_id = null)
  image_type: 'file' | 'url'
  elevation: number | null
  timers?: string             // JSON TokenTimer[] — non-indexed, added without a version bump
  acts_while_hidden?: number  // 0 | 1 — hidden token still takes its turn
  is_ally?: number            // 0 | 1 — fights with the party; left out of the XP meter
}

export interface DbEncounterWall {
  id?: number
  encounter_id: number
  points: string              // JSON: Array<{x: number, y: number}>
  coverType: 'full' | 'three-quarter' | 'half' | 'quarter' | 'door'
  isOpen: boolean
}

export interface DbEntity {
  id?: number
  campaign_id: number
  type: string
  name: string
  content: string
  attributes: string          // JSON
  is_favorite?: number        // 0 | 1 — starred in the entity overview
  created_at: string
  updated_at: string
}

export interface DbEntityLink {
  id?: number
  source_id: number
  target_type: string
  target_name: string
  metadata: string            // JSON
}

export interface DbEntitySnapshot {
  id?: number
  entity_id: number        // FK to entities table
  label: string            // GM-typed label: "Before Ascension", "Session 12"
  note: string             // optional short note about why this snapshot was taken
  content: string          // full markdown content at time of snapshot
  attributes: string       // JSON string of all attributes at time of snapshot
  name: string             // name of the entity at time of snapshot
  created_at: string       // ISO timestamp
  // linked event (optional)
  event_id: number | null  // FK to entities table where type='event'
  event_name: string | null
}

/** A party member: player character or companion (FEATURES_PLAN.md §1). */
export interface DbCharacter {
  id?: number
  campaign_id: number
  name: string
  role: 'pc' | 'companion'
  level: number
  xp: number
  treat_as_pc: number              // 0 | 1 — companions only; PCs always count
  str_mod: number | null           // manual, for the encumbrance warning
  npc_entity_id: number | null     // the campaign NPC entry (portrait, lore page, token)
  token_id?: number | null         // library token placed by the encounter builder
  created_at: string
  updated_at: string
}

/** One "level up" action: which characters went from which level to which. */
export interface DbLevelUp {
  id?: number
  campaign_id: number
  at: string
  trigger: 'manual' | 'quest' | 'encounter'
  ref_id: number | null            // quest entity / encounter id
  changes: string                  // JSON LevelChange[]
  undone_at?: string | null
}

/** One XP award (FEATURES_PLAN.md P4): an encounter's or an accomplishment's XP for some characters. */
export interface DbXpAward {
  id?: number
  campaign_id: number
  at: string
  source: 'encounter' | 'accomplishment'
  ref_type: 'encounter' | 'quest' | null
  ref_id: number | null
  amount: number                   // per character
  character_ids: string            // JSON number[]
  reason: string
  undone_at?: string | null
}

/** One inventory entry (FEATURES_PLAN.md P3): an item stack held by a character, the stash or an encounter. */
export interface DbInventory {
  id?: number
  campaign_id: number
  owner: string                    // 'stash' | 'character:<id>' | 'encounter:<id>'
  item_id: string | null           // compendium item; null = free text
  quantity: number
  name_override: string | null
  price_override: number | null    // cp per item (per batch for ammunition)
  bulk_override: number | null     // tenths
  notes: string
  identified: number               // 0 | 1
  player_name: string | null
  player_description: string | null
  runes: Runes | null
  grade: string | null
  created_at: string
  updated_at: string
}

/** Coins of one owner, in cp for both games (1 credit = 10 cp). */
export interface DbPurse {
  id?: number
  campaign_id: number
  owner: string
  cp: number
  updated_at: string
}

/** One row of the old DM's Tome rules library, saved by the v4 upgrade before its tables were dropped. */
export interface DbLegacyLibrary {
  key: string                    // 'systems:<id>' | 'records:<id>'
  table: 'systems' | 'records'
  row: Record<string, unknown>
  savedAt: string
}

export interface DbEntityConnection {
  id?: number
  campaign_id: number
  source_entity_id: number
  target_entity_id: number
  label: string            // empty string = no label
  direction: 'one-way' | 'two-way' | 'none'
  color: string | null     // null = default edge color
  edgeType?: 'default' | 'straight' | 'step' | 'smoothstep'
}

export interface DbGraphLayout {
  id?: number
  campaign_id: number
  name: string              // user-visible graph name
  positions: string         // JSON: Record<entityId, {x, y}>
  hidden_nodes: string      // JSON: number[] (legacy, no longer used for GM)
  player_hidden_nodes?: string // JSON: number[] — hidden from player view
  zoom: number
  pan_x: number
  pan_y: number
}

export interface DbSoundTrack {
  id?: number
  name: string
  type: 'file' | 'url' | 'spotify'
  src: string           // URL for 'url'/'spotify'; empty for 'file'
  fileHandle?: any      // FileSystemFileHandle, stored as IDB structured clone
  duration?: number     // seconds, for display
  tags?: string         // JSON: string[]
  createdAt: string
  updatedAt: string
}

export interface DbSoundPlaylist {
  id?: number
  name: string
  description?: string
  color?: string        // theme color hex
  trackIds: string      // JSON: number[]
  loop: number          // 0 | 1
  shuffle: number       // 0 | 1
  createdAt: string
  updatedAt: string
}

/** User-owned image blobs (portraits, token art) referenced from rules entities. */
export interface DbImage {
  id: string
  blob: Blob
  mime: string
  createdAt: string
}

/** Compendium sync bookkeeping, one row per game (phase 3). */
export interface DbSyncState {
  game: GameId
  channel: string
  version: string
  /** `converter`: CONVERTER_VERSION the pack was converted with (missing = 1). */
  packs: Record<string, { hash: string; count: number; converter?: number }>
  syncedAt: string
}

// ── Database class ─────────────────────────────────────────────────────────
class StarTomeDb extends Dexie {
  campaigns!:         Table<DbCampaign>
  encounters!:        Table<DbEncounter>
  tokens!:            Table<DbToken>
  encounterTokens!:   Table<DbEncounterToken>
  entities!:          Table<DbEntity>
  entityLinks!:       Table<DbEntityLink>
  encounterWalls!:    Table<DbEncounterWall>
  entitySnapshots!:   Table<DbEntitySnapshot>
  entityConnections!: Table<DbEntityConnection>
  graphLayouts!:      Table<DbGraphLayout>
  soundTracks!:       Table<DbSoundTrack>
  soundPlaylists!:    Table<DbSoundPlaylist>
  rules!:             Table<RulesEntity, string>
  images!:            Table<DbImage, string>
  syncState!:         Table<DbSyncState, string>
  legacyLibrary!:     Table<DbLegacyLibrary, string>
  characters!:        Table<DbCharacter>
  levelUps!:          Table<DbLevelUp>
  inventory!:         Table<DbInventory>
  purses!:            Table<DbPurse>
  xpAwards!:          Table<DbXpAward>

  constructor() {
    super(DB_NAME)
    // v1: StarTome starts its own database. The store list equals DM's Tome's
    // `dmforge` v13; its upgrade history (v1–v13) never runs here because this
    // database is always created fresh. Data arrives via import, not migration.
    this.version(1).stores({
      campaigns:          '++id, updated_at, system_id',
      encounters:         '++id, campaign_id, created_at',
      tokens:             '++id, is_template, name, linked_record_id',
      encounterTokens:    '++id, encounter_id, token_id, linked_record_id',
      entities:           '++id, campaign_id, type, name',
      entityLinks:        '++id, source_id, target_type, target_name',
      systems:            '++id, shortId, updatedAt',
      records:            '++id, systemId, entityTypeId, name, updatedAt',
      encounterWalls:     '++id, encounter_id',
      entitySnapshots:    '++id, entity_id, event_id, created_at',
      entityConnections:  '++id, campaign_id, source_entity_id, target_entity_id',
      graphLayouts:       '++id, campaign_id, name',
      soundTracks:        '++id, name, type',
      soundPlaylists:     '++id, name',
    })
    // v2: typed PF2e/SF2e compendium (types/rules.ts), user image blobs, sync state
    this.version(2).stores({
      rules:              'id, kind, game, sortName, level, rarity, *traits, origin, [kind+sortName], [kind+level+sortName], updatedAt',
      images:             'id',
      syncState:          'game',
    })
    // v3: tokens and placements link compendium entries (phase 5)
    this.version(3).stores({
      tokens:             '++id, is_template, name, linked_record_id, linked_rules_id',
      encounterTokens:    '++id, encounter_id, token_id, linked_record_id, linked_rules_id',
    })
    // v4: the generic rules library is gone (phase 6). Its rows are copied to
    // `legacyLibrary` (downloadable from Settings) before the tables are
    // dropped; the record links and system ids it left behind go too.
    this.version(4).stores({
      systems:            null,
      records:            null,
      legacyLibrary:      'key, table',
      campaigns:          '++id, updated_at',
      tokens:             '++id, is_template, name, linked_rules_id',
      encounterTokens:    '++id, encounter_id, token_id, linked_rules_id',
    }).upgrade(async (tx) => {
      // Dropped tables stay readable here; Dexie deletes them after the upgrade.
      // Copied in chunks, one backup row per record: a library with inline
      // images runs to ~100 MB, too much for a single value.
      const savedAt = new Date().toISOString()
      for (const table of ['systems', 'records'] as const) {
        let last = -Infinity
        for (;;) {
          const rows = await tx.table(table).where(':id').above(last).limit(500).toArray()
          if (!rows.length) break
          await tx.table('legacyLibrary').bulkPut(rows.map(row => ({ key: `${table}:${row.id}`, table, row, savedAt })))
          last = rows[rows.length - 1].id
        }
      }
      await tx.table('campaigns').toCollection().modify((c: Record<string, unknown>) => { delete c.system_id })
      for (const t of ['tokens', 'encounterTokens']) {
        await tx.table(t).toCollection().modify((r: Record<string, unknown>) => { delete r.linked_record_id })
      }
    })
    // v5: party (FEATURES_PLAN.md P1). Characters are created from PC-flagged NPCs
    // by useParty on first load, not here, so the NPC lore stays the source until then.
    this.version(5).stores({
      characters:         '++id, campaign_id, npc_entity_id',
      levelUps:           '++id, campaign_id, at',
    })
    // v6: inventory and purses (FEATURES_PLAN.md P3). One list for every owner.
    this.version(6).stores({
      inventory:          '++id, campaign_id, owner, item_id',
      purses:             '++id, campaign_id, owner',
    })
    // v7: XP awards (FEATURES_PLAN.md P4). Encounter resolution lives on `encounters`.
    this.version(7).stores({
      xpAwards:           '++id, campaign_id, at',
    })
  }
}

// Singleton
let _db: StarTomeDb | null = null
export function getDb(): StarTomeDb {
  if (!_db) _db = new StarTomeDb()
  return _db
}

export function parseRecordData(data: any): Record<string, any> {
  if (!data) return {}
  if (typeof data === 'object') return data
  try { return JSON.parse(data) } catch { return {} }
}

/** "url" for http(s) sources, "file" for data URLs / local paths. */
export function imageTypeOf(src: string): 'file' | 'url' {
  return src.startsWith('http') ? 'url' : 'file'
}

// ── Timestamp helper ───────────────────────────────────────────────────────
export function now() { return new Date().toISOString() }

// ── Image helper — reads a File, resizes to ≤1920px, re-encodes as JPEG ──
const IMAGE_MAX_PX = 1920
const IMAGE_QUALITY = 0.8

export async function fileToDataUrl(file: File, toJpeg = true): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  return compressDataUrl(raw, toJpeg)
}

export function compressDataUrl(dataUrl: string, toJpeg = true): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img
      const scale = Math.min(1, IMAGE_MAX_PX / Math.max(w, h))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      const originalMime = dataUrl.match(/^data:([^;]+);/)?.[1] ?? 'image/png'
      const mime = toJpeg ? 'image/jpeg' : originalMime
      const quality = (mime === 'image/jpeg' || mime === 'image/webp') ? IMAGE_QUALITY : undefined
      resolve(canvas.toDataURL(mime, quality))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

// ── API ──────────────────────────────────────────────────────────────────


export const dbApi = {

  // ── Campaigns ─────────────────────────────────────────────────────────
  campaigns: {
    async list() {
      const db = getDb()
      return db.campaigns.orderBy('updated_at').reverse().toArray()
    },
    async get(id: number) {
      return getDb().campaigns.get(id)
    },
    async create(data: { name: string; description?: string; game?: GameId; rules?: Partial<CampaignRules> }) {
      const db = getDb()
      const ts = now()
      const id = await db.campaigns.add({ name: data.name, description: data.description ?? '', game: data.game ?? 'pf2e', rules: data.rules ?? {}, created_at: ts, updated_at: ts })
      return db.campaigns.get(id)
    },
    async update(id: number, data: { name?: string; description?: string; banner_source?: string | null; banner_type?: 'file' | 'url'; game?: GameId; rules?: Partial<CampaignRules> }) {
      const db = getDb()
      await db.campaigns.update(id, { ...data, updated_at: now() })
      return db.campaigns.get(id)
    },
    async delete(id: number) {
      const db = getDb()
      // Cascade: delete encounters, entities
      const encIds = await db.encounters.where('campaign_id').equals(id).primaryKeys()
      for (const eid of encIds) {
        await db.encounterTokens.where('encounter_id').equals(eid).delete()
      }
      await db.encounters.where('campaign_id').equals(id).delete()
      const entIds = await db.entities.where('campaign_id').equals(id).primaryKeys()
      for (const eid of entIds) {
        await db.entityLinks.where('source_id').equals(eid).delete()
      }
      await db.entities.where('campaign_id').equals(id).delete()
      await db.entityConnections.where('campaign_id').equals(id).delete()
      await db.characters.where('campaign_id').equals(id).delete()
      await db.levelUps.where('campaign_id').equals(id).delete()
      await db.xpAwards.where('campaign_id').equals(id).delete()
      await db.inventory.where('campaign_id').equals(id).delete()
      await db.purses.where('campaign_id').equals(id).delete()
      await db.campaigns.delete(id)
    },
    async clone(id: number) {
      const db = getDb()
      const source = await db.campaigns.get(id)
      if (!source) throw new Error(`campaigns.clone: campaign ${id} not found`)
      const ts = now()
      const newCampaignId = await db.campaigns.add({
        name: `${source.name} (Copy)`,
        description: source.description,
        banner_source: source.banner_source ?? null,
        banner_type: source.banner_type,
        game: source.game,
        rules: source.rules,
        created_at: ts,
        updated_at: ts,
      } as DbCampaign) as number

      // ── Entities ──────────────────────────────────────────────────────
      const entities = await db.entities.where('campaign_id').equals(id).toArray()
      const entityIdMap = new Map<number, number>()
      for (const e of entities) {
        const { id: oldId, ...rest } = e
        const newId = await db.entities.add({ ...rest, campaign_id: newCampaignId })
        entityIdMap.set(oldId!, newId as number)
      }
      const oldEntityIds = entities.map(e => e.id!)

      // ── Entity links (resolved by name — only source_id needs remap) ──
      const links = oldEntityIds.length
        ? await db.entityLinks.where('source_id').anyOf(oldEntityIds).toArray()
        : []
      for (const l of links) {
        const { id: _linkId, ...rest } = l
        const newSourceId = entityIdMap.get(rest.source_id)
        if (newSourceId == null) continue
        await db.entityLinks.add({ ...rest, source_id: newSourceId })
      }

      // ── Entity snapshots ────────────────────────────────────────────────
      for (const oldEntId of oldEntityIds) {
        const snaps = await db.entitySnapshots.where('entity_id').equals(oldEntId).toArray()
        for (const s of snaps) {
          const { id: _sId, ...rest } = s
          const newEntityId = entityIdMap.get(rest.entity_id)
          if (newEntityId == null) continue
          const newEventId = rest.event_id != null ? (entityIdMap.get(rest.event_id) ?? null) : null
          await db.entitySnapshots.add({ ...rest, entity_id: newEntityId, event_id: newEventId })
        }
      }

      // ── Entity connections ──────────────────────────────────────────────
      const connections = await db.entityConnections.where('campaign_id').equals(id).toArray()
      for (const c of connections) {
        const { id: _cId, ...rest } = c
        const newSource = entityIdMap.get(rest.source_entity_id)
        const newTarget = entityIdMap.get(rest.target_entity_id)
        if (newSource == null || newTarget == null) continue
        await db.entityConnections.add({ ...rest, campaign_id: newCampaignId, source_entity_id: newSource, target_entity_id: newTarget })
      }

      // ── Graph layouts ───────────────────────────────────────────────────
      const remapIdArray = (json: string): string => {
        try {
          const arr = JSON.parse(json)
          if (!Array.isArray(arr)) return json
          return JSON.stringify(arr.map((oldId: number) => entityIdMap.get(oldId)).filter((v: any) => v != null))
        } catch { return json }
      }
      const remapPositions = (json: string): string => {
        try {
          const obj = JSON.parse(json)
          const out: Record<string, any> = {}
          for (const [key, val] of Object.entries(obj)) {
            const newId = entityIdMap.get(Number(key))
            if (newId != null) out[newId] = val
          }
          return JSON.stringify(out)
        } catch { return json }
      }
      const layouts = await db.graphLayouts.where('campaign_id').equals(id).toArray()
      for (const g of layouts) {
        const { id: _gId, ...rest } = g
        await db.graphLayouts.add({
          ...rest,
          campaign_id: newCampaignId,
          positions: remapPositions(rest.positions),
          hidden_nodes: remapIdArray(rest.hidden_nodes),
          player_hidden_nodes: rest.player_hidden_nodes != null ? remapIdArray(rest.player_hidden_nodes) : rest.player_hidden_nodes,
        })
      }

      // ── Party (level-up and XP history stay with the original) ─────────
      const characters = await db.characters.where('campaign_id').equals(id).toArray()
      const ownerMap = new Map<string, string>([['stash', 'stash']])
      for (const { id: oldCId, ...c } of characters) {
        const newCId = await db.characters.add({ ...c, campaign_id: newCampaignId, npc_entity_id: c.npc_entity_id != null ? entityIdMap.get(c.npc_entity_id) ?? null : null })
        ownerMap.set(`character:${oldCId}`, `character:${newCId}`)
      }

      // ── Encounters (+ tokens, walls) ────────────────────────────────────
      const encounters = await db.encounters.where('campaign_id').equals(id).toArray()
      for (const enc of encounters) {
        const { id: oldEncId, ...rest } = enc
        // The resolve record points at the original's characters and XP log; the copy can't undo it
        const newEncId = await db.encounters.add({ ...rest, campaign_id: newCampaignId, resolution: null })
        ownerMap.set(`encounter:${oldEncId}`, `encounter:${newEncId}`)

        const tokens = await db.encounterTokens.where('encounter_id').equals(oldEncId!).toArray()
        for (const t of tokens) {
          const { id: _tId, ...tRest } = t
          await db.encounterTokens.add({ ...tRest, encounter_id: newEncId as number })
        }

        const walls = await db.encounterWalls.where('encounter_id').equals(oldEncId!).toArray()
        for (const w of walls) {
          const { id: _wId, ...wRest } = w
          await db.encounterWalls.add({ ...wRest, encounter_id: newEncId as number })
        }
      }

      // ── Inventory + purses (after characters and encounters, for the owner keys) ──
      const entries = await db.inventory.where('campaign_id').equals(id).toArray()
      for (const { id: _iId, ...e } of entries) {
        const owner = ownerMap.get(e.owner)
        if (owner) await db.inventory.add({ ...e, campaign_id: newCampaignId, owner })
      }
      const purses = await db.purses.where('campaign_id').equals(id).toArray()
      for (const { id: _pId, ...p } of purses) {
        const owner = ownerMap.get(p.owner)
        if (owner) await db.purses.add({ ...p, campaign_id: newCampaignId, owner })
      }

      return db.campaigns.get(newCampaignId)
    },
  },

  // ── Internal helpers ─────────────────────────────────────────────────
  async _resolveTokenDisplay(et: DbEncounterToken) {
    const db = getDb()
    const tok = et.token_id ? await db.tokens.get(et.token_id) : null
    const entry = (!tok && et.linked_rules_id) ? await db.rules.get(et.linked_rules_id) : null
    const synced = tok?.sync_image ? await dbApi.linkedImages.get(tok.linked_entity_id, tok.linked_rules_id) : null
    return {
      name: tok?.name ?? entry?.name ?? '',
      image_source: synced?.source ?? tok?.image_source ?? et.image_source ?? null,
      image_type: (synced?.type ?? tok?.image_type ?? et.image_type ?? 'file') as 'file' | 'url',
    }
  },

  // ── Linked-entry images (token ↔ NPC portrait / compendium token art) ──
  linkedImages: {
    /** Image of the entry a token is linked to. The NPC portrait wins over the
     *  compendium entry's token art (or portrait) when both links are set.
     *  Compendium blobs come back as data URLs, which the canvas and the player
     *  window can both load. */
    async get(entityId?: number | null, rulesId?: string | null): Promise<{ source: string; type: 'file' | 'url' } | null> {
      const db = getDb()
      if (entityId) {
        const ent = await db.entities.get(entityId)
        const attrs = parseRecordData(ent?.attributes)
        if (attrs.portraitSource) return { source: attrs.portraitSource, type: attrs.portraitType ?? 'file' }
      }
      if (rulesId) {
        const entry = await db.rules.get(rulesId) as (RulesEntity & { tokenImg?: string | null }) | undefined
        const src = await resolveImageDataUrl(entry?.tokenImg || entry?.img)
        if (src) return { source: src, type: imageTypeOf(src) }
      }
      return null
    },
  },

  // ── Encounters ────────────────────────────────────────────────────────
  encounters: {
    async list(campaignId: number) {
      const db = getDb()
      return db.encounters.where('campaign_id').equals(campaignId).reverse().sortBy('created_at')
    },
    async get(id: number) {
      const db = getDb()
      const enc = await db.encounters.get(id)
      if (!enc) return null
      // Join tokens — token_id may be null for creature-direct placements
      const etRows = await db.encounterTokens.where('encounter_id').equals(id).toArray()
      const tokens = await Promise.all(etRows.map(async et => {
        const display = await dbApi._resolveTokenDisplay(et)
        return { ...et, ...display }
      }))
      return { ...enc, tokens }
    },
    async create(data: { campaignId: number; name: string }) {
      const db = getDb()
      const ts = now()
      const id = await db.encounters.add({ campaign_id: data.campaignId, name: data.name, map_source: null, map_type: 'file', grid_size: 70, grid_offset_x: 0, grid_offset_y: 0, fog_data: '{}', viewport: '{"x":0,"y":0,"scale":1}', combat_log: '[]', created_at: ts, updated_at: ts })
      return db.encounters.get(id)
    },
    async update(data: { id: number; [key: string]: any }) {
      const db = getDb()
      const { id, ...rest } = data
      await db.encounters.update(id, { ...rest, updated_at: now() })
      return db.encounters.get(id)
    },
    async delete(id: number) {
      const db = getDb()
      await db.encounterTokens.where('encounter_id').equals(id).delete()
      // Planned loot goes with the encounter
      await db.inventory.where('owner').equals(`encounter:${id}`).delete()
      await db.purses.where('owner').equals(`encounter:${id}`).delete()
      await db.encounters.delete(id)
    },
    async search(q: string, limit: number) {
      const db = getDb()
      const lq = q.toLowerCase()
      return db.encounters.filter(e => e.name.toLowerCase().includes(lq)).limit(limit).toArray()
    },
  },

  // ── Tokens ────────────────────────────────────────────────────────────
  tokens: {
    async list() {
      const db = getDb()
      return db.tokens.where('is_template').equals(1).sortBy('name')
    },
    async create(data: { name: string; imageSource?: string | null; imageType?: string; linkedRulesId?: string | null; adjustment?: Adjustment | null; linkedEntityId?: number | null; isPlayerCharacter?: boolean; syncImage?: boolean }) {
      const db = getDb()
      const id = await db.tokens.add({
        name: data.name,
        image_source: data.imageSource ?? null,
        image_type: (data.imageType ?? 'file') as any,
        is_template: 1,
        is_player_character: data.isPlayerCharacter ? 1 : 0,
        linked_rules_id: data.linkedRulesId ?? null,
        rules_adjustment: data.adjustment ?? null,
        linked_entity_id: data.linkedEntityId ?? null,
        sync_image: data.syncImage ? 1 : 0,
        created_at: now(),
      })
      return db.tokens.get(id)
    },
    async update(id: number, data: { name?: string; imageSource?: string | null; imageType?: 'file' | 'url'; linkedRulesId?: string | null; adjustment?: Adjustment | null; linkedEntityId?: number | null; isPlayerCharacter?: boolean; syncImage?: boolean }) {
      const db = getDb()
      const changes: Record<string, any> = {}
      if (data.name !== undefined) changes.name = data.name
      if (data.imageSource !== undefined) changes.image_source = data.imageSource
      if (data.imageType !== undefined) changes.image_type = data.imageType
      if ('linkedRulesId' in data) changes.linked_rules_id = data.linkedRulesId ?? null
      if ('adjustment' in data) changes.rules_adjustment = data.adjustment ?? null
      if ('linkedEntityId' in data) changes.linked_entity_id = data.linkedEntityId ?? null
      if ('isPlayerCharacter' in data) changes.is_player_character = data.isPlayerCharacter ? 1 : 0
      if ('syncImage' in data) changes.sync_image = data.syncImage ? 1 : 0
      await db.tokens.update(id, changes)
    },
    async delete(id: number) {
      const db = getDb()
      await db.tokens.delete(id)
    },
  },

  // ── Encounter tokens ──────────────────────────────────────────────────
  encounterTokens: {
    async add(data: any) {
      const db = getDb()
      const id = await db.encounterTokens.add({
        encounter_id: data.encounterId,
        token_id: data.tokenId ?? null,
        grid_x: data.gridX ?? 0, grid_y: data.gridY ?? 0,
        size: data.size ?? 1, is_visible: data.isVisible ?? 1, is_dead: 0,
        label: data.label ?? null, conditions: '[]',
        hp_current: data.hpCurrent ?? null, hp_max: data.hpMax ?? null,
        ac: data.ac ?? null,
        initiative: data.initiative ?? null, notes: null,
        linked_rules_id: data.linkedRulesId ?? null,
        rules_adjustment: data.adjustment ?? null,
        linked_entity_id: data.linkedEntityId ?? null,
        vision_range: data.visionRange ?? null,
        is_player_token: data.isPlayerToken ? 1 : 0,
        image_source: data.imageSource ?? null,
        image_type: (data.imageType ?? 'file') as 'file' | 'url',
        elevation: data.elevation ?? null,
        timers: '[]',
        acts_while_hidden: 0,
        is_ally: data.isAlly ? 1 : 0,
      })
      const et = await db.encounterTokens.get(id)
      if (!et) throw new Error(`encounterTokens.add: row ${id} not found after insert`)
      const display = await dbApi._resolveTokenDisplay(et)
      return { ...et, ...display }
    },
    async update(data: { id: number; [key: string]: any }) {
      const db = getDb()
      const { id, ...rest } = data
      // Convert camelCase keys to snake_case
      const mapped: Record<string, any> = {}
      const toSnake = (s: string) => s.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
      for (const [k, v] of Object.entries(rest)) {
        mapped[toSnake(k)] = v
      }
      await db.encounterTokens.update(id, mapped)
    },
    async remove(id: number) {
      const db = getDb()
      await db.encounterTokens.delete(id)
    },
    /** Mirrors a library token's PC flag onto every placement of it, in all encounters. */
    async setPlayerFlagForLibraryToken(tokenId: number, isPlayer: boolean) {
      const db = getDb()
      await db.encounterTokens.where('token_id').equals(tokenId).modify({ is_player_token: isPlayer ? 1 : 0 })
    },
  },

  // ── Walls ─────────────────────────────────────────────────────────────
  walls: {
    async list(encounterId: number): Promise<DbEncounterWall[]> {
      return getDb().encounterWalls
        .where('encounter_id').equals(encounterId).toArray()
    },
    async add(wall: Omit<DbEncounterWall, 'id'>): Promise<number> {
      return getDb().encounterWalls.add(wall as DbEncounterWall)
    },
    async update(id: number, changes: Partial<DbEncounterWall>): Promise<void> {
      await getDb().encounterWalls.update(id, changes)
    },
    async delete(id: number): Promise<void> {
      await getDb().encounterWalls.delete(id)
    },
    async deleteByEncounter(encounterId: number): Promise<void> {
      await getDb().encounterWalls
        .where('encounter_id').equals(encounterId).delete()
    },
  },

  // ── Entities ──────────────────────────────────────────────────────────
  entities: {
    async list(campaignId: number) {
      const db = getDb()
      return db.entities.where('campaign_id').equals(campaignId).toArray()
        .then(rows => rows.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)))
    },
    async search(query: string, limit = 5) {
      const lq = query.toLowerCase()
      return getDb().entities.filter(e => e.name.toLowerCase().includes(lq) || e.type.toLowerCase().includes(lq)).limit(limit).toArray()
    },
    async searchByTag(tag: string, limit = 20) {
      const lq = tag.toLowerCase()
      const all = await getDb().entities.toArray()
      return all
        .filter(e => {
          try {
            const attrs = JSON.parse(e.attributes ?? '{}')
            return Array.isArray(attrs.tags) && attrs.tags.some((t: string) => String(t).toLowerCase().includes(lq))
          } catch { return false }
        })
        .slice(0, limit)
    },
    async get(id: number) {
      const db = getDb()
      return db.entities.get(id)
    },
    async create(data: { campaignId: number; type: string; name: string; content?: string; attributes?: string }) {
      const db = getDb()
      const ts = now()
      const id = await db.entities.add({ campaign_id: data.campaignId, type: data.type, name: data.name, content: data.content ?? '', attributes: data.attributes ?? '{}', created_at: ts, updated_at: ts })
      return db.entities.get(id)
    },
    async update(data: { id: number; [key: string]: any }) {
      const db = getDb()
      const { id, ...rest } = data
      await db.entities.update(id, { ...rest, updated_at: now() })
      return db.entities.get(id)
    },
    /** Favourite flag is metadata — it must not bump updated_at ("recently updated" sort). */
    async setFavorite(id: number, isFavorite: boolean) {
      await getDb().entities.update(id, { is_favorite: isFavorite ? 1 : 0 })
    },
    async delete(id: number) {
      const db = getDb()
      await db.entityLinks.where('source_id').equals(id).delete()
      await db.entityConnections.where('source_entity_id').equals(id).delete()
      await db.entityConnections.where('target_entity_id').equals(id).delete()
      await db.entities.delete(id)
    },
    async listLinks(campaignId: number) {
      const db = getDb()
      const entityIds = await db.entities.where('campaign_id').equals(campaignId).primaryKeys() as number[]
      if (!entityIds.length) return []
      return db.entityLinks.where('source_id').anyOf(entityIds).toArray()
    },
    async createLink(data: { sourceId: number; targetType: string; targetName: string; metadata?: string }) {
      const db = getDb()
      const id = await db.entityLinks.add({ source_id: data.sourceId, target_type: data.targetType, target_name: data.targetName, metadata: data.metadata ?? '{}' })
      return db.entityLinks.get(id)
    },
    async deleteLinks(sourceId: number) {
      const db = getDb()
      await db.entityLinks.where('source_id').equals(sourceId).delete()
    },
  },

  // ── System — replaces Electron dialog + fs ───────────────────────────
  system: {
    /**
     * Opens a file picker and returns a base64 data URL.
     * Replaces: openFileDialog() + readImage()
     */
    openFileDialog(): Promise<string | null> {
      return new Promise(resolve => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) { resolve(null); return }
          const dataUrl = await fileToDataUrl(file)
          resolve(dataUrl)
        }
        input.oncancel = () => resolve(null)
        input.click()
      })
    },
    /** Already a data URL — just return it */
    readImage(src: string): Promise<string | null> {
      return Promise.resolve(src.startsWith('data:') ? src : null)
    },
  },

  // ── Window — replaces Electron IPC window management ─────────────────
  window: {
    _channel: null as BroadcastChannel | null,
    _handlers: new Map<string, (data: any) => void>(),
    _ensureChannel() {
      if (!this._channel) {
        this._channel = new BroadcastChannel(channelName('player'))
        this._channel.addEventListener('message', (e: MessageEvent) => {
          this._handlers.get(e.data?.type)?.(e.data)
        })
      }
      return this._channel
    },
    openPlayer(encounterId: number): Promise<void> {
      // Hash mode routing: strip any existing hash from pathname, then append the player route
      const base = location.origin + location.pathname.replace(/\/+$/, '')
      const url = `${base}/#/encounter/${encounterId}/player`
      window.open(url, windowName('player'), 'width=1280,height=800')
      return Promise.resolve()
    },
    closePlayer(): Promise<void> {
      this._ensureChannel().postMessage({ type: 'close' })
      return Promise.resolve()
    },
    syncEncounter(data: any): void {
      // JSON round-trip strips Vue reactive Proxies, which postMessage cannot clone
      this._ensureChannel().postMessage({ type: 'sync', data: JSON.parse(JSON.stringify(data)) })
    },
    onPlayerClosed(cb: () => void): void {
      this._ensureChannel()
      this._handlers.set('player-closed', cb)
    },
    offPlayerClosed(): void { this._handlers.delete('player-closed') },
    onEncounterSync(cb: (data: any) => void): void {
      this._ensureChannel()
      this._handlers.set('sync', (d) => cb(d.data))
    },
    offEncounterSync(): void { this._handlers.delete('sync') },
    onPlayerReady(cb: () => void): void {
      this._ensureChannel()
      this._handlers.set('player-ready', cb)
    },
    offPlayerReady(): void { this._handlers.delete('player-ready') },
    sendPlayerReady(): void {
      this._ensureChannel().postMessage({ type: 'player-ready' })
    },
    sendPing(ping: { col: number; row: number; focus: boolean }): void {
      this._ensureChannel().postMessage({ type: 'ping', ...ping })
    },
    onPing(cb: (ping: { col: number; row: number; focus: boolean }) => void): void {
      this._ensureChannel()
      this._handlers.set('ping', (d) => cb({ col: d.col, row: d.row, focus: !!d.focus }))
    },
    offPing(): void { this._handlers.delete('ping') },
    // ── Map player ───────────────────────────────────────────────────────
    _mapChannel: null as BroadcastChannel | null,
    _mapHandlers: new Map<string, (data: any) => void>(),
    _ensureMapChannel() {
      if (!this._mapChannel) {
        this._mapChannel = new BroadcastChannel(channelName('map'))
        this._mapChannel.addEventListener('message', (e: MessageEvent) => {
          this._mapHandlers.get(e.data?.type)?.(e.data)
        })
      }
      return this._mapChannel
    },
    openMapPlayer(campaignId: number, locationId: number): Promise<void> {
      const base = location.origin + location.pathname.replace(/\/+$/, '')
      const url = `${base}/#/campaign/${campaignId}/map-player?locationId=${locationId}`
      window.open(url, windowName('map-player'), 'width=1280,height=900')
      return Promise.resolve()
    },
    syncMap(locationId: number | null): void {
      this._ensureMapChannel().postMessage({ type: 'map-sync', locationId })
    },
    onMapSync(cb: (locationId: number | null) => void): void {
      this._ensureMapChannel()
      this._mapHandlers.set('map-sync', (d) => cb(d.locationId))
    },
    offMapSync(): void { this._mapHandlers.delete('map-sync') },
  },

  // ── Systems ───────────────────────────────────────────────────────────
  snapshots: {
    async list(entityId: number): Promise<DbEntitySnapshot[]> {
      return getDb().entitySnapshots
        .where('entity_id').equals(entityId)
        .sortBy('created_at')
    },

    async create(snapshot: Omit<DbEntitySnapshot, 'id'>): Promise<DbEntitySnapshot> {
      const id = await getDb().entitySnapshots.add(snapshot)
      return { ...snapshot, id }
    },

    async update(id: number, changes: Partial<Pick<DbEntitySnapshot, 'label' | 'note' | 'event_id' | 'event_name'>>): Promise<void> {
      await getDb().entitySnapshots.update(id, changes)
    },

    async delete(id: number): Promise<void> {
      await getDb().entitySnapshots.delete(id)
    },

    async deleteByEntity(entityId: number): Promise<void> {
      await getDb().entitySnapshots
        .where('entity_id').equals(entityId).delete()
    },
  },

  // ── Entity connections (explicit graph edges) ─────────────────────────
  connections: {
    async list(campaignId: number): Promise<DbEntityConnection[]> {
      return getDb().entityConnections
        .where('campaign_id').equals(campaignId).toArray()
    },
    async add(conn: Omit<DbEntityConnection, 'id'>): Promise<DbEntityConnection> {
      const id = await getDb().entityConnections.add(conn as DbEntityConnection)
      return { ...conn, id }
    },
    async update(id: number, changes: Partial<DbEntityConnection>): Promise<void> {
      await getDb().entityConnections.update(id, changes)
    },
    async delete(id: number): Promise<void> {
      await getDb().entityConnections.delete(id)
    },
    async deleteByEntity(entityId: number): Promise<void> {
      const db = getDb()
      await db.entityConnections.where('source_entity_id').equals(entityId).delete()
      await db.entityConnections.where('target_entity_id').equals(entityId).delete()
    },
  },

  // ── Graph layouts (multiple named graphs per campaign) ───────────────
  graphLayout: {
    async list(campaignId: number): Promise<DbGraphLayout[]> {
      const all = await getDb().graphLayouts.where('campaign_id').equals(campaignId).toArray()
      return all.map(g => ({ ...g, name: g.name ?? 'Default' }))
    },
    async get(id: number): Promise<DbGraphLayout | undefined> {
      return getDb().graphLayouts.get(id)
    },
    async create(campaignId: number, name: string): Promise<number> {
      return getDb().graphLayouts.add({
        campaign_id: campaignId,
        name,
        positions: '{}',
        hidden_nodes: '[]',
        zoom: 1,
        pan_x: 0,
        pan_y: 0,
      } as DbGraphLayout) as Promise<number>
    },
    async save(id: number, data: Pick<DbGraphLayout, 'positions' | 'hidden_nodes' | 'player_hidden_nodes' | 'zoom' | 'pan_x' | 'pan_y'>): Promise<void> {
      await getDb().graphLayouts.update(id, data)
    },
    async rename(id: number, name: string): Promise<void> {
      await getDb().graphLayouts.update(id, { name })
    },
    async delete(id: number): Promise<void> {
      await getDb().graphLayouts.delete(id)
    },
    async searchAll(query: string, limit = 5): Promise<DbGraphLayout[]> {
      const lq = query.toLowerCase()
      const all = await getDb().graphLayouts.toArray()
      return all
        .filter(g => (g.name ?? 'Default').toLowerCase().includes(lq))
        .slice(0, limit)
        .map(g => ({ ...g, name: g.name ?? 'Default' }))
    },
  },

  isElectron: false,
}
