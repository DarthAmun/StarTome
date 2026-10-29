import { describe, expect, it } from 'vitest'
import { coinCount, effective, encumbrance, entryBulk, entryValue, parseOwner, partyTotals, planMove, splitCoins, toPlayerView, type InventoryEntry } from '~/rules/inventory'
import { parseMoney } from '~/rules/format'
import type { Item } from '~/types/rules'
import { stripGmOnly } from '~/utils/gmContent'

function entry(over: Partial<InventoryEntry> = {}): InventoryEntry {
  return {
    id: 1, owner: 'stash', itemId: 'ring', quantity: 1, nameOverride: null, priceOverride: null, bulkOverride: null,
    notes: '', identified: true, playerName: null, playerDescription: null, runes: null, grade: null, ...over,
  }
}

const ring = {
  name: 'Ring of Wizardry', price: { cp: 36000 }, bulk: 0, level: 7, rarity: 'uncommon', traits: ['arcane', 'invested', 'magical'],
  category: 'equipment', description: 'Grants extra spell slots.\n\n> [!hidden]\n> Cursed by Nualia.',
} as unknown as Item
const arrows = { name: 'Arrows', price: { cp: 10 }, priceFor: 10, bulk: 1, level: 0, rarity: 'common', traits: [], category: 'ammunition', description: '' } as unknown as Item

describe('inventory rules', () => {
  it('parses owners', () => {
    expect(parseOwner('stash')).toEqual({ kind: 'stash', id: null })
    expect(parseOwner('character:4')).toEqual({ kind: 'character', id: 4 })
    expect(parseOwner('encounter:12')).toEqual({ kind: 'encounter', id: 12 })
  })

  it('inherits from the linked item unless overridden', () => {
    expect(effective(entry(), ring)).toMatchObject({ name: 'Ring of Wizardry', unitPrice: 36000, level: 7 })
    expect(effective(entry({ nameOverride: 'Grandma\'s ring', priceOverride: 500 }), ring)).toMatchObject({ name: 'Grandma\'s ring', unitPrice: 500 })
    expect(effective(entry({ itemId: null, nameOverride: 'Rope' }), undefined)).toMatchObject({ name: 'Rope', unitPrice: null, bulk: 0 })
  })

  it('prices and weighs batched ammunition per batch', () => {
    expect(entryValue(entry({ itemId: 'arrows', quantity: 30 }), arrows)).toBe(30)
    expect(entryBulk(entry({ itemId: 'arrows', quantity: 25 }), arrows)).toBe(3)
  })

  it('plans moves: whole stack, split, or nothing', () => {
    const e = { id: 3, owner: 'stash', quantity: 5 }
    expect(planMove(e, 'stash')).toEqual({ type: 'none' })
    expect(planMove(e, 'character:1')).toEqual({ type: 'reassign', entryId: 3, to: 'character:1' })
    expect(planMove(e, 'character:1', 9)).toEqual({ type: 'reassign', entryId: 3, to: 'character:1' })
    expect(planMove(e, 'character:1', 2)).toEqual({ type: 'split', entryId: 3, to: 'character:1', quantity: 2, remaining: 3 })
    expect(planMove(e, 'character:1', 0)).toEqual({ type: 'none' })
  })

  it('splits coins evenly and keeps the remainder', () => {
    expect(splitCoins(1003, 4)).toEqual({ each: 250, remainder: 3 })
    expect(splitCoins(5, 0)).toEqual({ each: 0, remainder: 5 })
  })

  it('counts coins and Bulk', () => {
    expect(coinCount(12_345)).toBe(123 + 4 + 5)
    expect(encumbrance(65, 1)).toBe('ok')
    expect(encumbrance(70, 1)).toBe('encumbered')
    expect(encumbrance(120, 1)).toBe('overloaded')
    expect(encumbrance(120, null)).toBeNull()
  })

  it('parses typed money for both games', () => {
    expect(parseMoney('12 gp 5 sp')).toBe(1250)
    expect(parseMoney('12gp5sp')).toBe(1250)
    expect(parseMoney('1,500')).toBe(150_000)
    expect(parseMoney('2 pp 3 cp')).toBe(2003)
    expect(parseMoney('250', 'sf2e')).toBe(2500)
    expect(parseMoney('250 cr', 'sf2e')).toBe(2500)
    expect(parseMoney('lots')).toBeNull()
    expect(parseMoney('5 gp and change')).toBeNull()
  })
})

describe('toPlayerView', () => {
  it('shows the identified item without GM text', () => {
    const v = toPlayerView(entry({ quantity: 2, notes: 'Bought in Sandpoint.\n\n> [!hidden]\n> Stolen.' }), ring, stripGmOnly)
    expect(v).toMatchObject({ name: 'Ring of Wizardry', identified: true, price: 72000, level: 7, rarity: 'uncommon' })
    expect(v.description).toContain('Grants extra spell slots.')
    expect(v.description).toContain('Bought in Sandpoint.')
    expect(v.description).not.toMatch(/Nualia|Stolen/)
  })

  it('leaks nothing of an unidentified item', () => {
    const v = toPlayerView(entry({ identified: false, notes: 'Ring of Wizardry, cursed', playerName: 'Silver ring', playerDescription: 'Warm to the touch.\n\n> [!hidden]\n> It is a Ring of Wizardry.' }), ring, stripGmOnly)
    expect(v).toEqual({
      name: 'Silver ring', quantity: 1, identified: false, description: 'Warm to the touch.', bulk: 0,
      price: null, level: null, rarity: null, traits: [], runes: null, grade: null,
    })
    expect(JSON.stringify(v)).not.toMatch(/Wizardry|36000|360|magical|invested|Nualia|cursed/)
  })

  it('falls back to the definition, then to a category name', () => {
    const withDefault = { ...ring, unidentified: { name: 'Plain band', description: 'A simple ring.' } } as Item
    expect(toPlayerView(entry({ identified: false }), withDefault, stripGmOnly)).toMatchObject({ name: 'Plain band', description: 'A simple ring.' })
    expect(toPlayerView(entry({ identified: false }), ring, stripGmOnly).name).toBe('Unidentified item')
    expect(toPlayerView(entry({ identified: false, itemId: 'arrows' }), arrows, stripGmOnly).name).toBe('Unidentified ammunition')
  })
})

describe('partyTotals', () => {
  const items = new Map<string, Item>([['ring', ring], ['arrows', arrows]])
  const entries = [
    entry({ id: 1, owner: 'stash', identified: false }),
    entry({ id: 2, owner: 'character:1', itemId: 'arrows', quantity: 20 }),
    entry({ id: 3, owner: 'character:1', itemId: null, nameOverride: 'Heirloom' }),
    entry({ id: 4, owner: 'encounter:9' }),
  ]
  const purses = [{ owner: 'stash', cp: 1000 }, { owner: 'character:1', cp: 250 }]

  it('GM view counts true values and leaves encounter loot out of the party sum', () => {
    const t = partyTotals(entries, items, purses, 'gm')
    expect(t.items).toBe(36000 + 20)
    expect(t.coins).toBe(1250)
    expect(t.total).toBe(37270)
    expect(t.byOwner['character:1']).toMatchObject({ items: 20, coins: 250, unknownPrices: 1 })
    expect(t.byOwner['encounter:9'].items).toBe(36000)
  })

  it('player view counts unidentified items as 0', () => {
    const t = partyTotals(entries, items, purses, 'player')
    expect(t.items).toBe(20)
    expect(t.byOwner.stash).toMatchObject({ items: 0, unknownPrices: 0 })
  })

  it('weighs coins in PF2e only', () => {
    const heavy = [{ owner: 'stash', cp: 200_000 }]
    expect(partyTotals([], items, heavy, 'gm', true).byOwner.stash.bulk).toBe(20)
    expect(partyTotals([], items, heavy, 'gm', false).byOwner.stash.bulk).toBe(0)
  })
})
