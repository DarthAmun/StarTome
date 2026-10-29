/**
 * Dexie (IndexedDB) database: row types, schema history and the `dbApi`
 * repository for campaigns, encounters, tokens and lore. Party, inventory,
 * wealth and the compendium have their own repositories (useParty,
 * useInventory, useWealth, useRules); backups live in sync/backup.ts and the
 * player-window messages in utils/windowChannel.ts.
 *
 * Several columns are still JSON strings, a leftover of DM's Tome's SQLite
 * schema; read them with parseJson / parseJsonObject.
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
import { DB_NAME } from '~/utils/appNamespace'
import { imageTypeOf } from '~/utils/image'
import { parseJson } from '~/utils/json'
import type { CampaignRules, GameId } from '~/types/game'
import type { RulesEntity, Runes } from '~/types/rules'
import type { Adjustment } from '~/rules/combat'
import { dataUrlToBlob, resolveImageDataUrl, storeInlineImage } from '~/rules/images'

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
  map_source: string | null   // "img:<id>" (images table), http URL; data URLs only in old rows/files
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
  /** Wall, PF2e cover degree or door. DM's Tome's names are kept for compatibility:
   *  'three-quarter' = greater cover, 'half' = standard, 'quarter' = lesser. */
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

/** A treasure award outside an encounter (FEATURES_PLAN.md P5): an item or coins given as treasure, not a correction. */
export interface DbTreasureAward {
  id?: number
  campaign_id: number
  at: string
  value: number                    // cp, GM value at award time
  consumables: number              // cp of that value in consumables
  label: string
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
  container_id?: number | null     // a container entry of the same owner (P5 follow-up); non-indexed
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
  treasureAwards!:    Table<DbTreasureAward>

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
    // v8: treasure awards outside encounters (FEATURES_PLAN.md P5). Encounter loot
    // is valued in each encounter's resolution record.
    this.version(8).stores({
      treasureAwards:     '++id, campaign_id, at',
    })
    // v9: compound indexes for the hot per-campaign queries (FORK_PLAN §14 PERF-12):
    // the stash/purse of one campaign, entities of one type, resolved encounters.
    this.version(9).stores({
      inventory:          '++id, campaign_id, owner, item_id, [campaign_id+owner]',
      purses:             '++id, campaign_id, owner, [campaign_id+owner]',
      entities:           '++id, campaign_id, type, name, [campaign_id+type]',
      encounters:         '++id, campaign_id, created_at, [campaign_id+status], [campaign_id+name]',
    })
    // v10: encounter maps move out of the rows into `images` (PERF-03): every
    // list, search and wealth readout read all maps (several MB each) before.
    this.version(10).stores({}).upgrade(async (tx) => {
      const ids = await tx.table('encounters').filter((e: DbEncounter) => !!e.map_source?.startsWith('data:')).primaryKeys()
      for (const id of ids) {
        const row = await tx.table('encounters').get(id) as DbEncounter
        const imageId = crypto.randomUUID()
        const blob = dataUrlToBlob(row.map_source!)
        await tx.table('images').put({ id: imageId, blob, mime: blob.type, createdAt: new Date().toISOString() })
        await tx.table('encounters').update(id, { map_source: `img:${imageId}` })
      }
    })
  }
}

// Singleton
let _db: StarTomeDb | null = null
export function getDb(): StarTomeDb {
  if (!_db) {
    _db = new StarTomeDb()
    watchUpgrades(_db)
  }
  return _db
}

/**
 * A newer StarTome in another tab (PWA update) wants to upgrade the schema:
 * this tab closes its connection so the upgrade isn't blocked, and asks for a
 * reload. If this tab is the one waiting, it says which tabs are in the way.
 */
function watchUpgrades(db: StarTomeDb) {
  if (typeof window === 'undefined') return
  db.on('versionchange', () => {
    db.close()
    import('~/composables/useNotices').then(({ notify }) => notify(
      'StarTome was updated in another tab. Reload this tab to keep working; changes made here from now on are not saved.',
      'warning', { sticky: true, action: { label: 'Reload', run: () => location.reload() } }))
    return false
  })
  db.on('blocked', () => {
    import('~/composables/useNotices').then(({ notify }) => notify(
      'StarTome is waiting for other StarTome tabs or player windows to close before it can update its database.',
      'warning'))
  })
}

/** A JSON-object column (attributes, metadata …) as an object; {} when missing or corrupt. */
export function parseJsonObject(data: unknown): Record<string, any> {
  return parseJson<Record<string, any>>(data, {})
}

// ── Timestamp helper ───────────────────────────────────────────────────────
export function now() { return new Date().toISOString() }

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
    /** Deletes a campaign and everything that belongs to it, in one transaction. */
    async delete(id: number) {
      const db = getDb()
      await db.transaction('rw', [db.campaigns, db.encounters, db.encounterTokens, db.encounterWalls, db.entities, db.entityLinks,
        db.entitySnapshots, db.entityConnections, db.graphLayouts, db.characters, db.levelUps, db.xpAwards,
        db.treasureAwards, db.inventory, db.purses, db.tokens], async () => {
        const encIds = await db.encounters.where('campaign_id').equals(id).primaryKeys() as number[]
        if (encIds.length) {
          await db.encounterTokens.where('encounter_id').anyOf(encIds).delete()
          await db.encounterWalls.where('encounter_id').anyOf(encIds).delete()
        }
        await db.encounters.where('campaign_id').equals(id).delete()
        const entIds = await db.entities.where('campaign_id').equals(id).primaryKeys() as number[]
        if (entIds.length) {
          await db.entityLinks.where('source_id').anyOf(entIds).delete()
          await db.entitySnapshots.where('entity_id').anyOf(entIds).delete()
          // Library tokens are shared across campaigns: they only lose the NPC link
          const ents = new Set(entIds)
          await db.tokens.filter(t => t.linked_entity_id != null && ents.has(t.linked_entity_id)).modify({ linked_entity_id: null })
        }
        await db.entities.where('campaign_id').equals(id).delete()
        for (const table of [db.entityConnections, db.graphLayouts, db.characters, db.levelUps, db.xpAwards, db.treasureAwards, db.inventory, db.purses]) {
          await table.where('campaign_id').equals(id).delete()
        }
        await db.campaigns.delete(id)
      })
    },
    /** Copies a campaign; see sync/backup.ts. */
    async clone(id: number) {
      const { cloneCampaign } = await import('~/sync/backup')
      return cloneCampaign(id)
    },
  },

  // ── Internal helpers ─────────────────────────────────────────────────
  async _resolveTokenDisplay(et: DbEncounterToken) {
    return (await dbApi._resolveTokenDisplays([et]))[0]
  },

  /** Name and image of placements, from their library token or compendium entry. Batched: one read per table. */
  async _resolveTokenDisplays(ets: DbEncounterToken[]) {
    const db = getDb()
    const tokenIds = [...new Set(ets.map(et => et.token_id).filter((id): id is number => !!id))]
    const libTokens = new Map((await db.tokens.bulkGet(tokenIds)).filter((t): t is DbToken => !!t).map(t => [t.id!, t]))
    const directIds = [...new Set(ets.filter(et => !(et.token_id && libTokens.has(et.token_id)) && et.linked_rules_id).map(et => et.linked_rules_id!))]
    const entries = new Map((await db.rules.bulkGet(directIds)).filter((r): r is RulesEntity => !!r).map(r => [r.id, r]))
    const synced = new Map<number, { source: string; type: 'file' | 'url' } | null>()
    for (const t of libTokens.values()) {
      if (t.sync_image) synced.set(t.id!, await dbApi.linkedImages.get(t.linked_entity_id, t.linked_rules_id))
    }
    return ets.map(et => {
      const tok = et.token_id ? libTokens.get(et.token_id) : undefined
      const entry = !tok && et.linked_rules_id ? entries.get(et.linked_rules_id) : undefined
      const image = tok ? synced.get(tok.id!) : null
      return {
        name: tok?.name ?? entry?.name ?? '',
        image_source: image?.source ?? tok?.image_source ?? et.image_source ?? null,
        image_type: (image?.type ?? tok?.image_type ?? et.image_type ?? 'file') as 'file' | 'url',
      }
    })
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
        const attrs = parseJsonObject(ent?.attributes)
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
      const displays = await dbApi._resolveTokenDisplays(etRows)
      return { ...enc, tokens: etRows.map((et, i) => ({ ...et, ...displays[i] })) }
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
      // A new map arrives as a data URL; it's stored as a blob and the row keeps the ref
      if (typeof rest.map_source === 'string') rest.map_source = await storeInlineImage(rest.map_source)
      await db.encounters.update(id, { ...rest, updated_at: now() })
      return db.encounters.get(id)
    },
    /** Deletes an encounter with its tokens, walls and planned loot. */
    async delete(id: number) {
      const db = getDb()
      const owner = `encounter:${id}`
      await db.transaction('rw', [db.encounters, db.encounterTokens, db.encounterWalls, db.inventory, db.purses], async () => {
        await db.encounterTokens.where('encounter_id').equals(id).delete()
        await db.encounterWalls.where('encounter_id').equals(id).delete()
        await db.inventory.where('owner').equals(owner).delete()
        await db.purses.where('owner').equals(owner).delete()
        await db.encounters.delete(id)
      })
    },
    /** Name search over the index only: encounter rows (with their maps) aren't read. */
    async search(q: string, limit: number): Promise<{ id: number; name: string; campaign_id: number }[]> {
      const lq = q.toLowerCase()
      const hits: { id: number; name: string; campaign_id: number }[] = []
      await getDb().encounters.orderBy('[campaign_id+name]').until(() => hits.length >= limit).eachKey((key, cursor) => {
        const [campaignId, name] = key as unknown as [number, string]
        if (String(name).toLowerCase().includes(lq)) hits.push({ id: cursor.primaryKey as number, name, campaign_id: campaignId })
      })
      return hits
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
  },

  // ── Entities ──────────────────────────────────────────────────────────
  entities: {
    async list(campaignId: number) {
      const db = getDb()
      return db.entities.where('campaign_id').equals(campaignId).toArray()
        .then(rows => rows.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)))
    },
    /**
     * Entities whose name contains `query` (or, without a `type`, whose type
     * matches it). Names are matched on the index; only the hits are read.
     */
    async search(query: string, limit = 5, opts: { type?: string } = {}) {
      const db = getDb()
      const lq = query.toLowerCase()
      const ids: number[] = []
      await db.entities.orderBy('name').until(() => ids.length >= limit).eachKey((name, cursor) => {
        if (String(name).toLowerCase().includes(lq)) ids.push(cursor.primaryKey as number)
      })
      let rows = (await db.entities.bulkGet(ids)).filter((e): e is DbEntity => !!e)
      if (opts.type) {
        rows = rows.filter(e => e.type === opts.type)
        if (rows.length < limit) {
          // Too few among the first name hits: look through that type only
          const seen = new Set(rows.map(r => r.id))
          rows.push(...await db.entities.where('type').equals(opts.type).filter(e => !seen.has(e.id) && e.name.toLowerCase().includes(lq)).limit(limit - rows.length).toArray())
        }
      } else if (rows.length < limit) {
        const seen = new Set(rows.map(r => r.id))
        rows.push(...await db.entities.where('type').startsWithIgnoreCase(lq).filter(e => !seen.has(e.id)).limit(limit - rows.length).toArray())
      }
      return rows.slice(0, limit)
    },
    /** Entities with a tag containing `tag`; stops reading at `limit` hits. */
    async searchByTag(tag: string, limit = 20) {
      const lq = tag.toLowerCase()
      return getDb().entities
        .filter(e => e.attributes.includes('"tags"')
          && (parseJsonObject(e.attributes).tags ?? []).some((t: string) => String(t).toLowerCase().includes(lq)))
        .limit(limit).toArray()
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
    /**
     * Deletes an entity with its links, snapshots and graph edges, and clears
     * every reference to it: party member, tokens, placements, snapshot events
     * and map pins on other entries.
     */
    async delete(id: number) {
      const db = getDb()
      await db.transaction('rw', [db.entities, db.entityLinks, db.entitySnapshots, db.entityConnections, db.characters,
        db.tokens, db.encounterTokens], async () => {
        const row = await db.entities.get(id)
        await db.entityLinks.where('source_id').equals(id).delete()
        await db.entitySnapshots.where('entity_id').equals(id).delete()
        await db.entitySnapshots.where('event_id').equals(id).modify({ event_id: null, event_name: null })
        await db.entityConnections.where('source_entity_id').equals(id).delete()
        await db.entityConnections.where('target_entity_id').equals(id).delete()
        await db.characters.where('npc_entity_id').equals(id).modify({ npc_entity_id: null })
        await db.tokens.filter(t => t.linked_entity_id === id).modify({ linked_entity_id: null })
        await db.encounterTokens.filter(t => t.linked_entity_id === id).modify({ linked_entity_id: null })
        if (row) {
          await db.entities.where('campaign_id').equals(row.campaign_id)
            .filter(e => e.attributes.includes(`"entityId":${id}`))
            .modify((e: DbEntity) => {
              const attrs = parseJsonObject(e.attributes)
              attrs.mapPins = (attrs.mapPins ?? []).filter((p: { entityId: number }) => p.entityId !== id)
              e.attributes = JSON.stringify(attrs)
            })
        }
        await db.entities.delete(id)
      })
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

  // ── Snapshots ─────────────────────────────────────────────────────
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

}
