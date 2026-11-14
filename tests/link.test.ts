import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMockServer } from '../scripts/playbuddy-mock.mjs'
import { StarTomeDb, getDb, useDbForTests } from '@/data/db'
import { createEncounter, addCombatant } from '@/data/encounters'
import { addEntry, adjustPurse, inventory, purseOf, toStack } from '@/data/inventory'
import { outbox } from '@/data/link'
import { addCharacter, ledgerOf, removeCharacter, updateCharacter } from '@/data/party'
import { createCampaign, getRow } from '@/data/repo'
import { crewSkill } from '@/domain/rules/playerStarship'
import { characterOwner, STASH } from '@/domain/rules/inventory'
import type { Character } from '@/domain/schema'
import { givenItem, itemRefOf, readShareFile, rollLine, rulesIdOfRef, sheetFromWire, slugify } from '@/services/characterLink/convert'
import * as pb from '@/services/characterLink/link'

/** Polls until the check passes (the live loop runs in the background). */
async function until(check: () => Promise<boolean> | boolean, ms = 4000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return
    await new Promise(r => setTimeout(r, 25))
  }
  throw new Error('timed out')
}

describe('converters', () => {
  it('turn compendium ids into refs and back, per system', () => {
    expect(slugify('Healing Potion (Minor)')).toBe('healing-potion-minor')
    expect(itemRefOf('fvtt:pf2e:equipment-srd:X9Ps', 'Longsword')).toEqual({ slug: 'longsword', foundryId: 'X9Ps', pack: 'equipment-srd' })
    expect(itemRefOf('fvtt:sf2e:equipment:qIgc', 'Laser Pistol')).toMatchObject({ system: 'sf2e' })
    expect(itemRefOf('0190-homebrew', 'Odd Thing')).toBeUndefined()
    expect(rulesIdOfRef({ slug: 'x', foundryId: 'A', pack: 'equipment', system: 'sf2e' })).toBe('fvtt:sf2e:equipment:A')
    expect(rulesIdOfRef({ slug: 'longsword' })).toBeNull()
  })

  it('read a sheet into the mirror, with money in cp and Bulk in tenths', () => {
    const parts = sheetFromWire('c1', '2026-11-14T10:00:00Z', {
      basic: { name: 'Tarkus', level: 3, ancestry: 'Vesk', class: 'Soldier', class2: 'Envoy', hp: { current: 40, max: 52, temp: 3 }, conditions: [{ id: 'frightened', name: 'Frightened', value: 2 }], heroPoints: 2 },
      skills: { attributes: { str: 4, dex: 1, con: 3, int: 0, wis: 1, cha: 0 }, skills: { piloting: 6 }, classDc: 20, attacks: { ranged: 10 } },
      inventory: { coins: 1200, bulk: 31, invested: 2, items: [{ entryId: 'i1', ref: { slug: 'laser-pistol', foundryId: 'q', pack: 'equipment', system: 'sf2e' }, facts: { name: 'Laser Pistol', type: 'weapon', level: 0, price: 300, priceFor: 1, bulk: 1, rarity: 'common', traits: [] }, quantity: 1, identified: true, grade: 'tactical', implanted: true, attachments: [{ entryId: 'a1', kind: 'installed', facts: { name: 'Bayonet', type: 'weapon', level: 0, price: 50, priceFor: 1, bulk: 1, rarity: 'common', traits: [] }, identified: false }] }] },
    })
    expect(parts.blocks.basic).toMatchObject({ className: 'Soldier / Envoy', hp: { value: 40, max: 52, temp: 3 }, conditions: [{ slug: 'frightened', value: 2 }], heroPoints: 2 })
    expect(parts.blocks.skills).toMatchObject({ strMod: 4, classDc: 20, rangedAttack: 10, meleeAttack: null })
    expect(parts.blocks.inventory).toEqual({ coinsCp: 1200, bulkTenths: 31, investedCount: 2 })
    expect(parts.items?.[0]).toMatchObject({ rulesId: 'fvtt:sf2e:equipment:q', grade: 'tactical', implanted: true, attachments: [{ kind: 'installed', identified: false, price: 50 }] })
    // A crew member's shared skill beats the one entered by hand
    expect(crewSkill({ skills: { piloting: 2 }, link: { mirror: parts.blocks } }, 'Piloting')).toBe(6)
    expect(crewSkill({ skills: { computers: 5 }, link: { mirror: parts.blocks } }, 'Computers')).toBe(5)
  })

  it('send a stack with its facts, and hide what is on an unidentified item', () => {
    const stack = { ...toStackOf('Glowing blade'), identified: false, playerName: 'Strange sword', priceOverride: 9000, relic: { aspects: ['fire'] } }
    const rune = { ...toStackOf('Odd rune'), attachKind: 'rune' as const }
    const g = givenItem(stack, undefined, [{ entry: rune, item: undefined }])
    expect(g).toMatchObject({ facts: { name: 'Glowing blade', price: 9000, type: 'gear' }, identified: false, unidentifiedName: 'Strange sword', relic: { aspects: ['fire'] }, attachments: [{ kind: 'rune', identified: false }] })
    expect(g.ref).toBeUndefined()
  })

  it('tell a share file from other JSON, and a roll in words', () => {
    expect(readShareFile('{"format":"playbuddy-share","formatVersion":2,"exportedAt":"x","sheet":{"characterId":"c","at":"x"}}')?.sheet.characterId).toBe('c')
    expect(readShareFile('{"format":"playbuddy-share","formatVersion":1,"status":{}}')).toBeNull()
    expect(readShareFile('not json')).toBeNull()
    expect(rollLine({ label: 'Athletics', total: 23, dc: 20, degree: 'criticalSuccess', secret: true })).toBe('Athletics: 23 vs DC 20 — critical success (secret)')
  })
})

function toStackOf(name: string) {
  return { id: name, owner: STASH, itemId: null, quantity: 1, nameOverride: name, priceOverride: null, bulkOverride: null, notes: '', identified: true, playerName: null, playerDescription: null, runes: null, grade: null, containerId: null }
}

describe('the link against the mock server', () => {
  let mock: { url: string; close: () => Promise<void> }
  let n = 0
  const C = 'camp-1'
  const control = (path: string, body: unknown) => fetch(`${mock.url}${path}`, { method: 'POST', body: JSON.stringify(body) })
  const answer = (remoteId: string | null, body: unknown) => control(`/mock/messages/${remoteId}/answer`, body)
  const character = async (id: string) => (await getRow('characters', id)) as Character
  const stacksOf = async (owner: string) => (await inventory.ofCampaign(C)).filter(r => r.ownerKey === owner)
  const rows = () => outbox.ofCampaign(C)

  beforeAll(async () => { mock = await createMockServer({ port: 0, manual: true }) })
  afterAll(() => mock.close())
  afterEach(() => pb.stopLive())
  beforeEach(async () => {
    useDbForTests(new StarTomeDb(`link-${++n}`))
    await control('/mock/reset', {})
    await createCampaign({ id: C, name: 'Codex', description: '', game: 'pf2e' })
    expect(await pb.connect(Number(new URL(mock.url).port), '123 456', 'test')).toBe(true)
  })

  async function setup() {
    const groknar = await addCharacter({ campaignId: C, name: 'Groknar', role: 'pc', level: 6 })
    const ruby = await addEntry({ campaignId: C, owner: STASH, name: 'Ruby', quantity: 3, priceOverride: 5000 })
    await adjustPurse(C, STASH, 10_000)
    await pb.linkCampaign(C)
    pb.stopLive()
    await pb.linkCharacter(groknar.id, pb.link.game!.players.find(p => p.playerId === 'p_carl')!)
    return { id: groknar.id, ruby, owner: characterOwner(groknar.id) }
  }

  it('refuses a wrong code and reports health', async () => {
    await pb.disconnect()
    expect(await pb.connect(Number(new URL(mock.url).port), '000000', 'test')).toBe(false)
    expect(pb.link.error).toMatch(/code/)
    expect(pb.paired()).toBe(false)
    expect(await pb.refreshHealth()).toMatchObject({ ok: false, reason: 'unauthorized' })
  })

  it('pairs, links and mirrors what the player shares', async () => {
    const { id, owner } = await setup()
    expect(pb.link.game).toMatchObject({ system: 'pf2e', players: [{ name: 'Carl', characterName: 'Groknar', level: 7 }, { name: 'Mira' }] })
    const c = await character(id)
    expect(c).toMatchObject({ level: 7, strMod: 4, link: { playerId: 'p_carl', characterId: 'c_groknar' } })
    expect(c.link?.mirror).toMatchObject({ defenses: { ac: 25, fort: 16 }, basic: { hp: { value: 98, max: 112 }, heroPoints: 1 }, skills: { skills: { athletics: 16 } } })
    // Not in this compendium, so the app's own name, price and Bulk stay; runes hang on their sword
    const mine = await stacksOf(owner)
    const sword = mine.find(r => r.nameOverride === 'Longsword')!
    expect(sword).toMatchObject({ quantity: 1, link: { remoteEntryId: 'i1' }, bulkOverride: 10, runes: { potency: 1, striking: 1 } })
    expect(mine.filter(r => r.attachedTo === sword.id).map(r => r.nameOverride).sort()).toEqual(['Striking', 'Weapon Potency (+1)'])
    expect(mine.find(r => r.nameOverride === 'Healing Potion (Minor)')).toMatchObject({ quantity: 2, priceOverride: 400 })
    expect(await purseOf(C, owner)).toBe(41_260)
    expect((await getRow('campaigns', C))?.characterLink).toMatchObject({ provider: 'playbuddy', gameName: 'The Codex' })
  })

  it('follows HP, conditions and what a player stops sharing', async () => {
    const { id } = await setup()
    await pb.startLive(C)
    await control('/mock/hp', { playerId: 'p_carl', current: 40, conditions: [{ id: 'dying', name: 'Dying', value: 1 }] })
    await until(async () => (await character(id)).link?.mirror?.basic?.hp.value === 40)
    expect((await character(id)).link?.mirror?.basic?.conditions).toEqual([{ slug: 'dying', name: 'Dying', value: 1 }])
    await control('/mock/shares', { playerId: 'p_carl', shares: ['basic'] })
    await until(async () => !(await character(id)).link?.mirror?.defenses)
    expect((await character(id)).link?.mirror?.basic?.name).toBe('Groknar')
    expect(pb.link.game?.players[0]?.shares).toEqual(['basic'])
  })

  it('awards hero points, which the player\'s app lets through and keeps at 3', async () => {
    const { id } = await setup()
    await pb.startLive(C)
    expect(await pb.heroPointsForAll(C)).toBe(1)
    await until(async () => (await character(id)).link?.mirror?.basic?.heroPoints === 2)
    await pb.offerHeroPoints(await character(id), 5, 'Saved the town')
    await until(async () => (await character(id)).link?.mirror?.basic?.heroPoints === 3)
    expect((await rows()).map(r => [r.summary, r.state]).reverse()).toEqual([['1 hero point → Groknar', 'accepted'], ['5 hero points → Groknar', 'accepted']])
  })

  it('offers loot, keeps it in the stash until accepted, then takes it out', async () => {
    const { id, ruby, owner } = await setup()
    const entry = toStack((await getRow('inventory', ruby))!)
    await pb.offerItems(await character(id), [{ entry, item: undefined, quantity: 2, attached: [] }])
    const [row] = await rows()
    expect(row).toMatchObject({ kind: 'items', state: 'delivered', summary: '2× Ruby → Groknar' })
    expect((await getRow('inventory', ruby))?.link).toMatchObject({ offerId: row!.id })

    await pb.startLive(C)
    await answer(row!.remoteId, { state: 'accepted' })
    await until(async () => (await outbox.get(row!.id))?.state === 'accepted')
    expect(await getRow('inventory', ruby)).toMatchObject({ quantity: 1, link: null })
    await until(async () => (await stacksOf(owner)).some(r => r.nameOverride === 'Ruby' && r.quantity === 2))
  })

  it('frees a withdrawn gift, refunds declined coins and puts returned items in the stash', async () => {
    const { id, ruby } = await setup()
    await pb.offerItems(await character(id), [{ entry: toStack((await getRow('inventory', ruby))!), item: undefined, quantity: 3, attached: [] }])
    await pb.withdraw((await rows())[0]!)
    expect(await getRow('inventory', ruby)).toMatchObject({ quantity: 3, link: null })
    expect((await rows())[0]).toMatchObject({ state: 'withdrawn' })

    await pb.offerCoins(await character(id), 2500, '25 gp')
    expect(await purseOf(C, STASH)).toBe(7500)
    const coins = (await rows()).find(r => r.kind === 'coins')!
    await pb.startLive(C)
    await answer(coins.remoteId, { state: 'declined', reason: 'Too much' })
    await until(async () => (await purseOf(C, STASH)) === 10_000)
    expect(await outbox.get(coins.id)).toMatchObject({ state: 'declined', reason: 'Too much' })

    await control('/mock/return', { playerId: 'p_carl', entryId: 'i2', note: 'Spare' })
    await until(async () => (await stacksOf(STASH)).some(r => r.nameOverride === 'Healing Potion (Minor)' && r.quantity === 2))
    await pb.clearAnswered(C)
    expect(await rows()).toEqual([])
  })

  it('keeps a message in the outbox while Play Buddy is away, and catches up on answers given meanwhile', async () => {
    const { id } = await setup()
    const realPort = pb.link.port
    pb.link.port = 1
    await pb.offerHeroPoints(await character(id), 1)
    expect((await rows())[0]).toMatchObject({ state: 'outbox', remoteId: null })
    pb.link.port = realPort
    await control('/mock/online', { playerId: 'p_carl', online: false })
    await pb.startLive(C)
    await until(async () => (await rows())[0]?.state === 'queued')
    pb.stopLive()
    // Answered while nobody listens: the next start asks for it
    await control('/mock/online', { playerId: 'p_carl', online: true })
    await answer((await rows())[0]!.remoteId, { state: 'accepted' })
    await pb.startLive(C)
    await until(async () => (await rows())[0]?.state === 'accepted')
  })

  describe('level-ups', () => {
    async function levelSetup() {
      const ctx = await setup()
      const kib = await addCharacter({ campaignId: C, name: 'Kib', role: 'pc', level: 7 })
      const c = await getDb().rows('campaigns').get(C)
      await getDb().rows('campaigns').put({ ...c!, rules: { ...c!.rules, advancement: 'xp' } })
      await updateCharacter(ctx.id, { xp: 1200 })
      await updateCharacter(kib.id, { xp: 1100 })
      const change = async () => { const l = (await ledgerOf(C)).find(x => x.kind === 'levelUp'); return l?.kind === 'levelUp' ? l.changes.find(ch => ch.characterId === ctx.id) : undefined }
      return { ...ctx, kibId: kib.id, change }
    }

    it('level unlinked characters at once and linked ones when the player accepts', async () => {
      const { id, kibId, change } = await levelSetup()
      const entry = (await pb.levelUpParty(C, [id, kibId]))!
      expect(await character(kibId)).toMatchObject({ level: 8, xp: 100 })
      // XP is paid now, the level waits
      expect(await character(id)).toMatchObject({ level: 7, xp: 200 })
      const [row] = await rows()
      expect(row).toMatchObject({ ledgerId: entry.id, summary: 'Level 8 → Groknar', state: 'delivered' })
      expect(await change()).toMatchObject({ offer: { state: 'pending', outboxId: row!.id } })
      // A second level-up while one is waiting leaves Groknar out
      expect(await pb.levelUpParty(C, [id])).toBeNull()

      await pb.startLive(C)
      await answer(row!.remoteId, { state: 'accepted' })
      await until(async () => (await character(id)).level === 8)
      await until(async () => (await change())?.offer?.state === 'accepted')
      expect((await character(id)).xp).toBe(200)
    })

    it('refund the XP when the player declines', async () => {
      const { id, change } = await levelSetup()
      await pb.levelUpParty(C, [id])
      await pb.startLive(C)
      await answer((await rows())[0]!.remoteId, { state: 'declined', reason: 'Not yet' })
      await until(async () => (await character(id)).xp === 1200)
      expect(await character(id)).toMatchObject({ level: 7 })
      expect((await change())?.offer?.state).toBe('declined')
    })

    it('undo withdraws a pending offer and reverts unlinked characters', async () => {
      const { id, kibId, change } = await levelSetup()
      const entry = (await pb.levelUpParty(C, [id, kibId]))!
      await pb.undoPartyLevelUp(entry.id)
      expect(await character(kibId)).toMatchObject({ level: 7, xp: 1100 })
      expect(await character(id)).toMatchObject({ level: 7, xp: 1200 })
      expect((await rows())[0]).toMatchObject({ state: 'withdrawn' })
      expect((await change())?.offer?.state).toBe('withdrawn')
    })
  })

  it('writes nothing for a character removed while its sheet was on the way', async () => {
    const { id, owner } = await setup()
    const slow = pb.refreshAll(C)
    await removeCharacter(id)
    await slow
    expect(await stacksOf(owner)).toEqual([])
  })

  it('puts requested initiative into the encounter, keeps the roll, and sends damage', async () => {
    const { id } = await setup()
    const enc = await createEncounter(C, 'Ambush')
    const token = await addCombatant(enc.id, { x: 0, y: 0, ref: { kind: 'character', characterId: id } })
    expect(await pb.requestInitiative(enc.id, [await character(id)])).toBe(1)
    const [row] = await rows()
    await pb.startLive(C)
    await answer(row!.remoteId, { total: 21 })
    await until(async () => (await getRow('combatants', token.id))?.initiative === 21)
    expect(await outbox.get(row!.id)).toMatchObject({ state: 'accepted', roll: { total: 21, label: 'Initiative' } })
    await until(() => pb.link.rolls.some(r => r.who === 'Groknar' && r.line === 'Initiative: 21'))

    await pb.requestRoll(await character(id), { check: 'skill:stealth', dc: 20, secret: true, label: 'Sneak past' })
    const sneak = (await rows()).find(r => r.summary.startsWith('Sneak'))!
    expect(sneak.summary).toBe('Sneak past DC 20 (secret) — Groknar')
    await answer(sneak.remoteId, { total: 31 })
    await until(async () => (await outbox.get(sneak.id))?.roll?.degree === 'criticalSuccess')

    await pb.requestDamage(await character(id), { damage: [{ amount: 10, type: 'fire' }], conditions: [{ id: 'prone' }] })
    const dmg = (await rows()).find(r => r.kind === 'damage')!
    expect(dmg.summary).toBe('10 fire, prone → Groknar')
    await answer(dmg.remoteId, {})
    await until(async () => (await character(id)).link?.mirror?.basic?.hp.value === 88)
    expect((await character(id)).link?.mirror?.basic?.conditions.map(c => c.slug)).toEqual(['prone'])

    // Healing travels the same way; a message with nothing in it is not sent
    await pb.requestDamage(await character(id), { damage: [], conditions: [], healing: 7 })
    await pb.requestDamage(await character(id), { damage: [], conditions: [] })
    const heals = (await rows()).filter(r => r.kind === 'damage' && r.id !== dmg.id)
    expect(heals.map(r => r.summary)).toEqual(['7 healing → Groknar'])
    await answer(heals[0]!.remoteId, {})
    await until(async () => (await character(id)).link?.mirror?.basic?.hp.value === 95)
  })

  it('gives an unidentified item under its player name and reveals it later', async () => {
    const { id, owner } = await setup()
    const blade = await addEntry({ campaignId: C, owner: STASH, name: 'Flametongue', identified: false })
    const entry = { ...toStack((await getRow('inventory', blade))!), playerName: 'Warm sword' }
    await pb.startLive(C)
    await pb.offerItems(await character(id), [{ entry, item: undefined, quantity: 1, attached: [] }])
    expect((await rows())[0]?.summary).toBe('Warm sword → Groknar')
    await answer((await rows())[0]!.remoteId, { state: 'accepted' })
    const mine = async () => (await stacksOf(owner)).find(r => r.link?.remoteEntryId === 'i3')
    await until(async () => !!(await mine()))
    expect(await mine()).toMatchObject({ nameOverride: 'Warm sword', identified: false, playerName: 'Warm sword' })
    await pb.identify(await character(id), 'i3', 'Flametongue')
    await until(async () => (await mine())?.identified === true)
    expect(await mine()).toMatchObject({ nameOverride: 'Flametongue' })
  })

  it('imports a share file: read-only for a linked character, plain stacks for an unlinked one', async () => {
    const kib = await addCharacter({ campaignId: C, name: 'Kib', role: 'pc', level: 2 })
    const file = JSON.stringify({ format: 'playbuddy-share', formatVersion: 2, exportedAt: '2026-11-14T10:00:00Z', sheet: { characterId: 'c_kib', at: '2026-11-14T10:00:00Z',
      basic: { name: 'Kib', level: 5, ancestry: 'Goblin', class: 'Rogue', hp: { current: 50, max: 60, temp: 0 }, conditions: [], heroPoints: 1 },
      inventory: { coins: 777, bulk: 1, invested: 0, items: [{ entryId: 'i1', facts: { name: 'Lockpicks', type: 'gear', level: 0, price: 300, priceFor: 1, bulk: 1, rarity: 'common', traits: [] }, quantity: 1, identified: true }] } } })
    expect(await pb.importShareFile(kib.id, '{}')).toMatch(/not a Play Buddy share file/)
    expect(await pb.importShareFile(kib.id, file)).toBeNull()
    expect(await character(kib.id)).toMatchObject({ level: 5, link: null })
    expect(await stacksOf(characterOwner(kib.id))).toMatchObject([{ nameOverride: 'Lockpicks', link: null }])
    expect(await purseOf(C, characterOwner(kib.id))).toBe(777)
  })

  it('unlinking keeps the last known items as ordinary stacks', async () => {
    const { id, owner } = await setup()
    await pb.unlinkCampaign(C)
    expect(await character(id)).toMatchObject({ link: null, level: 7 })
    expect((await stacksOf(owner)).every(r => r.link === null)).toBe(true)
    expect((await getRow('campaigns', C))?.characterLink).toBeNull()
  })
})

describe('a Starfinder game', () => {
  it('reports its system, Starfinder skills, grades and implants', async () => {
    const mock = await createMockServer({ port: 0, manual: true, system: 'sf2e' })
    try {
      useDbForTests(new StarTomeDb('link-sf'))
      await createCampaign({ id: 'sf', name: 'Tech Core', description: '', game: 'sf2e' })
      await pb.connect(Number(new URL(mock.url).port), '123456', 'test')
      const tarkus = await addCharacter({ campaignId: 'sf', name: 'Tarkus', role: 'pc' })
      await pb.linkCampaign('sf')
      pb.stopLive()
      expect(pb.link.game?.system).toBe('sf2e')
      await pb.linkCharacter(tarkus.id, pb.link.game!.players[0]!)
      const c = (await getRow('characters', tarkus.id))!
      expect(crewSkill(c, 'Piloting')).toBe(6)
      expect(crewSkill(c, 'Perception')).toBe(8)
      expect(c.link?.mirror?.skills).toMatchObject({ classDc: 20, rangedAttack: 10 })
      const mine = (await inventory.ofCampaign('sf')).filter(r => r.ownerKey === characterOwner(tarkus.id))
      expect(mine.find(r => r.nameOverride === 'Laser Pistol')).toMatchObject({ grade: 'tactical' })
      expect(mine.find(r => r.nameOverride === 'Dermal Plating')).toMatchObject({ implanted: true })
    } finally { pb.stopLive(); await mock.close() }
  })
})
