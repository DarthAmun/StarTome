/** Homebrew import, part 1: the field checkers every kind's shape is built from. */
import { parseActionCost, parseBulk, parseMoney } from '@/domain/rules/format'
import { type GameId } from '@/domain/game'
import { SIZES, type ActionCost } from '@/domain/rules/types'
import type { HomebrewIssue } from './homebrew'

// ── Checkers ───────────────────────────────────────────────────────────────

export interface Ctx {
  issues: HomebrewIssue[]
  game: GameId | 'both'
}

export const SILENT_KEYS = new Set(['id', 'kind', 'origin', 'sortName', 'sourceRefs', 'createdAt', 'updatedAt'])
export const OWNED_BY_APP = new Set(['img', 'tokenImg', 'localEdits', 'upstream', 'legacy', 'build', 'supersededBy'])
export const dropReason = (k: string) => (OWNED_BY_APP.has(k) ? 'set by StarTome itself; left out' : 'unknown field; left out')
export const FAIL = Symbol('fail')
export type Checker = (v: unknown, path: string, ctx: Ctx) => unknown

/** `req`: missing → `def` with a warning, or an error when there is no default. */
export interface Field { check: Checker; req?: boolean; def?: unknown }
export type Shape = Record<string, Field>

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const warn = (ctx: Ctx, path: string, message: string) => { ctx.issues.push({ level: 'warning', path, message }) }
export const fail = (ctx: Ctx, path: string, message: string) => { ctx.issues.push({ level: 'error', path, message }); return FAIL }
export const show = (v: unknown) => JSON.stringify(v)

export const num: Checker = (v, path, ctx) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\s*[+-]?\d+(\.\d+)?\s*$/.test(v)) {
    warn(ctx, path, `text ${show(v)} read as a number`)
    return Number(v)
  }
  return fail(ctx, path, `should be a number, got ${show(v)}`)
}

export const numOrNull: Checker = (v, path, ctx) => (v === null ? null : num(v, path, ctx))

export const str: Checker = (v, path, ctx) => {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return fail(ctx, path, `should be text, got ${show(v)}`)
}

export const bool: Checker = (v, path, ctx) => {
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === 'false') { warn(ctx, path, `text ${show(v)} read as true/false`); return v === 'true' }
  return fail(ctx, path, `should be true or false, got ${show(v)}`)
}

export const strArr: Checker = (v, path, ctx) => {
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
export const traits: Checker = (v, path, ctx) => {
  const list = strArr(v, path, ctx)
  if (list === FAIL) return FAIL
  const slugs = (list as string[]).map(t => t.trim().toLowerCase().replace(/\s+/g, '-'))
  if (slugs.some((s, i) => s !== (list as string[])[i])) warn(ctx, path, 'traits turned into lower-case slugs')
  return [...new Set(slugs)]
}

export function oneOf<T extends string>(values: readonly T[], aliases: Record<string, T> = {}): Checker {
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

export const SIZE_ALIASES: Record<string, (typeof SIZES)[number]> = { small: 'sm', medium: 'med', large: 'lg', gargantuan: 'grg', gar: 'grg' }

/** { cp } in copper; text like "350 credits" or "12 gp" is converted. */
export const money: Checker = (v, path, ctx) => {
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
      const cp = keys.reduce((n, k) => n + (v[k] as number) * (units[k] ?? 0), 0)
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
export const bulk: Checker = (v, path, ctx) => {
  if (v === null) return null
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
  if (typeof v === 'string') {
    const b = parseBulk(v)
    if (b !== undefined && b !== null) { warn(ctx, path, `${show(v)} converted to ${b} (tenths)`); return b }
  }
  return fail(ctx, path, `should be bulk in tenths (L = 1, 1 = 10) or null, got ${show(v)}`)
}

export const actionCost: Checker = (v, path, ctx) => {
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
export function shape(fields: Shape): Checker {
  return (v, path, ctx) => {
    if (!isObj(v)) return fail(ctx, path, `should be an object, got ${show(v)}`)
    return checkFields(v, fields, path, ctx, {})
  }
}

export function arrOf(item: Checker): Checker {
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

export function record(value: Checker, lowerKeys = false): Checker {
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

export const either = (...checks: Checker[]): Checker => (v, path, ctx) => {
  for (const c of checks) {
    const sub: Ctx = { ...ctx, issues: [] }
    const r = c(v, path, sub)
    if (r !== FAIL) { ctx.issues.push(...sub.issues); return r }
  }
  return fail(ctx, path, `unexpected value ${show(v)}`)
}

/** Fills `out` from `v` field by field. */
export function checkFields(v: Record<string, unknown>, fields: Shape, path: string, ctx: Ctx, defaults: Record<string, unknown>): Record<string, unknown> | typeof FAIL {
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

export const req = (check: Checker, def?: unknown): Field => ({ check, req: true, def })
export const opt = (check: Checker): Field => ({ check })
