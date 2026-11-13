import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { StarTomeDb, getDb, useDbForTests } from '@/data/db'
import { createEntry } from '@/data/entries'
import { addEntry, adjustPurse, attach, detach, inventory, move, purseOf, removeEntry, splitPurse, store, toStack, transferCoins, updateEntry } from '@/data/inventory'
import { addCharacter, addCharacterFor, awardTreasure, awardXp, ledgerOf, levelUp, partyOf, removeCharacter, setCompanion, undoLevelUp, undoTreasureAward, undoXpAward, updateCampaignRules, updateCharacter } from '@/data/party'
import { createCampaign } from '@/data/repo'
import { rulesGet, rulesTable } from '@/data/rules'
import { loadWealth } from '@/data/wealth'
import { blankCompanionBase } from '@/domain/rules/companions'
import { newRulesEntity } from '@/domain/rules/factory'
import { characterOwner, STASH } from '@/domain/rules/inventory'
import type { Item, RulesEntity } from '@/domain/rules/types'

const C = 'camp-1'
let n = 0
beforeEach(async () => {
  useDbForTests(new StarTomeDb(`party-${++n}`))
  await createCampaign({ id: C, name: 'Test', description: '', game: 'pf2e' })
})

const item = (name: string, extra: Partial<Item> = {}) => ({ ...newRulesEntity('item', { name, game: 'pf2e' }), ...extra }) as RulesEntity
const rows = async (owner = STASH) => (await inventory.ofCampaign(C)).filter(r => r.ownerKey === owner)

describe('the party', () => {
  it('adds members from a name or an NPC, keeps the entry\'s level in step, and hands a leaver\'s things to the stash', async () => {
    const npc = await createEntry(C, 'npc', 'Kib')
    const kib = await addCharacterFor(npc)
    const pet = await addCharacter({ campaignId: C, name: 'Biter', role: 'companion' })
    expect((await partyOf(C)).map(c => [c.name, c.role])).toEqual([['Kib', 'pc'], ['Biter', 'companion']])
    expect(await addCharacterFor(npc)).toMatchObject({ id: kib.id })

    await updateCharacter(kib.id, { level: 4, strMod: 3 })
    expect((await getDb().rows('entries').get(npc.id))?.data).toMatchObject({ level: '4' })

    await addEntry({ campaignId: C, owner: characterOwner(kib.id), name: 'Lucky coin' })
    await adjustPurse(C, characterOwner(kib.id), 250)
    await removeCharacter(kib.id)
    expect((await partyOf(C)).map(c => c.id)).toEqual([pet.id])
    expect((await rows()).map(r => r.nameOverride)).toEqual(['Lucky coin'])
    expect(await purseOf(C, STASH)).toBe(250)
    expect(await getDb().rows('entries').get(npc.id)).toBeTruthy()
  })

  it('levels up and undoes it; in an XP campaign a level costs 1,000 XP', async () => {
    const a = await addCharacter({ campaignId: C, name: 'A', role: 'pc' })
    const b = await addCharacter({ campaignId: C, name: 'B', role: 'pc' })
    const award = await awardXp({ campaignId: C, amount: 1040, characterIds: [a.id], source: 'accomplishment', reason: 'Saved the town' })
    expect(award?.ready.map(c => c.name)).toEqual(['A'])
    const up = await levelUp(C, [a.id, b.id])
    expect((await partyOf(C)).map(c => [c.level, c.xp])).toEqual([[2, 40], [2, 0]])
    await awardXp({ campaignId: C, amount: 30, characterIds: [a.id], source: 'accomplishment' })
    await undoLevelUp(up?.id ?? '')
    // XP earned since the level-up stays on top of what the level cost
    expect((await partyOf(C)).map(c => [c.level, c.xp])).toEqual([[1, 1070], [1, 0]])
    await undoXpAward(award?.entry.id ?? '')
    expect((await partyOf(C))[0]?.xp).toBe(30)
    expect((await ledgerOf(C)).filter(l => l.undoneAt).length).toBe(2)
  })

  it('does not charge XP in a milestone campaign', async () => {
    await updateCampaignRules(C, { advancement: 'milestone' })
    const a = await addCharacter({ campaignId: C, name: 'A', role: 'pc' })
    await updateCharacter(a.id, { xp: 200 })
    await levelUp(C, [a.id], 'quest', 'quest-1')
    expect((await partyOf(C))[0]).toMatchObject({ level: 2, xp: 200 })
  })

  it('writes a companion\'s stat block and keeps it at the character\'s level', async () => {
    const pet = await addCharacter({ campaignId: C, name: 'Biter', role: 'companion' })
    await setCompanion(pet.id, { kind: 'animal', base: blankCompanionBase('animal'), stage: 'young', customizations: [] })
    const id = (await partyOf(C))[0]?.companionRulesId ?? ''
    expect(await rulesGet(id)).toMatchObject({ name: 'Biter', level: 1, kind: 'creature', origin: 'user' })
    await updateCharacter(pet.id, { level: 5 })
    expect((await rulesGet(id))?.level).toBe(5)
  })
})

describe('the inventory', () => {
  it('grows an identical stack, splits on a partial move and merges at the target', async () => {
    const a = await addCharacter({ campaignId: C, name: 'A', role: 'pc' })
    const id = await addEntry({ campaignId: C, owner: STASH, name: 'Torch', quantity: 3 })
    expect(await addEntry({ campaignId: C, owner: STASH, name: 'Torch', quantity: 2 })).toBe(id)
    await move(id, characterOwner(a.id), 2)
    await move(id, characterOwner(a.id), 1)
    expect((await rows()).map(r => r.quantity)).toEqual([2])
    expect((await rows(characterOwner(a.id))).map(r => r.quantity)).toEqual([3])
    await updateEntry(id, { quantity: 0 })
    expect(await rows()).toEqual([])
  })

  it('attaches runes to one item of a stack, replaces a fundamental rune, and moves a host with what is on it', async () => {
    await rulesTable().bulkAdd([
      item('Longsword', { id: 'sword', category: 'weapon', weapon: { category: 'martial', damage: { dice: 1, die: 'd8', type: 'slashing' } } }),
      item('Striking', { id: 'striking', category: 'equipment', usage: 'etched-onto-a-weapon', traits: ['magical'] }),
      item('Greater Striking', { id: 'greater', category: 'equipment', usage: 'etched-onto-a-weapon', traits: ['magical'] }),
    ])
    const a = await addCharacter({ campaignId: C, name: 'A', role: 'pc' })
    const swords = await addEntry({ campaignId: C, owner: STASH, itemId: 'sword', quantity: 2 })
    const rune = await attach(swords, { itemId: 'striking' })
    const all = await rows()
    const host = all.find(r => r.id !== swords && r.itemId === 'sword')
    expect(all.find(r => r.id === swords)?.quantity).toBe(1)
    expect(all.find(r => r.id === rune)).toMatchObject({ attachedTo: host?.id, attachKind: 'rune' })
    expect(host?.runes).toMatchObject({ striking: 1 })

    await attach(host?.id ?? '', { itemId: 'greater' })
    expect((await rows()).filter(r => r.attachedTo === host?.id).map(r => r.itemId)).toEqual(['greater'])

    await move(host?.id ?? '', characterOwner(a.id))
    expect((await rows(characterOwner(a.id))).map(r => r.itemId).sort()).toEqual(['greater', 'sword'])
    const attached = (await rows(characterOwner(a.id))).find(r => r.attachedTo)
    await detach(attached?.id ?? '')
    expect((await rows(characterOwner(a.id))).every(r => !r.attachedTo)).toBe(true)
    expect(toStack((await rows(characterOwner(a.id))).find(r => r.itemId === 'sword') ?? all[0]!).runes).toBeNull()
  })

  it('stores things in a container and lets them fall out when it is removed', async () => {
    await rulesTable().add(item('Backpack', { id: 'pack', category: 'container', container: { capacity: 40, bulkReduction: 20 } }))
    const pack = await addEntry({ campaignId: C, owner: STASH, itemId: 'pack' })
    const rope = await addEntry({ campaignId: C, owner: STASH, name: 'Rope' })
    await store(rope, pack)
    expect((await rows()).find(r => r.id === rope)?.containerId).toBe(pack)
    await removeEntry(pack)
    expect((await rows()).map(r => [r.id, r.containerId])).toEqual([[rope, null]])
  })

  it('moves and splits coins without making or losing any', async () => {
    const [a, b] = [await addCharacter({ campaignId: C, name: 'A', role: 'pc' }), await addCharacter({ campaignId: C, name: 'B', role: 'pc' })]
    await adjustPurse(C, STASH, 1001)
    expect(await transferCoins(C, STASH, characterOwner(a.id), 5000)).toBe(1001)
    await transferCoins(C, characterOwner(a.id), STASH, 1001)
    expect(await splitPurse(C, STASH, [characterOwner(a.id), characterOwner(b.id)])).toEqual({ each: 500, remainder: 1 })
    expect([await purseOf(C, STASH), await purseOf(C, characterOwner(a.id)), await purseOf(C, characterOwner(b.id))]).toEqual([1, 500, 500])
    await adjustPurse(C, STASH, -50)
    expect(await purseOf(C, STASH)).toBe(0)
  })
})

describe('wealth', () => {
  it('counts the baseline and awards since it, and drops undone awards', async () => {
    await updateCampaignRules(C, { advancement: 'milestone', startingTreasure: 10000, baselineAt: '2000-01-01T00:00:00.000Z' })
    await awardTreasure(C, { value: 5000, consumables: 1000 }, 'Reward')
    const party = { level: 2, size: 4, xps: [] }
    const first = await loadWealth(C, party)
    expect(first.readout?.awarded).toBe(15000)
    expect(first.sinceBaseline).toEqual({ encounters: 0, manual: 5000, count: 1 })
    expect(first.pace?.awarded).toBe(5000)
    const award = (await ledgerOf(C)).find(l => l.kind === 'treasureAward')
    await undoTreasureAward(award?.id ?? '')
    expect((await loadWealth(C, party)).readout?.awarded).toBe(10000)
    expect((await loadWealth(C, { level: null, size: 0, xps: [] })).readout).toBeNull()
  })
})
