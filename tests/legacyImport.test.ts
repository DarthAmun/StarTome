import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { remapLore, rewriteRulesRefs } from '~/converters/legacy/lore'
import { normalizeName } from '~/converters/legacy/match'
import { newRulesEntity } from '~/rules/factory'
import { analyseLegacy, applyLegacy, readLegacyFile, type LegacyBundle } from '~/sync/legacyImport'
import type { RulesEntity } from '~/types/rules'

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function foundry(id: string, kind: RulesEntity['kind'], name: string, extra: Partial<RulesEntity> = {}): RulesEntity {
  return { ...newRulesEntity(kind, { name, game: 'pf2e' }), id, origin: 'foundry', upstream: { pack: 'x', version: '1', hash: '' }, ...extra } as RulesEntity
}

const rec = (id: number, entityTypeId: string, name: string, data: Record<string, unknown>) =>
  ({ id, systemId: 1, entityTypeId, name, data: JSON.stringify(data), createdAt: '2026-01-01', updatedAt: '2026-01-01' })

/** A miniature DM's Tome "Everything" export. */
function exportFile(): Record<string, unknown> {
  return {
    version: 1, type: 'all', exportedAt: '2026-10-28T12:00:00.000Z',
    campaigns: [{ id: 2, name: 'The Codex', description: 'See {{spell: Burning Hands}}', created_at: '2026-03-14', updated_at: '2026-05-03', system_id: 1 }],
    entities: [
      { id: 10, campaign_id: 2, type: 'npc', name: 'Tibbin', content: 'Carries {{item: Sturmperle}} and fears {{creature: Minotaur}}', attributes: '{"isPlayerCharacter":true}', created_at: '', updated_at: '' },
      { id: 11, campaign_id: 2, type: 'location', name: 'Valoria', content: '', attributes: JSON.stringify({ mapPins: [{ entityId: 10, x: 0.1, y: 0.2 }, { entityId: 999, x: 0, y: 0 }] }), created_at: '', updated_at: '' },
      { id: 12, campaign_id: 2, type: 'region', name: 'North', content: '', attributes: JSON.stringify({ locationEntityId: 11, polygon: [], color: '#fff' }), created_at: '', updated_at: '' },
      { id: 13, campaign_id: 2, type: 'quest', name: 'Find it', content: '', attributes: JSON.stringify({ questGiverId: 10, questGiver: 'Tibbin' }), created_at: '', updated_at: '' },
      { id: 50, campaign_id: 99, type: 'note', name: 'Orphan', content: '', attributes: '{}', created_at: '', updated_at: '' },
    ],
    entityLinks: [{ id: 1, source_id: 10, target_type: 'location', target_name: 'Valoria', metadata: '{}' }],
    entitySnapshots: [{ id: 1, entity_id: 10, label: 'Before', note: '', content: 'old', attributes: '{}', name: 'Tibbin', created_at: '', event_id: 13, event_name: 'x' }],
    entityConnections: [{ id: 1, campaign_id: 2, source_entity_id: 10, target_entity_id: 11, label: '', direction: 'one-way', color: null }],
    graphLayouts: [{ id: 1, campaign_id: 2, name: 'Guilds', positions: '{"10":{"x":1,"y":2},"11":{"x":3,"y":4}}', hidden_nodes: '[11]', player_hidden_nodes: '[]', zoom: 1, pan_x: 0, pan_y: 0 }],
    tokens: [{ id: 47, name: 'Minotaur', image_source: null, image_type: 'file', is_template: 1, is_player_character: 0, linked_record_id: 100, linked_entity_id: 10, created_at: '' }],
    encounters: [{
      id: 1, campaign_id: 2, name: 'Maze', map_source: null, map_type: 'file', grid_size: 50, grid_offset_x: 0, grid_offset_y: 0, fog_data: '{}', viewport: '{}',
      combat_log: JSON.stringify([{ id: 1, tokenId: 9, type: 'damage' }]), sound_playlist_id: 4, created_at: '', updated_at: '',
    }],
    encounterTokens: [
      { id: 9, encounter_id: 1, token_id: 47, grid_x: 1, grid_y: 1, size: 1, is_visible: 1, is_dead: 0, label: null, conditions: '[]', hp_current: null, hp_max: null, ac: null, initiative: 4, notes: null, linked_record_id: 100, vision_range: null, is_player_token: 0, image_source: null, image_type: 'file', elevation: null },
      { id: 10, encounter_id: 1, token_id: null, grid_x: 2, grid_y: 1, size: 1, is_visible: 1, is_dead: 0, label: null, conditions: '[]', hp_current: null, hp_max: null, ac: null, initiative: 2, notes: null, linked_record_id: 555, vision_range: null, is_player_token: 0, image_source: null, image_type: 'file', elevation: null },
    ],
    encounterWalls: [{ id: 3, encounter_id: 1, points: '[]', coverType: 'full', isOpen: false }],
    systems: [{ id: 1, name: 'Pathfinder 2e', shortId: 'pf2e', description: '', version: '1', entityTypes: '[]', createdAt: '', updatedAt: '' }],
    records: [
      rec(100, 'creature', 'Minotaur', { level: 4, source: 'Bestiary p.237', portrait: PIXEL }),
      rec(101, 'spell', 'Burning Hands', { spellLevel: '1', source: 'Core Rulebook p.322' }),
      rec(102, 'item', 'Sturmperle', { itemType: 'Worn Item', level: 5, source: 'Selfmade', carried: 'Me', image: PIXEL }),
      rec(103, 'creature', 'Adult Black Dragon', { level: 11, source: 'Bestiary p.104' }),
      rec(104, 'character', 'Tibbin', {}),
    ],
  }
}

async function bundle(): Promise<LegacyBundle> {
  return readLegacyFile(new Blob([JSON.stringify(exportFile())]))
}

describe('legacy lore remapping', () => {
  it('rewrites refs to renamed compendium entries only', () => {
    const renames = new Map([['spell:burning hands', 'Breathe Fire']])
    expect(rewriteRulesRefs('{{spell: Burning Hands}} and {{npc: Burning Hands}} and {{item: Rope}}', renames, normalizeName))
      .toBe('{{spell: Breathe Fire}} and {{npc: Burning Hands}} and {{item: Rope}}')
  })

  it('remaps every id, including those inside JSON', async () => {
    const b = await bundle()
    const start = { campaigns: 5, entities: 100, entityLinks: 1, entitySnapshots: 1, entityConnections: 1, graphLayouts: 1, tokens: 1, encounters: 1, encounterTokens: 20, encounterWalls: 1 }
    const { tables, issues } = remapLore(b, start, { rulesLinks: new Map([[100, 'fvtt:mino']]) }, normalizeName)
    expect(tables.campaigns[0]).toMatchObject({ id: 5, game: 'pf2e' })
    expect(tables.campaigns[0]).not.toHaveProperty('system_id')
    expect(tables.entities.map(e => [e.id, e.campaign_id])).toEqual([[100, 5], [101, 5], [102, 5], [103, 5]])
    expect(JSON.parse(tables.entities[1].attributes).mapPins).toEqual([{ entityId: 100, x: 0.1, y: 0.2 }])
    expect(JSON.parse(tables.entities[2].attributes).locationEntityId).toBe(101)
    expect(JSON.parse(tables.entities[3].attributes).questGiverId).toBe(100)
    expect(tables.entityLinks[0].source_id).toBe(100)
    expect(tables.entitySnapshots[0]).toMatchObject({ entity_id: 100, event_id: 103 })
    expect(tables.entityConnections[0]).toMatchObject({ campaign_id: 5, source_entity_id: 100, target_entity_id: 101 })
    expect(JSON.parse(tables.graphLayouts[0].positions)).toEqual({ 100: { x: 1, y: 2 }, 101: { x: 3, y: 4 } })
    expect(tables.graphLayouts[0].hidden_nodes).toBe('[101]')
    expect(tables.tokens[0]).toMatchObject({ id: 1, linked_rules_id: 'fvtt:mino', linked_entity_id: 100 })
    expect(tables.tokens[0]).not.toHaveProperty('linked_record_id')
    expect(tables.encounterTokens.map(t => [t.id, t.token_id, t.linked_rules_id])).toEqual([[20, 1, 'fvtt:mino'], [21, null, null]])
    expect(tables.encounters[0]).toMatchObject({ campaign_id: 5, sound_playlist_id: null })
    // The converter keeps DM's Tome's JSON text; the import turns it into a value afterwards
    expect(JSON.parse(tables.encounters[0].combat_log as string)[0].tokenId).toBe(20)
    expect(tables.encounterWalls[0].encounter_id).toBe(1)
    expect(issues.map(i => `${i.table}:${i.id}`)).toEqual(['entities:50', 'entities:11', 'encounterTokens:10'])
  })
})

describe('legacy import', () => {
  beforeEach(async () => {
    const db = getDb()
    await Promise.all([db.rules.clear(), db.images.clear(), db.campaigns.clear(), db.entities.clear(), db.tokens.clear(), db.encounterTokens.clear()])
    await db.rules.bulkAdd([
      foundry('fvtt:mc', 'creature', 'Minotaur', { level: 4, publication: { title: 'Pathfinder Monster Core', remaster: true } }),
      foundry('fvtt:b1', 'creature', 'Minotaur', { level: 4, publication: { title: 'Pathfinder Bestiary', remaster: false }, supersededBy: 'fvtt:mc' }),
      foundry('fvtt:bf', 'spell', 'Breathe Fire', { level: 1 }),
    ])
    // A campaign already in StarTome: imported ids must not collide with it
    await db.campaigns.add({ name: 'Seed', description: '', created_at: '', updated_at: '' })
  })

  it('analyses: exact links, fuzzy renames, homebrew kept, unused leftovers dropped', async () => {
    const { analysis } = await analyseLegacy(await bundle())
    expect(analysis.compendiumSize).toBe(3)
    expect(analysis.kinds.creature).toEqual({ total: 2, exact: 1, fuzzy: 0, unmatched: 1 })
    expect(analysis.images).toEqual({ total: 2, exact: 1, fuzzy: 0 })
    expect(analysis.placements).toEqual({ linked: 1, broken: 1, exact: 1, fuzzy: 0 })
    expect(analysis.review.map(r => [r.name, r.status, r.decision])).toEqual([
      ['Burning Hands', 'fuzzy', { action: 'link', rulesId: 'fvtt:bf' }],
      ['Adult Black Dragon', 'unmatched', { action: 'drop' }],
      ['Sturmperle', 'unmatched', { action: 'keep' }],
    ])
    expect(analysis.review[2].usage).toMatchObject({ image: true, refs: 1, carried: 'Me', homebrew: true })
  })

  it('applies: portraits on both twins, homebrew entries, lore with fresh ids and compendium links', async () => {
    const b = await bundle()
    const analysed = await analyseLegacy(b)
    const report = await applyLegacy(b, analysed, { lore: true, decisions: { 103: { action: 'keep' } } })
    const db = getDb()

    expect(report).toMatchObject({ linked: 2, kept: 2, dropped: 0, imagesAttached: 2, entriesWithImages: 3 })
    const [mc, b1] = await db.rules.bulkGet(['fvtt:mc', 'fvtt:b1'])
    expect(mc!.img).toMatch(/^img:/)
    expect(b1!.img).toBe(mc!.img)
    expect(await db.images.count()).toBe(2)

    const perle = await db.rules.where('[kind+sortName]').equals(['item', 'sturmperle']).first()
    expect(perle).toMatchObject({ origin: 'legacy', level: 5, legacy: { recordId: 102, carried: 'Me' } })
    expect(perle!.img).toMatch(/^img:/)
    expect(await db.rules.where('[kind+sortName]').equals(['creature', 'adult black dragon']).count()).toBe(1)

    const campaigns = await db.campaigns.toArray()
    expect(campaigns.map(c => c.name)).toEqual(['Seed', 'The Codex'])
    const codex = campaigns[1]
    expect(codex.description).toBe('See {{spell: Breathe Fire}}')
    expect(codex).not.toHaveProperty('system_id')

    const placements = await db.encounterTokens.toArray()
    expect(placements[0].linked_rules_id).toBe('fvtt:b1')   // the Bestiary printing the record came from
    expect(placements[0]).not.toHaveProperty('linked_record_id')
    expect(placements[1]).toMatchObject({ linked_rules_id: null })
    expect(report.placements).toEqual({ linkedToCompendium: 1, linkedToFoundry: 1, cleared: 1 })
    expect(report.written).toMatchObject({ campaigns: 1, entities: 4 })

    // A second analysis notices the campaign is already here
    expect((await analyseLegacy(await bundle())).analysis.alreadyImported).toEqual(['The Codex'])
  })

  it('reuses homebrew entries from an earlier import instead of duplicating them', async () => {
    const b = await bundle()
    await applyLegacy(b, await analyseLegacy(b), { lore: false })
    const again = await bundle()
    const report = await applyLegacy(again, await analyseLegacy(again), { lore: false })
    expect(report.kept).toBe(1)
    expect(await getDb().rules.where('origin').equals('legacy').count()).toBe(1)
  })
})
