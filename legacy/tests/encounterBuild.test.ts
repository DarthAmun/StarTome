import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { createEncounterFromBuild } from '~/composables/useEncounterBuild'
import { useParty } from '~/composables/useParty'
import { newRulesEntity } from '~/rules/factory'
import type { Creature } from '~/types/rules'

async function setup() {
  const db = getDb()
  const campaignId = await db.campaigns.add({ name: 'The Codex', description: '', game: 'pf2e', rules: { advancement: 'milestone' }, created_at: '', updated_at: '' } as any) as number
  const kib = await db.entities.add({ campaign_id: campaignId, type: 'npc', name: 'Kib', content: '', attributes: JSON.stringify({ isPlayerCharacter: true, level: '3' }) } as any) as number
  const party = useParty()
  await party.load(campaignId)
  await party.addCharacter({ campaignId, name: 'Lira', role: 'pc', level: 3 })
  const goblin = { ...newRulesEntity('creature', { name: 'Goblin Warrior', game: 'pf2e' }), level: -1, hp: 6, ac: 16, size: 'sm' } as Creature
  const ogre = { ...newRulesEntity('creature', { name: 'Ogre', game: 'pf2e' }), level: 3, hp: 50, ac: 17, size: 'lg' } as Creature
  await db.rules.bulkAdd([goblin, ogre])
  return { campaignId, kib, goblin, ogre, party }
}

describe('createEncounterFromBuild', () => {
  beforeEach(async () => {
    const db = getDb()
    await Promise.all([db.campaigns.clear(), db.entities.clear(), db.characters.clear(), db.rules.clear(), db.tokens.clear(), db.encounters.clear(), db.encounterTokens.clear()])
  })

  it('places the party and every enemy, and reuses party tokens next time', async () => {
    const { campaignId, kib, goblin, ogre, party } = await setup()
    const build = {
      name: 'Ambush',
      partyLevel: 4,
      slots: [
        { rulesId: goblin.id, count: 3, adjustment: null },
        { rulesId: ogre.id, count: 1, adjustment: 'elite' as const },
        { rulesId: 'gone', count: 2, adjustment: null },
      ],
    }
    const res = await createEncounterFromBuild(campaignId, build, party.characters.value)
    expect(res?.missing).toBe(1)

    const db = getDb()
    const enc = await db.encounters.get(res!.encounterId)
    expect(enc).toMatchObject({ name: 'Ambush', status: 'prepared', party_level: 4 })
    const placed = await db.encounterTokens.where('encounter_id').equals(res!.encounterId).toArray()

    const players = placed.filter(t => t.is_player_token)
    expect(players).toHaveLength(2)
    expect(players.find(t => t.linked_entity_id === kib)).toBeTruthy()

    const enemies = placed.filter(t => !t.is_player_token)
    expect(enemies.map(t => t.label)).toEqual(['Goblin Warrior 1', 'Goblin Warrior 2', 'Goblin Warrior 3', null])
    const elite = enemies.find(t => t.linked_rules_id === ogre.id)!
    expect(elite).toMatchObject({ rules_adjustment: 'elite', size: 2, hp_max: 50 + 15 })

    // No two tokens share a square
    const squares = placed.flatMap(t => Array.from({ length: t.size * t.size }, (_, i) => `${t.grid_x + (i % t.size)},${t.grid_y + Math.floor(i / t.size)}`))
    expect(new Set(squares).size).toBe(squares.length)

    // Party tokens were saved to the library and are reused
    expect(await db.tokens.count()).toBe(2)
    expect(party.characters.value.every(c => c.tokenId !== null)).toBe(true)
    await createEncounterFromBuild(campaignId, { name: '', partyLevel: null, slots: [] }, party.characters.value)
    expect(await db.tokens.count()).toBe(2)
  })
})
