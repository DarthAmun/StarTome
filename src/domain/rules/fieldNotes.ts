/**
 * Field notes: a creature's stat block as plain sentences for a player, one
 * paragraph per line of a Monstrumologist monster page (the homebrew class's
 * Identity, Defenses, Weaknesses and Abilities lines).
 *
 * Numbers never appear (except the level, which the Identity line reveals).
 * Each number is rated against GM Core's Building Creatures tables for the
 * creature's level, so "low on willpower" means low for a creature of that
 * level, the way Recall Knowledge answers truthfully without raw numbers.
 * Weak/elite tokens pass their adjusted entry, so the ratings follow it.
 */
import { averageDamage, columnOf, type Column } from '@/domain/rules/creatureBuilding'
import { formatTrait, SIZE_LABEL } from '@/domain/rules/format'
import type { Creature, Resistance, Spellcasting, StatAction, Strike, Weakness } from '@/domain/rules/types'

export type FieldLine = 'identity' | 'defenses' | 'weaknesses' | 'abilities'
export const FIELD_LINES: FieldLine[] = ['identity', 'defenses', 'weaknesses', 'abilities']
export const FIELD_LINE_LABEL: Record<FieldLine, string> = {
  identity: 'Identity', defenses: 'Defenses', weaknesses: 'Weaknesses', abilities: 'Abilities',
}

export interface FieldNote { line: FieldLine; label: string; text: string }

export interface FieldNotesOptions {
  /** Abilities also lists the Strikes and actions as the stat block prints them (for Mimicry). */
  statBlockText?: boolean
}

const RANK: Record<Column, number> = { extreme: 4, high: 3, moderate: 2, low: 1, terrible: 0 }

/** "the goblin warrior" → "The goblin warrior"; names already starting with "the" stay as they are. */
export function subjectName(name: string): string {
  return /^the\s/i.test(name) ? name[0]!.toUpperCase() + name.slice(1) : `The ${name}`
}

export function fieldNotes(c: Creature, opts: FieldNotesOptions = {}): FieldNote[] {
  const text: Record<FieldLine, string> = {
    identity: identityText(c),
    defenses: defensesText(c),
    weaknesses: weaknessesText(c),
    abilities: abilitiesText(c, opts),
  }
  return FIELD_LINES.map(line => ({ line, label: FIELD_LINE_LABEL[line], text: text[line] }))
}

/** Every line as one block to paste, each under its heading. */
export function fieldNotesText(name: string, notes: FieldNote[]): string {
  return [`${name}: field notes`, ...notes.map(n => `${n.label}\n${n.text}`)].join('\n\n')
}

// ── Identity ───────────────────────────────────────────────────────────────

function identityText(c: Creature): string {
  const size = SIZE_LABEL[c.size] ?? ''
  const traits = c.traits.map(formatTrait)
  const rarity = c.rarity === 'common' ? '' : ` It is ${c.rarity === 'uncommon' ? 'an' : 'a'} ${c.rarity} creature.`
  const kind = traits.length ? `${size ? `${size} ` : ''}creature with the ${list(traits)} trait${traits.length === 1 ? '' : 's'}` : `${size ? `${size} ` : ''}creature`
  return `${subjectName(c.name)} is a level ${c.level} ${kind}.${rarity}`
}

// ── Defenses ───────────────────────────────────────────────────────────────

type Save = 'fort' | 'ref' | 'will'
const SAVE_NAME: Record<Save, string> = { fort: 'Fortitude', ref: 'Reflex', will: 'Will' }

/** What each save says about the creature at each column, as the rest of a sentence after its name. */
const SAVE_PHRASE: Record<Save, Record<Column, string>> = {
  fort: {
    extreme: 'is incredibly tough', high: 'can take a beating', moderate: 'is about as hardy as you would expect',
    low: 'is physically frail', terrible: 'is very frail',
  },
  ref: {
    extreme: 'is lightning quick', high: 'is quick to dodge', moderate: 'dodges about as well as you would expect',
    low: 'is slow to react', terrible: 'is very sluggish',
  },
  will: {
    extreme: 'has an iron will', high: 'is strong-willed', moderate: 'is about as strong-willed as you would expect',
    low: 'is low on willpower', terrible: 'is very weak-minded',
  },
}

const AC_PHRASE: Record<Column, string> = {
  extreme: 'Its defenses are exceptionally hard to get through; most attacks will glance off.',
  high: 'It is well protected and harder to hit than most.',
  moderate: 'Its armor is about what you would expect for a creature of its level.',
  low: 'It is poorly protected and easy to hit.',
  terrible: 'It is barely protected at all.',
}

const HP_PHRASE: Record<Column, string> = {
  extreme: 'There is a lot of it to get through; expect a long fight.',
  high: 'There is a lot of it to get through; expect a long fight.',
  moderate: 'It can take about as much punishment as you would expect.',
  low: 'It does not have much staying power and goes down quickly once you land your hits.',
  terrible: 'It does not have much staying power and goes down quickly once you land your hits.',
}

function defensesText(c: Creature): string {
  const name = subjectName(c.name)
  const bands = (['fort', 'ref', 'will'] as Save[]).map(s => ({ save: s, col: columnOf(s, c.saves[s], c.level) }))
  const top = Math.max(...bands.map(b => RANK[b.col]))
  const bottom = Math.min(...bands.map(b => RANK[b.col]))
  let saves: string
  if (top === bottom) {
    const col = bands[0]!.col
    saves = `${name} has no weak spot among its saves: it ${bandWord(col)} against attacks on body, reflexes and mind alike.`
  } else {
    const weak = bands.filter(b => RANK[b.col] === bottom)
    const strong = bands.filter(b => RANK[b.col] === top)
    const mid = bands.filter(b => RANK[b.col] !== top && RANK[b.col] !== bottom)
    const join = bottom <= RANK.moderate ? 'but' : 'and'
    saves = `${name} ${list(weak.map(b => SAVE_PHRASE[b.save][b.col]))} ${join} ${list(strong.map(b => SAVE_PHRASE[b.save][b.col]))}.`
    if (mid.length) saves += ` It ${SAVE_PHRASE[mid[0]!.save][mid[0]!.col]}.`
    saves += ` Effects that target its ${list(weak.map(b => SAVE_NAME[b.save]), 'or')} are your best bet; its ${list(strong.map(b => SAVE_NAME[b.save]), 'and')} ${strong.length === 1 ? 'is' : 'are'} the hardest to break.`
  }
  if (c.saveNote) saves += ' Some of its saves get better against certain effects.'
  const ac = AC_PHRASE[columnOf('ac', c.ac, c.level)]
  let hp = HP_PHRASE[columnOf('hp', c.hp, c.level)]
  if (c.hardness) hp += ' A hard exterior blunts every blow it takes.'
  if (c.hpNote && /regenerat|fast healing/i.test(c.hpNote)) hp += ' Its wounds close on their own, so focus your damage.'
  return [saves, ac, hp].join(' ')
}

/** A column as "holds up well" etc. for the even-saves sentence. */
function bandWord(col: Column): string {
  return { extreme: 'holds up exceptionally well', high: 'holds up well', moderate: 'holds up about as well as you would expect', low: 'holds up poorly', terrible: 'holds up very poorly' }[col]
}

// ── Weaknesses ─────────────────────────────────────────────────────────────

/** How big a weakness or resistance is for the level: roughly GM Core's Table 2-8 range. */
function iwrSize(value: number, level: number): 'small' | 'normal' | 'large' {
  const max = Math.max(3, level + 3)
  const min = Math.max(1, Math.ceil(level / 2) + 1)
  if (value >= max - 1) return 'large'
  if (value <= min) return 'small'
  return 'normal'
}

const typeName = (t: string) => t.replace(/-/g, ' ')

function weaknessPhrase(w: Weakness, level: number): string {
  const size = iwrSize(w.value, level)
  const base = size === 'large' ? `badly hurt by ${typeName(w.type)}` : size === 'small' ? `slightly vulnerable to ${typeName(w.type)}` : `vulnerable to ${typeName(w.type)}`
  return w.note ? `${base} (${w.note})` : base
}

function resistancePhrase(r: Resistance, level: number): string {
  const size = iwrSize(r.value, level)
  let base = size === 'large' ? `shrugs off most ${typeName(r.type)}` : size === 'small' ? `slightly resists ${typeName(r.type)}` : `resists ${typeName(r.type)}`
  if (r.except?.length) base += ` (except ${list(r.except.map(typeName), 'or')})`
  if (r.note) base += ` (${r.note})`
  return base
}

function weaknessesText(c: Creature): string {
  const name = subjectName(c.name)
  if (!c.weaknesses.length && !c.resistances.length && !c.immunities.length) {
    return `${name} has no special weaknesses, resistances or immunities: every kind of damage and effect works on it normally.`
  }
  const parts: string[] = []
  if (c.weaknesses.length) parts.push(`${name} is ${list(c.weaknesses.map(w => weaknessPhrase(w, c.level)))}.`)
  else parts.push(`${name} has no special weaknesses.`)
  if (c.resistances.length) parts.push(`It ${list(c.resistances.map(r => resistancePhrase(r, c.level)))}.`)
  if (c.immunities.length) parts.push(`It is immune to ${list(c.immunities.map(typeName))}.`)
  return parts.join(' ')
}

// ── Abilities ──────────────────────────────────────────────────────────────

const ATTACK_PHRASE: Record<Column, string> = {
  extreme: 'almost never misses', high: 'hits often', moderate: 'hits about as often as you would expect',
  low: 'misses a lot', terrible: 'misses a lot',
}
const DAMAGE_PHRASE: Record<Column, string> = {
  extreme: 'devastating', high: 'heavy', moderate: 'solid', low: 'light', terrible: 'light',
}
const SPELL_PHRASE: Record<Column, string> = {
  extreme: 'very hard to resist', high: 'hard to resist', moderate: 'about as hard to resist as you would expect',
  low: 'fairly easy to resist', terrible: 'fairly easy to resist',
}

/** Traits worth telling a player about an attack (how far it reaches, how often it can swing). */
const SHOWN_STRIKE_TRAIT = /^(reach|agile|range|thrown|deadly|fatal|forceful|sweep|trip|grapple|shove|backstab|versatile)/

function strikeSentence(s: Strike, level: number): string {
  const avg = s.damage.reduce((sum, d) => sum + averageDamage(d.formula), 0)
  const attack = ATTACK_PHRASE[columnOf('attack', s.bonus, level)]
  const dmg = DAMAGE_PHRASE[columnOf('damage', avg, level)]
  const types = [...new Set(s.damage.map(d => d.type).filter(Boolean))]
  const traits = s.traits.filter(t => SHOWN_STRIKE_TRAIT.test(t)).map(formatTrait)
  const range = s.range === 'melee' ? 'melee' : s.rangeIncrement ? `ranged, ${s.rangeIncrement} feet` : 'ranged'
  const head = `${capitalize(s.name)} (${[range, ...traits].join(', ')})`
  let out = `${head}: ${attack} and deals ${dmg} ${types.length ? `${list(types)} ` : ''}damage`
  if (s.effects?.length) out += `, plus ${list(s.effects)}`
  return `${out}.`
}

function spellSentence(sc: Spellcasting, level: number): string {
  const col = columnOf('spell', sc.dc, level)
  const kind = sc.type === 'innate' ? 'innate' : sc.type === 'focus' ? 'focus' : sc.type === 'ritual' ? 'ritual' : sc.type
  const top = [...sc.spells].sort((a, b) => (b.heightenedTo ?? b.rank) - (a.heightenedTo ?? a.rank))
  const names = [...new Set(top.map(s => s.name))].slice(0, 3)
  let out = `It casts ${kind} ${sc.tradition} spells that are ${SPELL_PHRASE[col]}`
  if (names.length) out += `, including ${list(names)}`
  return `${out}.`
}

const COST_WORD = (a: StatAction) => typeof a.cost === 'number' ? `${a.cost} action${a.cost === 1 ? '' : 's'}`
  : a.cost === 'free' ? 'free action' : a.cost && typeof a.cost === 'object' && 'min' in a.cost ? `${a.cost.min} to ${a.cost.max} actions` : ''

function abilityName(a: StatAction): string {
  const bits = [COST_WORD(a), a.traits.includes('aura') ? 'aura' : '', a.frequency ? 'limited uses' : ''].filter(Boolean)
  return bits.length ? `${a.name} (${bits.join(', ')})` : a.name
}

const SPEED_WORD: Record<string, string> = { fly: 'fly', swim: 'swim', climb: 'climb', burrow: 'burrow' }

function abilitiesText(c: Creature, opts: FieldNotesOptions): string {
  const name = subjectName(c.name)
  const parts: string[] = []
  if (c.strikes.length) {
    parts.push(`${name} attacks with ${list(c.strikes.map(s => s.name.toLowerCase()))}.`)
    parts.push(...c.strikes.map(s => strikeSentence(s, c.level)))
  } else {
    parts.push(`${name} has no weapon attacks of its own.`)
  }
  for (const sc of c.spellcasting) parts.push(spellSentence(sc, c.level))

  const reactions = c.actions.filter(a => a.cost === 'reaction')
  const active = c.actions.filter(a => a.section === 'offensive' && a.cost !== 'reaction')
  const passive = c.actions.filter(a => a.section !== 'offensive' && a.cost !== 'reaction' && (a.cost === null || a.cost === 'passive') && (a.traits.includes('aura') || a.section === 'defensive'))
  if (reactions.length) parts.push(`Watch out for its reaction${reactions.length === 1 ? '' : 's'}: ${list(reactions.map(a => a.name))}.`)
  else parts.push('It has no reactions.')
  if (active.length) parts.push(`Special abilities to expect: ${list(active.map(abilityName))}.`)
  if (passive.length) parts.push(`It always has ${list(passive.map(abilityName))} working for it.`)

  const moves = Object.entries(c.speeds).filter(([k, v]) => v > 0 && SPEED_WORD[k]).map(([k]) => SPEED_WORD[k]!)
  const land = c.speeds.land ?? 0
  if (moves.length) parts.push(`It can ${list(moves, 'and')}.`)
  if (land >= 40) parts.push('It is fast on its feet.')
  else if (land > 0 && land <= 15) parts.push('It is slow on its feet.')

  let out = parts.join(' ')
  if (opts.statBlockText) out += `\n\n${statBlockLines(c).join('\n')}`
  return out
}

/** The offensive part of the stat block as printed: Strikes and offensive actions (for Mimicry). */
export function statBlockLines(c: Creature): string[] {
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
  const strikes = c.strikes.map(s => {
    const traits = s.traits.length ? ` (${s.traits.map(formatTrait).join(', ')})` : ''
    const dmg = s.damage.map(d => `${d.formula} ${d.type}`.trim()).join(' plus ')
    const extra = s.effects?.length ? ` plus ${s.effects.join(', ')}` : ''
    return `${s.range === 'melee' ? 'Melee' : 'Ranged'} ${s.name} ${sign(s.bonus)}${traits}, Damage ${dmg}${extra}`
  })
  const actions = c.actions.filter(a => a.section === 'offensive').map(a => {
    const cost = COST_WORD(a)
    const traits = a.traits.length ? ` (${a.traits.map(formatTrait).join(', ')})` : ''
    return `${a.name}${cost ? ` [${cost}]` : ''}${traits} ${plain(a.text)}`.trim()
  })
  return [...strikes, ...actions]
}

/** Markdown and Foundry inline syntax down to readable text. */
function plain(md: string): string {
  return md
    .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, '$1')
    .replace(/@\w+\[([^\]|]*)[^\]]*\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Helpers ────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

/** "a", "a and b", "a, b and c". */
function list(items: string[], conj = 'and'): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`
}
