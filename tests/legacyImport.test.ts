import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { monsterTokenIds, remapLore } from '~/converters/legacy/lore'
import { applyLegacy, readLegacyFile, summarizeLegacy, type LegacyBundle } from '~/sync/legacyImport'

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/** A miniature DM's Tome "Everything" export, rules library included (it must be ignored). */
function exportFile(): Record<string, unknown> {
  return {
    version: 1, type: 'all', exportedAt: '2026-10-28T12:00:00.000Z',
    campaigns: [{ id: 2, name: 'The Codex', description: 'See {{spell: Burning Hands}}', created_at: '2026-03-14', updated_at: '2026-05-03', system_id: 1 }],
    entities: [
      { id: 10, campaign_id: 2, type: 'npc', name: 'Tibbin', content: 'Fears {{creature: Minotaur}}', attributes: JSON.stringify({ isPlayerCharacter: true, portraitSource: PIXEL, portraitType: 'file' }), created_at: '', updated_at: '' },
      { id: 11, campaign_id: 2, type: 'location', name: 'Valoria', content: '', attributes: JSON.stringify({ imageSource: PIXEL, mapPins: [{ entityId: 10, x: 0.1, y: 0.2 }, { entityId: 999, x: 0, y: 0 }] }), created_at: '', updated_at: '' },
      { id: 12, campaign_id: 2, type: 'region', name: 'North', content: '', attributes: JSON.stringify({ locationEntityId: 11, polygon: [], color: '#fff' }), created_at: '', updated_at: '' },
      { id: 13, campaign_id: 2, type: 'quest', name: 'Find it', content: '', attributes: JSON.stringify({ questGiverId: 10, questGiver: 'Tibbin' }), created_at: '', updated_at: '' },
      { id: 14, campaign_id: 2, type: 'faction', name: 'Guild', content: '', attributes: JSON.stringify({ logoSource: PIXEL }), created_at: '', updated_at: '' },
      { id: 50, campaign_id: 99, type: 'note', name: 'Orphan', content: '', attributes: '{}', created_at: '', updated_at: '' },
    ],
    entityLinks: [{ id: 1, source_id: 10, target_type: 'location', target_name: 'Valoria', metadata: '{}' }],
    entitySnapshots: [{ id: 1, entity_id: 10, label: 'Before', note: '', content: 'old', attributes: '{"level":"3"}', name: 'Tibbin', created_at: '', event_id: 13, event_name: 'x' }],
    entityConnections: [{ id: 1, campaign_id: 2, source_entity_id: 10, target_entity_id: 11, label: '', direction: 'one-way', color: null }],
    graphLayouts: [{ id: 1, campaign_id: 2, name: 'Guilds', positions: '{"10":{"x":1,"y":2},"11":{"x":3,"y":4}}', hidden_nodes: '[11]', player_hidden_nodes: '[]', zoom: 1, pan_x: 0, pan_y: 0 }],
    tokens: [
      // An NPC's token that also pointed at a library record: kept, the record link goes
      { id: 46, name: 'Tibbin', image_source: PIXEL, image_type: 'file', is_template: 1, is_player_character: 1, linked_record_id: 104, linked_entity_id: 10, created_at: '' },
      // A monster token: left out
      { id: 47, name: 'Minotaur', image_source: PIXEL, image_type: 'file', is_template: 1, is_player_character: 0, linked_record_id: 100, linked_entity_id: null, created_at: '' },
    ],
    encounters: [{
      id: 1, campaign_id: 2, name: 'Maze', map_source: PIXEL, map_type: 'file', grid_size: 50, grid_offset_x: 0, grid_offset_y: 0, fog_data: '{"1,1":"revealed"}', viewport: '{}',
      combat_log: JSON.stringify([{ id: 1, tokenId: 9, type: 'damage' }]), sound_playlist_id: 4, created_at: '', updated_at: '',
    }],
    encounterTokens: [
      { id: 8, encounter_id: 1, token_id: 46, grid_x: 0, grid_y: 1, size: 1, is_visible: 1, is_dead: 0, label: null, conditions: '[]', hp_current: null, hp_max: null, ac: null, initiative: 9, notes: null, linked_record_id: 104, linked_entity_id: 10, vision_range: null, is_player_token: 1, image_source: null, image_type: 'file', elevation: null },
      { id: 9, encounter_id: 1, token_id: 47, grid_x: 1, grid_y: 1, size: 2, is_visible: 1, is_dead: 0, label: null, conditions: '[{"name":"Frightened","value":1}]', hp_current: 30, hp_max: 45, ac: 20, initiative: 4, notes: null, linked_record_id: 100, vision_range: null, is_player_token: 0, image_source: null, image_type: 'file', elevation: null },
      // Placed straight from DM's Tome's library: no token, name and picture came from the record
      { id: 7, encounter_id: 1, token_id: null, grid_x: 3, grid_y: 1, size: 1, is_visible: 1, is_dead: 0, label: null, conditions: '[]', hp_current: null, hp_max: null, ac: null, initiative: 1, notes: null, linked_record_id: 101, vision_range: null, is_player_token: 0, image_source: null, image_type: 'file', elevation: null },
    ],
    encounterWalls: [{ id: 3, encounter_id: 1, points: '[{"x":0,"y":0},{"x":2,"y":0}]', coverType: 'half', isOpen: false }],
    systems: [{ id: 1, name: 'Pathfinder 2e', shortId: 'pf2e', description: '', version: '1', entityTypes: '[]', createdAt: '', updatedAt: '' }],
    records: [
      { id: 100, systemId: 1, entityTypeId: 'creature', name: 'Minotaur', data: '{}', createdAt: '', updatedAt: '' },
      { id: 101, systemId: 1, entityTypeId: 'creature', name: 'Vampire Spawn', data: JSON.stringify({ portrait: PIXEL }), createdAt: '', updatedAt: '' },
    ],
  }
}

async function bundle(): Promise<LegacyBundle> {
  return readLegacyFile(new Blob([JSON.stringify(exportFile())]))
}

describe('DM\'s Tome campaign remapping', () => {
  it('remaps every id, including those inside JSON, and turns JSON text into values', async () => {
    const b = await bundle()
    const start = { campaigns: 5, entities: 100, entityLinks: 1, entitySnapshots: 1, entityConnections: 1, graphLayouts: 1, tokens: 1, encounters: 1, encounterTokens: 20, encounterWalls: 1 }
    const { tables, issues, monsterTokens } = remapLore(b, start)
    expect(tables.campaigns[0]).toMatchObject({ id: 5, game: 'pf2e', description: 'See {{spell: Burning Hands}}' })
    expect(tables.campaigns[0]).not.toHaveProperty('system_id')
    expect(tables.entities.map(e => [e.id, e.campaign_id])).toEqual([[100, 5], [101, 5], [102, 5], [103, 5], [104, 5]])
    expect(tables.entities[1].attributes).toMatchObject({ mapPins: [{ entityId: 100, x: 0.1, y: 0.2 }] })
    expect(tables.entities[2].attributes).toMatchObject({ locationEntityId: 101 })
    expect(tables.entities[3].attributes).toMatchObject({ questGiverId: 100 })
    expect(tables.entityLinks[0]).toMatchObject({ source_id: 100, metadata: {} })
    expect(tables.entitySnapshots[0]).toMatchObject({ entity_id: 100, event_id: 103, attributes: { level: '3' } })
    expect(tables.entityConnections[0]).toMatchObject({ campaign_id: 5, source_entity_id: 100, target_entity_id: 101 })
    expect(tables.graphLayouts[0]).toMatchObject({ positions: { 100: { x: 1, y: 2 }, 101: { x: 3, y: 4 } }, hidden_nodes: [101] })
    expect(tables.encounters[0]).toMatchObject({ campaign_id: 5, sound_playlist_id: null, fog_data: { '1,1': 'revealed' } })
    expect((tables.encounters[0].combat_log as { tokenId: number }[])[0].tokenId).toBe(21)
    // Placed straight from the library: the record's name and portrait, not the record
    expect(tables.encounterTokens[2]).toMatchObject({ token_id: null, label: 'Vampire Spawn', image_source: PIXEL, linked_rules_id: null })
    expect(tables.encounterWalls[0]).toMatchObject({ encounter_id: 1, points: [{ x: 0, y: 0 }, { x: 2, y: 0 }] })
    expect(monsterTokens).toBe(1)
    expect(issues.map(i => `${i.table}:${i.id}`)).toEqual(['entities:50', 'entities:11', 'tokens:-1'])
  })

  it('keeps NPC and PC tokens without their library link and leaves monster tokens out', async () => {
    const b = await bundle()
    expect([...monsterTokenIds(b.tokens)]).toEqual([47])
    const start = { campaigns: 1, entities: 1, entityLinks: 1, entitySnapshots: 1, entityConnections: 1, graphLayouts: 1, tokens: 1, encounters: 1, encounterTokens: 1, encounterWalls: 1 }
    const { tables } = remapLore(b, start)
    expect(tables.tokens).toHaveLength(1)
    expect(tables.tokens[0]).toMatchObject({ id: 1, name: 'Tibbin', linked_rules_id: null, linked_entity_id: 1, is_player_character: 1 })
    expect(tables.tokens[0]).not.toHaveProperty('linked_record_id')
    // The monster's placement stays, standing on its own name and image
    const [pc, monster] = tables.encounterTokens
    expect(pc).toMatchObject({ token_id: 1, linked_rules_id: null, linked_entity_id: 1 })
    expect(monster).toMatchObject({ token_id: null, label: 'Minotaur', image_source: PIXEL, linked_rules_id: null, hp_current: 30, size: 2 })
    expect(monster.conditions).toEqual([{ name: 'Frightened', value: 1 }])
    expect(monster).not.toHaveProperty('linked_record_id')
  })
})

describe('DM\'s Tome import', () => {
  beforeEach(async () => {
    const db = getDb()
    await Promise.all(['campaigns', 'entities', 'entityLinks', 'entitySnapshots', 'entityConnections', 'graphLayouts', 'tokens', 'encounters', 'encounterTokens', 'encounterWalls', 'rules', 'images']
      .map(t => db.table(t).clear()))
  })

  it('summarizes the campaigns and what is left out', async () => {
    const s = await summarizeLegacy(await bundle())
    expect(s.campaigns).toEqual([{ id: 2, name: 'The Codex', entries: 5, encounters: 1 }])
    expect(s.monsterTokens).toBe(1)
    expect(s.alreadyImported).toEqual([])
  })

  it('imports campaign data with portraits and images, never the rules library', async () => {
    const db = getDb()
    const report = await applyLegacy(await bundle())
    expect(report.written).toMatchObject({ campaigns: 1, entities: 5, tokens: 1, encounters: 1, encounterTokens: 3 })
    expect(report.monsterTokens).toBe(1)
    expect(await db.rules.count()).toBe(0)
    expect(db.tables.map(t => t.name)).not.toContain('records')

    const ents = await db.entities.toArray()
    const byName = (n: string) => ents.find(e => e.name === n)!.attributes as Record<string, any>
    expect(byName('Tibbin').portraitSource).toBe(PIXEL)
    expect(byName('Guild').logoSource).toBe(PIXEL)
    expect(byName('Valoria').imageSource).toBe(PIXEL)

    const enc = (await db.encounters.toArray())[0]
    expect(enc.map_source).toMatch(/^img:/)
    expect((await db.encounterWalls.toArray())[0].coverType).toBe('standard')
    expect((await summarizeLegacy(await bundle())).alreadyImported).toEqual(['The Codex'])
  })
})
