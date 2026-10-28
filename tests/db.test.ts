import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'

describe('StarTome database', () => {
  it('opens its own database with the full store list', async () => {
    const db = getDb()
    await db.open()
    expect(db.name).toBe('startome')
    expect(db.verno).toBe(2)
    expect(db.tables.map(t => t.name).sort()).toEqual([
      'campaigns', 'encounterTokens', 'encounterWalls', 'encounters', 'entities', 'entityConnections',
      'entityLinks', 'entitySnapshots', 'graphLayouts', 'images', 'records', 'rules', 'soundPlaylists',
      'soundTracks', 'syncState', 'systems', 'tokens',
    ])
  })

  it('round-trips a campaign', async () => {
    const db = getDb()
    const id = await db.campaigns.add({ name: 'Test', description: '', created_at: 'x', updated_at: 'x' })
    expect((await db.campaigns.get(id))?.name).toBe('Test')
  })
})
