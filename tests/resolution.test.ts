import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { useInventory } from '~/composables/useInventory'
import { useParty } from '~/composables/useParty'
import { useResolution } from '~/composables/useResolution'
import { encounterOwner, STASH } from '~/rules/inventory'

async function setup(advancement: 'xp' | 'milestone') {
  const db = getDb()
  const id = await db.campaigns.add({ name: 'The Codex', description: '', game: 'pf2e', rules: { advancement }, created_at: '', updated_at: '' }) as number
  const party = useParty()
  await party.load(id)
  await party.addCharacter({ campaignId: id, name: 'Kib', role: 'pc', level: 3 })
  await party.addCharacter({ campaignId: id, name: 'Lira', role: 'pc', level: 3 })
  const [kib, lira] = party.characters.value.map(c => c.id) as [number, number]
  const encId = await db.encounters.add({
    campaign_id: id, name: 'Goblin ambush', map_source: null, map_type: 'file', grid_size: 70, grid_offset_x: 0, grid_offset_y: 0,
    fog_data: '{}', viewport: '{}', combat_log: '[]', status: 'active', created_at: '', updated_at: '',
  }) as number
  const inv = useInventory()
  await inv.load(id)
  await inv.addEntry({ campaignId: id, owner: STASH, name: 'Healing potion', quantity: 1 })
  await inv.addEntry({ campaignId: id, owner: encounterOwner(encId), name: 'Healing potion', quantity: 2 })
  await inv.addEntry({ campaignId: id, owner: encounterOwner(encId), name: 'Goblin totem', identified: false })
  await inv.adjustPurse(id, encounterOwner(encId), 500)
  return { id, kib, lira, encId, inv, party }
}

const resolveInput = (encId: number, participants: number[], awardXp: boolean) => ({
  encounterId: encId, participants, xpTotal: 80, partyLevel: 3, accomplishment: 30, xpAwarded: 110, awardXp,
})

describe('encounter resolution', () => {
  beforeEach(async () => {
    const db = getDb()
    await Promise.all([db.campaigns.clear(), db.characters.clear(), db.levelUps.clear(), db.xpAwards.clear(), db.inventory.clear(), db.purses.clear(), db.encounters.clear()])
    useParty().dismissPrompt()
  })

  it('moves loot and coins to the stash and awards XP to the participants', async () => {
    const { id, kib, lira, encId, inv, party } = await setup('xp')
    await useResolution().resolveEncounter(resolveInput(encId, [kib], true))

    const byOwner = (o: string) => inv.entries.value.filter(e => e.owner === o)
    expect(byOwner(encounterOwner(encId))).toHaveLength(0)
    expect(byOwner(STASH).map(e => [e.nameOverride, e.quantity, e.identified]).sort()).toEqual([['Goblin totem', 1, false], ['Healing potion', 3, true]])
    expect(inv.purses.value[STASH]).toBe(500)
    expect(inv.purses.value[encounterOwner(encId)] ?? 0).toBe(0)

    expect(party.characters.value.find(c => c.id === kib)!.xp).toBe(110)
    expect(party.characters.value.find(c => c.id === lira)!.xp).toBe(0)
    expect(party.xpAwards.value).toHaveLength(1)
    const enc = await getDb().encounters.get(encId)
    expect(enc).toMatchObject({ status: 'resolved', xp_total: 80, xp_awarded: 110, party_level_at_resolve: 3 })

    // Resolving twice does nothing
    await useResolution().resolveEncounter(resolveInput(encId, [kib], true))
    expect(party.characters.value.find(c => c.id === kib)!.xp).toBe(110)
  })

  it('re-opens: loot and XP come back, as far as the loot is still in the stash', async () => {
    const { kib, encId, inv, party } = await setup('xp')
    await useResolution().resolveEncounter(resolveInput(encId, [kib], true))
    // The party drinks two potions before the GM re-opens
    const potions = inv.entries.value.find(e => e.nameOverride === 'Healing potion')!
    await inv.updateEntry(potions.id, { quantity: 1 })

    const short = await useResolution().reopenEncounter(encId)
    expect(short).toEqual({ names: ['Healing potion'], cp: 0 })
    const loot = inv.entries.value.filter(e => e.owner === encounterOwner(encId))
    expect(loot.map(e => [e.nameOverride, e.quantity]).sort()).toEqual([['Goblin totem', 1], ['Healing potion', 1]])
    expect(inv.entries.value.filter(e => e.owner === STASH)).toHaveLength(0)
    expect(inv.purses.value[encounterOwner(encId)]).toBe(500)
    expect(party.characters.value.find(c => c.id === kib)!.xp).toBe(0)
    expect(party.xpAwards.value[0].undoneAt).toBeTruthy()
    expect((await getDb().encounters.get(encId))!.status).toBe('prepared')
  })

  it('offers a level-up at 1,000 XP that costs 1,000 XP and can be undone', async () => {
    const { id, kib, encId, party } = await setup('xp')
    await party.updateCharacter(kib, { xp: 950 })
    await useResolution().resolveEncounter(resolveInput(encId, [kib], true))
    expect(party.prompt.value).toMatchObject({ trigger: 'encounter', refId: encId, selected: [kib] })

    const logId = await party.levelUp(id, [kib], 'encounter', encId)
    expect(party.characters.value.find(c => c.id === kib)).toMatchObject({ level: 4, xp: 60 })
    await party.awardXp({ campaignId: id, amount: 10, characterIds: [kib], source: 'accomplishment' })
    await party.undoLevelUp(logId!)
    expect(party.characters.value.find(c => c.id === kib)).toMatchObject({ level: 3, xp: 1070 })
  })

  it('records but does not award XP in milestone campaigns, and paces it', async () => {
    const { id, kib, lira, encId, party } = await setup('milestone')
    await useResolution().resolveEncounter(resolveInput(encId, [kib, lira], false))
    expect(party.characters.value.every(c => c.xp === 0)).toBe(true)
    expect(party.xpAwards.value).toHaveLength(0)
    expect(await useResolution().loadPacing(id)).toMatchObject({ xp: 110, encounters: 1 })

    await party.levelUp(id, [kib, lira])
    expect(await useResolution().loadPacing(id)).toMatchObject({ xp: 0, encounters: 0 })
    expect(party.characters.value.every(c => c.xp === 0)).toBe(true)
  })
})
