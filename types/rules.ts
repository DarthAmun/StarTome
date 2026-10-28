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
import type { GameId } from '~/types/game'

// ── Primitives ─────────────────────────────────────────────────────────────

export type Rarity = 'common' | 'uncommon' | 'rare' | 'unique'
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
  | 'ancestry' | 'heritage' | 'background' | 'class' | 'deity'

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
  localEdits?: Record<string, unknown>   // dotted path → value, applied over upstream fields
  legacy?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ── Kinds ──────────────────────────────────────────────────────────────────

export type ItemCategory =
  | 'weapon' | 'armor' | 'shield' | 'equipment' | 'consumable' | 'treasure'
  | 'container' | 'ammunition' | 'kit'

export interface Item extends RulesEntityBase {
  kind: 'item'
  category: ItemCategory
  subcategory?: string
  baseItem?: string
  price: Money | null
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
  }
  armor?: { category: string; group?: string; acBonus: number; dexCap: number | null; checkPenalty: number; speedPenalty: number; strength: number | null; grade?: string }
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
}

export interface StatAction {
  name: string
  cost: ActionCost
  section: 'interaction' | 'defensive' | 'offensive'
  traits: string[]
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
  inventory: { itemId: string; quantity: number }[]
  tokenImg?: string | null
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
}

export type RulesEntity = Item | Creature | Hazard | Spell | Feat | Action | Condition | ReferenceEntry

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
