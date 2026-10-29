import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'

describe('StarTome database', () => {
  it('opens its own database with the full store list', async () => {
    const db = getDb()
    await db.open()
    expect(db.name).toBe('startome')
    expect(db.verno).toBe(10)
    expect(db.tables.map(t => t.name).sort()).toEqual([
      'campaigns', 'characters', 'encounterTokens', 'encounterWalls', 'encounters', 'entities', 'entityConnections',
      'entityLinks', 'entitySnapshots', 'graphLayouts', 'images', 'inventory', 'legacyLibrary', 'levelUps', 'purses', 'rules', 'soundPlaylists',
      'soundTracks', 'syncState', 'tokens', 'treasureAwards', 'xpAwards',
    ])
  })

  it('round-trips a campaign', async () => {
    const db = getDb()
    const id = await db.campaigns.add({ name: 'Test', description: '', created_at: 'x', updated_at: 'x' })
    expect((await db.campaigns.get(id))?.name).toBe('Test')
  })

  it('indexes compendium links on tokens and placements', async () => {
    const db = getDb()
    await db.encounterTokens.add({ encounter_id: 1, token_id: null, grid_x: 0, grid_y: 0, size: 1, is_visible: 1, is_dead: 0, label: null, conditions: '[]', hp_current: 6, hp_max: 6, ac: 16, initiative: null, notes: null, linked_rules_id: 'fvtt:pf2e:bestiary:x', rules_adjustment: 'elite', vision_range: null, is_player_token: 0, image_source: null, image_type: 'file', elevation: null })
    const rows = await db.encounterTokens.where('linked_rules_id').equals('fvtt:pf2e:bestiary:x').toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].rules_adjustment).toBe('elite')
  })
})

describe('cascading deletes', () => {
  async function campaign() {
    const db = getDb()
    const id = await db.campaigns.add({ name: 'Doomed', description: '', created_at: '', updated_at: '' }) as number
    const npc = await db.entities.add({ campaign_id: id, type: 'npc', name: 'Vos', content: '', attributes: '{}', created_at: '', updated_at: '' }) as number
    const loc = await db.entities.add({ campaign_id: id, type: 'location', name: 'Keep', content: '', attributes: JSON.stringify({ mapPins: [{ entityId: npc, x: 0, y: 0 }] }), created_at: '', updated_at: '' }) as number
    const event = await db.entities.add({ campaign_id: id, type: 'event', name: 'Siege', content: '', attributes: '{}', created_at: '', updated_at: '' }) as number
    await db.entitySnapshots.add({ entity_id: loc, label: 'Before', note: '', content: '', attributes: '{}', name: 'Keep', created_at: '', event_id: event, event_name: 'Siege' })
    await db.graphLayouts.add({ campaign_id: id, name: 'G', positions: '{}', hidden_nodes: '[]', zoom: 1, pan_x: 0, pan_y: 0 })
    const enc = await db.encounters.add({ campaign_id: id, name: 'Fight', created_at: '', updated_at: '' } as any) as number
    await db.encounterWalls.add({ encounter_id: enc, points: '[]', coverType: 'full', isOpen: false })
    const token = await db.tokens.add({ name: 'Vos', image_source: null, image_type: 'file', is_template: 1, is_player_character: 0, linked_entity_id: npc, created_at: '' }) as number
    await db.characters.add({ campaign_id: id, name: 'Vos', role: 'companion', level: 1, xp: 0, treat_as_pc: 0, str_mod: null, npc_entity_id: npc, created_at: '', updated_at: '' })
    return { id, npc, loc, event, enc, token }
  }

  it('deleting a campaign leaves no walls, snapshots or graphs behind and keeps library tokens', async () => {
    const { dbApi } = await import('~/composables/useDb')
    const db = getDb()
    const c = await campaign()
    await dbApi.campaigns.delete(c.id)
    expect(await db.encounterWalls.where('encounter_id').equals(c.enc).count()).toBe(0)
    expect(await db.entitySnapshots.where('entity_id').equals(c.loc).count()).toBe(0)
    expect(await db.graphLayouts.where('campaign_id').equals(c.id).count()).toBe(0)
    expect(await db.tokens.get(c.token)).toMatchObject({ linked_entity_id: null })
  })

  it('deleting an encounter removes its walls', async () => {
    const { dbApi } = await import('~/composables/useDb')
    const c = await campaign()
    await dbApi.encounters.delete(c.enc)
    expect(await getDb().encounterWalls.where('encounter_id').equals(c.enc).count()).toBe(0)
  })

  it('deleting an entity clears every reference to it', async () => {
    const { dbApi } = await import('~/composables/useDb')
    const db = getDb()
    const c = await campaign()
    await dbApi.entities.delete(c.npc)
    expect(JSON.parse((await db.entities.get(c.loc))!.attributes).mapPins).toEqual([])
    expect((await db.characters.where('campaign_id').equals(c.id).first())!.npc_entity_id).toBeNull()
    expect((await db.tokens.get(c.token))!.linked_entity_id).toBeNull()
    await dbApi.entities.delete(c.event)
    expect((await db.entitySnapshots.where('entity_id').equals(c.loc).first())!.event_id).toBeNull()
  })
})
