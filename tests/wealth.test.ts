import { describe, expect, it } from 'vitest'
import type { InventoryEntry } from '~/rules/inventory'
import {
  consumableShare, cumulativeExpected, gearCheck, gearPiece, levelSteps, lootValue, matchLevel,
  treasurePace, wealthReadout, xpProgress, type GearPiece,
} from '~/rules/wealth'
import type { Item } from '~/types/rules'

const entry = (p: Partial<InventoryEntry>): InventoryEntry => ({
  id: 1, owner: 'stash', itemId: null, quantity: 1, nameOverride: null, priceOverride: null, bulkOverride: null,
  notes: '', identified: true, playerName: null, playerDescription: null, runes: null, grade: null, ...p,
})
const zero = { value: 0, consumables: 0 }

describe('expected treasure', () => {
  const steps = levelSteps('pf2e', 4)

  it('sums Party Treasure by Level from level 1', () => {
    expect(steps.slice(0, 3)).toEqual([17500, 30000, 50000])
    expect(cumulativeExpected(steps, 1)).toBe(0)
    expect(cumulativeExpected(steps, 3)).toBe(47500)
    expect(cumulativeExpected(steps, 3, 0.5)).toBe(72500)
  })

  it('adjusts each level for party size', () => {
    expect(levelSteps('pf2e', 5)[0]).toBe(18500)
    expect(levelSteps('pf2e', 3)[0]).toBe(16500)
    expect(levelSteps('sf2e', 4)[0]).toBe(17500) // 1,750 cr = 17,500 cp
  })

  it('finds the level a total matches', () => {
    expect(matchLevel(steps, 0)).toEqual({ level: 1, progress: 0 })
    expect(matchLevel(steps, 47500)).toEqual({ level: 3, progress: 0 })
    expect(matchLevel(steps, 72500)).toEqual({ level: 3, progress: 0.5 })
    // Past level 20 the last row keeps counting
    const all = steps.reduce((a, b) => a + b, 0)
    expect(matchLevel(steps, all).level).toBe(20)
    expect(matchLevel(steps, all).progress).toBeCloseTo(1)
  })
})

describe('wealth readout', () => {
  it('compares the baseline plus awards with the running total', () => {
    const r = wealthReadout({
      game: 'pf2e', partyLevel: 3, progress: 0, partySize: 4,
      starting: { value: 30000, consumables: 0 }, awards: [{ value: 17500, consumables: 5000 }], countConsumables: true,
    })
    expect(r.awarded).toBe(47500)
    expect(r.expected).toBe(47500)
    expect(r.ratio).toBe(1)
    expect(r.matches).toEqual({ level: 3, progress: 0 })
    expect(r.estimate).toBe(false)
  })

  it('has no ratio at the very start', () => {
    const r = wealthReadout({ game: 'pf2e', partyLevel: 1, progress: 0, partySize: 4, starting: zero, awards: [], countConsumables: true })
    expect(r.ratio).toBeNull()
  })

  it('leaves consumables out on both sides when asked, as an estimate', () => {
    const prices = { 1: 400, 2: 700 }
    // Level 1 row: consumables 2nd ×2, 1st ×3 → 1,400 + 1,200
    expect(consumableShare('pf2e', 1, prices)).toBe(2600)
    const r = wealthReadout({
      game: 'pf2e', partyLevel: 2, progress: 0, partySize: 4,
      starting: zero, awards: [{ value: 17500, consumables: 2600 }], countConsumables: false, prices,
    })
    expect(r.awarded).toBe(14900)
    expect(r.expected).toBe(14900)
    expect(r.estimate).toBe(true)
  })
})

describe('treasure pace', () => {
  it('measures the current level only', () => {
    expect(treasurePace('pf2e', 5, 4, 67500)).toEqual({ expected: 135000, awarded: 67500, fraction: 0.5, remaining: 67500 })
    expect(treasurePace('pf2e', 1, 5, 20000).remaining).toBe(-1500)
  })
})

describe('loot value', () => {
  it('adds items and coins and splits off consumables', () => {
    const items = new Map<string, any>([
      ['potion', { name: 'Potion', price: { cp: 400 }, priceFor: 1, bulk: 1, level: 1, rarity: 'common', traits: ['consumable'], category: 'consumable' }],
      ['arrows', { name: 'Arrows', price: { cp: 10 }, priceFor: 10, bulk: 1, level: 0, rarity: 'common', traits: [], category: 'ammunition' }],
      ['sword', { name: 'Sword', price: { cp: 1500 }, priceFor: 1, bulk: 10, level: 0, rarity: 'common', traits: [], category: 'weapon' }],
    ])
    const v = lootValue([
      entry({ itemId: 'potion', quantity: 2 }),
      entry({ itemId: 'arrows', quantity: 20 }),
      entry({ itemId: 'sword' }),
      entry({ nameOverride: 'Idol', priceOverride: 1000 }),
    ], items, 500)
    expect(v).toEqual({ value: 500 + 800 + 20 + 1500 + 1000, consumables: 820 })
  })
})

describe('gear check', () => {
  const piece = (p: Partial<GearPiece>): GearPiece => ({ name: 'x', kind: 'weapon', potency: 0, fundamental: 0, grade: 0, ...p })

  it('PF2e: expects potency at 2 and striking at 4', () => {
    const [w, a] = gearCheck('pf2e', 4, [piece({ potency: 1, fundamental: 1 }), piece({ kind: 'armor' })], false)
    expect(w).toMatchObject({ status: 'ok', have: '+1 striking', expected: '+1 striking' })
    expect(a).toMatchObject({ status: 'ok', expected: 'no runes' })
  })

  it('PF2e: one short rune is behind, a missing weapon is none', () => {
    const [w, a] = gearCheck('pf2e', 8, [piece({ kind: 'armor', potency: 1 })], false)
    expect(w).toMatchObject({ status: 'none', piece: null, expected: '+1 striking' })
    expect(a).toMatchObject({ status: 'behind', expected: '+1 resilient' })
    expect(gearCheck('pf2e', 1, [piece({ potency: 1 })], false)[0].status).toBe('ahead')
  })

  it('PF2e: picks the best weapon', () => {
    const [w] = gearCheck('pf2e', 12, [piece({ name: 'dagger' }), piece({ name: 'sword', potency: 2, fundamental: 2 })], false)
    expect(w.piece?.name).toBe('sword')
    expect(w.status).toBe('ok')
  })

  it('ABP skips the rune check', () => {
    expect(gearCheck('pf2e', 10, [], true)).toEqual([])
  })

  it('SF2e: compares grades', () => {
    const [w, a] = gearCheck('sf2e', 4, [piece({ grade: 2 }), piece({ kind: 'armor', grade: 0 })], false)
    expect(w).toMatchObject({ status: 'ok', have: 'advanced', expected: 'advanced' })
    expect(a).toMatchObject({ status: 'ok', expected: 'commercial' })
    expect(gearCheck('sf2e', 5, [piece({ kind: 'armor', grade: 0 })], false)[1].status).toBe('behind')
  })

  it('reads runes and grade from the entry before the item', () => {
    const sword = { name: 'Longsword', category: 'weapon', weapon: { runes: { potency: 1, striking: 1, property: [] }, grade: 'tactical' } } as unknown as Item
    expect(gearPiece(entry({ itemId: 'x' }), sword)).toMatchObject({ kind: 'weapon', potency: 1, fundamental: 1, grade: 1 })
    expect(gearPiece(entry({ itemId: 'x', runes: { potency: 2, striking: 2, property: [] }, grade: 'elite' }), sword))
      .toMatchObject({ potency: 2, fundamental: 2, grade: 4 })
    expect(gearPiece(entry({}), { name: 'Rope', category: 'equipment' } as Item)).toBeNull()
  })
})

describe('progress', () => {
  it('averages XP toward the next level', () => {
    expect(xpProgress([])).toBe(0)
    expect(xpProgress([500, 300])).toBe(0.4)
    expect(xpProgress([1200, 1000])).toBe(0.99)
  })
})
