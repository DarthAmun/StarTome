/**
 * Compendium repository: the only module that reads or writes the `rules` store.
 *
 * Reads return the effective entry (local edits applied, domain/rules/edits.ts).
 * Writes route by origin: your own entries change in place; a synced entry's
 * rules fields go to its `localEdits` overlay, so the next sync keeps them.
 */
import type { Table } from 'dexie'
import type { GameId } from '@/domain/game'
import { newId, nowIso } from '@/domain/ids'
import { isOverlayPath, setPath, withLocalEdits } from '@/domain/rules/edits'
import { newRulesEntity, newRulesId } from '@/domain/rules/factory'
import { packOf } from '@/domain/rules/packs'
import { RULES_KINDS, type Feat, type Rarity, type RulesEntity, type RulesKind, type RulesOrigin } from '@/domain/rules/types'
import { getDb } from './db'
import { clearRulesIndex, indexedIds, patchRulesIndex, searchRuleNames } from './rulesIndex'

export function rulesTable(): Table<RulesEntity, string> {
  return getDb().rows('rules') as unknown as Table<RulesEntity, string>
}

export interface RulesQuery {
  /** One kind; `kinds` takes several. */
  kind?: RulesKind
  /** Empty = every kind. */
  kinds?: RulesKind[]
  /** Games to include; entries tagged 'both' always match. Empty = all. */
  games?: GameId[]
  text?: string
  levelMin?: number | null
  levelMax?: number | null
  rarities?: Rarity[]
  /** Every listed trait must be present. */
  traits?: string[]
  origins?: RulesOrigin[]
  /** Hide legacy entries that have a remaster version. Default true. */
  hideSuperseded?: boolean
  /** Include entries that disappeared from their Foundry pack. Default false. */
  showRemoved?: boolean
  favoritesOnly?: boolean
  /** Homebrew packs (publication title; '' = no pack). Only your own entries match. */
  packs?: string[]
  sort?: 'name' | 'level'
  dir?: 'asc' | 'desc'
  offset?: number
  limit?: number
}

export interface RulesPage { items: RulesEntity[]; total: number }

// ── Change notice ──────────────────────────────────────────────────────────

const listeners = new Set<() => void>()

/** Called after every compendium write; returns the function that stops it. */
export function onRulesChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Other windows of the app (a second tab, the players' window) hear of a change here and reload their lists. */
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('startome-rules')
if (channel) {
  channel.onmessage = () => { clearRulesIndex(); for (const fn of listeners) fn() }
  // Under Node (the tests) an open channel would keep the process alive
  ;(channel as unknown as { unref?: () => void }).unref?.()
}

function touch(before?: RulesEntity | null, after?: RulesEntity | null): void {
  if (!before && !after) clearRulesIndex()
  else patchRulesIndex(before ?? null, after ?? null)
  for (const fn of listeners) fn()
  channel?.postMessage('changed')
}

/** For writers outside this module (the sync worker, imports): lists and counts reload. */
export function notifyRulesChanged(): void {
  touch()
}

// ── Reads ──────────────────────────────────────────────────────────────────

/** One page of the compendium, filtered and sorted; only the shown rows are read. */
export async function rulesQuery(q: RulesQuery): Promise<RulesPage> {
  const { offset = 0, limit = 100, ...filters } = q
  const all = await indexedIds(filters)
  const page = await rulesTable().bulkGet(all.slice(offset, offset + limit))
  return { items: page.filter((r): r is RulesEntity => !!r).map(withLocalEdits), total: all.length }
}

export async function rulesGet(id: string): Promise<RulesEntity | undefined> {
  const e = await rulesTable().get(id)
  return e && withLocalEdits(e)
}

/** The stored row without local edits, for "reset" and conflict views. */
export async function rulesGetRaw(id: string): Promise<RulesEntity | undefined> {
  return rulesTable().get(id)
}

export async function rulesGetMany(ids: string[]): Promise<RulesEntity[]> {
  return (await rulesTable().bulkGet(ids)).filter((r): r is RulesEntity => !!r).map(withLocalEdits)
}

/** Name search across all kinds: whole name, name start, word starts and typos, then contains. */
export async function rulesSearch(text: string, limit = 8, games?: GameId[]): Promise<RulesEntity[]> {
  const gameSet = games?.length ? new Set<string>([...games, 'both']) : null
  const keep = (e: RulesEntity) => !e.supersededBy && !e.upstream?.removed && (!gameSet || gameSet.has(e.game))
  const ranked = await searchRuleNames(text)
  const out: RulesEntity[] = []
  const BATCH = Math.max(limit * 2, 16)
  for (let i = 0; i < ranked.length && out.length < limit; i += BATCH) {
    const keys = ranked.slice(i, i + BATCH)
    const rank = new Map(keys.map((k, n) => [`${k[0]}:${k[1]}`, n]))
    const rows = await rulesTable().where('[kind+sortName]').anyOf(keys).toArray()
    rows.sort((a, b) => (rank.get(`${a.kind}:${a.sortName}`) ?? 0) - (rank.get(`${b.kind}:${b.sortName}`) ?? 0))
    for (const r of rows) if (out.length < limit && keep(r)) out.push(r)
  }
  return out.map(withLocalEdits)
}

/**
 * Best entry for a name: exact (case-insensitive) match, preferring the
 * campaign's game, then non-superseded entries, then remaster printings.
 */
export async function rulesFindByName(kind: RulesKind, name: string, game?: GameId): Promise<RulesEntity | undefined> {
  const rows = await rulesTable().where('[kind+sortName]').equals([kind, name.trim().toLowerCase()]).toArray()
  const score = (e: RulesEntity) => (game && (e.game === game || e.game === 'both') ? 4 : 0) + (e.supersededBy ? 0 : 2) + (e.publication?.remaster ? 1 : 0)
  const best = rows.sort((a, b) => score(b) - score(a))[0]
  return best && withLocalEdits(best)
}

/** Id and name of every entry of a kind (optionally by game), for pickers. */
export async function rulesNameList(kind: RulesKind, games?: GameId[]): Promise<{ id: string; name: string }[]> {
  const gameSet = games?.length ? new Set<string>([...games, 'both']) : null
  const out: { id: string; name: string }[] = []
  await rulesTable().where('[kind+sortName]').between([kind, ''], [kind, '￿']).each((raw) => {
    if (raw.supersededBy || raw.upstream?.removed || (gameSet && !gameSet.has(raw.game))) return
    out.push({ id: raw.id, name: withLocalEdits(raw).name })
  })
  return out
}

/** Feats carrying a class's trait (its features and subclass options), for one game. */
export async function rulesClassFeats(trait: string, game: GameId | 'both'): Promise<Feat[]> {
  const keep = (r: RulesEntity) => r.kind === 'feat' && !r.supersededBy && !r.upstream?.removed && (game === 'both' || r.game === 'both' || r.game === game)
  const own = (await rulesTable().where('traits').equals(trait).toArray()).filter(keep)
  // Some options don't carry the class trait (Kineticist gates, Exemplar ikons): found by the tags the class's features choose from
  const tags = new Set(own.flatMap(r => (r as Feat).choices ?? []))
  const ids = new Set(own.map(r => r.id))
  const tagged = tags.size
    ? await rulesTable().where('[kind+sortName]').between(['feat', ''], ['feat', '￿']).filter(r => !ids.has(r.id) && keep(r) && !!(r as Feat).optionOf?.some(t => tags.has(t))).toArray()
    : []
  return [...own, ...tagged].map(r => withLocalEdits(r) as Feat)
}

/** Your own (homebrew) entries, effective, optionally only those in the given packs. */
export async function rulesUserEntries(packs?: string[]): Promise<RulesEntity[]> {
  const rows = (await rulesTable().where('origin').equals('user').toArray()).map(withLocalEdits)
  if (!packs) return rows
  const keep = new Set(packs)
  return rows.filter(e => keep.has(packOf(e)))
}

export async function rulesCounts(): Promise<Record<RulesKind, number>> {
  const counts = await Promise.all(RULES_KINDS.map(k => rulesTable().where('kind').equals(k).count()))
  return Object.fromEntries(RULES_KINDS.map((k, i) => [k, counts[i] ?? 0])) as Record<RulesKind, number>
}

// ── Writes ─────────────────────────────────────────────────────────────────

/** The name the user sees, lower-cased: a synced entry's local name edit wins. */
export function effectiveSortName(row: RulesEntity): string {
  return String(row.localEdits?.name ?? row.name).toLowerCase()
}

export async function rulesCreate(kind: RulesKind, init: { name: string; game: GameId | 'both' }): Promise<RulesEntity> {
  const entity = newRulesEntity(kind, init)
  await rulesTable().add(entity)
  touch(null, entity)
  return entity
}

/** Writes a whole homebrew entry (the creature builder): creates it or replaces it. */
export async function rulesSaveUser(entity: RulesEntity): Promise<RulesEntity> {
  if (entity.origin !== 'user') throw new Error('Only homebrew entries can be written whole.')
  const before = await rulesTable().get(entity.id)
  const next = { ...(JSON.parse(JSON.stringify(entity)) as RulesEntity), sortName: entity.name.toLowerCase(), updatedAt: nowIso() }
  await rulesTable().put(next)
  touch(before ?? null, next)
  return next
}

/** Writes checked homebrew entries (the importer) in one transaction. */
export async function rulesPutMany(entities: RulesEntity[]): Promise<void> {
  await rulesTable().bulkPut(entities.map(e => JSON.parse(JSON.stringify(e)) as RulesEntity))
  touch()
}

/** Sets one field (dotted path). Synced entries get the change as a local edit. */
export async function rulesUpdate(id: string, path: string, value: unknown): Promise<RulesEntity | undefined> {
  const row = await rulesTable().get(id)
  if (!row) return undefined
  const plain = value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as unknown
  let next: RulesEntity = row.origin === 'foundry' && isOverlayPath(path)
    ? { ...row, localEdits: { ...(row.localEdits ?? {}), [path]: plain } }
    : setPath(row, path, plain)
  if (path === 'name') next = { ...next, sortName: effectiveSortName(next) }
  next.updatedAt = nowIso()
  await rulesTable().put(next)
  touch(row, next)
  return withLocalEdits(next)
}

/** Drops local edits: all of them, or only one path. */
export async function rulesResetEdits(id: string, path?: string): Promise<RulesEntity | undefined> {
  const row = await rulesTable().get(id)
  if (!row?.localEdits) return row && withLocalEdits(row)
  const edits = { ...row.localEdits }
  if (path) delete edits[path]
  const next: RulesEntity = { ...row, localEdits: path && Object.keys(edits).length ? edits : undefined, updatedAt: nowIso() }
  next.sortName = effectiveSortName(next)
  await rulesTable().put(next)
  touch(row, next)
  return withLocalEdits(next)
}

/** A copy of a stored image, so two entries never share one blob. */
async function copyImage(ref: string | null | undefined): Promise<string | null> {
  const m = /^img:(.+)$/.exec(ref ?? '')
  if (!m?.[1]) return ref ?? null
  const row = await getDb().images.get(m[1])
  if (!row) return null
  const id = newId()
  await getDb().images.put({ ...row, id, createdAt: nowIso() })
  return `img:${id}`
}

/** Copies the effective entry as a new homebrew entry you fully own. */
export async function rulesDuplicate(id: string): Promise<RulesEntity | undefined> {
  const src = await rulesGet(id)
  if (!src) return undefined
  const ts = nowIso()
  const tokenImg = (src as { tokenImg?: string | null }).tokenImg
  const copy = {
    ...(JSON.parse(JSON.stringify(src)) as RulesEntity),
    img: await copyImage(src.img),
    ...(tokenImg !== undefined ? { tokenImg: await copyImage(tokenImg) } : {}),
    id: newRulesId(), origin: 'user', name: `${src.name} (Homebrew)`, sortName: `${src.name} (homebrew)`.toLowerCase(),
    sourceRefs: [], upstream: undefined, localEdits: undefined, supersededBy: undefined, createdAt: ts, updatedAt: ts,
  } as RulesEntity
  await rulesTable().add(copy)
  touch(null, copy)
  return copy
}

/** Only your own entries can be deleted; a synced entry would come back with the next sync. */
export async function rulesDelete(id: string): Promise<void> {
  const row = await rulesTable().get(id)
  if (!row) return
  if (row.origin === 'foundry') throw new Error('Synced compendium entries cannot be deleted.')
  await rulesTable().delete(id)
  touch(row, null)
}

/** Deletes many own entries at once (a homebrew pack). Synced entries are skipped. Returns how many went. */
export async function rulesDeleteMany(ids: string[]): Promise<number> {
  const rows = (await rulesTable().bulkGet(ids)).filter((r): r is RulesEntity => !!r && r.origin !== 'foundry')
  if (!rows.length) return 0
  await rulesTable().bulkDelete(rows.map(r => r.id))
  touch()
  return rows.length
}

// ── Sync state ─────────────────────────────────────────────────────────────

export interface SyncState {
  game: GameId
  channel: 'release'
  version: string
  packs: Record<string, { hash: string; count: number; converter?: number }>
  syncedAt: string
}

export const syncStates = {
  get: async (game: GameId) => (await getDb().rows('syncState').get(game)) as SyncState | undefined,
  put: (state: SyncState) => getDb().rows('syncState').put(state as unknown as { game: GameId }),
  all: async () => (await getDb().rows('syncState').toArray()) as unknown as SyncState[],
}

/** Synced entries per game and per licence, for the sync page. */
export async function foundryStats(): Promise<{ perGame: Partial<Record<GameId, number>>; licences: [string, number][] }> {
  const perGame: Partial<Record<GameId, number>> = {}
  const lic = new Map<string, number>()
  await rulesTable().where('origin').equals('foundry').each((r) => {
    if (r.game === 'pf2e' || r.game === 'sf2e') perGame[r.game] = (perGame[r.game] ?? 0) + 1
    const l = r.publication?.license
    if (l) lic.set(l, (lic.get(l) ?? 0) + 1)
  })
  return { perGame, licences: [...lic.entries()].sort((a, b) => b[1] - a[1]) }
}

/** Stored rows for ids, and stored rows sharing a kind and name with the given entries (for the homebrew import's plan). */
export async function rulesForImport(entries: Pick<RulesEntity, 'id' | 'kind' | 'sortName'>[]): Promise<{ byId: Map<string, RulesEntity>; sameName: Map<string, RulesEntity[]> }> {
  const [existing, named] = await Promise.all([
    rulesTable().bulkGet(entries.map(e => e.id)),
    rulesTable().where('[kind+sortName]').anyOf(entries.map(e => [e.kind, e.sortName])).toArray(),
  ])
  const sameName = new Map<string, RulesEntity[]>()
  for (const r of named) sameName.set(`${r.kind}:${r.sortName}`, [...(sameName.get(`${r.kind}:${r.sortName}`) ?? []), r])
  return { byId: new Map(existing.filter((r): r is RulesEntity => !!r).map(r => [r.id, r])), sameName }
}
