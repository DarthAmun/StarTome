import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { useEncounterStore } from '~/stores/encounter'

async function encounter(tokens: { label: string; initiative: number | null; visible?: boolean; actsWhileHidden?: boolean; dead?: boolean; timers?: unknown[] }[]) {
  const db = getDb()
  const campaignId = await db.campaigns.add({ name: 'C', description: '', created_at: '', updated_at: '' }) as number
  const id = await db.encounters.add({
    campaign_id: campaignId, name: 'Fight', map_source: null, map_type: 'file', grid_size: 70, grid_offset_x: 0, grid_offset_y: 0,
    fog_data: '{}', viewport: '{}', combat_log: '[]', created_at: '', updated_at: '',
  }) as number
  for (const t of tokens) {
    await db.encounterTokens.add({
      encounter_id: id, token_id: null, grid_x: 0, grid_y: 0, size: 1, is_visible: t.visible === false ? 0 : 1, is_dead: t.dead ? 1 : 0,
      label: t.label, conditions: '[]', hp_current: 10, hp_max: 10, ac: 15, initiative: t.initiative, notes: null,
      vision_range: null, is_player_token: 0, image_source: null, image_type: 'file', elevation: null,
      timers: JSON.stringify(t.timers ?? []), acts_while_hidden: t.actsWhileHidden ? 1 : 0,
    })
  }
  const store = useEncounterStore()
  await store.loadEncounter(id)
  return { store, id }
}

const labels = (list: { label: string | null }[]) => list.map(t => t.label)

describe('encounter store', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const db = getDb()
    await Promise.all([db.campaigns.clear(), db.encounters.clear(), db.encounterTokens.clear()])
  })

  it('orders turns by initiative, leaving out the dead and the hidden unless they act while hidden', async () => {
    const { store } = await encounter([
      { label: 'Slow', initiative: 5 },
      { label: 'Fast', initiative: 20 },
      { label: 'Dead', initiative: 15, dead: true },
      { label: 'Lurker', initiative: 12, visible: false, actsWhileHidden: true },
      { label: 'Hidden', initiative: 18, visible: false },
      { label: 'Unrolled', initiative: null },
    ])
    expect(labels(store.initiativeOrder)).toEqual(['Fast', 'Lurker', 'Slow', 'Unrolled'])
  })

  it('advances turns, wraps into the next round and steps back across it', async () => {
    const { store } = await encounter([{ label: 'A', initiative: 20 }, { label: 'B', initiative: 10 }])
    // The highest initiative is up first
    expect(store.initiativeOrder[store.currentTurnIndex].label).toBe('A')
    store.nextTurn()
    store.nextTurn()
    expect([store.initiativeOrder[store.currentTurnIndex].label, store.roundNumber]).toEqual(['A', 2])
    store.prevTurn()
    expect([store.initiativeOrder[store.currentTurnIndex].label, store.roundNumber]).toEqual(['B', 1])
  })

  it('keeps the turn on the same token when another one is removed', async () => {
    const { store } = await encounter([{ label: 'A', initiative: 20 }, { label: 'B', initiative: 15 }, { label: 'C', initiative: 10 }])
    store.nextTurn()
    expect(store.initiativeOrder[store.currentTurnIndex].label).toBe('B')
    await store.removeToken(store.initiativeOrder[0].id)
    expect(store.initiativeOrder[store.currentTurnIndex].label).toBe('B')
  })

  it('counts a token\'s timers down at the start of its turn and undoes that on step back', async () => {
    const { store } = await encounter([
      { label: 'Dragon', initiative: 20, timers: [{ id: 't', name: 'Breath', remaining: 2, duration: 3 }] },
      { label: 'Hero', initiative: 10 },
    ])
    const dragon = () => store.current!.tokens.find(t => t.label === 'Dragon')!
    store.nextTurn()
    store.nextTurn()
    // Round 2 starts with the dragon's turn
    expect(dragon().timers[0].remaining).toBe(1)
    store.prevTurn()
    expect(dragon().timers[0].remaining).toBe(2)
  })

  it('shows hidden combatants to players only as "?" when asked', async () => {
    const { store } = await encounter([{ label: 'Lurker', initiative: 12, visible: false, actsWhileHidden: true }, { label: 'Hero', initiative: 5 }])
    expect(store.playerTurnOrder().map(e => e.label)).toEqual(['Hero'])
    store.setPlayerViewPrefs({ hiddenTurns: 'mystery' })
    expect(store.playerTurnOrder().map(e => [e.name, e.isMystery ?? false])).toEqual([['?', true], [expect.any(String), false]])
  })

  it('saves painted fog once, after the painting pauses or on flush', async () => {
    const { store, id } = await encounter([])
    await store.setFogCell('1,1', 'revealed')
    await store.setFogCell('1,2', 'revealed')
    expect((await getDb().encounters.get(id))!.fog_data).toBe('{}')
    await store.flushPendingSaves()
    // Stored as a value since v12
    expect((await getDb().encounters.get(id))!.fog_data).toEqual({ '1,1': 'revealed', '1,2': 'revealed' })
  })

  it('logs damage, healing and conditions as they change', async () => {
    const { store } = await encounter([{ label: 'Goblin', initiative: 10 }])
    const id = store.current!.tokens[0].id
    await store.updateToken(id, { hpCurrent: 4 })
    await store.updateToken(id, { hpCurrent: 7 })
    await store.updateToken(id, { conditions: [{ name: 'Frightened', value: 1 }] })
    expect(store.current!.combatLog.map(e => [e.type, e.value ?? e.conditionName])).toEqual([
      ['damage', 6], ['healing', 3], ['condition-added', 'Frightened'],
    ])
  })
})
