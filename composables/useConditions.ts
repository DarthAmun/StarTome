import type { TokenCondition } from '~/stores/encounter'

import type { GameId } from '~/types/game'

export type ConditionGroup = 'abilities' | 'death' | 'senses' | 'detection' | 'attitudes' | 'other'

export interface ConditionCatalogEntry {
  icon: string     // oh-vue-icons gi-* name
  abbr: string
  color: string    // hex
  colorHex: number // 0x-prefixed number
  desc: string     // one-line reminder, not rules text
  valued: boolean  // always carries a value (Frightened 2)
  group: ConditionGroup
  games: GameId[]
}

type CatalogSeed = Omit<ConditionCatalogEntry, 'colorHex' | 'games'> & { games?: GameId[] }

const BOTH: GameId[] = ['pf2e', 'sf2e']

/** Built-in PF2e/SF2e remaster conditions. Temporary until the Foundry compendium
 *  sync (phase 3) provides condition entries with full rules text. */
const SEED: Record<string, CatalogSeed> = {
  'Blinded':           { icon: 'gi-sight-disabled',   abbr: 'BLD', color: '#7d8a99', valued: false, group: 'senses',    desc: "Can't see; everything is hidden to you; penalty to Perception." },
  'Broken':            { icon: 'gi-broken-shield',    abbr: 'BRK', color: '#8a7f73', valued: false, group: 'other',     desc: "Object is damaged and doesn't work properly." },
  'Clumsy':            { icon: 'gi-foot-trip',        abbr: 'CLM', color: '#c08a5a', valued: true,  group: 'abilities', desc: 'Status penalty to Dex-based checks and DCs, including AC and Reflex.' },
  'Concealed':         { icon: 'gi-cloak',            abbr: 'CNC', color: '#7a8fa6', valued: false, group: 'senses',    desc: 'Hard to see; attackers must pass a DC 5 flat check.' },
  'Confused':          { icon: 'gi-spiral-lollipop',  abbr: 'CNF', color: '#b87de8', valued: false, group: 'other',     desc: 'Off-guard; acts erratically and may attack anyone.' },
  'Controlled':        { icon: 'gi-puppet',           abbr: 'CTL', color: '#8456a8', valued: false, group: 'other',     desc: 'Another creature decides your actions.' },
  'Cursebound':        { icon: 'gi-cursed-star',      abbr: 'CRB', color: '#7a4fa0', valued: true,  group: 'abilities', desc: 'Accumulated curse; status penalty to some checks.' },
  'Dazzled':           { icon: 'gi-sun-radiations',   abbr: 'DAZ', color: '#d9c34a', valued: false, group: 'senses',    desc: 'Everything you see is concealed to you.' },
  'Deafened':          { icon: 'gi-mute',             abbr: 'DEF', color: '#8a9aaa', valued: false, group: 'senses',    desc: "Can't hear; penalty to Perception and initiative; auditory actions may fail." },
  'Doomed':            { icon: 'gi-death-skull',      abbr: 'DMD', color: '#5a3a4a', valued: true,  group: 'death',     desc: 'You die at a lower dying value.' },
  'Drained':           { icon: 'gi-blood',            abbr: 'DRN', color: '#a35b5b', valued: true,  group: 'abilities', desc: 'Status penalty to Con-based checks; lose max HP per level.' },
  'Dying':             { icon: 'gi-heart-beats',      abbr: 'DYG', color: '#d04a4a', valued: true,  group: 'death',     desc: 'Unconscious and close to death; recovery checks each turn.' },
  'Encumbered':        { icon: 'gi-weight',           abbr: 'ENC', color: '#9a8a6a', valued: false, group: 'other',     desc: 'Carrying too much; clumsy 1 and slower.' },
  'Enfeebled':         { icon: 'gi-weight-crush',     abbr: 'ENF', color: '#b5a07a', valued: true,  group: 'abilities', desc: 'Status penalty to Str-based rolls and DCs, including melee damage.' },
  'Fascinated':        { icon: 'gi-spiral-lollipop',  abbr: 'FSC', color: '#c86fa8', valued: false, group: 'other',     desc: 'Distracted by something; penalty to Perception and skills.' },
  'Fatigued':          { icon: 'gi-tired-eye',        abbr: 'FTG', color: '#8a7a6a', valued: false, group: 'other',     desc: 'Penalty to AC and saves; no exploration activities.' },
  'Fleeing':           { icon: 'gi-run',              abbr: 'FLE', color: '#e8924a', valued: false, group: 'other',     desc: 'Must spend actions getting away from the source.' },
  'Friendly':          { icon: 'gi-shaking-hands',    abbr: 'FRN', color: '#7cc44e', valued: false, group: 'attitudes', desc: 'Attitude: likes you and is willing to help in small ways.' },
  'Frightened':        { icon: 'gi-terror',           abbr: 'FRT', color: '#a06ad4', valued: true,  group: 'other',     desc: 'Status penalty to all checks and DCs; drops by 1 each turn.' },
  'Grabbed':           { icon: 'gi-grab',             abbr: 'GRB', color: '#c08a5a', valued: false, group: 'other',     desc: 'Immobilized and off-guard; manipulate actions may fail.' },
  'Helpful':           { icon: 'gi-glowing-hands',    abbr: 'HLP', color: '#5fc98a', valued: false, group: 'attitudes', desc: 'Attitude: actively wants to help you.' },
  'Hidden':            { icon: 'gi-hidden',           abbr: 'HID', color: '#6a7a8a', valued: false, group: 'detection', desc: 'Location known but not seen; DC 11 flat check to target.' },
  'Hostile':           { icon: 'gi-evil-hand',        abbr: 'HST', color: '#e05555', valued: false, group: 'attitudes', desc: 'Attitude: actively works against you.' },
  'Immobilized':       { icon: 'gi-manacles',         abbr: 'IMM', color: '#9aa7b8', valued: false, group: 'other',     desc: "Can't move with move actions." },
  'Indifferent':       { icon: 'gi-shrug',            abbr: 'IND', color: '#a0a0a0', valued: false, group: 'attitudes', desc: "Attitude: doesn't care either way." },
  'Invisible':         { icon: 'gi-invisible',        abbr: 'INV', color: '#88c5c5', valued: false, group: 'senses',    desc: "Can't be seen; undetected unless found." },
  'Observed':          { icon: 'gi-eye-target',       abbr: 'OBS', color: '#7a9ab5', valued: false, group: 'detection', desc: 'In plain view.' },
  'Off-Guard':         { icon: 'gi-shield-bash',      abbr: 'OFG', color: '#d9a43a', valued: false, group: 'other',     desc: '−2 circumstance penalty to AC.' },
  'Paralyzed':         { icon: 'gi-frozen-body',      abbr: 'PAR', color: '#6a9ac0', valued: false, group: 'other',     desc: "Off-guard; can't act except Recall Knowledge and mental actions." },
  'Persistent Damage': { icon: 'gi-burning-embers',   abbr: 'PER', color: '#e07b39', valued: false, group: 'other',     desc: 'Take damage at the end of each turn; flat check to end it.' },
  'Petrified':         { icon: 'gi-stone-bust',       abbr: 'PET', color: '#8a8a8a', valued: false, group: 'other',     desc: "Turned to stone; can't act or sense anything." },
  'Prone':             { icon: 'gi-falling',          abbr: 'PRN', color: '#b9824a', valued: false, group: 'other',     desc: 'Off-guard; penalty to attacks; only Crawl or Stand.' },
  'Quickened':         { icon: 'gi-sprint',           abbr: 'QCK', color: '#4ab8e8', valued: false, group: 'other',     desc: 'One extra action each turn, limited to specific uses.' },
  'Restrained':        { icon: 'gi-spider-web',       abbr: 'RST', color: '#9aa7b8', valued: false, group: 'other',     desc: "Off-guard and immobilized; can't attack or use most actions." },
  'Sickened':          { icon: 'gi-vomiting',         abbr: 'SCK', color: '#5fae54', valued: true,  group: 'other',     desc: "Status penalty to all checks and DCs; can't willingly ingest anything." },
  'Slowed':            { icon: 'gi-snail',            abbr: 'SLW', color: '#6a89b5', valued: true,  group: 'other',     desc: 'Lose that many actions at the start of each turn.' },
  'Stunned':           { icon: 'gi-knockout',         abbr: 'STN', color: '#d9c34a', valued: true,  group: 'other',     desc: 'Lose actions (or turns) until the value is used up.' },
  'Stupefied':         { icon: 'gi-brain',            abbr: 'STP', color: '#4aa3c0', valued: true,  group: 'abilities', desc: 'Status penalty to Int/Wis/Cha checks; spells may fail.' },
  'Unconscious':       { icon: 'gi-sleepy',           abbr: 'UNC', color: '#5a5a7a', valued: false, group: 'death',     desc: "Off-guard, blinded, prone; can't act." },
  'Undetected':        { icon: 'gi-ghost',            abbr: 'UND', color: '#6a6a8a', valued: false, group: 'detection', desc: 'Location unknown; attackers must guess a square.' },
  'Unfriendly':        { icon: 'gi-angry-eyes',       abbr: 'UNF', color: '#e8924a', valued: false, group: 'attitudes', desc: "Attitude: dislikes you and won't help." },
  'Unnoticed':         { icon: 'gi-ninja-head',       abbr: 'UNN', color: '#4a4a6a', valued: false, group: 'detection', desc: "The creature doesn't know you're there at all." },
  'Wounded':           { icon: 'gi-bleeding-wound',   abbr: 'WND', color: '#b04a4a', valued: true,  group: 'death',     desc: 'Dying value rises by this amount when you start dying.' },
  // SF2e additions
  'Glitching':         { icon: 'gi-circuitry',        abbr: 'GLT', color: '#4ae8d5', valued: true,  group: 'other',     desc: 'Tech malfunctions; flat checks when using affected equipment.', games: ['sf2e'] },
  'Suppressed':        { icon: 'gi-bullets',          abbr: 'SUP', color: '#c0a060', valued: false, group: 'other',     desc: 'Pinned by fire; penalty to attacks and Speed.', games: ['sf2e'] },
  'Untethered':        { icon: 'gi-astronaut-helmet', abbr: 'UTH', color: '#7a9ae8', valued: false, group: 'other',     desc: 'Floating in zero gravity without a way to move.', games: ['sf2e'] },
}

export const CONDITION_CATALOG: Record<string, ConditionCatalogEntry> = Object.fromEntries(
  Object.entries(SEED).map(([name, e]) => [name, { ...e, games: e.games ?? BOTH, colorHex: hexColorToNumber(e.color) }]),
)

/** Pre-remaster names that resolve to a remaster condition. */
export const CONDITION_ALIASES: Record<string, string> = {
  'Flat-Footed': 'Off-Guard',
  'Flat-footed': 'Off-Guard',
}

/** Catalog entry by name; case-insensitive, follows pre-remaster aliases. */
export function conditionInfo(name: string): ConditionCatalogEntry | undefined {
  const canonical = CONDITION_ALIASES[name] ?? name
  return CONDITION_CATALOG[canonical]
    ?? Object.entries(CONDITION_CATALOG).find(([n]) => n.toLowerCase() === canonical.toLowerCase())?.[1]
}

/** Built-in conditions available in a game, sorted by name. */
export function builtinConditions(game: GameId): ({ name: string } & ConditionCatalogEntry)[] {
  return Object.entries(CONDITION_CATALOG)
    .filter(([, e]) => e.games.includes(game))
    .map(([name, e]) => ({ name, ...e }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

const FALLBACK_COLORS = [
  '#7a8fa6', '#9a7ab5', '#7ab58a', '#b5a07a',
  '#7ab5b5', '#b57a7a', '#8a7ab5', '#b5b57a',
]

export function getConditionColor(name: string): string {
  return conditionInfo(name)?.color ?? FALLBACK_COLORS[Math.abs(hashStr(name)) % FALLBACK_COLORS.length]
}

export function getConditionColorHex(name: string): number {
  return hexColorToNumber(getConditionColor(name))
}

export function hexColorToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

export function visibleConditions(conditions: TokenCondition[], isDM: boolean): TokenCondition[] {
  return isDM ? conditions : conditions.filter(c => !c.hidden)
}

export type HealthState = 'healthy' | 'bloodied' | 'critical' | 'dead'

export function healthState(token: { isDead?: boolean; hpCurrent: number | null; hpMax: number | null }): HealthState {
  if (token.isDead || (token.hpCurrent ?? 0) <= 0) return 'dead'
  const f = (token.hpCurrent ?? 0) / (token.hpMax ?? 1)
  if (f <= 0.25) return 'critical'
  if (f <= 0.5) return 'bloodied'
  return 'healthy'
}

export function hpColor(f: number): string {
  if (f <= 0.25) return '#d04a4a'
  if (f <= 0.5) return '#c9973a'
  return '#1a9a80'
}

export function hpColorHex(f: number): number {
  if (f <= 0.25) return 0xd04a4a
  if (f <= 0.5) return 0xc9973a
  return 0x1a9a80
}

export const HEALTH_STATE_COLORS: Record<HealthState, string> = {
  healthy:  '#1a9a80',
  bloodied: '#c9973a',
  critical: '#d04a4a',
  dead:     '#777788',
}

export const HEALTH_STATE_LABELS: Record<HealthState, string> = {
  healthy:  'Healthy',
  bloodied: 'Bloodied',
  critical: 'Critical',
  dead:     'Dead',
}
