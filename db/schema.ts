/**
 * The StarTome database: row types, the Dexie schema with its upgrade history,
 * and the connection (`getDb`). Repositories (dbApi in composables/useDb.ts,
 * useParty, useInventory, useWealth, useRules, sync/backup.ts) build on it.
 *
 * Structured columns hold values (Dexie v12/v13). Their types still allow
 * JSON text: DM's Tome files and older rows bring text until they're
 * converted, so read them with parseJson / parseJsonObject.
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
import { parseJson } from '~/utils/json'
import type { CampaignRules, GameId } from '~/types/game'
import type { RulesEntity, Runes } from '~/types/rules'
import type { Adjustment } from '~/rules/combat'
import { dataUrlToBlob } from '~/rules/images'

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
  // Values since v12 (written on nearly every combat action); JSON text in files
  // and older rows, so read them with parseJson
  fog_data: Record<string, string> | string
  viewport: { x: number; y: number; scale: number } | string
  combat_log: unknown[] | string   // CombatLogEntry[]
  status?: string             // 'prepared' | 'active'
  current_turn_index?: number
  round_number?: number
  fov_enabled?: boolean
  sound_playlist_id?: number | null
  initiative_formula?: string | null
  party_level?: number | null // overrides the party tab's level for this encounter's meter
  // Resolution (FEATURES_PLAN.md P4); status 'resolved'. Non-indexed, no version bump.
  defeated?: unknown[] | string  // DefeatedEnemy[]: enemies removed in Run mode, XP kept
  resolved_at?: string | null
  xp_total?: number | null     // XP of the enemies counted, against party_level_at_resolve
  xp_awarded?: number | null   // per participant, as for four PCs, incl. accomplishment XP
  party_level_at_resolve?: number | null
  resolution?: Record<string, unknown> | string | null   // ResolutionRecord, for the undo
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
  conditions: unknown[] | string  // TokenCondition[]; a value since v12, see DbEncounter.fog_data
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
  timers?: unknown[] | string // TokenTimer[]; a value since v12 — non-indexed
  acts_while_hidden?: number  // 0 | 1 — hidden token still takes its turn
  is_ally?: number            // 0 | 1 — fights with the party; left out of the XP meter
}

export interface DbEncounterWall {
  id?: number
  encounter_id: number
  points: { x: number; y: number }[] | string
  /** Wall ('full'), PF2e cover degree or door. DM's Tome's 5e names (three-quarter,
   *  half, quarter) become greater, standard, lesser on upgrade and import. */
  coverType: 'full' | 'greater' | 'standard' | 'lesser' | 'door'
  isOpen: boolean
}

export interface DbEntity {
  id?: number
  campaign_id: number
  type: string
  name: string
  content: string
  attributes: Record<string, any> | string   // EntityAttributes
  is_favorite?: number        // 0 | 1 — starred in the entity overview
  created_at: string
  updated_at: string
}

export interface DbEntityLink {
  id?: number
  source_id: number
  target_type: string
  target_name: string
  metadata: Record<string, string> | string
}

export interface DbEntitySnapshot {
  id?: number
  entity_id: number        // FK to entities table
  label: string            // GM-typed label: "Before Ascension", "Session 12"
  note: string             // optional short note about why this snapshot was taken
  content: string          // full markdown content at time of snapshot
  attributes: Record<string, any> | string   // all attributes at the time of the snapshot
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
  changes: unknown[] | string      // LevelChange[]
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
  character_ids: number[] | string
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
  positions: Record<string, { x: number; y: number }> | string   // by entity id
  hidden_nodes: number[] | string        // legacy, no longer used for GM
  player_hidden_nodes?: number[] | string // hidden from the player view
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
  tags?: string[] | string
  createdAt: string
  updatedAt: string
}

export interface DbSoundPlaylist {
  id?: number
  name: string
  description?: string
  color?: string        // theme color hex
  trackIds: number[] | string
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
    // v11: the home page's per-campaign overview (counts, recent activity) reads
    // index keys and a handful of rows instead of every entry with its portrait
    this.version(11).stores({
      entities:           '++id, campaign_id, type, name, [campaign_id+type], [campaign_id+updated_at]',
    })
    // v12: the combat state columns hold values instead of JSON text (ARCH-03)
    this.version(12).stores({}).upgrade(async (tx) => {
      for (const t of ['encounters', 'encounterTokens']) {
        await tx.table(t).toCollection().modify((r: Record<string, unknown>) => { Object.assign(r, rowValues(t, r)) })
      }
    })
    // v13: every other structured column holds values too. Files no longer have
    // to be readable by DM's Tome (only its campaigns come in, converted on import)
    this.version(13).stores({}).upgrade(async (tx) => {
      for (const t of Object.keys(VALUE_COLUMNS)) {
        await tx.table(t).toCollection().modify((r: Record<string, unknown>) => { Object.assign(r, rowValues(t, r)) })
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

/**
 * Columns that hold structured values (FORK_PLAN §14 ARCH-03): the combat
 * state since v12, everything else since v13, with the value an empty or
 * corrupt one becomes. DM's Tome files and older StarTome rows still carry
 * JSON text; `rowValues` converts a row, `structureColumns` a whole database.
 */
export const VALUE_COLUMNS: Record<string, Record<string, unknown>> = {
  encounters: { fog_data: {}, viewport: { x: 0, y: 0, scale: 1 }, combat_log: [], defeated: [], resolution: null },
  encounterTokens: { conditions: [], timers: [] },
  encounterWalls: { points: [] },
  entities: { attributes: {} },
  entitySnapshots: { attributes: {} },
  entityLinks: { metadata: {} },
  graphLayouts: { positions: {}, hidden_nodes: [], player_hidden_nodes: [] },
  levelUps: { changes: [] },
  xpAwards: { character_ids: [] },
  soundTracks: { tags: [] },
  soundPlaylists: { trackIds: [] },
}

/** The row with every structured column of `table` as a value (only the columns it has). */
/** DM's Tome's 5e wall cover names → PF2e cover degrees. */
const COVER_FROM_5E: Record<string, string> = { 'three-quarter': 'greater', half: 'standard', quarter: 'lesser' }

export function rowValues<T extends object>(table: string, row: T): T {
  const cols = VALUE_COLUMNS[table]
  if (!cols) return row
  const out = { ...row } as Record<string, unknown>
  if (table === 'encounterWalls' && typeof out.coverType === 'string' && COVER_FROM_5E[out.coverType]) out.coverType = COVER_FROM_5E[out.coverType]
  for (const [col, fallback] of Object.entries(cols)) {
    if (col in out && typeof out[col] === 'string') out[col] = parseJson(out[col], structuredClone(fallback))
  }
  return out as unknown as T
}

/** Turns JSON text left in structured columns into values, e.g. after the DM's Tome import. */
export async function structureColumns(): Promise<void> {
  const db = getDb()
  for (const [table, cols] of Object.entries(VALUE_COLUMNS)) {
    const names = Object.keys(cols)
    await db.table(table).filter((r: Record<string, unknown>) => names.some(c => typeof r[c] === 'string')
      || (table === 'encounterWalls' && typeof r.coverType === 'string' && r.coverType in COVER_FROM_5E))
      .modify((r: Record<string, unknown>) => { Object.assign(r, rowValues(table, r)) })
  }
}

/** A JSON-object column (attributes, metadata …) as an object; {} when missing or corrupt. */
export function parseJsonObject(data: unknown): Record<string, any> {
  return parseJson<Record<string, any>>(data, {})
}

// ── Timestamp helper ───────────────────────────────────────────────────────
export function now() { return new Date().toISOString() }
