/**
 * Typed PF2e/SF2e rules entities — the compendium.
 *
 * Replaces the user-designed systems/records library. Entries come from three
 * origins: the Foundry sync (phase 3), the legacy DM's Tome import (phase 4) and
 * the user (homebrew). See FORK_PLAN.md §4 for the design.
 *
 * Ownership rule: the sync owns every rules field of a 'foundry' entry. User
 * edits to such an entry go to `localEdits` (an overlay re-applied after each
 * sync); user-owned fields (img, gmNotes, tags, …) are never touched by sync.
 */
import type { GameId } from '@/domain/game'

// ── Primitives ─────────────────────────────────────────────────────────────

export type Rarity = 'common' | 'uncommon' | 'rare' | 'unique'
/** The creature builder's road map and columns; typed in its own module once Phase 3 moves it. */
export type CreatureBuild = Record<string, unknown>

export type Size = 'tiny' | 'sm' | 'med' | 'lg' | 'huge' | 'grg'
export type Proficiency = 'untrained' | 'trained' | 'expert' | 'master' | 'legendary'

/** 1–3 actions, a range ("1 to 3"), free/reaction/passive, or text ("10 minutes"). */
export type ActionCost =
  | 'free' | 'reaction' | 'passive' | 1 | 2 | 3
  | { min: 1 | 2 | 3; max: 1 | 2 | 3 }
  | { text: string }
  | null

/** Money in copper for both games (SF2e credits are stored as sp → 1 credit = 10 cp). */
export interface Money { cp: number }

/** Bulk in tenths: L = 1, — = 0, 1 Bulk = 10. null = varies (see bulkNote). */
export type BulkTenths = number | null

export interface SourceRef { system: string; id: string; version?: string }

export type RulesOrigin = 'foundry' | 'user' | 'legacy'

export type RulesKind =
  | 'item' | 'creature' | 'hazard' | 'spell' | 'feat' | 'action' | 'condition'
  | 'ancestry' | 'heritage' | 'background' | 'class' | 'deity' | 'relicGift' | 'vehicle'
  | 'starship' | 'starshipFrame' | 'battleStation' | 'stationUpgrade' | 'expansionBay'

export interface Publication { title: string; remaster: boolean; license?: string }

export interface DamageRoll { formula: string; type: string }

// ── Base ───────────────────────────────────────────────────────────────────

export interface RulesEntityBase {
  id: string
  origin: RulesOrigin
  kind: RulesKind
  game: GameId | 'both'
  name: string
  sortName: string              // lower-cased name; indexed for prefix search and sorting
  level: number
  rarity: Rarity
  traits: string[]
  publication?: Publication
  supersededBy?: string         // legacy entry → its remaster version
  description: string           // markdown; may contain > [!hidden] blocks
  sourceRefs: SourceRef[]
  upstream?: { pack: string; version: string; hash: string; removed?: boolean }
  // user-owned
  img?: string | null
  gmNotes?: string
  tags?: string[]
  isFavorite?: boolean
  style?: { color?: string; icon?: string }   // token badge look (conditions)
  localEdits?: Record<string, unknown>   // dotted path → value, applied over upstream fields
  legacy?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ── Kinds ──────────────────────────────────────────────────────────────────

export type ItemCategory =
  | 'weapon' | 'armor' | 'shield' | 'equipment' | 'consumable' | 'treasure'
  | 'container' | 'ammunition' | 'kit'

/** Fundamental and property runes (PF2e). Potency +1…+3; striking/resilient 1 = base, 2 = greater, 3 = major. */
export interface Runes {
  potency: number
  striking?: number
  resilient?: number
  property: string[]
}

export interface Item extends RulesEntityBase {
  kind: 'item'
  category: ItemCategory
  subcategory?: string
  baseItem?: string
  price: Money | null
  /** The price buys this many (ammunition: 1 sp for 10). */
  priceFor?: number
  bulk: BulkTenths
  bulkNote?: string
  usage?: string
  hands?: string
  activation?: { cost: ActionCost; traits?: string[]; text?: string }[]
  uses?: { max: number }
  unidentified?: { name: string; description?: string }
  weapon?: {
    category: string; group?: string
    damage: { dice: number; die: string; type: string }
    range?: number; reload?: string
    ammo?: { type?: string; capacity?: number }; expend?: number; grade?: string; splash?: number
    runes?: Runes
  }
  armor?: { category: string; group?: string; acBonus: number; dexCap: number | null; checkPenalty: number; speedPenalty: number; strength: number | null; grade?: string; runes?: Runes }
  shield?: { acBonus: number; hardness: number; hp: number; bt: number }
  container?: { capacity: BulkTenths; bulkReduction: BulkTenths }
  material?: { type: string; grade: string } | null
}

export interface Sense { type: string; acuity?: string; range?: number }
export interface Resistance { type: string; value: number; except?: string[]; note?: string }
export interface Weakness { type: string; value: number; note?: string }

export interface Strike {
  name: string
  range: 'melee' | 'ranged'
  bonus: number
  traits: string[]
  damage: DamageRoll[]
  effects?: string[]
  /** Ranged: feet per range increment (SF2e Area Fire and Auto-Fire use it). */
  rangeIncrement?: number
}

export interface StatAction {
  name: string
  cost: ActionCost
  section: 'interaction' | 'defensive' | 'offensive'
  traits: string[]
  frequency?: string
  text: string
}

export interface Spellcasting {
  name: string
  tradition: string
  type: 'prepared' | 'spontaneous' | 'innate' | 'focus' | 'ritual'
  dc: number
  attack?: number
  spells: { spellId?: string; name: string; rank: number; heightenedTo?: number; uses?: number }[]
}

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

export interface Creature extends RulesEntityBase {
  kind: 'creature'
  size: Size
  perception: number
  senses: Sense[]
  languages: string[]
  skills: Record<string, number>
  abilities: Record<AbilityKey, number>
  ac: number
  acNote?: string
  saves: { fort: number; ref: number; will: number }
  saveNote?: string
  hp: number
  hpNote?: string
  hardness?: number
  immunities: string[]
  weaknesses: Weakness[]
  resistances: Resistance[]
  speeds: Record<string, number>
  strikes: Strike[]
  actions: StatAction[]
  spellcasting: Spellcasting[]
  /** Gear the creature carries; itemId links the compendium entry when Foundry provides one. */
  inventory: { itemId?: string; name: string; quantity: number }[]
  tokenImg?: string | null
  /** Homebrew made with the creature builder: its road map and columns, for "Rebuild at level". */
  build?: CreatureBuild
}

export interface Hazard extends RulesEntityBase {
  kind: 'hazard'
  complex: boolean
  stealth: { bonus: number | null; note?: string }
  disable: string
  ac?: number
  saves?: Partial<{ fort: number; ref: number; will: number }>
  hardness?: number
  hp?: number
  bt?: number
  immunities?: string[]
  weaknesses?: Weakness[]
  resistances?: Resistance[]
  strikes?: Strike[]
  actions: StatAction[]
  routine?: string
  reset?: string
}

export interface Spell extends RulesEntityBase {
  kind: 'spell'                 // level = rank; cantrips: level 1 + trait 'cantrip'
  spellType: 'spell' | 'focus' | 'ritual'
  traditions: string[]
  cast: ActionCost
  range?: string
  area?: string
  targets?: string
  duration?: string
  sustained?: boolean
  defense?: { save: 'fort' | 'ref' | 'will'; basic: boolean } | { ac: true } | null
  damage?: DamageRoll[]
  heightened?: { trigger: string; text: string }[]
}

export interface Feat extends RulesEntityBase {
  kind: 'feat'
  category: string              // ancestry, class, general, skill, archetype, …
  cost: ActionCost
  prerequisites: string[]
  trigger?: string
  frequency?: string
  requirements?: string
  /** Class feature that offers a choice (Foundry ChoiceSet): the option groups it picks from, e.g. ['mystic-connection']. */
  choices?: string[]
  /** Class feature that is one option of such a choice (a subclass: muse, connection, domain …). */
  optionOf?: string[]
}

export interface Action extends RulesEntityBase {
  kind: 'action'
  cost: ActionCost
  category?: string
  trigger?: string
  frequency?: string
  requirements?: string
}

export interface Condition extends RulesEntityBase {
  kind: 'condition'
  group?: string
  valued: boolean
  overrides: string[]
  aliases?: string[]
}

/** Ancestry, heritage, background, class, deity: reference entries. Kind-specific
 *  facts live in `facts` until a feature needs them typed. */
export interface ReferenceEntry extends RulesEntityBase {
  kind: 'ancestry' | 'heritage' | 'background' | 'class' | 'deity'
  facts: Record<string, string | number | string[]>
  /** Class: its class features by level (names of feat entries). */
  features?: ClassFeatureRef[]
  /** Class: the levels its feat slots and skill increases come at (rules/progression.ts has the defaults). */
  progression?: Partial<ClassProgression>
}

export interface ClassFeatureRef { level: number; name: string }

export interface ClassProgression {
  classFeats: number[]
  skillFeats: number[]
  generalFeats: number[]
  ancestryFeats: number[]
  skillIncreases: number[]
}

export type GiftTier = 'minor' | 'major' | 'grand'
export const GIFT_TIERS: GiftTier[] = ['minor', 'major', 'grand']

/** A relic gift (GMG p. 96): attached to a relic in the inventory as it awakens. */
export interface RelicGift extends RulesEntityBase {
  kind: 'relicGift'
  tier: GiftTier
  /** Relic aspects it belongs to (air, fiend, …), lower case. */
  aspects: string[]
  prerequisites?: string[]
  activation?: { cost: ActionCost; traits?: string[]; frequency?: string; trigger?: string; text?: string }[]
  /** Name of the rune the gift grants ("the relic gains the flaming rune"). */
  grantsRune?: string
}

/**
 * A vehicle (Foundry `vehicle` actor; SF2e Tech Core pp. 134–141, PF2e GM Core).
 * An object with crew: AC, Fortitude, Hardness and HP, a collision and a piloting check.
 */
export interface Vehicle extends RulesEntityBase {
  kind: 'vehicle'
  size: Size
  price: Money | null
  ac: number
  fort: number
  hardness: number
  hp: number
  bt?: number
  immunities: string[]
  weaknesses: Weakness[]
  resistances: Resistance[]
  /** Collision: a basic Reflex save against the DC, for the damage. */
  collision: { dc: number | null; damage: string }
  crew: string
  passengers: string
  /** "Piloting (DC 25)" */
  pilotingCheck: string
  /** Feet. */
  space: { long: number; wide: number; high: number } | null
  /** "40 feet (motorized), fly 60 feet (motorized)" */
  speed: string
  actions: StatAction[]
}

// ── Starships (SF2e Tech Core ch. 6–7, STARFINDER_PLAN.md P3) ───────────────────
// Foundry has no starship data: these come from homebrew files (the book,
// imported locally). Distances are zones on the sensor map.

/** A station action: an action available while helming a battle station, from a grade on. */
export interface StationAction extends StatAction {
  /** Lowest grade of the station that grants it (commercial … paragon); missing = always. */
  grade?: string
}

/** One row of a battle station's advancement table (Tech Core pp. 179–183). */
export interface StationAdvancement {
  grade: string
  /** Starship level the station reaches this grade at. */
  level: number
  /** Upgrade slots at this grade. */
  upgrades: number
  /** Item bonuses while someone helms the station. */
  helmed?: Partial<Record<'ac' | 'fort' | 'ref' | 'will', number>>
  /** Added to the starship's sensor range (scanners), helmed or not. */
  sensors?: number
  /** Gunnery: weapon damage dice and tracking bonus. */
  damageDice?: number
  tracking?: number
  /** Drone console: drones it can deploy. */
  drones?: number
}

export interface BattleStation extends RulesEntityBase {
  kind: 'battleStation'
  /** Benefits while installed, helmed or not (markdown). */
  benefits?: string
  /** Benefits while helmed (markdown). */
  helmedBenefits?: string
  advancement: StationAdvancement[]
  actions: StationAction[]
}

export interface StarshipWeapon {
  category: 'simple' | 'martial' | 'advanced'
  damage: { dice: number; die: string; type: string }
  /** Range increment in zones. */
  range: number
  /** Upgrade slots (the weapon table's column). */
  upgrades: number
  group?: string
}

/** A battle station upgrade or a starship weapon (installed in a gunnery). */
export interface StationUpgrade extends RulesEntityBase {
  kind: 'stationUpgrade'
  /** Station it installs in, lower case ("gunnery", "pilot's console"); "any" for every station. */
  station: string
  actions: StationAction[]
  /** Grades with their own level ("Type tactical; Level 2"), and what changes. */
  grades?: { grade: string; level: number; text?: string }[]
  weapon?: StarshipWeapon
}

/** A starship frame (bulwark, explorer, skirmisher): the player starship's statistics by level. */
export interface StarshipFrame extends RulesEntityBase {
  kind: 'starshipFrame'
  size: Size
  sensorRange: number
  expansionBays: number
  /** Customizable battle station slots besides the default ones. */
  customSlots: number
  /** Stations the frame comes with, and upgrades built into them (not counted against the limit). */
  defaultStations: { station: string; upgrades: string[] }[]
  /** One row per level, 1…20. Speed in zones. */
  stats: { level: number; hp: number; sp: number; ac: number; fort: number; ref: number; will: number; speed: number }[]
}

export interface ExpansionBay extends RulesEntityBase {
  kind: 'expansionBay'
  /** False for bays that don't use one of the starship's expansion bay slots (crew quarters, lounge, mess bay). */
  takesSlot: boolean
  /** Choices within the bay (crew quarters: bunks, budget, …). */
  options?: { name: string; text: string }[]
}

export interface StarshipStrike extends Strike {
  /** Range increment in zones. */
  rangeZones?: number
}

/** An enemy or NPC starship (Tech Core "Starship Archive"); the level is its STARSHIP level. */
export interface Starship extends RulesEntityBase {
  kind: 'starship'
  size: Size
  perception: number
  sensorRange: number
  skills: Record<string, number>
  abilities: Record<AbilityKey, number>
  ac: number
  saves: { fort: number; ref: number; will: number }
  /** Hull Points. */
  hp: number
  /** Shield Points and the generator's fortify value. */
  shields?: { max: number; fortify: number } | null
  /** "starship immunities" stands for the standard list (rules/starships.ts). */
  immunities: string[]
  weaknesses: Weakness[]
  resistances: Resistance[]
  /** Zones. */
  speed: number
  battleStations: { station: string; actions: string[]; weapons?: string[] }[]
  strikes: StarshipStrike[]
  actions: StatAction[]
  living?: boolean
}

export type RulesEntity = Item | Creature | Hazard | Spell | Feat | Action | Condition | ReferenceEntry | RelicGift | Vehicle
  | Starship | StarshipFrame | BattleStation | StationUpgrade | ExpansionBay

export type RulesEntityOf<K extends RulesKind> = Extract<RulesEntity, { kind: K }>

// ── Kind config ────────────────────────────────────────────────────────────

export interface RulesKindConfig {
  label: string
  plural: string
  segment: string               // route segment under /compendium/
  icon: string
  color: string
  levelLabel: string            // "Level", "Rank"
  hasLevel: boolean             // false for reference kinds whose level is meaningless
  /** Sidebar group; kinds without one are listed first. */
  group?: 'starships'
  /** Only offered in campaigns of this game (the compendium shows it anyway). */
  game?: GameId
}

export const RULES_KIND_CONFIG: Record<RulesKind, RulesKindConfig> = {
  item:       { label: 'Item',       plural: 'Items',       segment: 'items',       icon: 'gi-swap-bag',            color: '#e8c44a', levelLabel: 'Level', hasLevel: true },
  creature:   { label: 'Creature',   plural: 'Creatures',   segment: 'creatures',   icon: 'gi-dragon-head',         color: '#e05555', levelLabel: 'Level', hasLevel: true },
  hazard:     { label: 'Hazard',     plural: 'Hazards',     segment: 'hazards',     icon: 'gi-wolf-trap',         color: '#e8924a', levelLabel: 'Level', hasLevel: true },
  spell:      { label: 'Spell',      plural: 'Spells',      segment: 'spells',      icon: 'gi-spell-book',          color: '#a87de8', levelLabel: 'Rank',  hasLevel: true },
  feat:       { label: 'Feat',       plural: 'Feats',       segment: 'feats',       icon: 'gi-laurels',             color: '#4ab8e8', levelLabel: 'Level', hasLevel: true },
  action:     { label: 'Action',     plural: 'Actions',     segment: 'actions',     icon: 'gi-lightning-trio',      color: '#5fc98a', levelLabel: 'Level', hasLevel: false },
  condition:  { label: 'Condition',  plural: 'Conditions',  segment: 'conditions',  icon: 'gi-poison-bottle',       color: '#c86fa8', levelLabel: 'Level', hasLevel: false },
  ancestry:   { label: 'Ancestry',   plural: 'Ancestries',  segment: 'ancestries',  icon: 'gi-family-tree',         color: '#7cc44e', levelLabel: 'Level', hasLevel: false },
  heritage:   { label: 'Heritage',   plural: 'Heritages',   segment: 'heritages',   icon: 'gi-tree-branch',         color: '#9acd5e', levelLabel: 'Level', hasLevel: false },
  background: { label: 'Background', plural: 'Backgrounds', segment: 'backgrounds', icon: 'gi-scroll-unfurled',     color: '#b5a07a', levelLabel: 'Level', hasLevel: false },
  class:      { label: 'Class',      plural: 'Classes',     segment: 'classes',     icon: 'gi-swords-emblem',       color: '#6b9fe8', levelLabel: 'Level', hasLevel: false },
  deity:      { label: 'Deity',      plural: 'Deities',     segment: 'deities',     icon: 'gi-angel-outfit',        color: '#d4b54a', levelLabel: 'Level', hasLevel: false },
  relicGift:  { label: 'Relic gift', plural: 'Relic gifts', segment: 'relic-gifts', icon: 'gi-gem-pendant',         color: '#e0a35a', levelLabel: 'Level', hasLevel: false },
  vehicle:    { label: 'Vehicle',    plural: 'Vehicles',    segment: 'vehicles',    icon: 'gi-jeep',                color: '#8fa3b8', levelLabel: 'Level', hasLevel: true },
  starship:       { label: 'Starship',        plural: 'Starships',        segment: 'starships',        icon: 'gi-spaceship',       color: '#4ab8e8', levelLabel: 'Starship', hasLevel: true,  group: 'starships', game: 'sf2e' },
  starshipFrame:  { label: 'Starship frame',  plural: 'Frames',           segment: 'starship-frames',  icon: 'gi-space-shuttle',   color: '#5aa0d8', levelLabel: 'Level',    hasLevel: false, group: 'starships', game: 'sf2e' },
  battleStation:  { label: 'Battle station',  plural: 'Battle stations',  segment: 'battle-stations',  icon: 'gi-radar-sweep',     color: '#6bc0c8', levelLabel: 'Level',    hasLevel: false, group: 'starships', game: 'sf2e' },
  stationUpgrade: { label: 'Station upgrade', plural: 'Station upgrades', segment: 'station-upgrades', icon: 'gi-cog',             color: '#8fb0d0', levelLabel: 'Level',    hasLevel: true,  group: 'starships', game: 'sf2e' },
  expansionBay:   { label: 'Expansion bay',   plural: 'Expansion bays',   segment: 'expansion-bays',   icon: 'gi-cargo-crate',     color: '#a0a8c0', levelLabel: 'Level',    hasLevel: false, group: 'starships', game: 'sf2e' },
}

export const RULES_KINDS = Object.keys(RULES_KIND_CONFIG) as RulesKind[]

export const REFERENCE_KINDS = ['ancestry', 'heritage', 'background', 'class', 'deity'] as const

export function isRulesKind(v: string): v is RulesKind {
  return v in RULES_KIND_CONFIG
}

export function kindForSegment(segment: string): RulesKind | null {
  return RULES_KINDS.find(k => RULES_KIND_CONFIG[k].segment === segment) ?? null
}

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'unique']
export const SIZES: Size[] = ['tiny', 'sm', 'med', 'lg', 'huge', 'grg']
export const ITEM_CATEGORIES: ItemCategory[] = ['weapon', 'armor', 'shield', 'equipment', 'consumable', 'treasure', 'container', 'ammunition', 'kit']
