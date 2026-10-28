/**
 * Golden tests for the Foundry converters, pinned to pf2e-8.6.1 / sf2e-1.6.1.
 * Fixtures are real release documents (ORC/OGL, see their publication.license);
 * context.json holds the link index and lang strings they reference.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { convertFoundryDoc, type FoundryDoc } from '~/converters/foundry'
import type { Creature, Hazard, Item, ReferenceEntry, RulesEntity, Spell } from '~/types/rules'

const dir = fileURLToPath(new URL('./fixtures/foundry/', import.meta.url))
const fixtures: { game: 'pf2e' | 'sf2e'; pack: string; doc: FoundryDoc }[] = JSON.parse(readFileSync(`${dir}docs.json`, 'utf8'))
const context: { index: Record<string, { kind: string; name: string }>; lang: Record<string, string> } = JSON.parse(readFileSync(`${dir}context.json`, 'utf8'))

function convert(name: string) {
  const f = fixtures.find(x => x.doc.name === name)
  if (!f) throw new Error(`fixture ${name} missing`)
  const res = convertFoundryDoc(f.doc, {
    game: f.game, version: f.game === 'pf2e' ? '8.6.1' : '1.6.1', pack: f.pack,
    resolveUuid: u => context.index[u] ?? null, localize: k => context.lang[k] ?? null,
  })
  if (!res.entity) throw new Error(`${name} did not convert: ${JSON.stringify(res.issues)}`)
  return res.entity
}
const as = <T extends RulesEntity>(e: RulesEntity) => e as T

describe('Foundry converter — items', () => {
  it('Longsword', () => {
    const e = as<Item>(convert('Longsword'))
    expect(e.id).toBe('fvtt:pf2e:equipment-srd:LJdbVTOZog39EEbi')
    expect(e).toMatchObject({ origin: 'foundry', game: 'pf2e', level: 0, category: 'weapon', price: { cp: 100 }, bulk: 10, hands: '1', usage: 'held in one hand' })
    expect(e.weapon).toEqual({ category: 'martial', group: 'sword', damage: { dice: 1, die: 'd8', type: 'slashing' } })
    expect(e.publication).toEqual({ title: 'Pathfinder Player Core', remaster: true, license: 'ORC' })
  })

  it('Full Plate and Steel Shield', () => {
    expect(as<Item>(convert('Full Plate')).armor).toEqual({ category: 'heavy', group: 'plate', acBonus: 6, dexCap: 0, checkPenalty: -3, speedPenalty: -10, strength: 4 })
    expect(as<Item>(convert('Steel Shield')).shield).toEqual({ acBonus: 2, hardness: 5, hp: 20, bt: 10 })
  })

  it('consumables: price, bulk, activation and dice chips', () => {
    const e = as<Item>(convert('Healing Potion (Minor)'))
    expect(e).toMatchObject({ category: 'consumable', subcategory: 'potion', level: 1, price: { cp: 400 }, bulk: 1 })
    expect(e.activation).toEqual([{ cost: 1, traits: ['manipulate'] }])
    expect(e.description).toContain('you regain ::dice[1d8] healing Hit Points')
  })

  it('ammunition priced per batch, containers with capacity, kits and treasure', () => {
    expect(as<Item>(convert('Arrows'))).toMatchObject({ category: 'ammunition', price: { cp: 10 }, priceFor: 10, bulk: 1 })
    expect(as<Item>(convert("Pathfinder's Pouch")).container).toEqual({ capacity: 10, bulkReduction: 10 })
    expect(as<Item>(convert("Adventurer's Pack"))).toMatchObject({ category: 'kit', price: { cp: 150 } })
    expect(as<Item>(convert('Amethyst'))).toMatchObject({ category: 'treasure', subcategory: 'gem', price: { cp: 500 } })
  })

  it('SF2e weapons and armor keep grade, ammo and credits-as-silver prices', () => {
    const gun = as<Item>(convert('Laser Pistol'))
    expect(gun).toMatchObject({ game: 'sf2e', price: { cp: 300 } })
    expect(gun.weapon).toMatchObject({ group: 'laser', range: 40, reload: '1', expend: 2, grade: 'commercial', ammo: { type: 'battery', capacity: 1 } })
    expect(as<Item>(convert('Second Skin')).armor).toMatchObject({ category: 'light', acBonus: 1, dexCap: 4, grade: 'commercial' })
  })
})

describe('Foundry converter — creatures and hazards', () => {
  it('Goblin Warrior', () => {
    const e = as<Creature>(convert('Goblin Warrior'))
    expect(e).toMatchObject({ level: -1, size: 'sm', perception: 2, ac: 16, hp: 6, saves: { fort: 5, ref: 7, will: 3 }, speeds: { land: 25 } })
    expect(e.abilities).toEqual({ str: 0, dex: 3, con: 1, int: 0, wis: -1, cha: 1 })
    expect(e.strikes.map(s => [s.name, s.range, s.bonus])).toEqual([['Dogslicer', 'melee', 7], ['Shortbow', 'ranged', 7]])
    expect(e.strikes[1].traits).toEqual(['deadly-d10', 'reload-0'])
    expect(e.actions.find(a => a.name === 'Goblin Scuttle')).toMatchObject({ cost: 'reaction', section: 'defensive' })
    expect(e.inventory.map(i => i.name)).toEqual(expect.arrayContaining(['Dogslicer', 'Shortbow', 'Leather Armor']))
    expect(e.inventory.every(i => i.itemId?.startsWith('fvtt:pf2e:equipment-srd:'))).toBe(true)
  })

  it('Herexen: prepared spellcasting linked to spell entries, strike effects by name', () => {
    const e = as<Creature>(convert('Herexen'))
    expect(e.spellcasting.map(sc => [sc.name, sc.type, sc.spells.map(sp => sp.name)])).toEqual([
      ['Divine Prepared Spells', 'prepared', ['Harm']],
      ['Cleric Domain Spells', 'focus', ["Death's Call"]],
    ])
    expect(e.spellcasting[0]).toMatchObject({ tradition: 'divine' })
    expect(e.spellcasting[0].dc).toBeGreaterThan(0)
    expect(e.spellcasting.flatMap(sc => sc.spells).every(s => s.spellId?.startsWith('fvtt:pf2e:spells-srd:'))).toBe(true)
    expect(e.strikes[0].effects).toEqual(["Heretic's Smite"])
    expect(e.immunities).toContain('death effects')
  })

  it('SF2e Warpstitcher', () => {
    const e = as<Creature>(convert('Warpstitcher'))
    expect(e).toMatchObject({ game: 'sf2e', level: 14, size: 'lg', speeds: { land: 40, climb: 40 } })
    expect(e.id.startsWith('fvtt:sf2e:alien-core-bestiary:')).toBe(true)
    expect(e.spellcasting.length).toBeGreaterThan(0)
  })

  it('Hidden Pit (simple) and Spinning Blade Pillar (complex)', () => {
    const pit = as<Hazard>(convert('Hidden Pit'))
    expect(pit).toMatchObject({ complex: false, stealth: { bonus: 8 }, ac: 10, hardness: 3, hp: 12 })
    expect(pit.disable).toBe('DC 12 Thievery to remove the trapdoor')
    expect(pit.actions[0]).toMatchObject({ name: 'Pitfall', cost: 'reaction' })
    expect(pit.actions[0].text).toContain('{{action: Grab an Edge}}')
    const pillar = as<Hazard>(convert('Spinning Blade Pillar'))
    expect(pillar.complex).toBe(true)
    expect(pillar.routine).toBeTruthy()
    expect(pillar.strikes?.length).toBeGreaterThan(0)
  })
})

describe('Foundry converter — spells, feats, actions, conditions', () => {
  it('Fireball, cantrips, focus spells and variable casting', () => {
    const fb = as<Spell>(convert('Fireball'))
    expect(fb).toMatchObject({ level: 3, cast: 2, range: '500 feet', area: '20-foot burst', defense: { save: 'ref', basic: true }, traditions: ['arcane', 'primal'] })
    expect(fb.description).toContain('**Heightened (+1)** The damage increases by 2d6.')
    expect(as<Spell>(convert('Electric Arc')).traits).toContain('cantrip')
    expect(as<Spell>(convert('Lay on Hands')).spellType).toBe('focus')
    expect(as<Spell>(convert('Heal')).cast).toEqual({ min: 1, max: 3 })
  })

  it('feats keep action cost, category and prerequisites', () => {
    expect(convert('Sudden Charge')).toMatchObject({ kind: 'feat', category: 'class', cost: 2, level: 1 })
    expect(convert('Reactive Shield')).toMatchObject({ cost: 'reaction' })
    expect(convert('Fighter Dedication')).toMatchObject({ level: 2, prerequisites: ['Strength +2', 'Dexterity +2'] })
  })

  it('actions and conditions', () => {
    expect(convert('Grapple')).toMatchObject({ kind: 'action', cost: 1, category: 'interaction' })
    expect(convert('Frightened')).toMatchObject({ kind: 'condition', valued: true })
    expect(convert('Off-Guard')).toMatchObject({ valued: false, aliases: ['Flat-Footed'] })
  })
})

describe('Foundry converter — reference kinds', () => {
  it('ancestry, heritage, background, class, deity facts', () => {
    expect(as<ReferenceEntry>(convert('Human')).facts).toMatchObject({ HP: 8, Speed: '25 feet', 'Attribute boosts': ['free', 'free'] })
    expect(as<ReferenceEntry>(convert('Skilled Human')).facts).toEqual({ Ancestry: 'Human' })
    expect(as<ReferenceEntry>(convert('Acolyte')).facts).toMatchObject({ 'Trained skills': ['religion', 'Scribing Lore'], Feat: ['Student of the Canon'] })
    expect(as<ReferenceEntry>(convert('Fighter')).facts).toMatchObject({ 'HP per level': 10, Perception: 'expert', Will: 'trained' })
    expect(as<ReferenceEntry>(convert('Pharasma')).facts).toMatchObject({ 'Favored weapon': ['dagger'], 'Cleric spells': ['1: Mindlink', '3: Ghostly Weapon', '4: Vision of Death'] })
  })
})

describe('Foundry converter — whole output', () => {
  // Snapshots lock the full converted entries; review the diff when the converter changes on purpose.
  for (const f of fixtures) {
    it(`${f.game}/${f.doc.name}`, () => {
      expect(convert(f.doc.name)).toMatchSnapshot()
    })
  }
})
