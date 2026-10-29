/**
 * GM Core's Building Creatures tables and road maps (FEATURES_PLAN.md §10.3).
 *
 * Tables 2-1 to 2-11, GM Core pp. 112-121, checked on Archives of Nethys
 * 2026-10-29 (https://2e.aonprd.com/Rules.aspx?ID=2874 and its sections).
 * SF2e uses the same tables. The road maps are GM Core's sidebar, which AoN
 * doesn't carry; they are entered from the book's wording and `ROADMAPS_VERIFIED`
 * stays false until checked.
 */
import type { AbilityKey, Creature, Strike } from '~/types/rules'

export type Column = 'extreme' | 'high' | 'moderate' | 'low' | 'terrible'
export const COLUMNS: Column[] = ['extreme', 'high', 'moderate', 'low', 'terrible']

export type BuildStat = 'perception' | AbilityKey | 'ac' | 'fort' | 'ref' | 'will' | 'hp'
export const ABILITY_STATS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
export const BUILD_STATS: BuildStat[] = ['perception', ...ABILITY_STATS, 'ac', 'fort', 'ref', 'will', 'hp']

export const MIN_BUILD_LEVEL = -1
export const MAX_BUILD_LEVEL = 24

// Rows are levels −1…24; columns in COLUMNS order (null = not in that table).
type Row = (number | null)[]

// Table 2-1: Attribute Modifier Scales. Extreme starts at level 1; terrible is −5 at every level (GM Core p. 115).
const ATTRIBUTES: Row[] = [
  [null, 3, 2, 0], [null, 3, 2, 0], [5, 4, 3, 1], [5, 4, 3, 1], [5, 4, 3, 1], [6, 5, 3, 2], [6, 5, 4, 2], [7, 5, 4, 2],
  [7, 6, 4, 2], [7, 6, 4, 3], [7, 6, 4, 3], [8, 7, 5, 3], [8, 7, 5, 3], [8, 7, 5, 4], [9, 8, 5, 4], [9, 8, 5, 4],
  [9, 8, 6, 4], [10, 9, 6, 5], [10, 9, 6, 5], [10, 9, 6, 5], [11, 10, 6, 5], [11, 10, 7, 6], [11, 10, 7, 6], [11, 10, 8, 6],
  [11, 10, 8, 6], [13, 12, 9, 7],
].map(r => [...r, -5])

// Table 2-2: Perception and Table 2-6: Saving Throws (the same numbers)
const PERCEPTION_SAVES: Row[] = [
  [9, 8, 5, 2, 0], [10, 9, 6, 3, 1], [11, 10, 7, 4, 2], [12, 11, 8, 5, 3], [14, 12, 9, 6, 4], [15, 14, 11, 8, 6],
  [17, 15, 12, 9, 7], [18, 17, 14, 11, 8], [20, 18, 15, 12, 10], [21, 19, 16, 13, 11], [23, 21, 18, 15, 12],
  [24, 22, 19, 16, 14], [26, 24, 21, 18, 15], [27, 25, 22, 19, 16], [29, 26, 23, 20, 18], [30, 28, 25, 22, 19],
  [32, 29, 26, 23, 20], [33, 30, 28, 25, 22], [35, 32, 29, 26, 23], [36, 33, 30, 27, 24], [38, 35, 32, 29, 26],
  [39, 36, 33, 30, 27], [41, 38, 35, 32, 28], [43, 39, 36, 33, 30], [44, 40, 37, 34, 31], [46, 42, 38, 36, 32],
]

// Table 2-3: Skills. Low is a range in the book (e.g. +4 to +3); terrible here is its lower end.
const SKILLS: Row[] = [
  [8, 5, 4, 2, 1], [9, 6, 5, 3, 2], [10, 7, 6, 4, 3], [11, 8, 7, 5, 4], [13, 10, 9, 7, 5], [15, 12, 10, 8, 7],
  [16, 13, 12, 10, 8], [18, 15, 13, 11, 9], [20, 17, 15, 13, 11], [21, 18, 16, 14, 12], [23, 20, 18, 16, 13],
  [25, 22, 19, 17, 15], [26, 23, 21, 19, 16], [28, 25, 22, 20, 17], [30, 27, 24, 22, 19], [31, 28, 25, 23, 20],
  [33, 30, 27, 25, 21], [35, 32, 28, 26, 23], [36, 33, 30, 28, 24], [38, 35, 31, 29, 25], [40, 37, 33, 31, 27],
  [41, 38, 34, 32, 28], [43, 40, 36, 34, 29], [45, 42, 37, 35, 31], [46, 43, 38, 36, 32], [48, 45, 40, 38, 33],
]

// Table 2-5: Armor Class
const AC: Row[] = [
  [18, 15, 14, 12], [19, 16, 15, 13], [19, 16, 15, 13], [21, 18, 17, 15], [22, 19, 18, 16], [24, 21, 20, 18],
  [25, 22, 21, 19], [27, 24, 23, 21], [28, 25, 24, 22], [30, 27, 26, 24], [31, 28, 27, 25], [33, 30, 29, 27],
  [34, 31, 30, 28], [36, 33, 32, 30], [37, 34, 33, 31], [39, 36, 35, 33], [40, 37, 36, 34], [42, 39, 38, 36],
  [43, 40, 39, 37], [45, 42, 41, 39], [46, 43, 42, 40], [48, 45, 44, 42], [49, 46, 45, 43], [51, 48, 47, 45],
  [52, 49, 48, 46], [54, 51, 50, 48],
].map(r => [...r, null])

// Table 2-7: Hit Points, as [high, moderate, low] ranges [max, min]; the builder uses the midpoint.
const HP_RANGES: [number, number][][] = [
  [[9, 9], [8, 7], [6, 5]], [[20, 17], [16, 14], [13, 11]], [[26, 24], [21, 19], [16, 14]], [[40, 36], [32, 28], [25, 21]],
  [[59, 53], [48, 42], [37, 31]], [[78, 72], [63, 57], [48, 42]], [[97, 91], [78, 72], [59, 53]], [[123, 115], [99, 91], [75, 67]],
  [[148, 140], [119, 111], [90, 82]], [[173, 165], [139, 131], [105, 97]], [[198, 190], [159, 151], [120, 112]],
  [[223, 215], [179, 171], [135, 127]], [[248, 240], [199, 191], [150, 142]], [[273, 265], [219, 211], [165, 157]],
  [[298, 290], [239, 231], [180, 172]], [[323, 315], [259, 251], [195, 187]], [[348, 340], [279, 271], [210, 202]],
  [[373, 365], [299, 291], [225, 217]], [[398, 390], [319, 311], [240, 232]], [[423, 415], [339, 331], [255, 247]],
  [[448, 440], [359, 351], [270, 262]], [[473, 465], [379, 371], [285, 277]], [[505, 495], [405, 395], [305, 295]],
  [[544, 532], [436, 424], [329, 317]], [[581, 569], [466, 454], [351, 339]], [[633, 617], [508, 492], [383, 367]],
]
const HP_COLUMNS: Column[] = ['high', 'moderate', 'low']

// Table 2-9: Strike Attack Bonus
const ATTACK: Row[] = [
  [10, 8, 6, 4], [10, 8, 6, 4], [11, 9, 7, 5], [13, 11, 9, 7], [14, 12, 10, 8], [16, 14, 12, 9], [17, 15, 13, 11],
  [19, 17, 15, 12], [20, 18, 16, 13], [22, 20, 18, 15], [23, 21, 19, 16], [25, 23, 21, 17], [27, 24, 22, 19],
  [28, 26, 24, 20], [29, 27, 25, 21], [31, 29, 27, 23], [32, 30, 28, 24], [34, 32, 30, 25], [35, 33, 31, 27],
  [37, 35, 33, 28], [38, 36, 34, 29], [40, 38, 36, 31], [41, 39, 37, 32], [43, 41, 39, 33], [44, 42, 40, 35],
  [46, 44, 42, 36],
].map(r => [...r, null])

// Table 2-10: Strike Damage (extreme, high, moderate, low)
const DAMAGE: string[][] = [
  ['1d6+1', '1d4+1', '1d4', '1d4'], ['1d6+3', '1d6+2', '1d4+2', '1d4+1'], ['1d8+4', '1d6+3', '1d6+2', '1d4+2'],
  ['1d12+4', '1d10+4', '1d8+4', '1d6+3'], ['1d12+8', '1d10+6', '1d8+6', '1d6+5'], ['2d10+7', '2d8+5', '2d6+5', '2d4+4'],
  ['2d12+7', '2d8+7', '2d6+6', '2d4+6'], ['2d12+10', '2d8+9', '2d6+8', '2d4+7'], ['2d12+12', '2d10+9', '2d8+8', '2d6+6'],
  ['2d12+15', '2d10+11', '2d8+9', '2d6+8'], ['2d12+17', '2d10+13', '2d8+11', '2d6+9'], ['2d12+20', '2d12+13', '2d10+11', '2d6+10'],
  ['2d12+22', '2d12+15', '2d10+12', '2d8+10'], ['3d12+19', '3d10+14', '3d8+12', '3d6+10'], ['3d12+21', '3d10+16', '3d8+14', '3d6+11'],
  ['3d12+24', '3d10+18', '3d8+15', '3d6+13'], ['3d12+26', '3d12+17', '3d10+14', '3d6+14'], ['3d12+29', '3d12+18', '3d10+15', '3d6+15'],
  ['3d12+31', '3d12+19', '3d10+16', '3d6+16'], ['3d12+34', '3d12+20', '3d10+17', '3d6+17'], ['4d12+29', '4d10+20', '4d8+17', '4d6+14'],
  ['4d12+32', '4d10+22', '4d8+19', '4d6+15'], ['4d12+34', '4d10+24', '4d8+20', '4d6+17'], ['4d12+37', '4d10+26', '4d8+22', '4d6+18'],
  ['4d12+39', '4d12+24', '4d10+20', '4d6+19'], ['4d12+42', '4d12+26', '4d10+22', '4d6+21'],
]

// Table 2-11: Spell DC and spell attack (extreme, high, moderate); the attack is DC − 8.
const SPELL_DC: Row[] = [
  [19, 16, 13], [19, 16, 13], [20, 17, 14], [22, 18, 15], [23, 20, 17], [25, 21, 18], [26, 22, 19], [27, 24, 21],
  [29, 25, 22], [30, 26, 23], [32, 28, 25], [33, 29, 26], [34, 30, 27], [36, 32, 29], [37, 33, 30], [39, 34, 31],
  [40, 36, 33], [41, 37, 34], [43, 38, 35], [44, 40, 37], [46, 41, 38], [47, 42, 39], [48, 44, 41], [50, 45, 42],
  [51, 46, 43], [52, 48, 45],
].map(r => [...r, null, null])

export function clampBuildLevel(level: number): number {
  return Math.max(MIN_BUILD_LEVEL, Math.min(MAX_BUILD_LEVEL, Math.round(level)))
}

function row<T>(table: T[], level: number): T {
  return table[clampBuildLevel(level) - MIN_BUILD_LEVEL]
}

/** Nearest column the table has, going towards moderate (e.g. extreme attributes below level 1 → high). */
function pick(r: Row, column: Column): number {
  const order: Column[] = column === 'terrible' ? ['terrible', 'low'] : column === 'extreme' ? ['extreme', 'high'] : [column, 'moderate']
  for (const c of order) {
    const v = r[COLUMNS.indexOf(c)]
    if (v !== null && v !== undefined) return v
  }
  return r[COLUMNS.indexOf('moderate')]!
}

/** Columns a stat's table has (HP: high/moderate/low; AC: no terrible). */
export function columnsFor(stat: BuildStat | 'skill' | 'attack' | 'damage' | 'spell'): Column[] {
  if (stat === 'hp') return HP_COLUMNS
  if (stat === 'ac' || stat === 'attack' || stat === 'damage') return ['extreme', 'high', 'moderate', 'low']
  if (stat === 'spell') return ['extreme', 'high', 'moderate']
  return COLUMNS
}

export function statValue(stat: BuildStat, column: Column, level: number): number {
  if (stat === 'hp') {
    const i = Math.max(0, HP_COLUMNS.indexOf(column === 'extreme' ? 'high' : column === 'terrible' ? 'low' : column))
    const [max, min] = row(HP_RANGES, level)[i]
    return Math.round((max + min) / 2)
  }
  if (stat === 'perception' || stat === 'fort' || stat === 'ref' || stat === 'will') return pick(row(PERCEPTION_SAVES, level), column)
  if (stat === 'ac') return pick(row(AC, level), column)
  return pick(row(ATTRIBUTES, level), column)
}

export function skillValue(column: Column, level: number): number {
  return pick(row(SKILLS, level), column)
}

export function attackValue(column: Column, level: number): number {
  return pick(row(ATTACK, level), column)
}

export function damageFormula(column: Column, level: number): string {
  const i = Math.max(0, ['extreme', 'high', 'moderate', 'low'].indexOf(column === 'terrible' ? 'low' : column))
  return row(DAMAGE, level)[i]
}

export function spellDc(column: Column, level: number): { dc: number; attack: number } {
  const dc = pick(row(SPELL_DC, level), column === 'low' || column === 'terrible' ? 'moderate' : column)
  return { dc, attack: dc - 8 }
}

// ── Road maps ──────────────────────────────────────────────────────────────

export interface Roadmap {
  label: string
  hint: string
  columns: Partial<Record<BuildStat, Column>>
  attack?: Column
  damage?: Column
  spell?: Column | null
}

export const ROADMAPS_VERIFIED = false

export const ROADMAPS: Record<string, Roadmap> = {
  custom: { label: 'Custom (all moderate)', hint: 'Every statistic moderate.', columns: {} },
  brute: {
    label: 'Brute', hint: 'Hits hard, soaks damage, easy to fool.',
    columns: { perception: 'low', str: 'high', con: 'high', dex: 'low', int: 'low', wis: 'low', cha: 'low', ac: 'low', fort: 'high', ref: 'low', will: 'low', hp: 'high' },
    attack: 'moderate', damage: 'extreme',
  },
  'magical-striker': {
    label: 'Magical striker', hint: 'Mixes strong Strikes with some spells.',
    columns: {}, attack: 'high', damage: 'high', spell: 'moderate',
  },
  'skill-paragon': {
    label: 'Skill paragon', hint: 'Many good skills; uses them in combat.',
    columns: { dex: 'high', ref: 'high', will: 'high', fort: 'low' },
  },
  skirmisher: {
    label: 'Skirmisher', hint: 'Mobile; darts in and out.',
    columns: { dex: 'high', fort: 'low', ref: 'high' },
  },
  sniper: {
    label: 'Sniper', hint: 'Deadly at range, fragile up close.',
    columns: { perception: 'high', dex: 'high', fort: 'low', ref: 'high', hp: 'low' },
    attack: 'high', damage: 'high',
  },
  soldier: {
    label: 'Soldier', hint: 'Tough front-liner with tactics.',
    columns: { str: 'high', ac: 'high', fort: 'high' },
    attack: 'high', damage: 'high',
  },
  spellcaster: {
    label: 'Spellcaster', hint: 'Strong spells, weak body.',
    columns: { int: 'high', fort: 'low', will: 'high', hp: 'low' },
    attack: 'low', damage: 'low', spell: 'high',
  },
}

// ── Building ───────────────────────────────────────────────────────────────

export interface BuildSkill { name: string; column: Column }
export interface BuildStrike {
  name: string
  range: 'melee' | 'ranged'
  traits: string[]
  damageType: string
  attack: Column
  damage: Column
}

/** What the builder stores on a homebrew creature, so it can be rebuilt at another level. */
export interface CreatureBuild {
  roadmap: string
  columns: Record<BuildStat, Column>
  skills: BuildSkill[]
  strikes: BuildStrike[]
  spell: { column: Column; tradition: string; type: 'innate' | 'prepared' | 'spontaneous' } | null
  /** Numbers typed over the table: stat key (e.g. "ac", "skill:stealth", "strike:0:attack") → value. */
  custom: Record<string, number | string>
}

export function roadmapColumns(roadmap: string): Record<BuildStat, Column> {
  const r = ROADMAPS[roadmap] ?? ROADMAPS.custom
  return Object.fromEntries(BUILD_STATS.map(s => [s, r.columns[s] ?? 'moderate'])) as Record<BuildStat, Column>
}

export function newBuild(roadmap = 'custom'): CreatureBuild {
  const r = ROADMAPS[roadmap] ?? ROADMAPS.custom
  return {
    roadmap,
    columns: roadmapColumns(roadmap),
    skills: [],
    strikes: [{ name: 'Strike', range: 'melee', traits: [], damageType: 'bludgeoning', attack: r.attack ?? 'moderate', damage: r.damage ?? 'moderate' }],
    spell: r.spell ? { column: r.spell, tradition: 'arcane', type: 'innate' } : null,
    custom: {},
  }
}

/** The stat block numbers a build gives at a level; typed-over values win. */
export function buildStats(build: CreatureBuild, level: number): Pick<Creature, 'perception' | 'abilities' | 'skills' | 'ac' | 'saves' | 'hp' | 'strikes' | 'spellcasting'> {
  const num = (key: string, table: number) => {
    const v = build.custom[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : table
  }
  const stat = (s: BuildStat) => num(s, statValue(s, build.columns[s], level))
  const strikes: Strike[] = build.strikes.map((s, i) => {
    const formula = build.custom[`strike:${i}:damage`]
    return {
      name: s.name || 'Strike',
      range: s.range,
      bonus: num(`strike:${i}:attack`, attackValue(s.attack, level)),
      traits: s.traits,
      damage: [{ formula: typeof formula === 'string' && formula.trim() ? formula.trim() : damageFormula(s.damage, level), type: s.damageType || 'bludgeoning' }],
    }
  })
  const spell = build.spell ? spellDc(build.spell.column, level) : null
  return {
    perception: stat('perception'),
    abilities: Object.fromEntries(ABILITY_STATS.map(a => [a, stat(a)])) as Creature['abilities'],
    skills: Object.fromEntries(build.skills.filter(s => s.name.trim()).map(s => {
      const key = s.name.trim().toLowerCase()
      return [key, num(`skill:${key}`, skillValue(s.column, level))]
    })),
    ac: stat('ac'),
    saves: { fort: stat('fort'), ref: stat('ref'), will: stat('will') },
    hp: stat('hp'),
    strikes,
    spellcasting: build.spell && spell ? [{
      name: `${titleWord(build.spell.tradition)} ${titleWord(build.spell.type)} Spells`,
      tradition: build.spell.tradition,
      type: build.spell.type,
      dc: num('spell:dc', spell.dc),
      attack: num('spell:attack', spell.attack),
      spells: [],
    }] : [],
  }
}

function titleWord(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Typed-over values a rebuild keeps (they don't follow the level), for listing. */
export function customKeys(build: CreatureBuild): string[] {
  return Object.keys(build.custom).filter(k => build.custom[k] !== '' && build.custom[k] !== undefined)
}

