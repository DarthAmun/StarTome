import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { dbApi, getDb } from '~/composables/useDb'
import { useInventory } from '~/composables/useInventory'
import { useParty } from '~/composables/useParty'
import { characterOwner, encounterOwner, STASH } from '~/rules/inventory'

async function setup() {
  const db = getDb()
  const id = await db.campaigns.add({ name: 'The Codex', description: '', game: 'pf2e', rules: { advancement: 'milestone' }, created_at: '', updated_at: '' }) as number
  const party = useParty()
  await party.load(id)
  await party.addCharacter({ campaignId: id, name: 'Kib', role: 'pc', level: 3 })
  await party.addCharacter({ campaignId: id, name: 'Lira', role: 'pc', level: 3 })
  const [kib, lira] = party.characters.value.map(c => c.id)
  const inv = useInventory()
  await inv.load(id)
  return { id, kib: kib!, lira: lira!, inv }
}

describe('inventory repository', () => {
  beforeEach(async () => {
    const db = getDb()
    await Promise.all([db.campaigns.clear(), db.entities.clear(), db.characters.clear(), db.levelUps.clear(), db.inventory.clear(), db.purses.clear(), db.encounters.clear()])
  })

  it('adds into an identical stack and splits on a partial move', async () => {
    const { id, kib, inv } = await setup()
    await inv.addEntry({ campaignId: id, owner: STASH, name: 'Healing potion', quantity: 3 })
    await inv.addEntry({ campaignId: id, owner: STASH, name: 'Healing potion', quantity: 2 })
    expect(inv.entries.value).toHaveLength(1)
    const potion = inv.entries.value[0]
    expect(potion.quantity).toBe(5)

    await inv.move(potion.id, characterOwner(kib), 2)
    const byOwner = (o: string) => inv.entries.value.filter(e => e.owner === o)
    expect(byOwner(STASH).map(e => e.quantity)).toEqual([3])
    expect(byOwner(characterOwner(kib)).map(e => e.quantity)).toEqual([2])

    // Moving the rest merges into Kib's stack
    await inv.move(potion.id, characterOwner(kib))
    expect(byOwner(STASH)).toHaveLength(0)
    expect(byOwner(characterOwner(kib)).map(e => e.quantity)).toEqual([5])
  })

  it('keeps identified and unidentified copies apart', async () => {
    const { id, inv } = await setup()
    await inv.addEntry({ campaignId: id, owner: STASH, name: 'Ring', identified: false })
    await inv.addEntry({ campaignId: id, owner: STASH, name: 'Ring' })
    expect(inv.entries.value).toHaveLength(2)
    const unid = inv.entries.value.find(e => !e.identified)!
    await inv.setIdentified(unid.id, true)
    expect(inv.entries.value.every(e => e.identified)).toBe(true)
  })

  it('removes an entry when its quantity drops to 0', async () => {
    const { id, inv } = await setup()
    const eid = await inv.addEntry({ campaignId: id, owner: STASH, name: 'Rope' })
    await inv.updateEntry(eid, { quantity: 0 })
    expect(inv.entries.value).toHaveLength(0)
  })

  it('moves coins, never below zero, and splits the stash evenly', async () => {
    const { id, kib, lira, inv } = await setup()
    await inv.adjustPurse(id, STASH, 1003)
    await inv.adjustPurse(id, STASH, -5000)
    expect(inv.purses.value[STASH]).toBe(0)
    await inv.adjustPurse(id, STASH, 1003)
    expect(await inv.transferCoins(id, STASH, characterOwner(kib), 5000)).toBe(1003)
    await inv.transferCoins(id, characterOwner(kib), STASH, 1003)
    const r = await inv.splitPurse(id, STASH, [characterOwner(kib), characterOwner(lira)])
    expect(r).toEqual({ each: 501, remainder: 1 })
    expect(inv.purses.value).toMatchObject({ [STASH]: 1, [characterOwner(kib)]: 501, [characterOwner(lira)]: 501 })
  })

  it('hands a removed character\'s items and coins to the stash', async () => {
    const { id, kib, inv } = await setup()
    await inv.addEntry({ campaignId: id, owner: characterOwner(kib), name: 'Lute' })
    await inv.adjustPurse(id, characterOwner(kib), 300)
    await useParty().removeCharacter(kib)
    expect(inv.entries.value.map(e => e.owner)).toEqual([STASH])
    expect(inv.purses.value[STASH]).toBe(300)
    expect(inv.purses.value[characterOwner(kib)]).toBeUndefined()
  })

  it('deletes planned loot with its encounter and copies inventory with a cloned campaign', async () => {
    const { id, kib, inv } = await setup()
    const encId = await getDb().encounters.add({ campaign_id: id, name: 'Ambush', created_at: '', updated_at: '' } as any) as number
    await inv.addEntry({ campaignId: id, owner: encounterOwner(encId), name: 'Gem' })
    await inv.addEntry({ campaignId: id, owner: characterOwner(kib), name: 'Lute' })
    await inv.adjustPurse(id, characterOwner(kib), 50)

    const clone = await dbApi.campaigns.clone(id)
    const cloned = await getDb().inventory.where('campaign_id').equals(clone!.id!).toArray()
    const newKib = (await getDb().characters.where('campaign_id').equals(clone!.id!).toArray())[0]
    expect(cloned.map(e => e.owner)).toEqual(expect.arrayContaining([characterOwner(newKib.id!), expect.stringMatching(/^encounter:\d+$/)]))
    expect(cloned).toHaveLength(2)
    expect(cloned.some(e => e.owner === encounterOwner(encId))).toBe(false)
    expect((await getDb().purses.where('campaign_id').equals(clone!.id!).toArray())[0].owner).toBe(characterOwner(newKib.id!))

    await dbApi.encounters.delete(encId)
    await inv.load(id)
    expect(inv.entries.value.map(e => e.nameOverride)).toEqual(['Lute'])
  })
})
