/**
 * What the entry editor shows per kind: a list of fields, each a path into
 * the entry and a codec that turns its value into text and back. Lists of
 * rows (Strikes, abilities, spell lists) are fields whose rows have fields.
 */
import { coinsToCp, formatActionCost, formatBulk, parseActionCost, parseBulk, SIZE_LABEL, titleCase } from '@/domain/rules/format'
import {
  formatFacts, formatFeatures, formatIwrList, formatList, formatNumberMap, formatSenses, formatSpeeds, formatSpellList,
  parseFacts, parseFeatures, parseIwr, parseList, parseNumberMap, parseSenses, parseSpeeds, parseSpellList, parseTraits,
} from '@/domain/rules/parse'
import { GIFT_TIERS, ITEM_CATEGORIES, RARITIES, SIZES, type ActionCost, type DamageRoll, type RulesEntity, type RulesKind, type Spell, type Spellcasting } from '@/domain/rules/types'

export type Codec =
  | 'text' | 'optText' | 'area' | 'number' | 'optNumber' | 'nullNumber' | 'bool' | 'select' | 'list' | 'optList' | 'traits' | 'map' | 'signedMap'
  | 'iwr' | 'senses' | 'speeds' | 'price' | 'bulk' | 'cost' | 'facts' | 'features' | 'damage' | 'spells' | 'defense' | 'json' | 'jsonObject'

export interface Field {
  path: string
  label: string
  codec: Codec
  hint?: string
  /** Select: value and label. */
  options?: [string, string][]
  /** Columns of three it takes. */
  span?: 1 | 2 | 3
  when?: (e: Record<string, unknown>) => boolean
}

export interface RowsField { path: string; label: string; add: string; blank: Record<string, unknown>; columns: Field[] }
export interface Section { title: string; fields: Field[]; rows?: RowsField[] }

const opts = (values: readonly string[], label: (v: string) => string = titleCase): [string, string][] => values.map(v => [v, label(v)])
const f = (path: string, label: string, codec: Codec, extra: Partial<Field> = {}): Field => ({ path, label, codec, ...extra })

function costText(cost: ActionCost | undefined): string {
  if (cost === null || cost === undefined) return ''
  return typeof cost === 'object' && 'text' in cost ? cost.text : formatActionCost(cost)
}

/** "1d6+3 slashing plus 1d4 fire" ⇄ damage rolls */
function parseDamage(text: string): DamageRoll[] {
  return text.split(/\s+plus\s+/i).map(s => s.trim()).filter(Boolean).map((part) => {
    const m = /^(\S+)\s*(.*)$/.exec(part)
    return { formula: m?.[1] ?? part, type: (m?.[2] ?? '').trim() }
  })
}

function defenseKey(d: Spell['defense']): string {
  if (!d) return ''
  return 'ac' in d ? 'ac' : `${d.basic ? 'basic-' : ''}${d.save}`
}

/** A field's value as the text (or tick) its input shows. */
export function show(field: Field, value: unknown, game: string): string | boolean {
  switch (field.codec) {
    case 'bool': return !!value
    case 'list': case 'optList': case 'traits': return formatList(value as string[] | undefined)
    case 'map': return formatNumberMap(value as Record<string, number> | undefined)
    case 'signedMap': return formatNumberMap(value as Record<string, number> | undefined, true)
    case 'iwr': return formatIwrList(value as Parameters<typeof formatIwrList>[0])
    case 'senses': return formatSenses(value as Parameters<typeof formatSenses>[0])
    case 'speeds': return formatSpeeds(value as Record<string, number> | undefined)
    case 'price': { const cp = (value as { cp: number } | null | undefined)?.cp; return cp === undefined ? '' : String(game === 'sf2e' ? cp / 10 : cp / 100) }
    case 'bulk': return value === undefined ? '' : formatBulk(value as number | null)
    case 'cost': return costText(value as ActionCost | undefined)
    case 'facts': return formatFacts(value as Parameters<typeof formatFacts>[0])
    case 'features': return formatFeatures(value as Parameters<typeof formatFeatures>[0])
    case 'damage': return ((value as DamageRoll[] | undefined) ?? []).map(d => `${d.formula} ${d.type}`.trim()).join(' plus ')
    case 'spells': return formatSpellList(value as Spellcasting['spells'] | undefined)
    case 'defense': return defenseKey(value as Spell['defense'])
    case 'json': return JSON.stringify(value ?? [], null, 1)
    case 'jsonObject': return value === undefined || value === null ? '' : JSON.stringify(value, null, 1)
    default: return value === undefined || value === null ? '' : String(value)
  }
}

/** The value a typed text stands for. Throws when it cannot be read (JSON fields). */
export function read(field: Field, raw: string | boolean, game: string, previous: unknown): unknown {
  const text = typeof raw === 'string' ? raw : ''
  switch (field.codec) {
    case 'bool': return !!raw
    case 'optText': return text.trim() || undefined
    case 'number': return Number(text) || 0
    case 'optNumber': return text.trim() === '' ? undefined : Number(text)
    case 'nullNumber': return text.trim() === '' ? null : Number(text)
    case 'list': return parseList(text)
    case 'optList': { const l = parseList(text); return l.length ? l : undefined }
    case 'traits': return parseTraits(text)
    case 'map': case 'signedMap': return parseNumberMap(text)
    case 'iwr': return parseIwr(text)
    case 'senses': return parseSenses(text)
    case 'speeds': return parseSpeeds(text)
    case 'price': return text.trim() === '' ? null : { cp: game === 'sf2e' ? coinsToCp({ credits: Number(text) }) : coinsToCp({ gp: Number(text) }) }
    case 'bulk': return parseBulk(text) ?? null
    case 'cost': return parseActionCost(text)
    case 'facts': return parseFacts(text)
    case 'features': { const l = parseFeatures(text); return l.length ? l : undefined }
    case 'damage': return parseDamage(text)
    case 'spells': return parseSpellList(text, (previous as Spellcasting['spells'] | undefined) ?? [])
    case 'defense': return !text ? null : text === 'ac' ? { ac: true } : { save: text.replace('basic-', ''), basic: text.startsWith('basic-') }
    case 'json': { const v: unknown = text.trim() ? JSON.parse(text) : []; if (!Array.isArray(v)) throw new Error('should be a list ([ … ])'); return v }
    case 'jsonObject': return text.trim() ? JSON.parse(text) as unknown : undefined
    default: return text
  }
}

// ── Shared pieces ──────────────────────────────────────────────────────────

const SIZE = f('size', 'Size', 'select', { options: SIZES.map(s => [s, SIZE_LABEL[s]]) })
const IWR = [
  f('immunities', 'Immunities', 'list', { span: 3 }),
  f('weaknesses', 'Weaknesses', 'iwr', { span: 3, hint: 'fire 5, cold iron 10' }),
  f('resistances', 'Resistances', 'iwr', { span: 3, hint: 'physical 5 (except silver)' }),
]
const COST_HINT = '1, 2, 3, free, reaction, or text'
const ACTION_COLUMNS: Field[] = [
  f('name', 'Name', 'text'), f('cost', 'Actions', 'cost', { hint: COST_HINT }), f('traits', 'Traits', 'traits'),
  f('frequency', 'Frequency', 'optText'), f('text', 'Text', 'area', { span: 3 }),
]
const SECTION = f('section', 'Section', 'select', { options: opts(['interaction', 'defensive', 'offensive']) })
const actions = (withSection = false, extra: Field[] = []): RowsField => ({
  path: 'actions', label: 'Abilities', add: 'Add ability', blank: { name: 'New ability', cost: 1, section: 'offensive', traits: [], text: '' },
  columns: [...ACTION_COLUMNS.slice(0, 2), ...(withSection ? [SECTION] : []), ...extra, ...ACTION_COLUMNS.slice(2)],
})
const STRIKES: RowsField = {
  path: 'strikes', label: 'Strikes', add: 'Add Strike', blank: { name: 'Strike', range: 'melee', bonus: 0, traits: [], damage: [{ formula: '1d6', type: 'bludgeoning' }] },
  columns: [
    f('name', 'Name', 'text'), f('range', 'Type', 'select', { options: opts(['melee', 'ranged']) }), f('bonus', 'Attack bonus', 'number'),
    f('traits', 'Traits', 'traits', { span: 2 }), f('rangeIncrement', 'Range increment (ft)', 'optNumber'),
    f('damage', 'Damage', 'damage', { span: 2, hint: '1d8+4 slashing plus 1d6 fire' }), f('effects', 'Effects', 'optList'),
  ],
}
const SAVES = [f('saves.fort', 'Fortitude', 'number'), f('saves.ref', 'Reflex', 'number'), f('saves.will', 'Will', 'number')]
const kindIs = (...c: string[]) => (e: Record<string, unknown>) => c.includes(String(e.category))

export const KIND_SECTIONS: Record<RulesKind, Section[]> = {
  item: [
    { title: 'Item', fields: [
      f('category', 'Category', 'select', { options: opts(ITEM_CATEGORIES) }), f('subcategory', 'Subcategory', 'optText'), f('baseItem', 'Base item', 'optText'),
      f('price', 'Price', 'price', { hint: 'gp, or credits in Starfinder' }), f('priceFor', 'Price buys', 'optNumber'), f('bulk', 'Bulk', 'bulk', { hint: 'L, —, 1, 2' }),
      f('usage', 'Usage', 'optText'), f('hands', 'Hands', 'optText'), f('uses.max', 'Uses', 'optNumber'),
      f('unidentified.name', 'Unidentified name', 'optText', { span: 3, hint: 'what the players see until it is identified' }),
    ] },
    { title: 'Weapon', fields: [
      f('weapon.category', 'Category', 'text'), f('weapon.group', 'Group', 'optText'), f('weapon.grade', 'Grade', 'optText'),
      f('weapon.damage.dice', 'Dice', 'number'), f('weapon.damage.die', 'Die', 'text'), f('weapon.damage.type', 'Damage type', 'text'),
      f('weapon.range', 'Range (ft)', 'optNumber'), f('weapon.reload', 'Reload', 'optText'), f('weapon.expend', 'Expend', 'optNumber'),
      f('weapon.ammo.capacity', 'Capacity', 'optNumber'), f('weapon.runes', 'Runes', 'jsonObject', { span: 2, hint: '{ "potency": 1, "striking": 1, "property": ["flaming"] }' }),
    ].map(x => ({ ...x, when: kindIs('weapon') })) },
    { title: 'Armor', fields: [
      f('armor.category', 'Category', 'text'), f('armor.group', 'Group', 'optText'), f('armor.grade', 'Grade', 'optText'),
      f('armor.acBonus', 'AC bonus', 'number'), f('armor.dexCap', 'Dex cap', 'nullNumber'), f('armor.strength', 'Strength', 'nullNumber'),
      f('armor.checkPenalty', 'Check penalty', 'number'), f('armor.speedPenalty', 'Speed penalty', 'number'),
    ].map(x => ({ ...x, when: kindIs('armor') })) },
    { title: 'Shield', fields: [f('shield.acBonus', 'AC bonus', 'number'), f('shield.hardness', 'Hardness', 'number'), f('shield.hp', 'HP', 'number'), f('shield.bt', 'Broken threshold', 'number')].map(x => ({ ...x, when: kindIs('shield') })) },
    { title: 'Activations', fields: [f('activation', 'Activations', 'json', { span: 3, hint: '[{ "cost": 1, "traits": ["manipulate"], "text": "…" }]' })] },
  ],
  creature: [
    { title: 'Creature', fields: [
      SIZE, f('perception', 'Perception', 'number'), f('languages', 'Languages', 'list'),
      f('senses', 'Senses', 'senses', { span: 3, hint: 'darkvision, scent (imprecise) 30 feet' }),
      f('skills', 'Skills', 'signedMap', { span: 3, hint: 'Athletics +7, Stealth +5' }),
      f('abilities', 'Attribute modifiers', 'signedMap', { span: 3, hint: 'str +4, dex +2, con +3, int −1, wis +1, cha +0' }),
    ] },
    { title: 'Defenses', fields: [
      f('ac', 'AC', 'number'), f('acNote', 'AC note', 'optText', { span: 2 }), ...SAVES, f('saveNote', 'Save note', 'optText', { span: 3 }),
      f('hp', 'HP', 'number'), f('hpNote', 'HP note', 'optText'), f('hardness', 'Hardness', 'optNumber'), ...IWR,
    ] },
    { title: 'Offense', fields: [f('speeds', 'Speeds', 'speeds', { span: 3, hint: '25 feet, fly 40 feet' })], rows: [
      STRIKES,
      { path: 'spellcasting', label: 'Spellcasting', add: 'Add spellcasting', blank: { name: 'Arcane Innate Spells', tradition: 'arcane', type: 'innate', dc: 15, spells: [] },
        columns: [
          f('name', 'Name', 'text'), f('tradition', 'Tradition', 'text'), f('type', 'Type', 'select', { options: opts(['prepared', 'spontaneous', 'innate', 'focus', 'ritual']) }),
          f('dc', 'DC', 'number'), f('attack', 'Attack', 'optNumber'), f('spells', 'Spells', 'spells', { span: 3, hint: '3rd fireball, haste; cantrips detect magic' }),
        ] },
      actions(true),
    ] },
    { title: 'Gear and art', fields: [f('inventory', 'Items', 'json', { span: 3, hint: '[{ "name": "Longsword", "quantity": 1 }]' })] },
  ],
  hazard: [
    { title: 'Hazard', fields: [
      f('complex', 'Complex', 'bool'), f('stealth.bonus', 'Stealth', 'nullNumber'), f('stealth.note', 'Stealth note', 'optText'),
      f('disable', 'Disable', 'area', { span: 3 }), f('ac', 'AC', 'optNumber'), f('hardness', 'Hardness', 'optNumber'), f('hp', 'HP', 'optNumber'),
      f('saves.fort', 'Fortitude', 'optNumber'), f('saves.ref', 'Reflex', 'optNumber'), f('saves.will', 'Will', 'optNumber'), f('bt', 'Broken threshold', 'optNumber'), ...IWR,
      f('routine', 'Routine', 'area', { span: 3 }), f('reset', 'Reset', 'area', { span: 3 }),
    ], rows: [STRIKES, actions()] },
  ],
  vehicle: [
    { title: 'Vehicle', fields: [
      SIZE, f('price', 'Price', 'price'), f('space', 'Space (ft)', 'jsonObject', { hint: '{ "long": 10, "wide": 5, "high": 5 }' }),
      f('crew', 'Crew', 'text'), f('passengers', 'Passengers', 'text'), f('pilotingCheck', 'Piloting check', 'text'),
      f('ac', 'AC', 'number'), f('fort', 'Fortitude', 'number'), f('hardness', 'Hardness', 'number'), f('hp', 'HP', 'number'), f('bt', 'Broken threshold', 'optNumber'),
      f('collision.damage', 'Collision damage', 'text'), f('collision.dc', 'Collision DC', 'nullNumber'), f('speed', 'Speed', 'text', { span: 2 }), ...IWR,
    ], rows: [actions()] },
  ],
  starship: [
    { title: 'Starship', fields: [
      SIZE, f('perception', 'Perception', 'number'), f('sensorRange', 'Sensor range (zones)', 'number'),
      f('ac', 'AC', 'number'), f('hp', 'Hull Points', 'number'), f('speed', 'Speed (zones)', 'number'), ...SAVES,
      f('shields', 'Shields', 'jsonObject', { hint: '{ "max": 20, "fortify": 5 }' }), f('living', 'Living', 'bool'),
      f('skills', 'Skills', 'signedMap', { span: 3, hint: 'piloting +11' }), f('abilities', 'Attribute modifiers', 'signedMap', { span: 3 }), ...IWR,
      f('battleStations', 'Battle stations', 'json', { span: 3, hint: '[{ "station": "gunnery", "actions": [], "weapons": ["magnetar rail"] }]' }),
      f('strikes', 'Strikes', 'json', { span: 3, hint: 'like creature Strikes, plus rangeZones' }),
    ], rows: [actions()] },
  ],
  starshipFrame: [{ title: 'Frame', fields: [
    SIZE, f('sensorRange', 'Sensor range (zones)', 'number'), f('expansionBays', 'Expansion bays', 'number'), f('customSlots', 'Customizable station slots', 'number'),
    f('defaultStations', 'Default stations', 'json', { span: 3, hint: '[{ "station": "pilot\'s console", "upgrades": ["ramming prow"] }]' }),
    f('stats', 'Statistics by level', 'json', { span: 3, hint: '[{ "level": 1, "hp": 27, "sp": 10, "ac": 17, "fort": 9, "ref": 6, "will": 8, "speed": 2 }, …]' }),
  ] }],
  battleStation: [{ title: 'Battle station', fields: [
    f('benefits', 'Benefits', 'area', { span: 3 }), f('helmedBenefits', 'Helmed benefits', 'area', { span: 3 }),
    f('advancement', 'Advancement', 'json', { span: 3, hint: '[{ "grade": "commercial", "level": 1, "upgrades": 0, "helmed": { "ac": 0 } }, …]' }),
  ], rows: [actions(false, [f('grade', 'From grade', 'optText')])] }],
  stationUpgrade: [{ title: 'Station upgrade', fields: [
    f('station', 'Station', 'text', { hint: 'gunnery, pilot\'s console, any' }),
    f('weapon', 'Starship weapon', 'jsonObject', { span: 2, hint: '{ "category": "martial", "damage": { "dice": 1, "die": "d8", "type": "electricity" }, "range": 3, "upgrades": 1 }' }),
    f('grades', 'Grades', 'json', { span: 3, hint: '[{ "grade": "tactical", "level": 2, "text": "…" }]' }),
  ], rows: [actions(false, [f('grade', 'From grade', 'optText')])] }],
  expansionBay: [{ title: 'Expansion bay', fields: [f('takesSlot', 'Takes an expansion bay slot', 'bool'), f('options', 'Options', 'json', { span: 3, hint: '[{ "name": "Bunks", "text": "…" }]' })] }],
  spell: [{ title: 'Spell', fields: [
    f('spellType', 'Type', 'select', { options: opts(['spell', 'focus', 'ritual']) }), f('traditions', 'Traditions', 'list'), f('cast', 'Cast', 'cost', { hint: COST_HINT }),
    f('range', 'Range', 'optText'), f('area', 'Area', 'optText'), f('targets', 'Targets', 'optText'),
    f('defense', 'Defense', 'select', { options: [['', 'None'], ['ac', 'AC'], ['fort', 'Fortitude'], ['ref', 'Reflex'], ['will', 'Will'], ['basic-fort', 'basic Fortitude'], ['basic-ref', 'basic Reflex'], ['basic-will', 'basic Will']] }),
    f('duration', 'Duration', 'optText'), f('sustained', 'Sustained', 'bool'), f('damage', 'Damage', 'damage', { span: 3, hint: '6d6 fire' }),
  ], rows: [{ path: 'heightened', label: 'Heightened', add: 'Add heightened entry', blank: { trigger: '+1', text: '' }, columns: [f('trigger', 'When', 'text'), f('text', 'Text', 'area', { span: 2 })] }] }],
  feat: [{ title: 'Feat', fields: [
    f('category', 'Category', 'text', { hint: 'ancestry, class, general, skill, archetype, classfeature' }), f('cost', 'Actions', 'cost', { hint: COST_HINT }), f('prerequisites', 'Prerequisites', 'list'),
    f('trigger', 'Trigger', 'optText', { span: 3 }), f('frequency', 'Frequency', 'optText'), f('requirements', 'Requirements', 'optText', { span: 2 }),
    f('choices', 'Offers a choice from', 'optList', { hint: 'option tags, e.g. mystic-connection' }), f('optionOf', 'Is an option of', 'optList', { span: 2 }),
  ] }],
  action: [{ title: 'Action', fields: [
    f('cost', 'Actions', 'cost', { hint: COST_HINT }), f('category', 'Category', 'optText'), f('frequency', 'Frequency', 'optText'),
    f('trigger', 'Trigger', 'optText', { span: 3 }), f('requirements', 'Requirements', 'optText', { span: 3 }),
  ] }],
  condition: [{ title: 'Condition', fields: [
    f('valued', 'Has a value', 'bool'), f('group', 'Group', 'optText'), f('overrides', 'Overrides', 'list'), f('aliases', 'Also known as', 'optList', { span: 3 }),
    f('style.color', 'Badge colour', 'optText'), f('style.icon', 'Badge icon', 'optText'),
  ] }],
  relicGift: [{ title: 'Relic gift', fields: [
    f('tier', 'Tier', 'select', { options: opts(GIFT_TIERS) }), f('aspects', 'Aspects', 'list'), f('grantsRune', 'Grants rune', 'optText'),
    f('prerequisites', 'Prerequisites', 'optList', { span: 3 }), f('activation', 'Activations', 'json', { span: 3, hint: '[{ "cost": 2, "frequency": "once per day", "text": "…" }]' }),
  ] }],
  ancestry: [{ title: 'Facts', fields: [f('facts', 'Facts', 'facts', { span: 3, hint: 'one per line: HP: 8' })] }],
  heritage: [{ title: 'Facts', fields: [f('facts', 'Facts', 'facts', { span: 3, hint: 'one per line: Ancestry: Elf' })] }],
  background: [{ title: 'Facts', fields: [f('facts', 'Facts', 'facts', { span: 3 })] }],
  deity: [{ title: 'Facts', fields: [f('facts', 'Facts', 'facts', { span: 3 })] }],
  class: [{ title: 'Class', fields: [
    f('facts', 'Facts', 'facts', { span: 3, hint: 'one per line: Key attribute: Strength' }),
    f('features', 'Class features', 'features', { span: 3, hint: 'one level per line: 1: Rage, Instinct' }),
    f('progression', 'Feat and skill levels', 'jsonObject', { span: 3, hint: '{ "classFeats": [1, 2, 4], "skillIncreases": [3, 5] } · empty = the usual levels' }),
  ] }],
}

export const COMMON_FIELDS: Field[] = [
  f('name', 'Name', 'text', { span: 2 }), f('game', 'Game', 'select', { options: [['pf2e', 'Pathfinder 2e'], ['sf2e', 'Starfinder 2e'], ['both', 'Both']] }),
  f('level', 'Level', 'number'), f('rarity', 'Rarity', 'select', { options: opts(RARITIES) }), f('tags', 'Your tags', 'optList'),
  f('traits', 'Traits', 'traits', { span: 3, hint: 'comma-separated' }),
]

/** Sub-objects an item only has once one of their fields is filled: what the rest starts as. */
export const SUB_DEFAULTS: Record<string, Record<string, unknown>> = {
  weapon: { category: 'simple', damage: { dice: 1, die: 'd6', type: 'bludgeoning' } },
  armor: { category: 'light', acBonus: 0, dexCap: null, checkPenalty: 0, speedPenalty: 0, strength: null },
  shield: { acBonus: 2, hardness: 0, hp: 0, bt: 0 },
  unidentified: {},
  uses: {},
  style: {},
}

export type Entity = RulesEntity
