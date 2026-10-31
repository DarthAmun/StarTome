import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMockServer } from '../scripts/playbuddy-mock.mjs'
import {
  coinsToCp, cpToCoins, itemRefOf, offerItemToWire, readShareFile, runesFromWire, runesToWire, slugify, stackFromEntry, statusFromWire,
} from '~/partylink/convert'
import { LinkError, type LinkEvent, type PartyLink } from '~/partylink/port'
import { createPlayBuddyLink, pair } from '~/partylink/playbuddy'
import type * as W from '~/partylink/wire/v1'
import type { InventoryEntry } from '~/rules/inventory'
import type { Item } from '~/types/rules'

const resolve = (ref: W.ItemRef) => (ref.foundryId && ref.pack ? `fvtt:pf2e:${ref.pack}:${ref.foundryId}` : null)

describe('Play Buddy converters', () => {
  it('slugs names like Foundry and maps our ids to item refs', () => {
    expect(slugify('Healing Potion (Minor)')).toBe('healing-potion-minor')
    expect(slugify("Thieves' Toolkit")).toBe('thieves-toolkit')
    expect(itemRefOf('fvtt:pf2e:equipment-srd:abc123', 'Longsword')).toEqual({ slug: 'longsword', foundryId: 'abc123', pack: 'equipment-srd' })
    expect(itemRefOf('hb-uuid', 'Arc Rifle')).toEqual({ slug: 'arc-rifle' })
  })

  it('converts coins and runes both ways', () => {
    expect(coinsToCp({ pp: 1, gp: 2, sp: 3, cp: 4 })).toBe(1234)
    expect(cpToCoins(1234)).toEqual({ pp: 0, gp: 12, sp: 3, cp: 4 })
    const wire = [{ runeId: 'weapon-potency-2' }, { runeId: 'striking-greater' }, { runeId: 'ghost-touch' }]
    expect(runesFromWire(wire)).toEqual({ potency: 2, striking: 2, property: ['ghostTouch'] })
    expect(runesToWire({ potency: 2, striking: 2, property: ['ghostTouch'] }, false)).toEqual(wire)
    expect(runesToWire({ potency: 1, resilient: 1, property: [] }, true)).toEqual([{ runeId: 'armor-potency-1' }, { runeId: 'resilient' }])
  })

  it('reads a status into our vocabulary', () => {
    const m = statusFromWire({
      playerId: 'p', characterId: 'c', at: 'now', notShared: ['skills'],
      basic: { name: 'G', level: 7, ancestry: 'Orc', class: 'Magus', class2: 'Psychic', hp: { current: 10, max: 20, temp: 3 }, conditions: [{ id: 'frightened', name: 'Frightened', value: 2 }] },
      defenses: { ac: 25, saves: { fortitude: 16, reflex: 13, will: 14 }, perception: 13, speeds: { land: 25 } },
      inventory: { coins: { pp: 0, gp: 5, sp: 0, cp: 0 }, bulk: { carried: 1.1, encumberedAt: 9, limit: 14 }, invested: { count: 1, limit: 10 }, items: [
        { entryId: 'i1', ref: { slug: 'longsword', foundryId: 'X', pack: 'equipment-srd' }, custom: false, name: 'Longsword', quantity: 1, level: 0, rarity: 'common', type: 'weapon', price: 100, priceFor: 1, bulk: 1, location: 'held', identified: true },
      ] },
    }, resolve)
    expect(m.basic).toMatchObject({ className: 'Magus / Psychic', hp: { value: 10, max: 20, temp: 3 }, conditions: [{ slug: 'frightened', value: 2 }] })
    expect(m.defenses).toEqual({ ac: 25, fort: 16, ref: 13, will: 14, perception: 13, speed: 25 })
    expect(m.inventory).toMatchObject({ coinsCp: 500, bulkTenths: 11, items: [{ rulesId: 'fvtt:pf2e:equipment-srd:X', bulk: 10 }] })
  })

  it('offers synced items by ref and homebrew or unidentified items with what the player may see', () => {
    const entry: InventoryEntry = {
      id: 1, owner: 'stash', itemId: 'fvtt:pf2e:equipment-srd:abc', quantity: 1, nameOverride: null, priceOverride: null, bulkOverride: null,
      notes: 'GM only', identified: false, playerName: 'Glowing Blade', playerDescription: null, runes: { potency: 1, property: [] }, grade: null, containerId: null,
    }
    const item = { id: 'fvtt:pf2e:equipment-srd:abc', name: 'Flaming Longsword', category: 'weapon', level: 8, price: { cp: 50000 }, priceFor: 1, bulk: 10, rarity: 'common', traits: [] } as unknown as Item
    expect(offerItemToWire(stackFromEntry(entry, item))).toEqual({
      quantity: 1, ref: { slug: 'flaming-longsword', foundryId: 'abc', pack: 'equipment-srd' },
      runes: [{ runeId: 'weapon-potency-1' }], identified: false, unidentifiedName: 'Glowing Blade',
    })
    const brew = offerItemToWire(stackFromEntry({ ...entry, itemId: null, identified: true, nameOverride: 'Lucky Coin', runes: null }, undefined))
    expect(brew.definition).toMatchObject({ id: 'lucky-coin', name: 'Lucky Coin', type: 'gear', source: 'StarTome homebrew' })
    expect(brew.ref).toBeUndefined()
  })

  it('reads share files and nothing else', () => {
    expect(readShareFile('{"format":"playbuddy-share","formatVersion":1,"exportedAt":"x","status":{"playerId":""}}')?.status.playerId).toBe('')
    expect(readShareFile('{"format":"other"}')).toBeNull()
    expect(readShareFile('nope')).toBeNull()
  })
})

describe('PlayBuddyLink against the mock server', () => {
  let mock: { url: string; close: () => Promise<void> }
  let link: PartyLink
  const control = (path: string, body: unknown) => fetch(`${mock.url}${path}`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json())

  beforeAll(async () => {
    mock = await createMockServer({ port: 0, manual: true })
    await expect(pair(mock.url, '000000', 'test')).rejects.toMatchObject({ code: 'pairCodeInvalid' })
    const { token } = await pair(mock.url, '123 456', 'test')
    link = createPlayBuddyLink({ baseUrl: mock.url, token, clientId: null }, resolve)
  })
  afterAll(() => mock.close())

  it('probes, reads the game and the shared status', async () => {
    expect(await link.probe()).toMatchObject({ ok: true, apiVersion: '1.0', gameOpen: true })
    const game = await link.game()
    expect(game.players.map(p => [p.name, p.characterName, p.className])).toEqual([['Carl', 'Groknar', 'Magus / Psychic'], ['Lena', 'Mirelle', 'Cleric']])
    const [groknar, mirelle] = await link.status('all', ['basic', 'inventory'])
    expect(groknar.inventory?.items[0]).toMatchObject({ name: 'Longsword', rulesId: 'fvtt:pf2e:equipment-srd:X9Ps5cz8oIRRo4zv', runes: { potency: 1, striking: 1, property: [] } })
    expect(mirelle.notShared).toEqual(['inventory'])
    expect((await link.status(['p_lena'], ['skills']))[0].notShared).toEqual(['skills'])
  })

  it('sends offers once per key and follows them through events', async () => {
    const first = await link.sendOffer('key-1', ['p_carl'], { kind: 'levelUp', toLevel: 8 })
    const again = await link.sendOffer('key-1', ['p_carl'], { kind: 'levelUp', toLevel: 8 })
    expect(again.offerId).toBe(first.offerId)
    expect(first.deliveries).toEqual([{ playerId: 'p_carl', state: 'delivered' }])
    const { lastSeq } = await link.events(0, 0)
    const waiting = link.events(lastSeq, 5)
    await control(`/mock/offers/${first.offerId}/answer`, { playerId: 'p_carl', state: 'accepted' })
    const batch = await waiting
    expect(batch.events.map((e: LinkEvent) => e.type)).toEqual(['offer', 'status'])
    expect((await link.status(['p_carl'], ['basic']))[0].basic?.level).toBe(8)
  })

  it('maps API errors to LinkErrors', async () => {
    await expect(link.sendOffer('key-2', ['nobody'], { kind: 'coins', cp: 100 })).rejects.toBeInstanceOf(LinkError)
    const bad = createPlayBuddyLink({ baseUrl: mock.url, token: 'wrong', clientId: null }, resolve)
    await expect(bad.game()).rejects.toMatchObject({ code: 'unauthorized' })
    const gone = createPlayBuddyLink({ baseUrl: 'http://127.0.0.1:1', token: 't', clientId: null }, resolve)
    expect(await gone.probe()).toMatchObject({ ok: false, reason: 'unreachable' })
  })

  it('reports requested rolls and applies damage requests on the player side', async () => {
    const { lastSeq } = await link.events(0, 0)
    const r = await link.sendRequest('key-3', ['p_carl'], { kind: 'roll', check: 'perception', initiative: true, label: 'Initiative' })
    await control(`/mock/requests/${r.requestId}/answer`, { playerId: 'p_carl' })
    const batch = await link.events(lastSeq, 0)
    const rollEvent = batch.events.find((e: LinkEvent) => e.type === 'roll') as Extract<LinkEvent, { type: 'roll' }>
    expect(rollEvent.roll).toMatchObject({ requestId: r.requestId, kind: 'initiative', label: 'Initiative' })

    const d = await link.sendRequest('key-4', ['p_carl'], { kind: 'damage', damage: [{ amount: 12, type: 'fire' }], conditions: [{ slug: 'frightened', value: 1 }] })
    await control(`/mock/requests/${d.requestId}/answer`, { playerId: 'p_carl' })
    const after = (await link.status(['p_carl'], ['basic']))[0].basic!
    expect(after.hp.value).toBe(98 - 12)
    expect(after.conditions).toEqual([{ slug: 'frightened', name: 'Frightened', value: 1 }])
  })
})
