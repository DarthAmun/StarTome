import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { useInventory } from '~/composables/useInventory'
import { useParty } from '~/composables/useParty'
import { parseResolution, useResolution } from '~/composables/useResolution'
import { useWealth } from '~/composables/useWealth'
import { encounterOwner } from '~/rules/inventory'

async function setup() {
  const db = getDb()
  const id = await db.campaigns.add({ name: 'The Codex', description: '', game: 'pf2e', rules: { advancement: 'milestone' }, created_at: '', updated_at: '' }) as number
  const party = useParty()
  await party.load(id)
  for (const name of ['Kib', 'Lira', 'Vex', 'Oon']) await party.addCharacter({ campaignId: id, name, role: 'pc', level: 2 })
  const encId = await db.encounters.add({
    campaign_id: id, name: 'Goblin ambush', map_source: null, map_type: 'file', grid_size: 70, grid_offset_x: 0, grid_offset_y: 0,
    fog_data: '{}', viewport: '{}', combat_log: '[]', status: 'active', created_at: '', updated_at: '',
  }) as number
  const inv = useInventory()
  await inv.load(id)
  const totem = await inv.addEntry({ campaignId: id, owner: encounterOwner(encId), name: 'Goblin totem' })
  await inv.updateEntry(totem, { priceOverride: 2000 })
  await inv.adjustPurse(id, encounterOwner(encId), 5000)
  return { id, encId, party }
}

const shape = { level: 2, size: 4, xps: [] }

describe('wealth tracking', () => {
  beforeEach(async () => {
    const db = getDb()
    await Promise.all([db.campaigns.clear(), db.characters.clear(), db.levelUps.clear(), db.xpAwards.clear(),
      db.inventory.clear(), db.purses.clear(), db.encounters.clear(), db.treasureAwards.clear()])
  })

  it('values resolved loot and counts it with manual awards', async () => {
    const { id, encId } = await setup()
    await useResolution().resolveEncounter({ encounterId: encId, participants: [], xpTotal: 80, partyLevel: 2, accomplishment: 0, xpAwarded: 80, awardXp: false })
    const record = parseResolution((await getDb().encounters.get(encId))!.resolution)
    expect(record?.treasure).toEqual({ value: 7000, consumables: 0 })

    const wealth = useWealth()
    await wealth.loadAwards(id)
    await wealth.awardTreasure({ campaignId: id, value: { value: 3000, consumables: 1000 }, label: 'Guild reward' })
    const s = await wealth.loadWealth(id, shape)
    expect(s.sinceBaseline).toEqual({ encounters: 7000, manual: 3000, count: 2 })
    expect(s.readout?.awarded).toBe(10000)
    // Level 1's row plus 80 / 1,000 of level 2's (milestone pacing)
    expect(s.readout?.expected).toBe(17500 + 2400)
    expect(s.pace).toMatchObject({ awarded: 10000, expected: 30000 })

    await wealth.undoTreasureAward(wealth.awards.value[0].id)
    expect((await wealth.loadWealth(id, shape)).readout?.awarded).toBe(7000)
  })

  it('counts only awards after the baseline, and the pace only since the last level-up', async () => {
    const { id, encId, party } = await setup()
    const wealth = useWealth()
    await wealth.awardTreasure({ campaignId: id, value: { value: 1000, consumables: 0 }, label: 'Before' })
    await new Promise(r => setTimeout(r, 5))
    await wealth.updateRules(id, { startingTreasure: 20000, startingConsumables: 0, startingLevel: 2, baselineAt: new Date().toISOString() })
    await new Promise(r => setTimeout(r, 5))
    await useResolution().resolveEncounter({ encounterId: encId, participants: [], xpTotal: 80, partyLevel: 2, accomplishment: 0, xpAwarded: 80, awardXp: false })
    let s = await wealth.loadWealth(id, shape)
    expect(s.readout?.awarded).toBe(27000)
    expect(s.pace?.awarded).toBe(8000)

    await new Promise(r => setTimeout(r, 5))
    await party.levelUp(id, party.characters.value.map(c => c.id))
    s = await wealth.loadWealth(id, { ...shape, level: 3 })
    expect(s.pace).toMatchObject({ awarded: 0, expected: 50000 })
    expect(await wealth.loadTreasurePace(id, 3, 4)).toMatchObject({ awarded: 0 })
  })

  it('skips awards worth nothing', async () => {
    const { id } = await setup()
    const wealth = useWealth()
    await wealth.loadAwards(id)
    await wealth.awardTreasure({ campaignId: id, value: { value: 0, consumables: 0 }, label: 'Unpriced idol' })
    expect(wealth.awards.value).toHaveLength(0)
  })
})
