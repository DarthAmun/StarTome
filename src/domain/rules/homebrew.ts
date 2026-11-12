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
import { newRulesEntity } from '@/domain/rules/factory'
import { convertPf2oolsRelicGifts, isPf2oolsRelicGifts } from '@/domain/pf2ools/relicGifts'
import { GAME_IDS, type GameId } from '@/domain/game'
import { kindForSegment, RULES_KIND_CONFIG, RULES_KINDS, type RulesEntity, type RulesKind } from '@/domain/rules/types'

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
  try { data = JSON.parse((fenced ? fenced[1]! : text).trim()) }
  catch (err) { return { error: `Not valid JSON: ${(err as Error).message}` } }
  // Pf2ools relic gifts (converters/pf2ools): converted here, then checked like any homebrew
  if (isPf2oolsRelicGifts(data)) return { entries: convertPf2oolsRelicGifts(data) }
  if (Array.isArray(data)) return { entries: data }
  if (isObj(data)) {
    if (Array.isArray(data.rules)) return { entries: data.rules }
    if ('kind' in data) return { entries: [data] }
  }
  return { error: 'No entries found: expected a `rules` array, an array of entries, or one entry with a `kind`.' }
}

import { type Ctx, FAIL, checkFields, fail, isObj, show, warn } from './homebrewCheckers'
import { COMMON, KIND_SHAPES } from './homebrewShapes'
export { OWNED_BY_APP } from './homebrewCheckers'

// ── Entry ──────────────────────────────────────────────────────────────────

/** "Creatures", "creature", "item" → a kind; plural segments are accepted with a warning. */
function readKind(v: unknown, ctx: Ctx): RulesKind | null {
  if (typeof v !== 'string') { fail(ctx, 'kind', `missing; should be one of ${Object.keys(RULES_KIND_CONFIG).join(', ')}`); return null }
  const t = v.trim().toLowerCase()
  const exact = RULES_KINDS.find(kind => kind.toLowerCase() === t)
  if (exact) return exact
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
