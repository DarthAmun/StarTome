import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { DB_NAME } from '~/utils/appNamespace'

/** The store list StarTome had at v3 (phase 5), before the old library was dropped. */
const V3_STORES = {
  campaigns: '++id, updated_at, system_id',
  encounters: '++id, campaign_id, created_at',
  tokens: '++id, is_template, name, linked_record_id, linked_rules_id',
  encounterTokens: '++id, encounter_id, token_id, linked_record_id, linked_rules_id',
  entities: '++id, campaign_id, type, name',
  entityLinks: '++id, source_id, target_type, target_name',
  systems: '++id, shortId, updatedAt',
  records: '++id, systemId, entityTypeId, name, updatedAt',
  encounterWalls: '++id, encounter_id',
  entitySnapshots: '++id, entity_id, event_id, created_at',
  entityConnections: '++id, campaign_id, source_entity_id, target_entity_id',
  graphLayouts: '++id, campaign_id, name',
  soundTracks: '++id, name, type',
  soundPlaylists: '++id, name',
  rules: 'id, kind, game, sortName, level, rarity, *traits, origin, [kind+sortName], [kind+level+sortName], updatedAt',
  images: 'id',
  syncState: 'game',
}

describe('v4 upgrade', () => {
  it('drops the old library with its record links and system ids', async () => {
    const old = new Dexie(DB_NAME)
    old.version(3).stores(V3_STORES)
    await old.open()
    await old.table('systems').add({ name: 'Pathfinder 2e', shortId: 'pf2e', entityTypes: '[]' })
    await old.table('records').bulkAdd([{ systemId: 1, entityTypeId: 'creature', name: 'Goblin', data: '{}' }, { systemId: 1, entityTypeId: 'item', name: 'Rope', data: '{}' }])
    await old.table('campaigns').add({ name: 'The Codex', description: '', system_id: 1, created_at: '', updated_at: '' })
    await old.table('tokens').add({ name: 'Goblin', linked_record_id: 1, linked_rules_id: 'fvtt:g', is_template: 1 })
    old.close()

    const db = getDb()
    await db.open()
    expect(db.verno).toBe(14)
    // DM's Tome system data isn't kept (v14 also drops the old backup table)
    expect(db.tables.map(t => t.name)).not.toContain('records')
    expect(db.tables.map(t => t.name)).not.toContain('systems')
    expect(db.tables.map(t => t.name)).not.toContain('legacyLibrary')
    expect(await db.campaigns.toArray()).toEqual([expect.not.objectContaining({ system_id: 1 })])
    const [token] = await db.tokens.toArray()
    expect(token).not.toHaveProperty('linked_record_id')
    expect(token.linked_rules_id).toBe('fvtt:g')
  })
})
