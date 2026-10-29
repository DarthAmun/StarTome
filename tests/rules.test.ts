import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import {
  rulesCounts, rulesCreate, rulesDelete, rulesDuplicate, rulesFindByName, rulesGet, rulesGetRaw,
  rulesQuery, rulesResetEdits, rulesSearch, rulesUpdate,
} from '~/composables/useRules'
import { conflictingEdits, setPath, withLocalEdits } from '~/rules/edits'
import { newRulesEntity } from '~/rules/factory'
import { coinsToCp, formatActionCost, formatBulk, formatMoney, formatTrait, parseActionCost, parseBulk, signed } from '~/rules/format'
import { creatureXp, encounterBudget, expectedTreasure, GAME_RULES, levelTreasure, simpleHazardXp } from '~/rules/registry'
import type { Creature, Item, RulesEntity } from '~/types/rules'

describe('format', () => {
  it('formats PF2e prices in gp/sp/cp and SF2e prices in credits', () => {
    expect(formatMoney({ cp: 400 })).toBe('4 gp')
    expect(formatMoney({ cp: 150_000 })).toBe('1,500 gp')
    expect(formatMoney({ cp: 135 })).toBe('1 gp 3 sp 5 cp')
    expect(formatMoney({ cp: 300 }, 'sf2e')).toBe('30 cr')
    expect(formatMoney(null)).toBe('—')
    expect(coinsToCp({ gp: 1, sp: 5 })).toBe(150)
    expect(coinsToCp({ credits: 30 })).toBe(300)
  })

  it('formats and parses Bulk', () => {
    expect(formatBulk(0)).toBe('—')
    expect(formatBulk(1)).toBe('L')
    expect(formatBulk(10)).toBe('1')
    expect(formatBulk(21)).toBe('2, L')
    expect(formatBulk(null, 'varies by armor')).toBe('varies by armor')
    expect(parseBulk('L')).toBe(1)
    expect(parseBulk('—')).toBe(0)
    expect(parseBulk('3')).toBe(30)
    expect(parseBulk('varies')).toBeUndefined()
  })

  it('formats and parses action costs', () => {
    expect(formatActionCost(2)).toBe('◆◆')
    expect(formatActionCost('reaction')).toBe('↺')
    expect(formatActionCost({ min: 1, max: 3 })).toBe('◆ to ◆◆◆')
    expect(formatActionCost({ text: '10 minutes' })).toBe('10 minutes')
    expect(parseActionCost('two')).toBe(2)
    expect(parseActionCost('◆◆◆')).toBe(3)
    expect(parseActionCost('↺')).toBe('reaction')
    expect(parseActionCost('1 to 3')).toEqual({ min: 1, max: 3 })
    expect(parseActionCost('1 minute')).toEqual({ text: '1 minute' })
    expect(parseActionCost('')).toBeNull()
  })

  it('formats traits and modifiers', () => {
    expect(formatTrait('versatile-p')).toBe('versatile P')
    expect(formatTrait('deadly-d10')).toBe('deadly d10')
    expect(formatTrait('reach-15')).toBe('reach 15')
    expect(formatTrait('mindless')).toBe('mindless')
    expect(signed(5)).toBe('+5')
    expect(signed(-2)).toBe('−2')
  })
})

describe('treasure registry', () => {
  it('holds Party Treasure by Level for both games in cp', () => {
    expect(GAME_RULES.pf2e.treasure).toHaveLength(20)
    expect(GAME_RULES.pf2e.treasure[0]).toMatchObject({ total: 17_500, currency: 4_000, perExtraPc: 1_000 })
    expect(GAME_RULES.pf2e.treasure[19].total).toBe(49_000_000)
    // SF2e credits × 10 cp equal PF2e gp × 100 cp
    expect(GAME_RULES.sf2e.treasure.map(r => r.total)).toEqual(GAME_RULES.pf2e.treasure.map(r => r.total))
    expect(GAME_RULES.sf2e.treasure[4]).toMatchObject({ currency: 32_000, perExtraPc: 8_000 })
  })

  it('lists item counts per level', () => {
    const [l1, l5] = [GAME_RULES.sf2e.treasure[0], GAME_RULES.sf2e.treasure[4]]
    expect(l1.permanent).toEqual({ 2: 2, 1: 2 })
    expect(l1.consumables).toEqual({ 2: 2, 1: 3 })
    expect(l5.consumables).toEqual({ 6: 2, 5: 2, 4: 2 })
    expect(GAME_RULES.sf2e.treasure[19]).toMatchObject({ permanent: { 20: 4 }, consumables: { 20: 4, 19: 2 } })
  })

  it('adjusts for party size and sums a running total (Wealth_by_Level sheet)', () => {
    expect(levelTreasure('pf2e', 1, 5)).toBe(18_500)
    expect(levelTreasure('pf2e', 1, 3)).toBe(16_500)
    // Sheet, 5 PCs: level 2 adjusted total 503 gp = 185 + 318 (300 + 18)
    expect(expectedTreasure('pf2e', { fromLevel: 1, level: 3, partySize: 5 })).toBe(50_300)
    expect(expectedTreasure('pf2e', { fromLevel: 1, level: 2, progress: 0.5, partySize: 4 })).toBe(17_500 + 15_000)
    expect(expectedTreasure('pf2e', { fromLevel: 5, level: 5, partySize: 4 })).toBe(0)
  })
})

describe('encounter registry', () => {
  it('scales the budget with party size', () => {
    expect(encounterBudget('pf2e', 'moderate', 4)).toBe(80)
    expect(encounterBudget('pf2e', 'severe', 5)).toBe(150)
    expect(encounterBudget('pf2e', 'low', 3)).toBe(40)
  })

  it('awards XP by level difference', () => {
    expect(creatureXp('pf2e', 3, 3)).toBe(40)
    expect(creatureXp('pf2e', 5, 3)).toBe(80)
    expect(creatureXp('pf2e', -1, 3)).toBe(10)
    expect(creatureXp('pf2e', -2, 3)).toBe(0)
    expect(creatureXp('pf2e', 9, 3)).toBe(160)
    expect(simpleHazardXp('pf2e', 4, 3)).toBe(12)
  })
})

describe('local edits', () => {
  const base = newRulesEntity('creature', { name: 'Goblin', game: 'pf2e', origin: 'foundry' }) as Creature

  it('lays edits over upstream values without mutating them', () => {
    const edited = { ...base, localEdits: { hp: 12, 'saves.fort': 7 } }
    const eff = withLocalEdits(edited)
    expect(eff.hp).toBe(12)
    expect(eff.saves).toEqual({ fort: 7, ref: 0, will: 0 })
    expect(edited.hp).toBe(1)
    expect(edited.saves.fort).toBe(0)
  })

  it('applies parent edits before child edits', () => {
    const eff = withLocalEdits({ ...base, localEdits: { 'saves.will': 9, saves: { fort: 1, ref: 2, will: 3 } } })
    expect(eff.saves).toEqual({ fort: 1, ref: 2, will: 9 })
  })

  it('detects edits whose upstream value changed', () => {
    const before = { ...base, localEdits: { hp: 12, ac: 18 } }
    const after = { ...before, hp: 8 }
    expect(conflictingEdits(before, after)).toEqual(['hp'])
  })

  it('setPath clones only along the path', () => {
    const next = setPath(base, 'saves.fort', 3)
    expect(next.saves.fort).toBe(3)
    expect(next.abilities).toBe(base.abilities)
  })
})

describe('rules repository', () => {
  beforeEach(async () => { await getDb().rules.clear() })

  async function addFoundry(e: RulesEntity) {
    await getDb().rules.add({ ...e, origin: 'foundry' })
    return e.id
  }

  it('creates, finds and deletes user entries', async () => {
    const item = await rulesCreate('item', { name: 'Sturmperle', game: 'pf2e' })
    expect(item.origin).toBe('user')
    expect((await rulesFindByName('item', 'sturmperle'))?.id).toBe(item.id)
    await rulesUpdate(item.id, 'price', { cp: 2500 })
    expect(((await rulesGet(item.id)) as Item).price).toEqual({ cp: 2500 })
    await rulesDelete(item.id)
    expect(await rulesGet(item.id)).toBeUndefined()
  })

  it('keeps sortName in step with the name', async () => {
    const e = await rulesCreate('feat', { name: 'Old Name', game: 'pf2e' })
    await rulesUpdate(e.id, 'name', 'Power Attack')
    expect((await rulesGetRaw(e.id))?.sortName).toBe('power attack')
  })

  it('stores edits to synced entries as an overlay and can reset them', async () => {
    const id = await addFoundry(newRulesEntity('creature', { name: 'Goblin Warrior', game: 'pf2e' }))
    await rulesUpdate(id, 'hp', 9)
    await rulesUpdate(id, 'gmNotes', 'Ambushes from the reeds')
    const raw = await rulesGetRaw(id) as Creature
    expect(raw.hp).toBe(1)
    expect(raw.localEdits).toEqual({ hp: 9 })
    expect(raw.gmNotes).toBe('Ambushes from the reeds')
    expect(((await rulesGet(id)) as Creature).hp).toBe(9)
    await rulesResetEdits(id)
    expect(((await rulesGet(id)) as Creature).hp).toBe(1)
  })

  it('refuses to delete synced entries but can duplicate them as homebrew', async () => {
    const id = await addFoundry(newRulesEntity('spell', { name: 'Fireball', game: 'pf2e' }))
    await expect(rulesDelete(id)).rejects.toThrow()
    const copy = await rulesDuplicate(id)
    expect(copy?.origin).toBe('user')
    expect(copy?.name).toBe('Fireball (Homebrew)')
  })

  it('filters, sorts and pages queries', async () => {
    const mk = (name: string, level: number, extra: Partial<RulesEntity> = {}) =>
      getDb().rules.add({ ...newRulesEntity('item', { name, game: 'pf2e' }), level, ...extra } as RulesEntity)
    await mk('Longsword', 0, { traits: ['versatile-p'] })
    await mk('Healing Potion (Minor)', 1, { traits: ['consumable', 'healing'] })
    await mk('Bag of Holding', 4, { rarity: 'uncommon' })
    await mk('Laser Pistol', 0, { game: 'sf2e' } as Partial<RulesEntity>)
    await mk('Old Potion', 1, { supersededBy: 'x' })

    const all = await rulesQuery({ kind: 'item' })
    expect(all.total).toBe(4)
    expect(all.items.map(i => i.name)).toEqual(['Bag of Holding', 'Healing Potion (Minor)', 'Laser Pistol', 'Longsword'])

    expect((await rulesQuery({ kind: 'item', games: ['pf2e'] })).total).toBe(3)
    expect((await rulesQuery({ kind: 'item', text: 'potion' })).items.map(i => i.name)).toEqual(['Healing Potion (Minor)'])
    expect((await rulesQuery({ kind: 'item', text: 'potion', hideSuperseded: false })).total).toBe(2)
    expect((await rulesQuery({ kind: 'item', traits: ['healing'] })).total).toBe(1)
    expect((await rulesQuery({ kind: 'item', rarities: ['uncommon'] })).items[0].name).toBe('Bag of Holding')
    expect((await rulesQuery({ kind: 'item', levelMin: 1, levelMax: 4 })).total).toBe(2)

    const byLevel = await rulesQuery({ kind: 'item', sort: 'level', dir: 'desc' })
    expect(byLevel.items[0].name).toBe('Bag of Holding')
    const page = await rulesQuery({ kind: 'item', offset: 1, limit: 2 })
    expect(page.total).toBe(4)
    expect(page.items.map(i => i.name)).toEqual(['Healing Potion (Minor)', 'Laser Pistol'])
  })

  it('prefers the campaign game and remaster printings when resolving names', async () => {
    const legacy = { ...newRulesEntity('condition', { name: 'Frightened', game: 'pf2e' }), publication: { title: 'Core Rulebook', remaster: false } }
    const remaster = { ...newRulesEntity('condition', { name: 'Frightened', game: 'pf2e' }), publication: { title: 'Player Core', remaster: true } }
    await getDb().rules.bulkAdd([legacy, remaster] as RulesEntity[])
    expect((await rulesFindByName('condition', 'Frightened', 'pf2e'))?.id).toBe(remaster.id)
  })

  it('searches names across kinds, prefix matches first', async () => {
    await rulesCreate('spell', { name: 'Fireball', game: 'pf2e' })
    await rulesCreate('hazard', { name: 'Fireball Rune', game: 'pf2e' })
    await rulesCreate('item', { name: 'Wand of Fireball', game: 'pf2e' })
    await rulesCreate('item', { name: 'Fireball Pistol', game: 'sf2e' })
    const hits = await rulesSearch('fireball', 8, ['pf2e'])
    expect(hits.map(h => h.name)).toEqual(['Fireball', 'Fireball Rune', 'Wand of Fireball'])
  })

  it('counts entries per kind', async () => {
    await rulesCreate('hazard', { name: 'Pit', game: 'pf2e' })
    const counts = await rulesCounts()
    expect(counts.hazard).toBe(1)
    expect(counts.creature).toBe(0)
  })
})
