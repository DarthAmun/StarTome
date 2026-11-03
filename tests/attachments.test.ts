import { describe, expect, it } from 'vitest'
import {
  attachedLabel, attachKindOf, attachmentWarnings, canAttach, fundamentalOf, giftValues, hostsOf, replacedBy, runesSummary,
} from '~/rules/attachments'
import { entryBulk, entryValue, partyTotals, sameStack, type InventoryEntry } from '~/rules/inventory'
import { convertPf2oolsRelicGifts, convertTags, isPf2oolsRelicGifts } from '~/converters/pf2ools/relicGifts'
import { checkHomebrewEntry, readHomebrewText } from '~/rules/homebrew'
import type { Item } from '~/types/rules'

const item = (over: Partial<Item>) => ({ name: 'X', traits: [], category: 'equipment', price: null, bulk: 0, level: 0, rarity: 'common', ...over }) as Item

function entry(over: Partial<InventoryEntry> = {}): InventoryEntry {
  return {
    id: 1, owner: 'stash', itemId: null, quantity: 1, nameOverride: 'X', priceOverride: null, bulkOverride: null,
    notes: '', identified: true, playerName: null, playerDescription: null, runes: null, grade: null, containerId: null, ...over,
  }
}

describe('attachments', () => {
  it('reads hosts and kinds from usage and traits', () => {
    expect(hostsOf(item({ usage: 'etched onto a weapon' }))).toEqual(['weapon'])
    expect(hostsOf(item({ usage: 'affixed to armor or a weapon' }))).toEqual(['weapon', 'armor'])
    expect(hostsOf(item({ usage: 'applied to a weapon' }))).toEqual([])
    expect(attachKindOf(item({ usage: 'etched onto a weapon', traits: ['rune'] }))).toBe('rune')
    expect(attachKindOf(item({ usage: 'affixed to a shield', traits: ['talisman', 'consumable'] }))).toBe('talisman')
    expect(attachKindOf(item({ traits: ['upgrade'] }))).toBe('upgrade')
    expect(attachKindOf(item({ usage: 'held in one hand' }))).toBeNull()
    expect(canAttach(item({ usage: 'etched onto armor' }), item({ category: 'weapon' }))).toBe(false)
    expect(canAttach(item({ usage: 'etched onto armor' }), item({ category: 'armor' }))).toBe(true)
    expect(canAttach(item({ usage: 'etched onto armor' }), undefined)).toBe(true)
  })

  it('knows fundamental runes in both naming styles', () => {
    expect(fundamentalOf('Weapon Potency (+2)')).toEqual({ slot: 'weaponPotency', value: 2 })
    expect(fundamentalOf('+1 Armor Potency')).toEqual({ slot: 'armorPotency', value: 1 })
    expect(fundamentalOf('Greater Striking')).toEqual({ slot: 'striking', value: 2 })
    expect(fundamentalOf('Resilient (Major)')).toEqual({ slot: 'resilient', value: 3 })
    expect(fundamentalOf('Reinforcing Rune (Lesser)')).toEqual({ slot: 'reinforcing', value: 2 })
    expect(fundamentalOf('Flaming')).toBeNull()
  })

  it('summarises runes, labels the host and replaces a fundamental in its slot', () => {
    const attached = [
      { id: 2, name: 'Weapon Potency (+1)', kind: 'rune' as const },
      { id: 3, name: 'Striking', kind: 'rune' as const },
      { id: 4, name: 'Flaming', kind: 'rune' as const },
      { id: 5, name: 'Wolf Fang', kind: 'talisman' as const },
    ]
    expect(runesSummary(attached)).toEqual({ potency: 1, striking: 1, property: ['flaming'] })
    expect(attachedLabel(attached)).toBe('+1 striking flaming')
    expect(replacedBy(attached, { name: 'Greater Striking', kind: 'rune' })).toEqual([3])
    expect(replacedBy(attached, { name: 'Frost', kind: 'rune' })).toEqual([])
    expect(attachmentWarnings(attached, { kind: 'weapon', relic: false })).toEqual([])
    expect(attachmentWarnings([...attached, { id: 6, name: 'Frost', kind: 'rune' }], { kind: 'weapon', relic: false })[0]).toMatch(/2 property runes but potency \+1/)
  })

  it('values relic gifts by Table 2–22, dormant ones at 0', () => {
    const relic = entry({ id: 10, relic: { aspects: ['fire'] } })
    const g = (id: number, identified = true) => entry({ id, attachedTo: 10, attachKind: 'gift', identified })
    const values = giftValues([relic, g(13), g(11), g(12, false)])
    expect(values.get(11)).toBe(2_000)
    expect(values.get(13)).toBe(16_000)
    expect(values.get(12)).toBe(0)
    const dormant = { ...g(12, false), giftValue: 0, priceOverride: 99 }
    expect(entryValue(dormant)).toBe(0)
  })

  it('adds attachments to totals without Bulk, and never stacks them', () => {
    const sword = entry({ id: 1, nameOverride: 'Longsword', priceOverride: 100 })
    const rune = entry({ id: 2, nameOverride: 'Striking', priceOverride: 6_500, bulkOverride: 10, attachedTo: 1, attachKind: 'rune' })
    expect(entryBulk(rune)).toBe(0)
    expect(partyTotals([sword, rune], new Map(), [], 'gm').items).toBe(6_600)
    expect(sameStack(rune, { ...rune, id: 3 })).toBe(false)
  })
})

describe('pf2ools relic gifts', () => {
  const blazing = {
    type: 'relicGift', source: { page: 101, ID: 'GMG' }, name: { primary: 'Blazing Soul' },
    data: {
      tier: 'Grand', traits: [{ trait: 'evocation' }, { trait: 'fire' }], aspects: [{ name: 'fire' }],
      entries: [
        'You gain fire resistance 10 and regain {@damage 1d8} HP.',
        { type: 'ability', activity: { number: 1, unit: 'reaction' }, components: ['envision'], trigger: 'A creature is {@condition frightened 1}', entries: ['Deal {@damage 6d6} fire damage.'] },
      ],
      _tags: { misc: { 'Grants ability': true } },
    },
  }
  const flaming = {
    type: 'relicGift', source: { page: 584, ID: 'CRB' }, name: { primary: 'Flaming' },
    data: { tier: 'Minor', traits: [{ trait: 'fire' }], aspects: [{ name: 'fire' }], entries: ['{@note The relic gains the {@item flaming} rune.}'], _tags: { misc: { 'Is rune': true } } },
  }

  it('converts nested tags to links and rolls', () => {
    expect(convertTags('{@note gains the {@item flaming|CRB} rune}')).toBe('*gains the {{item: Flaming}} rune*')
    expect(convertTags('{@as 2} {@d20 +5} {@b Melee} {@quickref counteract|crb|3|counteracting}')).toBe('◆◆ ::dice[1d20+5] **Melee** counteracting')
    expect(convertTags('broken {@note text')).toBe('broken text')
  })

  it('reads the bundle as homebrew entries that pass the check', () => {
    const bundle = { relicGift: [blazing, flaming] }
    expect(isPf2oolsRelicGifts(bundle)).toBe(true)
    expect(isPf2oolsRelicGifts([{ kind: 'item' }])).toBe(false)
    const [b, f] = convertPf2oolsRelicGifts(bundle)
    expect(b).toMatchObject({ id: 'pf2ools:relicGift:GMG:blazing-soul', kind: 'relicGift', tier: 'grand', aspects: ['fire'], traits: ['fire'] })
    expect(b.activation).toEqual([{ cost: 'reaction', trigger: 'A creature is {{condition: Frightened}} 1', text: 'Deal ::dice[6d6] fire damage.' }])
    expect(b.description).toContain('*Source: Gamemastery Guide p. 101*')
    expect(f).toMatchObject({ tier: 'minor', grantsRune: 'Flaming' })

    const read = readHomebrewText(JSON.stringify(bundle))
    expect('entries' in read && read.entries).toHaveLength(2)
    const checked = (read as { entries: unknown[] }).entries.map((e, i) => checkHomebrewEntry(e, i, { game: 'pf2e', newId: () => 'new', now: '2026-11-03T00:00:00Z' }))
    expect(checked.flatMap(c => c.issues.filter(x => x.level === 'error'))).toEqual([])
    expect(checked[0].entry).toMatchObject({ id: 'pf2ools:relicGift:GMG:blazing-soul', publication: { title: 'Relic Gifts (pf2ools)' } })
  })
})
