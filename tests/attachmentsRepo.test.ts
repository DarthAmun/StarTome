import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { useInventory } from '~/composables/useInventory'
import { useParty } from '~/composables/useParty'
import { newRulesEntity } from '~/rules/factory'
import { characterOwner, STASH } from '~/rules/inventory'
import type { Item, RulesEntity } from '~/types/rules'

function rune(id: string, name: string, cp: number, usage = 'etched onto a weapon'): Item {
  const base = newRulesEntity('item', { name, game: 'pf2e' }) as Item
  return { ...base, id, origin: 'foundry', price: { cp }, usage, traits: ['magical', 'rune'] }
}

async function setup() {
  const db = getDb()
  const id = await db.campaigns.add({ name: 'The Codex', description: '', game: 'pf2e', rules: { advancement: 'milestone' }, created_at: '', updated_at: '' }) as number
  const sword: Item = { ...(newRulesEntity('item', { name: 'Longsword', game: 'pf2e' }) as Item), id: 'sword', origin: 'foundry', category: 'weapon', price: { cp: 100 }, bulk: 10 }
  const gift: RulesEntity = { ...newRulesEntity('relicGift', { name: 'Blazing Soul', game: 'pf2e' }), id: 'gift' }
  await db.rules.bulkAdd([sword, rune('pot1', 'Weapon Potency (+1)', 3_500), rune('str1', 'Striking', 6_500), rune('str2', 'Greater Striking', 106_500), rune('flm', 'Flaming', 50_000), gift])
  const party = useParty()
  await party.load(id)
  await party.addCharacter({ campaignId: id, name: 'Kib', role: 'pc', level: 3 })
  const inv = useInventory()
  await inv.load(id)
  return { id, kib: party.characters.value[0].id, inv }
}

describe('attachments in the inventory', () => {
  beforeEach(async () => {
    const db = getDb()
    await Promise.all([db.campaigns.clear(), db.characters.clear(), db.inventory.clear(), db.purses.clear(), db.rules.clear()])
  })

  it('attaches runes to one of a stack, sums the value and replaces fundamentals', async () => {
    const { id, inv } = await setup()
    const swords = await inv.addEntry({ campaignId: id, owner: STASH, itemId: 'sword', quantity: 2 })
    const potency = (await inv.attach(swords, { itemId: 'pot1' }))!
    const host = inv.entries.value.find(e => e.id === inv.entries.value.find(x => x.id === potency)!.attachedTo)!
    expect(host.id).not.toBe(swords)
    expect(inv.entries.value.find(e => e.id === swords)!.quantity).toBe(1)
    await inv.attach(host.id, { itemId: 'str1' })
    await inv.attach(host.id, { itemId: 'str2' })
    const attached = inv.entries.value.filter(e => e.attachedTo === host.id)
    expect(attached.map(e => e.itemId).sort()).toEqual(['pot1', 'str2'])
    expect(inv.entries.value.find(e => e.id === host.id)!.runes).toEqual({ potency: 1, striking: 2, property: [] })
    // A plain longsword added later doesn't merge into the one with runes
    await inv.addEntry({ campaignId: id, owner: STASH, itemId: 'sword' })
    expect(inv.entries.value.find(e => e.id === host.id)!.quantity).toBe(1)
  })

  it('moves runes with their item, detaches them loose and deletes them with it', async () => {
    const { id, kib, inv } = await setup()
    const sword = await inv.addEntry({ campaignId: id, owner: STASH, itemId: 'sword' })
    const loose = await inv.addEntry({ campaignId: id, owner: STASH, itemId: 'flm', quantity: 2 })
    await inv.attach(sword, { entryId: loose })
    expect(inv.entries.value.find(e => e.id === loose)!.quantity).toBe(1)
    const flaming = inv.entries.value.find(e => e.attachedTo === sword)!

    await inv.move(flaming.id, characterOwner(kib))
    expect(inv.entries.value.find(e => e.id === flaming.id)!.owner).toBe(STASH)
    await inv.move(sword, characterOwner(kib))
    expect(inv.entries.value.filter(e => e.owner === characterOwner(kib)).map(e => e.itemId).sort()).toEqual(['flm', 'sword'])

    await inv.detach(flaming.id)
    expect(inv.entries.value.find(e => e.id === flaming.id)).toMatchObject({ attachedTo: null, owner: characterOwner(kib) })
    expect(inv.entries.value.find(e => e.id === sword)!.runes).toBeNull()

    await inv.attach(sword, { entryId: flaming.id })
    await inv.removeEntry(sword)
    expect(inv.entries.value.filter(e => e.owner === characterOwner(kib))).toHaveLength(0)
  })

  it('values awakened relic gifts and leaves dormant ones out', async () => {
    const { id, inv } = await setup()
    const relic = await inv.addEntry({ campaignId: id, owner: STASH, name: 'Ember Crown' })
    await inv.setRelic(relic, { aspects: ['fire'] })
    const g1 = (await inv.attach(relic, { itemId: 'gift' }))!
    const g2 = (await inv.attach(relic, { itemId: 'gift' }))!
    await inv.setIdentified(g2, false)
    const byId = (x: number) => inv.entries.value.find(e => e.id === x)!
    expect(byId(g1)).toMatchObject({ attachKind: 'gift', giftValue: 2_000 })
    expect(byId(g2).giftValue).toBe(0)
    await inv.setIdentified(g2, true)
    expect(byId(g2).giftValue).toBe(16_000)
    // A gift taken off is gone, not a loose item
    await inv.detach(g2)
    expect(inv.entries.value.find(e => e.id === g2)).toBeUndefined()
  })

  it('turns runes from the old dropdowns into attached runes', async () => {
    const { id, inv } = await setup()
    const ts = new Date().toISOString()
    await getDb().inventory.add({
      campaign_id: id, owner: STASH, item_id: 'sword', quantity: 2, name_override: null, price_override: null, bulk_override: null, notes: '',
      identified: 1, player_name: null, player_description: null, runes: { potency: 1, striking: 1, property: ['flaming'] }, grade: null, created_at: ts, updated_at: ts,
    })
    await inv.load(id)
    await new Promise(r => setTimeout(r, 50))
    await inv.load(id)
    const hosts = inv.entries.value.filter(e => e.itemId === 'sword')
    expect(hosts.map(h => h.quantity)).toEqual([1, 1])
    for (const h of hosts) {
      expect(inv.entries.value.filter(e => e.attachedTo === h.id).map(e => e.itemId).sort()).toEqual(['flm', 'pot1', 'str1'])
      expect(h.runes).toEqual({ potency: 1, striking: 1, property: ['flaming'] })
    }
  })
})
