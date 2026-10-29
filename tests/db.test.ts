import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'

describe('StarTome database', () => {
  it('opens its own database with the full store list', async () => {
    const db = getDb()
    await db.open()
    expect(db.name).toBe('startome')
    expect(db.verno).toBe(6)
    expect(db.tables.map(t => t.name).sort()).toEqual([
      'campaigns', 'characters', 'encounterTokens', 'encounterWalls', 'encounters', 'entities', 'entityConnections',
      'entityLinks', 'entitySnapshots', 'graphLayouts', 'images', 'inventory', 'legacyLibrary', 'levelUps', 'purses', 'rules', 'soundPlaylists',
      'soundTracks', 'syncState', 'tokens',
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
