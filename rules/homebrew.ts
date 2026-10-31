/**
 * Homebrew import: reads a hand-written or AI-written JSON file of compendium
 * entries (HOMEBREW_FORMAT.md), checks every field against types/rules.ts and
 * fills safe defaults so a slip in the file can't break an entry's page.
 *
 * - error: the entry can't be imported (unknown kind, no name, a required
 *   number that isn't one …).
 * - warning: something was fixed or dropped (a default filled in, "15" read
 *   as 15, an unknown field left out).
 *
 * Pure functions; the homebrew page does the IO.
 */
import { newRulesEntity } from '~/rules/factory'
import { parseActionCost, parseBulk, parseMoney } from '~/rules/format'
import { GAME_IDS, type GameId } from '~/types/game'
import {
  isRulesKind, ITEM_CATEGORIES, kindForSegment, RARITIES, RULES_KIND_CONFIG, SIZES,
  type ActionCost, type RulesEntity, type RulesKind,
} from '~/types/rules'

export interface HomebrewIssue { level: 'error' | 'warning'; path: string; message: string }

export interface HomebrewCheck {
  /** Position in the file, from 0. */
  index: number
  name: string
  kind: RulesKind | null
  /** Null when the entry has errors. */
  entry: RulesEntity | null
  issues: HomebrewIssue[]
}

// ── File ───────────────────────────────────────────────────────────────────

/**
 * The raw entries of a homebrew file: a StarTome export (`rules`), a bare
 * array, or one entry. Pasted text may still carry its ```json fence.
 */
export function readHomebrewText(text: string): { entries: unknown[] } | { error: string } {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)```/)
  let data: unknown
  try { data = JSON.parse((fenced ? fenced[1] : text).trim()) }
  catch (err) { return { error: `Not valid JSON: ${(err as Error).message}` } }
  if (Array.isArray(data)) return { entries: data }
  if (isObj(data)) {
    if (Array.isArray(data.rules)) return { entries: data.rules }
    if ('kind' in data) return { entries: [data] }
  }
  return { error: 'No entries found: expected a `rules` array, an array of entries, or one entry with a `kind`.' }
}

// ── Checkers ───────────────────────────────────────────────────────────────

interface Ctx {
  issues: HomebrewIssue[]
  game: GameId | 'both'
}

const FAIL = Symbol('fail')
type Checker = (v: unknown, path: string, ctx: Ctx) => unknown

/** `req`: missing → `def` with a warning, or an error when there is no default. */
interface Field { check: Checker; req?: boolean; def?: unknown }
type Shape = Record<string, Field>

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const warn = (ctx: Ctx, path: string, message: string) => { ctx.issues.push({ level: 'warning', path, message }) }
const fail = (ctx: Ctx, path: string, message: string) => { ctx.issues.push({ level: 'error', path, message }); return FAIL }
const show = (v: unknown) => JSON.stringify(v)

const num: Checker = (v, path, ctx) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\s*[+-]?\d+(\.\d+)?\s*$/.test(v)) {
    warn(ctx, path, `text ${show(v)} read as a number`)
    return Number(v)
  }
  return fail(ctx, path, `should be a number, got ${show(v)}`)
}

const numOrNull: Checker = (v, path, ctx) => (v === null ? null : num(v, path, ctx))

const str: Checker = (v, path, ctx) => {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return fail(ctx, path, `should be text, got ${show(v)}`)
}

const bool: Checker = (v, path, ctx) => {
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === 'false') { warn(ctx, path, `text ${show(v)} read as true/false`); return v === 'true' }
  return fail(ctx, path, `should be true or false, got ${show(v)}`)
}

const strArr: Checker = (v, path, ctx) => {
  if (typeof v === 'string') {
    warn(ctx, path, 'should be a list; split the text on commas')
    return v.split(',').map(s => s.trim()).filter(Boolean)
  }
  if (!Array.isArray(v)) return fail(ctx, path, `should be a list of text, got ${show(v)}`)
  const out: string[] = []
  v.forEach((x, i) => {
    if (typeof x === 'string' || typeof x === 'number') out.push(String(x))
    else warn(ctx, `${path}[${i}]`, `dropped ${show(x)}: not text`)
  })
  return out
}

/** Traits are lower-case slugs ("two-hand-d10"). */
const traits: Checker = (v, path, ctx) => {
  const list = strArr(v, path, ctx)
  if (list === FAIL) return FAIL
  const slugs = (list as string[]).map(t => t.trim().toLowerCase().replace(/\s+/g, '-'))
  if (slugs.some((s, i) => s !== (list as string[])[i])) warn(ctx, path, 'traits turned into lower-case slugs')
  return [...new Set(slugs)]
}

function oneOf<T extends string>(values: readonly T[], aliases: Record<string, T> = {}): Checker {
  return (v, path, ctx) => {
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase()
      if ((values as readonly string[]).includes(v)) return v
      const hit = (values as readonly string[]).includes(t) ? t as T : aliases[t]
      if (hit) { warn(ctx, path, `${show(v)} read as ${show(hit)}`); return hit }
    }
    return fail(ctx, path, `should be one of ${values.join(', ')}; got ${show(v)}`)
  }
}

const SIZE_ALIASES: Record<string, (typeof SIZES)[number]> = { small: 'sm', medium: 'med', large: 'lg', gargantuan: 'grg', gar: 'grg' }

/** { cp } in copper; text like "350 credits" or "12 gp" is converted. */
const money: Checker = (v, path, ctx) => {
  if (v === null) return null
  if (isObj(v)) {
    const keys = Object.keys(v)
    if (keys.length === 1 && keys[0] === 'cp') {
      const cp = num(v.cp, `${path}.cp`, ctx)
      return cp === FAIL ? FAIL : { cp: Math.round(cp as number) }
    }
    // { credits: 350 } / { gp: 12, sp: 5 }
    const units: Record<string, number> = { pp: 1000, gp: 100, sp: 10, cp: 1, credits: 10, cr: 10 }
    if (keys.length && keys.every(k => k in units && typeof v[k] === 'number')) {
      const cp = keys.reduce((n, k) => n + (v[k] as number) * units[k], 0)
      warn(ctx, path, `${show(v)} converted to ${cp} cp`)
      return { cp: Math.round(cp) }
    }
  }
  if (typeof v === 'string') {
    const cp = parseMoney(v, ctx.game === 'pf2e' ? 'pf2e' : 'sf2e')
    if (cp !== null) { warn(ctx, path, `${show(v)} converted to ${cp} cp`); return { cp } }
  }
  return fail(ctx, path, `should be { "cp": number } or null, got ${show(v)}`)
}

/** Tenths; written forms ("L", "—", "2") are converted. A bare number is already tenths. */
const bulk: Checker = (v, path, ctx) => {
  if (v === null) return null
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
  if (typeof v === 'string') {
    const b = parseBulk(v)
    if (b !== undefined && b !== null) { warn(ctx, path, `${show(v)} converted to ${b} (tenths)`); return b }
  }
  return fail(ctx, path, `should be bulk in tenths (L = 1, 1 = 10) or null, got ${show(v)}`)
}

const actionCost: Checker = (v, path, ctx) => {
  if (v === null || v === 1 || v === 2 || v === 3 || v === 'free' || v === 'reaction' || v === 'passive') return v
  if (isObj(v)) {
    if (typeof v.text === 'string') return { text: v.text }
    if ([1, 2, 3].includes(v.min as number) && [1, 2, 3].includes(v.max as number)) return { min: v.min, max: v.max }
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const cost = parseActionCost(String(v))
    if (cost !== v) warn(ctx, path, `${show(v)} read as ${show(cost)}`)
    return cost satisfies ActionCost
  }
  return fail(ctx, path, `should be 1, 2, 3, "free", "reaction", "passive", { "text": … } or null; got ${show(v)}`)
}

/** Object with known fields; unknown ones are dropped with a warning. */
function shape(fields: Shape): Checker {
  return (v, path, ctx) => {
    if (!isObj(v)) return fail(ctx, path, `should be an object, got ${show(v)}`)
    return checkFields(v, fields, path, ctx, {})
  }
}

function arrOf(item: Checker): Checker {
  return (v, path, ctx) => {
    if (!Array.isArray(v)) return fail(ctx, path, `should be a list, got ${show(v)}`)
    const out: unknown[] = []
    v.forEach((x, i) => {
      // An element's own problems drop the element, not the entry
      const sub: Ctx = { ...ctx, issues: [] }
      const r = item(x, `${path}[${i}]`, sub)
      for (const iss of sub.issues) ctx.issues.push({ ...iss, level: 'warning' })
      if (r === FAIL) warn(ctx, `${path}[${i}]`, 'dropped')
      else out.push(r)
    })
    return out
  }
}

function record(value: Checker, lowerKeys = false): Checker {
  return (v, path, ctx) => {
    if (!isObj(v)) return fail(ctx, path, `should be an object, got ${show(v)}`)
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) {
      const r = value(x, `${path}.${k}`, ctx)
      if (r === FAIL) continue
      const key = lowerKeys ? k.trim().toLowerCase() : k
      if (key !== k) warn(ctx, `${path}.${k}`, `key lower-cased to ${show(key)}`)
      out[key] = r
    }
    return out
  }
}

const either = (...checks: Checker[]): Checker => (v, path, ctx) => {
  for (const c of checks) {
    const sub: Ctx = { ...ctx, issues: [] }
    const r = c(v, path, sub)
    if (r !== FAIL) { ctx.issues.push(...sub.issues); return r }
  }
  return fail(ctx, path, `unexpected value ${show(v)}`)
}

/** Fills `out` from `v` field by field. */
function checkFields(v: Record<string, unknown>, fields: Shape, path: string, ctx: Ctx, defaults: Record<string, unknown>): Record<string, unknown> | typeof FAIL {
  const out: Record<string, unknown> = {}
  let failed = false
  const p = (k: string) => (path ? `${path}.${k}` : k)
  for (const [k, f] of Object.entries(fields)) {
    const def = k in defaults ? defaults[k] : f.def
    if (v[k] === undefined) {
      if (!f.req) continue
      if (def === undefined) { fail(ctx, p(k), 'missing'); failed = true; continue }
      warn(ctx, p(k), `missing; set to ${show(def)}`)
      out[k] = structuredClone(def)
      continue
    }
    const sub: Ctx = { ...ctx, issues: [] }
    const r = f.check(v[k], p(k), sub)
    if (r === FAIL && f.req) { ctx.issues.push(...sub.issues); failed = true; continue }
    // Whatever went wrong inside a field that still came out was dropped there;
    // an optional field that doesn't check out is left out
    for (const iss of sub.issues) ctx.issues.push({ ...iss, level: 'warning' })
    if (r === FAIL) warn(ctx, p(k), 'left out')
    else out[k] = r
  }
  for (const k of Object.keys(v)) {
    if (!(k in fields) && !SILENT_KEYS.has(k)) warn(ctx, p(k), dropReason(k))
  }
  return failed ? FAIL : out
}

const req = (check: Checker, def?: unknown): Field => ({ check, req: true, def })
const opt = (check: Checker): Field => ({ check })

// ── Kind shapes ────────────────────────────────────────────────────────────

/** Recomputed or forced by the import, so not reported as dropped. */
const SILENT_KEYS = new Set(['id', 'kind', 'origin', 'sortName', 'sourceRefs', 'createdAt', 'updatedAt'])
export const OWNED_BY_APP = new Set(['img', 'tokenImg', 'localEdits', 'upstream', 'legacy', 'build', 'supersededBy'])
const dropReason = (k: string) => (OWNED_BY_APP.has(k) ? 'set by StarTome itself; left out' : 'unknown field; left out')

const damageRoll: Checker = (v, path, ctx) => {
  // "2d8+6 slashing"
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\S+)\s+(.+)$/)
    if (m) { warn(ctx, path, `${show(v)} split into formula and type`); return { formula: m[1], type: m[2].toLowerCase() } }
    return { formula: v.trim(), type: '' }
  }
  return shape({ formula: req(str), type: req(str, '') })(v, path, ctx)
}

const weaknessShape = shape({ type: req(str), value: req(num), note: opt(str) })
const resistanceShape = shape({ type: req(str), value: req(num), except: opt(strArr), note: opt(str) })

const strike = shape({
  name: req(str),
  range: req(oneOf(['melee', 'ranged'] as const), 'melee'),
  bonus: req(num),
  traits: req(traits, []),
  damage: req(arrOf(damageRoll), []),
  effects: opt(strArr),
})

const statAction = shape({
  name: req(str),
  cost: req(actionCost, null),
  section: req(oneOf(['interaction', 'defensive', 'offensive'] as const), 'offensive'),
  traits: req(traits, []),
  frequency: opt(str),
  text: req(str, ''),
})

const spellcasting = shape({
  name: req(str),
  tradition: req(str, ''),
  type: req(oneOf(['prepared', 'spontaneous', 'innate', 'focus', 'ritual'] as const)),
  dc: req(num),
  attack: opt(num),
  spells: req(arrOf(shape({ spellId: opt(str), name: req(str), rank: req(num), heightenedTo: opt(num), uses: opt(num) })), []),
})

const sense: Checker = (v, path, ctx) =>
  typeof v === 'string' ? { type: v } : shape({ type: req(str), acuity: opt(str), range: opt(num) })(v, path, ctx)

/** A bare number is the land Speed. */
const speeds: Checker = (v, path, ctx) => {
  if (typeof v === 'number') { warn(ctx, path, `read as { "land": ${v} }`); return { land: v } }
  return record(num, true)(v, path, ctx)
}

const runes = shape({ potency: req(num, 0), striking: opt(num), resilient: opt(num), property: req(strArr, []) })

const COMMON: Shape = {
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

const KIND_SHAPES: Record<RulesKind, Shape> = {
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
    material: opt(either((v, path, ctx) => (v === null ? null : FAIL), shape({ type: req(str), grade: req(str, '') }))),
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
  },
  deity: { facts: req(record(either(num, str, strArr))) },
}

// ── Entry ──────────────────────────────────────────────────────────────────

/** "Creatures", "creature", "item" → a kind; plural segments are accepted with a warning. */
function readKind(v: unknown, ctx: Ctx): RulesKind | null {
  if (typeof v !== 'string') { fail(ctx, 'kind', `missing; should be one of ${Object.keys(RULES_KIND_CONFIG).join(', ')}`); return null }
  const t = v.trim().toLowerCase()
  if (isRulesKind(t)) return t
  const k = kindForSegment(t)
  if (k) { warn(ctx, 'kind', `${show(v)} read as ${show(k)}`); return k }
  fail(ctx, 'kind', `unknown kind ${show(v)}; should be one of ${Object.keys(RULES_KIND_CONFIG).join(', ')}`)
  return null
}

export interface CheckOptions {
  now: string
  /** Used for entries without a valid `game`. */
  game: GameId | 'both'
  newId: () => string
}

/** Checks one raw entry and builds the row to write. */
export function checkHomebrewEntry(raw: unknown, index: number, opts: CheckOptions): HomebrewCheck {
  const ctx: Ctx = { issues: [], game: opts.game }
  if (!isObj(raw)) {
    return { index, name: `#${index + 1}`, kind: null, entry: null, issues: [{ level: 'error', path: '', message: 'not an object' }] }
  }
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `#${index + 1}`
  const kind = readKind(raw.kind, ctx)
  if (!kind) return { index, name, kind, entry: null, issues: ctx.issues }

  if (typeof raw.game === 'string' && (GAME_IDS as string[]).includes(raw.game)) ctx.game = raw.game as GameId
  // The factory's blank entry supplies the defaults, as for the "New …" button
  const blank = newRulesEntity(kind, { name: '', game: opts.game }) as unknown as Record<string, unknown>
  const defaults: Record<string, unknown> = { ...blank, game: opts.game }
  delete defaults.name
  // No game means the one picked for the import, without a warning for each entry
  const fields = checkFields({ game: opts.game, ...raw }, { ...COMMON, ...KIND_SHAPES[kind] }, '', ctx, defaults)

  if (raw.origin !== undefined && raw.origin !== 'user') warn(ctx, 'origin', `${show(raw.origin)} set to "user"`)
  let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : ''
  if (!id) id = opts.newId()
  if (fields === FAIL) return { index, name, kind, entry: null, issues: ctx.issues }

  const entryName = (fields.name as string).trim()
  if (!entryName) {
    ctx.issues.push({ level: 'error', path: 'name', message: 'empty' })
    return { index, name, kind, entry: null, issues: ctx.issues }
  }
  const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : opts.now
  const entry = {
    ...fields,
    id,
    origin: 'user',
    kind,
    name: entryName,
    sortName: entryName.toLowerCase(),
    sourceRefs: [],
    createdAt,
    updatedAt: opts.now,
  } as unknown as RulesEntity
  return { index, name: entryName, kind, entry, issues: ctx.issues }
}

// ── Plan ───────────────────────────────────────────────────────────────────

export type HomebrewStatus = 'new' | 'update' | 'error'

export interface HomebrewRow extends HomebrewCheck {
  status: HomebrewStatus
}

/** Fields of the row being replaced that an import keeps: the portrait, favourite, first creation. */
const KEPT_ON_UPDATE = ['img', 'tokenImg', 'isFavorite', 'createdAt'] as const

/**
 * Matches checked entries against the compendium. An id of a user/legacy entry
 * updates it (its portrait stays); an id of a synced entry, or one repeated in
 * the file, gets a fresh id. Same-named entries are pointed out.
 *
 * `existing`: rows with the file's ids. `sameName`: rows keyed `kind:sortName`.
 */
export function planHomebrewImport(
  checks: HomebrewCheck[],
  existing: Map<string, RulesEntity>,
  sameName: Map<string, RulesEntity[]>,
  newId: () => string,
): HomebrewRow[] {
  const seen = new Set<string>()
  return checks.map((c): HomebrewRow => {
    if (!c.entry) return { ...c, status: 'error' }
    const issues = [...c.issues]
    let entry = c.entry
    const prev = existing.get(entry.id)
    if (seen.has(entry.id) || prev?.origin === 'foundry') {
      issues.push({ level: 'warning', path: 'id', message: seen.has(entry.id) ? 'used twice in this file; given a new id' : 'belongs to a synced Foundry entry; given a new id' })
      entry = { ...entry, id: newId() }
    }
    seen.add(entry.id)
    const update = !!prev && prev.id === entry.id
    if (update) {
      const kept: Record<string, unknown> = {}
      for (const k of KEPT_ON_UPDATE) {
        const v = (prev as unknown as Record<string, unknown>)[k]
        if (v !== undefined && v !== null) kept[k] = v
      }
      if (prev!.kind !== entry.kind) issues.push({ level: 'warning', path: 'kind', message: `replaces a ${prev!.kind} with a ${entry.kind}` })
      entry = { ...entry, ...kept } as RulesEntity
    }
    const twins = (sameName.get(`${entry.kind}:${entry.sortName}`) ?? []).filter(r => r.id !== entry.id)
    if (twins.length) {
      const origins = [...new Set(twins.map(t => (t.origin === 'foundry' ? 'Foundry' : 'homebrew')))].join(' and ')
      issues.push({ level: 'warning', path: 'name', message: `a ${origins} ${entry.kind} with this name already exists` })
    }
    return { ...c, entry, issues, status: update ? 'update' : 'new' }
  })
}

/** Text to paste back to whoever wrote the file: each entry's problems. */
export function issuesReport(rows: HomebrewRow[]): string {
  const lines = ['StarTome homebrew import found these problems. Please send a corrected file (same ids):', '']
  for (const r of rows) {
    if (!r.issues.length) continue
    lines.push(`- ${r.name} (${r.kind ?? 'unknown kind'}, entry #${r.index + 1})${r.status === 'error' ? ' — NOT IMPORTED' : ''}`)
    for (const i of r.issues) lines.push(`  - ${i.level}: ${i.path || '(entry)'} ${i.message}`)
  }
  return lines.join('\n')
}
