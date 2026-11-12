import { describe, expect, it } from 'vitest'
import { GAME_RULES } from '~/rules/registry'
import { rollSlot, rollTreasure, rowCurrency, rowSlots, type TreasureCandidate } from '~/rules/treasureRoll'
import type { ItemCategory, Rarity } from '~/types/rules'

function seeded(seed: number) {
  // mulberry32
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const row = GAME_RULES.pf2e.treasure[2] // level 3
let n = 0
const item = (level: number, category: ItemCategory, rarity: Rarity = 'common'): TreasureCandidate =>
  ({ id: `i${++n}`, name: `${category} ${level}`, level, rarity, category, price: 100 })
const candidates: TreasureCandidate[] = [2, 3, 4].flatMap(l => [
  item(l, 'weapon'), item(l, 'armor'), item(l, 'equipment'), item(l, 'consumable'), item(l, 'consumable'),
  item(l, 'weapon', 'uncommon'), item(l, 'treasure'),
])
const base = { partySize: 4, rarities: ['common'] as Rarity[], gear: ['weapons', 'armor', 'worn', 'consumables'] as const }

describe('treasure rolls', () => {
  it('rolls the whole row with its slot counts, nothing above the level', () => {
    const r = rollTreasure(row, candidates, { ...base, gear: [...base.gear], share: 1, random: seeded(1) })
    expect(r.slots).toHaveLength(rowSlots(row).length)
    expect(r.slots.filter(s => s.slot.kind === 'permanent').map(s => s.slot.level).sort()).toEqual([3, 3, 4, 4])
    for (const s of r.slots) {
      expect(s.item).not.toBeNull()
      expect(s.item!.level).toBe(s.slot.level)
      expect(s.item!.level).toBeLessThanOrEqual(4)
      expect(s.item!.rarity).toBe('common')
      expect(s.item!.category).not.toBe('treasure')
      expect(s.slot.kind === 'consumable').toBe(s.item!.category === 'consumable')
    }
    expect(r.currency).toBe(row.currency)
  })

  it('is the same roll for the same seed', () => {
    const a = rollTreasure(row, candidates, { ...base, gear: [...base.gear], share: 0.5, random: seeded(7) })
    const b = rollTreasure(row, candidates, { ...base, gear: [...base.gear], share: 0.5, random: seeded(7) })
    expect(a).toEqual(b)
    expect(a.slots).toHaveLength(Math.round(rowSlots(row).length / 2))
  })

  it('holds the filters', () => {
    const r = rollTreasure(row, candidates, { ...base, gear: ['weapons'], share: 1, random: seeded(3) })
    expect(r.slots.every(s => s.slot.kind === 'permanent' && s.item?.category === 'weapon')).toBe(true)
    const skip = new Set(candidates.filter(c => c.category === 'weapon' && c.rarity === 'common').map(c => c.id))
    expect(rollSlot({ kind: 'permanent', level: 3 }, candidates, { ...base, gear: ['weapons'], share: 1, skipIds: skip })).toBeNull()
    expect(rollSlot({ kind: 'permanent', level: 3 }, candidates, { ...base, gear: ['weapons'], share: 1, skipIds: skip, rarities: ['common', 'uncommon'] })?.rarity).toBe('uncommon')
  })

  it('adjusts currency for party size and share', () => {
    expect(rowCurrency(row, 5, 1)).toBe(row.currency + row.perExtraPc)
    expect(rowCurrency(row, 4, 0.25)).toBe(Math.round(row.currency / 4))
  })
})
