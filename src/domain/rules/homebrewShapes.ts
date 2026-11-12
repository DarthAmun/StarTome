/** Homebrew import, part 2: what each compendium kind's fields must look like. */
import { GAME_IDS } from '@/domain/game'
import { GIFT_TIERS, ITEM_CATEGORIES, RARITIES, SIZES, type RulesKind } from '@/domain/rules/types'
import { type Checker, FAIL, SIZE_ALIASES, type Shape, actionCost, arrOf, bool, bulk, either, fail, money, num, numOrNull, oneOf, opt, record, req, shape, show, str, strArr, traits, warn } from './homebrewCheckers'

// ── Kind shapes ────────────────────────────────────────────────────────────

/** Recomputed or forced by the import, so not reported as dropped. */

export const damageRoll: Checker = (v, path, ctx) => {
  // "2d8+6 slashing"
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\S+)\s+(.+)$/)
    if (m) { warn(ctx, path, `${show(v)} split into formula and type`); return { formula: m[1]!, type: m[2]!.toLowerCase() } }
    return { formula: v.trim(), type: '' }
  }
  return shape({ formula: req(str), type: req(str, '') })(v, path, ctx)
}

export const weaknessShape = shape({ type: req(str), value: req(num), note: opt(str) })
export const resistanceShape = shape({ type: req(str), value: req(num), except: opt(strArr), note: opt(str) })

export const strike = shape({
  name: req(str),
  range: req(oneOf(['melee', 'ranged'] as const), 'melee'),
  bonus: req(num),
  traits: req(traits, []),
  damage: req(arrOf(damageRoll), []),
  effects: opt(strArr),
  rangeIncrement: opt(num),
})

export const statAction = shape({
  name: req(str),
  cost: req(actionCost, null),
  section: req(oneOf(['interaction', 'defensive', 'offensive'] as const), 'offensive'),
  traits: req(traits, []),
  frequency: opt(str),
  text: req(str, ''),
})

// ── Starships ──
export const GRADE_NAMES = ['commercial', 'tactical', 'advanced', 'superior', 'elite', 'ultimate', 'paragon'] as const
export const grade = oneOf(GRADE_NAMES)

/** "3 zones", "3-zone" → 3, with a warning. */
export const zones: Checker = (v, path, ctx) => {
  if (typeof v === 'string') {
    const m = v.match(/^\s*(-?\d+)\s*-?\s*zones?\s*$/i)
    if (m) { warn(ctx, path, `${show(v)} read as ${m[1]} zones`); return Number(m[1]) }
  }
  return num(v, path, ctx)
}

export const stationAction = shape({
  name: req(str),
  cost: req(actionCost, null),
  section: req(oneOf(['interaction', 'defensive', 'offensive'] as const), 'offensive'),
  traits: req(traits, ['station']),
  frequency: opt(str),
  text: req(str, ''),
  grade: opt(grade),
})

export const starshipStrike = shape({
  name: req(str),
  range: req(oneOf(['melee', 'ranged'] as const), 'ranged'),
  bonus: req(num),
  traits: req(traits, []),
  damage: req(arrOf(damageRoll), []),
  effects: opt(strArr),
  rangeZones: opt(zones),
})

export const spellcasting = shape({
  name: req(str),
  tradition: req(str, ''),
  type: req(oneOf(['prepared', 'spontaneous', 'innate', 'focus', 'ritual'] as const)),
  dc: req(num),
  attack: opt(num),
  spells: req(arrOf(shape({ spellId: opt(str), name: req(str), rank: req(num), heightenedTo: opt(num), uses: opt(num) })), []),
})

export const sense: Checker = (v, path, ctx) =>
  typeof v === 'string' ? { type: v } : shape({ type: req(str), acuity: opt(str), range: opt(num) })(v, path, ctx)

/** A bare number is the land Speed. */
export const speeds: Checker = (v, path, ctx) => {
  if (typeof v === 'number') { warn(ctx, path, `read as { "land": ${v} }`); return { land: v } }
  return record(num, true)(v, path, ctx)
}

export const runes = shape({ potency: req(num, 0), striking: opt(num), resilient: opt(num), property: req(strArr, []) })

export const COMMON: Shape = {
  name: req(str),
  game: req(oneOf([...GAME_IDS, 'both'] as const)),
  level: req(num),
  rarity: req(oneOf(RARITIES)),
  traits: req(traits),
  description: req(str),
  publication: opt(shape({ title: req(str), remaster: req(bool, true), license: opt(str) })),
  tags: opt(strArr),
  gmNotes: opt(str),
  isFavorite: opt(bool),
  style: opt(shape({ color: opt(str), icon: opt(str) })),
}

export const KIND_SHAPES: Record<RulesKind, Shape> = {
  item: {
    category: req(oneOf(ITEM_CATEGORIES)),
    subcategory: opt(str),
    baseItem: opt(str),
    price: req(money),
    priceFor: opt(num),
    bulk: req(bulk),
    bulkNote: opt(str),
    usage: opt(str),
    hands: opt(str),
    activation: opt(arrOf(shape({ cost: req(actionCost, null), traits: opt(traits), text: opt(str) }))),
    uses: opt(shape({ max: req(num) })),
    unidentified: opt(shape({ name: req(str), description: opt(str) })),
    weapon: opt(shape({
      category: req(str, 'simple'),
      group: opt(str),
      damage: req(shape({ dice: req(num, 1), die: req(str), type: req(str, '') })),
      range: opt(num),
      reload: opt(str),
      ammo: opt(shape({ type: opt(str), capacity: opt(num) })),
      expend: opt(num),
      grade: opt(str),
      splash: opt(num),
      runes: opt(runes),
    })),
    armor: opt(shape({
      category: req(str, 'light'),
      group: opt(str),
      acBonus: req(num, 0),
      dexCap: req(numOrNull, null),
      checkPenalty: req(num, 0),
      speedPenalty: req(num, 0),
      strength: req(numOrNull, null),
      grade: opt(str),
      runes: opt(runes),
    })),
    shield: opt(shape({ acBonus: req(num, 2), hardness: req(num, 0), hp: req(num, 0), bt: opt(num) })),
    container: opt(shape({ capacity: req(bulk, 0), bulkReduction: req(bulk, 0) })),
    material: opt(either(v => (v === null ? null : FAIL), shape({ type: req(str), grade: req(str, '') }))),
  },
  creature: {
    size: req(oneOf(SIZES, SIZE_ALIASES)),
    perception: req(num),
    senses: req(arrOf(sense)),
    languages: req(strArr),
    skills: req(record(num, true)),
    abilities: req(shape({ str: req(num, 0), dex: req(num, 0), con: req(num, 0), int: req(num, 0), wis: req(num, 0), cha: req(num, 0) })),
    ac: req(num),
    acNote: opt(str),
    saves: req(shape({ fort: req(num), ref: req(num), will: req(num) })),
    saveNote: opt(str),
    hp: req(num),
    hpNote: opt(str),
    hardness: opt(num),
    immunities: req(strArr),
    weaknesses: req(arrOf(weaknessShape)),
    resistances: req(arrOf(resistanceShape)),
    speeds: req(speeds),
    strikes: req(arrOf(strike)),
    actions: req(arrOf(statAction)),
    spellcasting: req(arrOf(spellcasting)),
    inventory: req(arrOf(shape({ itemId: opt(str), name: req(str), quantity: req(num, 1) }))),
  },
  hazard: {
    complex: req(bool),
    stealth: req(either(
      (v, path, ctx) => (typeof v === 'number' ? (warn(ctx, path, `read as { "bonus": ${v} }`), { bonus: v }) : FAIL),
      shape({ bonus: req(numOrNull, null), note: opt(str) }),
    )),
    disable: req(str),
    ac: opt(num),
    saves: opt(shape({ fort: opt(num), ref: opt(num), will: opt(num) })),
    hardness: opt(num),
    hp: opt(num),
    bt: opt(num),
    immunities: opt(strArr),
    weaknesses: opt(arrOf(weaknessShape)),
    resistances: opt(arrOf(resistanceShape)),
    strikes: opt(arrOf(strike)),
    actions: req(arrOf(statAction)),
    routine: opt(str),
    reset: opt(str),
  },
  spell: {
    spellType: req(oneOf(['spell', 'focus', 'ritual'] as const)),
    traditions: req(traits),
    cast: req(actionCost),
    range: opt(str),
    area: opt(str),
    targets: opt(str),
    duration: opt(str),
    sustained: opt(bool),
    defense: opt(either(
      (v) => (v === null ? null : FAIL),
      shape({ ac: req((v, path, ctx) => (v === true ? true : fail(ctx, path, 'should be true'))) }),
      shape({ save: req(oneOf(['fort', 'ref', 'will'] as const, { fortitude: 'fort', reflex: 'ref' })), basic: req(bool, false) }),
    )),
    damage: opt(arrOf(damageRoll)),
    heightened: opt(arrOf(shape({ trigger: req(str), text: req(str) }))),
  },
  feat: {
    category: req(str),
    cost: req(actionCost),
    prerequisites: req(strArr),
    trigger: opt(str),
    frequency: opt(str),
    requirements: opt(str),
    choices: opt(traits),
    optionOf: opt(traits),
  },
  action: {
    cost: req(actionCost),
    category: opt(str),
    trigger: opt(str),
    frequency: opt(str),
    requirements: opt(str),
  },
  condition: {
    valued: req(bool),
    overrides: req(strArr),
    group: opt(str),
    aliases: opt(strArr),
  },
  ancestry: { facts: req(record(either(num, str, strArr))) },
  heritage: { facts: req(record(either(num, str, strArr))) },
  background: { facts: req(record(either(num, str, strArr))) },
  class: {
    facts: req(record(either(num, str, strArr))),
    features: opt(arrOf(shape({ level: req(num, 1), name: req(str) }))),
    progression: opt(shape({
      classFeats: opt(arrOf(num)), skillFeats: opt(arrOf(num)), generalFeats: opt(arrOf(num)),
      ancestryFeats: opt(arrOf(num)), skillIncreases: opt(arrOf(num)),
    })),
  },
  deity: { facts: req(record(either(num, str, strArr))) },
  relicGift: {
    tier: req(oneOf(GIFT_TIERS)),
    aspects: req(strArr, []),
    prerequisites: opt(strArr),
    activation: opt(arrOf(shape({ cost: req(actionCost, null), traits: opt(traits), frequency: opt(str), trigger: opt(str), text: opt(str) }))),
    grantsRune: opt(str),
  },
  vehicle: {
    size: req(oneOf(SIZES, SIZE_ALIASES), 'lg'),
    price: req(money, null),
    ac: req(num),
    fort: req(num),
    hardness: req(num, 0),
    hp: req(num),
    bt: opt(num),
    immunities: req(strArr, []),
    weaknesses: req(arrOf(weaknessShape), []),
    resistances: req(arrOf(resistanceShape), []),
    collision: req(shape({ dc: req(numOrNull, null), damage: req(str, '') }), { dc: null, damage: '' }),
    crew: req(str, ''),
    passengers: req(str, ''),
    pilotingCheck: req(str, ''),
    space: opt(either((v) => (v === null ? null : FAIL), shape({ long: req(num, 0), wide: req(num, 0), high: req(num, 0) }))),
    speed: req(str, ''),
    actions: req(arrOf(statAction), []),
  },
  starship: {
    size: req(oneOf(SIZES, SIZE_ALIASES), 'med'),
    perception: req(num),
    sensorRange: req(zones),
    skills: req(record(num), {}),
    abilities: req(shape({ str: req(num, 0), dex: req(num, 0), con: req(num, 0), int: req(num, 0), wis: req(num, 0), cha: req(num, 0) })),
    ac: req(num),
    saves: req(shape({ fort: req(num), ref: req(num), will: req(num) })),
    hp: req(num),
    shields: opt(either((v) => (v === null ? null : FAIL), shape({ max: req(num), fortify: req(num, 0) }))),
    immunities: req(strArr, ['starship immunities']),
    weaknesses: req(arrOf(weaknessShape), []),
    resistances: req(arrOf(resistanceShape), []),
    speed: req(zones),
    battleStations: req(arrOf(shape({ station: req(str), actions: req(strArr, []), weapons: opt(strArr) })), []),
    strikes: req(arrOf(starshipStrike), []),
    actions: req(arrOf(statAction), []),
    living: opt(bool),
  },
  starshipFrame: {
    size: req(oneOf(SIZES, SIZE_ALIASES), 'med'),
    sensorRange: req(zones),
    expansionBays: req(num, 4),
    customSlots: req(num, 4),
    defaultStations: req(arrOf(shape({ station: req(str), upgrades: req(strArr, []) })), []),
    stats: req(arrOf(shape({
      level: req(num), hp: req(num), sp: req(num), ac: req(num), fort: req(num), ref: req(num), will: req(num), speed: req(zones),
    }))),
  },
  battleStation: {
    benefits: opt(str),
    helmedBenefits: opt(str),
    advancement: req(arrOf(shape({
      grade: req(grade), level: req(num), upgrades: req(num, 0),
      helmed: opt(shape({ ac: opt(num), fort: opt(num), ref: opt(num), will: opt(num) })),
      sensors: opt(zones), damageDice: opt(num), tracking: opt(num), drones: opt(num),
    }))),
    actions: req(arrOf(stationAction), []),
  },
  stationUpgrade: {
    station: req(str),
    actions: req(arrOf(stationAction), []),
    grades: opt(arrOf(shape({ grade: req(grade), level: req(num), text: opt(str) }))),
    weapon: opt(shape({
      category: req(oneOf(['simple', 'martial', 'advanced'] as const)),
      damage: req(shape({ dice: req(num, 1), die: req(str), type: req(str) })),
      range: req(zones),
      upgrades: req(num, 1),
      group: opt(str),
    })),
  },
  expansionBay: {
    takesSlot: req(bool, true),
    options: opt(arrOf(shape({ name: req(str), text: req(str, '') }))),
  },
}
