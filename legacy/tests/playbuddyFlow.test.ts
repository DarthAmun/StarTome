import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createMockServer } from '../scripts/playbuddy-mock.mjs'
import { getDb } from '~/composables/useDb'
import { useInventory } from '~/composables/useInventory'
import { useParty } from '~/composables/useParty'
import { usePlayBuddy } from '~/composables/usePlayBuddy'
import { characterOwner, STASH } from '~/rules/inventory'

/** Polls until the check passes (the live loop runs in the background). */
async function until(check: () => Promise<boolean> | boolean, ms = 4000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return
    await new Promise(r => setTimeout(r, 25))
  }
  throw new Error('timed out')
}

describe('Play Buddy flow (composable + mock server)', () => {
  let mock: { url: string; close: () => Promise<void> }
  const pb = usePlayBuddy()
  const control = (path: string, body: unknown) => fetch(`${mock.url}${path}`, { method: 'POST', body: JSON.stringify(body) })

  beforeAll(async () => {
    mock = await createMockServer({ port: 0, manual: true })
    await pb.connect(Number(new URL(mock.url).port), '123456')
  })
  afterEach(() => pb.stopLive())
  afterAll(() => mock.close())

  async function setup() {
    await control('/mock/reset', {})
    const db = getDb()
    const campaignId = await db.campaigns.add({ name: 'Codex', description: '', game: 'pf2e', rules: {}, created_at: '', updated_at: '' }) as number
    const party = useParty()
    await party.load(campaignId)
    const groknarId = await party.addCharacter({ campaignId, name: 'Groknar', role: 'pc', level: 6 })
    const inv = useInventory()
    await inv.load(campaignId)
    const ruby = await inv.addEntry({ campaignId, owner: STASH, name: 'Ruby', quantity: 3, priceOverride: 5000 })
    await inv.setPurse(campaignId, STASH, 10_000)
    const player = pb.game.value!.players.find(p => p.playerId === 'p_carl')!
    await pb.linkCampaign(campaignId)
    pb.stopLive()
    await pb.linkCharacter(campaignId, groknarId, player)
    const groknar = () => party.characters.value.find(c => c.id === groknarId)!
    return { campaignId, groknarId, groknar, inv, ruby, party }
  }

  it('pairs, links and mirrors what the player shares', async () => {
    expect(pb.connected.value).toBe(true)
    const { campaignId, groknar, inv } = await setup()
    expect(groknar()).toMatchObject({ level: 7, strMod: 4, pbPlayerId: 'p_carl' })
    expect(groknar().pbStatus?.defenses?.ac).toBe(25)
    const mirror = inv.entries.value.filter(e => e.owner === characterOwner(groknar().id))
    expect(mirror.map(e => [e.itemId, e.nameOverride, e.quantity, !!e.pbEntryId])).toEqual(expect.arrayContaining([
      // Not in this compendium: matched by name, which fails too, so Play Buddy's name, price and Bulk stay
      [null, 'Longsword', 1, true],
      [null, 'Healing Potion (Minor)', 2, true],
    ]))
    expect(inv.purses.value[characterOwner(groknar().id)]).toBe(41_260)
    void campaignId
  })

  it('awards hero points, which the player app auto-accepts and caps at 3', async () => {
    const { campaignId, groknar, party } = await setup()
    expect(groknar().pbStatus?.basic?.heroPoints).toBe(1)
    await pb.startLive(campaignId)
    await pb.heroPointsForAll(campaignId, party.characters.value)
    await until(() => groknar().pbStatus?.basic?.heroPoints === 2)
    await pb.offerHeroPoint(campaignId, groknar(), 5, 'Saved the town')
    await until(() => groknar().pbStatus?.basic?.heroPoints === 3)
    const rows = await getDb().linkOffers.where('campaign_id').equals(campaignId).toArray()
    expect(rows.map(r => [r.summary, r.state])).toEqual([['1 hero point → Groknar', 'accepted'], ['5 hero points → Groknar', 'accepted']])
  })

  describe('level-ups', () => {
    async function levelSetup() {
      const ctx = await setup()
      const kibId = await ctx.party.addCharacter({ campaignId: ctx.campaignId, name: 'Kib', role: 'pc', level: 7 })
      await ctx.party.updateCharacter(ctx.groknarId, { xp: 1200 })
      await ctx.party.updateCharacter(kibId, { xp: 1100 })
      const kib = () => ctx.party.characters.value.find(c => c.id === kibId)!
      const offerRow = async () => (await getDb().linkOffers.where('campaign_id').equals(ctx.campaignId).filter(r => r.kind === 'levelUp').first())!
      return { ...ctx, kibId, kib, offerRow }
    }

    it('level unlinked characters at once and linked ones when the player accepts', async () => {
      const { campaignId, groknarId, kibId, groknar, kib, party, offerRow } = await levelSetup()
      const logId = (await party.levelUp(campaignId, [groknarId, kibId]))!
      expect(kib()).toMatchObject({ level: 8, xp: 100 })
      // XP is paid now, the level waits
      expect(groknar()).toMatchObject({ level: 7, xp: 200 })
      expect((await party.pendingLevelUps(campaignId)).get(groknarId)).toBe(8)
      const row = await offerRow()
      expect(row).toMatchObject({ level_up_id: logId, summary: 'Level 8 → Groknar', state: 'delivered' })
      // A second level-up while one is waiting skips Groknar
      expect(await party.levelUp(campaignId, [groknarId])).toBeNull()

      await pb.startLive(campaignId)
      await control(`/mock/offers/${row.remote_id}/answer`, { playerId: 'p_carl', state: 'accepted' })
      await until(() => groknar().level === 8)
      await until(() => party.levelUps.value.find(l => l.id === logId)?.changes.find(c => c.characterId === groknarId)?.offer?.state === 'accepted')
      expect(groknar().xp).toBe(200)
    })

    it('refunds the XP when the player declines', async () => {
      const { campaignId, groknarId, groknar, party, offerRow } = await levelSetup()
      await party.levelUp(campaignId, [groknarId])
      const row = await offerRow()
      await pb.startLive(campaignId)
      await control(`/mock/offers/${row.remote_id}/answer`, { playerId: 'p_carl', state: 'declined', reason: 'Not yet' })
      await until(() => groknar().xp === 1200)
      expect(groknar().level).toBe(7)
      expect((await party.pendingLevelUps(campaignId)).size).toBe(0)
    })

    it('undo withdraws a pending offer and reverts unlinked characters', async () => {
      const { campaignId, groknarId, kibId, groknar, kib, party, offerRow } = await levelSetup()
      const logId = (await party.levelUp(campaignId, [groknarId, kibId]))!
      await party.undoLevelUp(logId)
      expect(kib()).toMatchObject({ level: 7, xp: 1100 })
      expect(groknar()).toMatchObject({ level: 7, xp: 1200 })
      expect(await offerRow()).toMatchObject({ state: 'withdrawn' })
      const change = party.levelUps.value.find(l => l.id === logId)!.changes.find(c => c.characterId === groknarId)!
      expect(change.offer?.state).toBe('withdrawn')
    })
  })

  it('drops a status read that lands after the character was removed', async () => {
    const { campaignId, groknarId, party, inv } = await setup()
    const slow = pb.refreshStatus(campaignId)
    await party.removeCharacter(groknarId)
    await slow
    expect(inv.entries.value.filter(e => e.owner === characterOwner(groknarId))).toEqual([])
    expect(inv.purses.value[characterOwner(groknarId)]).toBeUndefined()
  })

  it('offers loot, keeps it in the stash until accepted, then takes it out', async () => {
    const { campaignId, groknar, inv, ruby } = await setup()
    const entry = inv.entries.value.find(e => e.id === ruby)!
    await pb.offerItems(campaignId, groknar(), [{ entry, item: undefined, quantity: 2 }])
    const row = (await getDb().linkOffers.where('campaign_id').equals(campaignId).first())!
    expect(row).toMatchObject({ kind: 'items', state: 'delivered', summary: '2× Ruby → Groknar' })
    expect(inv.entries.value.find(e => e.id === ruby)?.pbOfferId).toBe(row.id)

    await pb.startLive(campaignId)
    await control(`/mock/offers/${row.remote_id}/answer`, { playerId: 'p_carl', state: 'accepted' })
    await until(async () => (await getDb().linkOffers.get(row.id!))?.state === 'accepted')
    await until(() => inv.entries.value.find(e => e.id === ruby)?.quantity === 1)
    expect(inv.entries.value.find(e => e.id === ruby)?.pbOfferId).toBeNull()
    // The mirror shows the rubies on Groknar after the status refresh
    await until(() => inv.entries.value.some(e => e.owner === characterOwner(groknar().id) && e.nameOverride === 'Ruby'))
  })

  it('refunds declined coins and puts returned items in the stash', async () => {
    const { campaignId, groknar, inv } = await setup()
    await pb.offerCoins(campaignId, groknar(), 2500, '25 gp')
    expect(inv.purses.value[STASH]).toBe(7500)
    const row = (await getDb().linkOffers.where('campaign_id').equals(campaignId).first())!
    await pb.startLive(campaignId)
    await control(`/mock/offers/${row.remote_id}/answer`, { playerId: 'p_carl', state: 'declined', reason: 'Too much' })
    await until(() => inv.purses.value[STASH] === 10_000)
    expect((await getDb().linkOffers.get(row.id!))).toMatchObject({ state: 'declined', reason: 'Too much' })

    await control('/mock/return', { playerId: 'p_carl', entryId: 'i2', note: 'Spare' })
    await until(() => inv.entries.value.some(e => e.owner === STASH && e.nameOverride === 'Healing Potion (Minor)'))
  })

  it('puts requested initiative rolls into the encounter and sends damage to the player', async () => {
    const { campaignId, groknarId, groknar, party } = await setup()
    const db = getDb()
    const tokenId = await db.tokens.add({ name: 'Groknar', image_source: null, created_at: '' } as any) as number
    await party.linkToken(groknarId, tokenId)
    const encounterId = await db.encounters.add({ campaign_id: campaignId, name: 'Ambush', created_at: '' } as any) as number
    const placement = await db.encounterTokens.add({ encounter_id: encounterId, token_id: tokenId, initiative: null } as any) as number

    await pb.requestInitiative(campaignId, encounterId, [groknar()])
    const row = (await db.linkOffers.where('campaign_id').equals(campaignId).first())!
    await pb.startLive(campaignId)
    await control(`/mock/requests/${row.remote_id}/answer`, { playerId: 'p_carl' })
    await until(async () => (await db.encounterTokens.get(placement))?.initiative != null)
    await until(() => pb.rolls.value.some(r => r.requestId === row.remote_id))

    await pb.requestDamage(campaignId, groknar(), [{ amount: 10, type: 'fire' }], [])
    const dmg = (await db.linkOffers.where('campaign_id').equals(campaignId).filter(r => r.kind === 'damage').first())!
    expect(dmg.summary).toBe('10 fire → Groknar')
    await control(`/mock/requests/${dmg.remote_id}/answer`, { playerId: 'p_carl' })
    await until(() => groknar().pbStatus?.basic?.hp.value === 98 - 10)
  })
})
