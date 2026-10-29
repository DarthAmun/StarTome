/**
 * `dbApi`: the repository for campaigns, encounters, tokens and lore. Party,
 * inventory, wealth and the compendium have their own repositories
 * (useParty, useInventory, useWealth, useRules); backups live in
 * sync/backup.ts and the player-window messages in utils/windowChannel.ts.
 *
 * Row types, the schema and `getDb` are in db/schema.ts and re-exported here,
 * so existing imports from this module keep working.
 */
import { getDb, now, parseJsonObject, type DbEncounterToken, type DbEncounterWall, type DbEntity, type DbEntitySnapshot, type DbEntityConnection, type DbGraphLayout, type DbToken } from '~/db/schema'
import type { CampaignRules, GameId } from '~/types/game'
import type { RulesEntity } from '~/types/rules'
import type { Adjustment } from '~/rules/combat'
import { resolveImageDataUrl, storeInlineImage } from '~/rules/images'
import { imageTypeOf } from '~/utils/image'

export * from '~/db/schema'

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
      const id = await db.encounters.add({ campaign_id: data.campaignId, name: data.name, map_source: null, map_type: 'file', grid_size: 70, grid_offset_x: 0, grid_offset_y: 0, fog_data: {}, viewport: { x: 0, y: 0, scale: 1 }, combat_log: [], created_at: ts, updated_at: ts })
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
        label: data.label ?? null, conditions: [],
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
        timers: [],
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
    /**
     * What the home page shows per campaign, without loading the entries:
     * counts per type from the index, the most recently updated few, and the
     * active quests.
     */
    async overview(campaignId: number, recentLimit = 8) {
      const db = getDb()
      const counts: Record<string, number> = {}
      await db.entities.where('[campaign_id+type]').between([campaignId, ''], [campaignId, '\uffff']).eachKey(key => {
        const type = (key as unknown as [number, string])[1]
        counts[type] = (counts[type] ?? 0) + 1
      })
      const recent = await db.entities.where('[campaign_id+updated_at]').between([campaignId, ''], [campaignId, '\uffff'])
        .reverse().limit(recentLimit).toArray()
      const quests = await db.entities.where('[campaign_id+type]').equals([campaignId, 'quest']).toArray()
      const slim = (e: DbEntity) => ({ id: e.id!, name: e.name, type: e.type, updated_at: e.updated_at })
      return {
        counts,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
        recent: recent.map(slim),
        activeQuests: quests.filter(q => parseJsonObject(q.attributes).status === 'active').map(slim),
      }
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
