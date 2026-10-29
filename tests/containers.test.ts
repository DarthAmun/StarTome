import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { useInventory } from '~/composables/useInventory'
import { useParty } from '~/composables/useParty'
import { characterOwner, containerLoad, containerOf, itemBulkByOwner, partyTotals, STASH, type InventoryEntry } from '~/rules/inventory'
import { NoneLink, LinkUnavailableError } from '~/partylink'

const entry = (p: Partial<InventoryEntry>): InventoryEntry => ({
  id: 1, owner: 'stash', itemId: null, quantity: 1, nameOverride: null, priceOverride: null, bulkOverride: null,
  notes: '', identified: true, playerName: null, playerDescription: null, runes: null, grade: null, containerId: null, ...p,
})
const base = { price: { cp: 10 }, priceFor: 1, level: 0, rarity: 'common' as const, traits: [] }
const items = new Map<string, any>([
  ['backpack', { ...base, name: 'Backpack', category: 'container', bulk: 1, container: { capacity: 40, bulkReduction: 20 } }],
  ['bag', { ...base, name: 'Bag of holding', category: 'container', bulk: 10, container: { capacity: 250, bulkReduction: 250 } }],
  ['rope', { ...base, name: 'Rope', category: 'equipment', bulk: 1 }],
  ['sword', { ...base, name: 'Longsword', category: 'weapon', bulk: 10 }],
])

describe('container Bulk', () => {
  it('takes the reduction off what the container holds', () => {
    const list = [
      entry({ id: 1, itemId: 'backpack' }),
      entry({ id: 2, itemId: 'sword', quantity: 3, containerId: 1 }),
      entry({ id: 3, itemId: 'rope', quantity: 5, containerId: 1 }),
      entry({ id: 4, itemId: 'sword' }),
    ]
    // Backpack holds 3.5 Bulk; 2 doesn't count → 1.5 + the pack's L + a loose sword
    expect(containerLoad(list[0], list, items)).toEqual({ contents: 35, capacity: 40, counted: 15, over: false })
    expect(itemBulkByOwner(list, items)).toEqual({ stash: 1 + 15 + 10 })
  })

  it('flags a full container, and a bag of holding weighs only itself', () => {
    const list = [entry({ id: 1, itemId: 'backpack' }), entry({ id: 2, itemId: 'sword', quantity: 5, containerId: 1 })]
    expect(containerLoad(list[0], list, items)?.over).toBe(true)
    const bag = [entry({ id: 1, itemId: 'bag' }), entry({ id: 2, itemId: 'sword', quantity: 20, containerId: 1 })]
    expect(itemBulkByOwner(bag, items)).toEqual({ stash: 10 })
    expect(partyTotals(bag, items, [], 'gm').byOwner.stash.bulk).toBe(10)
  })

  it('ignores a container of another owner or a non-container', () => {
    const list = [
      entry({ id: 1, itemId: 'backpack', owner: 'character:1' }),
      entry({ id: 2, itemId: 'sword', containerId: 1 }),
      entry({ id: 3, itemId: 'rope' }),
      entry({ id: 4, itemId: 'sword', containerId: 3 }),
    ]
    expect(containerOf(list[1], list, items)).toBeNull()
    expect(containerOf(list[3], list, items)).toBeNull()
    expect(itemBulkByOwner(list, items)).toEqual({ 'character:1': 1, stash: 10 + 1 + 10 })
  })
})

describe('containers in the repository', () => {
  beforeEach(async () => {
    const db = getDb()
    await Promise.all([db.campaigns.clear(), db.characters.clear(), db.inventory.clear(), db.purses.clear(), db.rules.clear()])
  })

  async function setup() {
    const db = getDb()
    await db.rules.put({
      id: 'local:backpack', kind: 'item', game: 'pf2e', origin: 'local', name: 'Backpack', sortName: 'backpack', level: 0,
      rarity: 'common', traits: [], description: '', category: 'container', bulk: 1, price: { cp: 10 },
      container: { capacity: 40, bulkReduction: 20 }, updatedAt: '',
    } as any)
    const id = await db.campaigns.add({ name: 'C', description: '', game: 'pf2e', rules: {}, created_at: '', updated_at: '' }) as number
    const party = useParty()
    await party.load(id)
    await party.addCharacter({ campaignId: id, name: 'Kib', role: 'pc', level: 1 })
    const kib = characterOwner(party.characters.value[0].id)
    const inv = useInventory()
    await inv.load(id)
    const pack = await inv.addEntry({ campaignId: id, owner: STASH, itemId: 'local:backpack' })
    const rope = await inv.addEntry({ campaignId: id, owner: STASH, name: 'Rope', quantity: 2 })
    return { id, kib, inv, pack, rope, party }
  }

  it('stores, merges and takes out stacks', async () => {
    const { id, inv, pack, rope } = await setup()
    await inv.store(rope, pack)
    expect(inv.entries.value.find(e => e.id === rope)?.containerId).toBe(pack)
    // Another rope stored in the pack merges into the stored stack
    const more = await inv.addEntry({ campaignId: id, owner: STASH, name: 'Rope' })
    await inv.store(more, pack)
    expect(inv.entries.value.filter(e => e.nameOverride === 'Rope').map(e => [e.quantity, e.containerId])).toEqual([[3, pack]])
    await inv.store(rope, null)
    expect(inv.entries.value.find(e => e.id === rope)?.containerId).toBeNull()
  })

  it('moves a container with its contents, and contents fall out when it is deleted', async () => {
    const { inv, pack, rope, kib } = await setup()
    await inv.store(rope, pack)
    await inv.move(pack, kib)
    expect(inv.entries.value.map(e => [e.id, e.owner, e.containerId])).toEqual(expect.arrayContaining([[pack, kib, null], [rope, kib, pack]]))
    // A stored stack moved to another owner comes out of the container
    await inv.move(rope, STASH, 1)
    expect(inv.entries.value.find(e => e.owner === STASH)?.containerId).toBeNull()
    await inv.removeEntry(pack)
    expect(inv.entries.value.find(e => e.id === rope)?.containerId).toBeNull()
  })

  it("hands a leaving character's container to the stash with its contents", async () => {
    const { id, inv, pack, rope, kib, party } = await setup()
    await inv.store(rope, pack)
    await inv.move(pack, kib)
    await party.removeCharacter(party.characters.value[0].id)
    await inv.load(id)
    expect(inv.entries.value.map(e => [e.id, e.owner, e.containerId])).toEqual(expect.arrayContaining([[pack, STASH, null], [rope, STASH, pack]]))
  })
})

describe('PartyLink stub', () => {
  it('links nothing: empty reads, refused writes', async () => {
    expect(await NoneLink.probe()).toEqual({ ok: false, reason: 'disabled' })
    expect(await NoneLink.listPlayers()).toEqual([])
    await expect(NoneLink.sendOffer('all', { kind: 'coins', cp: 100 })).rejects.toBeInstanceOf(LinkUnavailableError)
  })
})
