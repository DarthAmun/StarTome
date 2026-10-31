/**
 * Compendium repository — the only module that reads or writes the `rules` table.
 *
 * Reads return the *effective* entry (local edits applied, see rules/edits.ts).
 * Writes route by origin: a user/legacy entry is changed in place; a Foundry
 * entry's rules fields go to its `localEdits` overlay so a re-sync keeps them.
 */
import { ref, shallowRef, toRaw, watch } from 'vue'
import { getDb, now } from '~/composables/useDb'
import { onTablesChanged } from '~/db/changes'
import { newRulesEntity, newRulesId } from '~/rules/factory'
import { isOverlayPath, setPath, withLocalEdits } from '~/rules/edits'
import { packOf } from '~/rules/packs'
import { dataUrlToBlob, deleteImage, imageRefId, isImageRef, storeImage } from '~/rules/images'
import type { GameId } from '~/types/game'
import { isRulesKind, RULES_KIND_CONFIG, RULES_KINDS, type Feat, type Item, type Rarity, type RulesEntity, type RulesKind, type RulesOrigin } from '~/types/rules'

export interface RulesQuery {
  kind: RulesKind
  /** Games to include; entries tagged 'both' always match. Empty/undefined = all. */
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
  /** Include entries that disappeared from their Foundry pack (kept for links). Default false. */
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

/** Bumped on every write; components watch it to refresh lists, counts and the ref index. */
const revision = ref(0)
/** Bumped when the whole compendium may have changed (sync, import): the name index reloads. */
const bulkRevision = ref(0)
/** A write: lists reload; the name index is patched with the entry's old and new name. */
function touch(before?: RulesEntity | null, after?: RulesEntity | null) {
  queryCache.clear()
  if (before) indexRemove(before)
  if (after) indexAdd(after)
  revision.value++
}

function matcher(q: RulesQuery): (e: RulesEntity) => boolean {
  const text = q.text?.trim().toLowerCase() ?? ''
  const games = q.games?.length ? new Set<string>([...q.games, 'both']) : null
  const rarities = q.rarities?.length ? new Set(q.rarities) : null
  const origins = q.origins?.length ? new Set(q.origins) : null
  const traits = q.traits?.map(t => t.toLowerCase()) ?? []
  const hideSuperseded = q.hideSuperseded ?? true
  const packs = q.packs?.length ? new Set(q.packs) : null
  return (raw) => {
    const e = withLocalEdits(raw)
    if (games && !games.has(e.game)) return false
    if (hideSuperseded && e.supersededBy) return false
    if (!q.showRemoved && e.upstream?.removed) return false
    if (q.favoritesOnly && !e.isFavorite) return false
    if (origins && !origins.has(e.origin)) return false
    if (packs && (e.origin !== 'user' || !packs.has(packOf(e)))) return false
    if (rarities && !rarities.has(e.rarity)) return false
    if (q.levelMin !== null && q.levelMin !== undefined && e.level < q.levelMin) return false
    if (q.levelMax !== null && q.levelMax !== undefined && e.level > q.levelMax) return false
    if (traits.length && !traits.every(t => e.traits.includes(t))) return false
    if (text && !e.sortName.includes(text) && !e.traits.some(t => t === text)) return false
    return true
  }
}

// Matching ids per filter set (without paging), so paging and repeated
// queries don't re-scan the kind. Cleared on every compendium write.
const queryCache = new Map<string, Promise<string[]>>()
const QUERY_CACHE_MAX = 20

async function matchingIds(q: RulesQuery): Promise<string[]> {
  const db = getDb()
  const byLevel = q.sort === 'level'
  // [kind+level+sortName] sorts by level, then by name within a level
  const index = byLevel ? '[kind+level+sortName]' : '[kind+sortName]'
  const lower = byLevel ? [q.kind, -Infinity, ''] : [q.kind, '']
  const upper = byLevel ? [q.kind, Infinity, '\uffff'] : [q.kind, '\uffff']
  let coll = db.rules.where(index).between(lower, upper, true, true)
  if (q.dir === 'desc') coll = coll.reverse()
  const keep = matcher(q)
  const ids: string[] = []
  // Both releases ship the same conditions (same Foundry doc id): across games show one, the PF2e copy
  const twins = q.kind === 'condition' && !q.games?.length ? new Map<string, number>() : null
  await coll.each(row => {
    if (!keep(row)) return
    const docId = twins && row.origin === 'foundry' && row.game !== 'both' ? row.id.split(':').pop()! : null
    if (docId) {
      const at = twins!.get(docId)
      if (at !== undefined) { if (row.game === 'pf2e') ids[at] = row.id; return }
      twins!.set(docId, ids.length)
    }
    ids.push(row.id)
  })
  return ids
}

/** One page of a kind, filtered and sorted. The kind is scanned once per filter set. */
export async function rulesQuery(q: RulesQuery): Promise<RulesPage> {
  const { offset = 0, limit = 100, ...filters } = q
  const key = JSON.stringify(filters)
  let ids = queryCache.get(key)
  if (!ids) {
    ids = matchingIds(filters)
    queryCache.set(key, ids)
    if (queryCache.size > QUERY_CACHE_MAX) queryCache.delete(queryCache.keys().next().value!)
    ids.catch(() => queryCache.delete(key))
  }
  const all = await ids
  const page = await getDb().rules.bulkGet(all.slice(offset, offset + limit))
  return { items: page.filter((r): r is RulesEntity => !!r).map(withLocalEdits), total: all.length }
}

/**
 * Median price (cp) of a consumable per item level, for the wealth estimate
 * with "count consumables" off (FEATURES_PLAN.md §9.1).
 */
export async function consumablePriceMedians(game: GameId): Promise<Record<number, number>> {
  const keep = matcher({ kind: 'item', games: [game] })
  const byLevel: Record<number, number[]> = {}
  await getDb().rules.where('kind').equals('item').each(raw => {
    if (!keep(raw)) return
    const e = withLocalEdits(raw) as Item
    if (e.category !== 'consumable' || !e.price?.cp) return
    ;(byLevel[e.level] ??= []).push(Math.round(e.price.cp / Math.max(1, e.priceFor ?? 1)))
  })
  return Object.fromEntries(Object.entries(byLevel).map(([l, prices]) => {
    const sorted = prices.sort((a, b) => a - b)
    const mid = sorted.length >> 1
    return [Number(l), sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)]
  }))
}

/**
 * Name search across all kinds (global search, quick lookup). Prefix matches
 * come first via the index; a contains-scan fills up the rest.
 */
export async function rulesSearch(text: string, limit = 8, games?: GameId[]): Promise<RulesEntity[]> {
  const q = text.trim().toLowerCase()
  if (!q) return []
  const gameSet = games?.length ? new Set<string>([...games, 'both']) : null
  const keep = (e: RulesEntity) => !e.supersededBy && !e.upstream?.removed && (!gameSet || gameSet.has(e.game))
  const db = getDb()
  const prefix = await db.rules.where('sortName').startsWith(q).filter(keep).limit(limit).toArray()
  if (prefix.length >= limit) return prefix.map(withLocalEdits)
  const seen = new Set(prefix.map(e => e.id))
  let rest: RulesEntity[]
  if (nameIndexReady) {
    // Contains-matches from the in-memory name index (PERF-04): only matching rows are read
    const keys: [string, string][] = []
    for (const key of nameCounts.keys()) {
      const sep = key.indexOf(':')
      const name = key.slice(sep + 1)
      if (!name.startsWith(q) && name.includes(q)) keys.push([key.slice(0, sep), name])
      if (keys.length >= limit * 8) break
    }
    rest = keys.length
      ? await db.rules.where('[kind+sortName]').anyOf(keys).filter(e => !seen.has(e.id) && keep(e)).limit(limit - prefix.length).toArray()
      : []
  } else {
    rest = await db.rules
      .filter(e => !seen.has(e.id) && e.sortName.includes(q) && keep(e))
      .limit(limit - prefix.length)
      .toArray()
  }
  return [...prefix, ...rest].map(withLocalEdits)
}

export async function rulesGet(id: string): Promise<RulesEntity | undefined> {
  const e = await getDb().rules.get(id)
  return e && withLocalEdits(e)
}

/** Id and name of every entry of a kind (optionally by game), without loading
 *  more than one row at a time — for pickers over thousands of entries. */
export async function rulesNameList(kind: RulesKind, games?: GameId[]): Promise<{ id: string; name: string }[]> {
  const gameSet = games?.length ? new Set<string>([...games, 'both']) : null
  const out: { id: string; name: string }[] = []
  await getDb().rules.where('[kind+sortName]').between([kind, ''], [kind, '\uffff']).each((raw) => {
    if (raw.supersededBy || raw.upstream?.removed || (gameSet && !gameSet.has(raw.game))) return
    out.push({ id: raw.id, name: withLocalEdits(raw).name })
  })
  return out
}

/** The raw stored row, without local edits — for "reset" and conflict views. */
export async function rulesGetRaw(id: string): Promise<RulesEntity | undefined> {
  return getDb().rules.get(id)
}

export async function rulesGetMany(ids: string[]): Promise<RulesEntity[]> {
  const rows = await getDb().rules.bulkGet(ids)
  return rows.filter((r): r is RulesEntity => !!r).map(withLocalEdits)
}

/**
 * Best entry for a name: exact (case-insensitive) match, preferring the
 * campaign's game, then non-superseded entries, then remaster printings.
 */
export async function rulesFindByName(kind: RulesKind, name: string, game?: GameId): Promise<RulesEntity | undefined> {
  const rows = await getDb().rules.where('[kind+sortName]').equals([kind, name.trim().toLowerCase()]).toArray()
  if (!rows.length) return undefined
  const score = (e: RulesEntity) =>
    (game && (e.game === game || e.game === 'both') ? 4 : 0) + (e.supersededBy ? 0 : 2) + (e.publication?.remaster ? 1 : 0)
  return withLocalEdits(rows.sort((a, b) => score(b) - score(a))[0])
}

/** Feats carrying a class's trait (its features and subclass options), for one game. */
export async function rulesClassFeats(trait: string, game: GameId | 'both'): Promise<Feat[]> {
  const rows = await getDb().rules.where('traits').equals(trait).toArray()
  return rows
    .filter(r => r.kind === 'feat' && !r.supersededBy && !r.upstream?.removed && (game === 'both' || r.game === 'both' || r.game === game))
    .map(r => withLocalEdits(r) as Feat)
}

/** Your own (homebrew) entries, effective, optionally only those in the given packs (rules/packs.ts). */
export async function rulesUserEntries(packs?: string[]): Promise<RulesEntity[]> {
  const rows = (await getDb().rules.where('origin').equals('user').toArray()).map(withLocalEdits)
  if (!packs) return rows
  const keep = new Set(packs)
  return rows.filter(e => keep.has(packOf(e)))
}

/** Route of the compendium entry a {{kind: Name}} ref points to, or null if there is none. */
export async function rulesRefRoute(type: string, name: string, game?: GameId): Promise<string | null> {
  const kind = type.toLowerCase()
  if (!isRulesKind(kind)) return null
  const e = await rulesFindByName(kind, name, game)
  return e ? `/compendium/${RULES_KIND_CONFIG[kind].segment}?id=${e.id}` : null
}

export async function rulesCreate(kind: RulesKind, init: { name: string; game: GameId | 'both' }): Promise<RulesEntity> {
  const entity = newRulesEntity(kind, init)
  await getDb().rules.add(entity)
  touch(null, entity)
  return entity
}

/** Writes a whole homebrew entry (the creature builder): creates it or replaces it. */
export async function rulesSaveUser(entity: RulesEntity): Promise<RulesEntity> {
  if (entity.origin !== 'user') throw new Error('Only homebrew entries can be written whole.')
  const db = getDb()
  const before = await db.rules.get(entity.id)
  const next = { ...JSON.parse(JSON.stringify(entity)), sortName: entity.name.toLowerCase(), updatedAt: now() } as RulesEntity
  await db.rules.put(next)
  touch(before ?? null, next)
  return next
}

/** Sets one field (dotted path). Foundry entries get the change as a local edit. */
export async function rulesUpdate(id: string, path: string, value: unknown): Promise<RulesEntity | undefined> {
  const db = getDb()
  const row = await db.rules.get(id)
  if (!row) return undefined
  let next: RulesEntity
  if (row.origin === 'foundry' && isOverlayPath(path)) {
    next = { ...row, localEdits: { ...(row.localEdits ?? {}), [path]: value } }
  } else {
    next = setPath(row, path, value)
  }
  // Search, sorting and {{kind: Name}} refs go by the name the user sees (BUG-05)
  if (path === 'name') next.sortName = effectiveSortName(next)
  next.updatedAt = now()
  await db.rules.put(next)
  touch(row, next)
  return withLocalEdits(next)
}

/** Sets a portrait or token art from a data URL (stored as a blob) or an http URL. */
export async function rulesSetImage(id: string, field: 'img' | 'tokenImg', source: string | null): Promise<RulesEntity | undefined> {
  const before = await getDb().rules.get(id)
  const previous = (before as Record<string, unknown> | undefined)?.[field] as string | null | undefined
  const value = source?.startsWith('data:') ? await storeImage(dataUrlToBlob(source)) : source
  const updated = await rulesUpdate(id, field, value)
  // The replaced blob would otherwise stay in storage forever (BUG-12)
  if (before && previous !== value) await releaseImage(before, previous)
  return updated
}

/**
 * Deletes an entry's image blob once nothing uses it. Only a homebrew copy
 * made before copies got their own blobs can share one, so a user entry's
 * image is left for "Clean up unused images" (Settings) instead.
 */
async function releaseImage(owner: RulesEntity, ref: string | null | undefined) {
  if (!isImageRef(ref) || owner.origin === 'user') return
  const db = getDb()
  const shared = await db.rules.where('origin').equals('user')
    .filter(r => r.img === ref || (r as { tokenImg?: string | null }).tokenImg === ref).count()
  if (!shared) await deleteImage(ref)
}

async function copyImage(ref: string | null | undefined): Promise<string | null> {
  if (!isImageRef(ref)) return ref ?? null
  const row = await getDb().images.get(imageRefId(ref))
  return row ? storeImage(row.blob) : null
}

/** The name the user sees, lower-cased: a synced entry's local name edit wins. */
export function effectiveSortName(row: RulesEntity): string {
  return String(row.localEdits?.name ?? row.name).toLowerCase()
}

/** Drops local edits — all of them, or only one path. */
export async function rulesResetEdits(id: string, path?: string): Promise<RulesEntity | undefined> {
  const db = getDb()
  const row = await db.rules.get(id)
  if (!row?.localEdits) return row && withLocalEdits(row)
  const edits = { ...row.localEdits }
  if (path) delete edits[path]
  const next = { ...row, localEdits: path && Object.keys(edits).length ? edits : undefined, updatedAt: now() }
  next.sortName = effectiveSortName(next)
  await db.rules.put(next)
  touch(row, next)
  return withLocalEdits(next)
}

/** Copies the effective entry as a new homebrew entry the user fully owns. */
export async function rulesDuplicate(id: string): Promise<RulesEntity | undefined> {
  const src = await rulesGet(id)
  if (!src) return undefined
  const ts = now()
  // The copy gets its own image blobs, so replacing one portrait never changes the other
  const [img, tokenImg] = await Promise.all([copyImage(src.img), copyImage((src as { tokenImg?: string | null }).tokenImg)])
  const copy: RulesEntity = {
    ...structuredClone(toRaw(src)),
    img,
    ...((src as { tokenImg?: string | null }).tokenImg !== undefined ? { tokenImg } : {}),
    id: newRulesId(),
    origin: 'user',
    name: `${src.name} (Homebrew)`,
    sortName: `${src.name} (homebrew)`.toLowerCase(),
    sourceRefs: [],
    upstream: undefined,
    localEdits: undefined,
    supersededBy: undefined,
    createdAt: ts,
    updatedAt: ts,
  } as RulesEntity
  await getDb().rules.add(copy)
  touch(null, copy)
  return copy
}

/** Only user and legacy entries can be deleted; a synced entry would come back with the next sync. */
export async function rulesDelete(id: string): Promise<void> {
  const row = await getDb().rules.get(id)
  if (!row) return
  if (row.origin === 'foundry') throw new Error('Synced compendium entries cannot be deleted.')
  await getDb().rules.delete(id)
  await Promise.all([releaseImage(row, row.img), releaseImage(row, (row as { tokenImg?: string | null }).tokenImg)])
  touch(row, null)
}

export async function rulesCounts(): Promise<Record<RulesKind, number>> {
  const db = getDb()
  const counts = await Promise.all(RULES_KINDS.map(k => db.rules.where('kind').equals(k).count()))
  return Object.fromEntries(RULES_KINDS.map((k, i) => [k, counts[i]])) as Record<RulesKind, number>
}

// ── Name index for {{kind: Name}} refs ──────────────────────────────────────
// Rendering is synchronous, so names are kept in memory. Only the compound
// index keys are read — no rows are loaded.

// Counts, not a set: legacy/remaster twins and reprints share a name.
const nameCounts = new Map<string, number>()
const nameIndex = shallowRef<Map<string, number>>(nameCounts)
let nameIndexStarted = false
/** True once the index holds every entry (and until the next sync/import). */
let nameIndexReady = false
const indexKey = (e: Pick<RulesEntity, 'kind' | 'sortName'>) => `${e.kind}:${e.sortName}`

function indexAdd(e: RulesEntity) {
  nameCounts.set(indexKey(e), (nameCounts.get(indexKey(e)) ?? 0) + 1)
  nameIndex.value = new Map(nameCounts)
}
function indexRemove(e: RulesEntity) {
  const n = (nameCounts.get(indexKey(e)) ?? 0) - 1
  if (n > 0) nameCounts.set(indexKey(e), n); else nameCounts.delete(indexKey(e))
  nameIndex.value = new Map(nameCounts)
}

async function loadNameIndex() {
  const keys = await getDb().rules.orderBy('[kind+sortName]').keys() as unknown as [string, string][]
  nameCounts.clear()
  for (const [kind, name] of keys) {
    const k = `${kind}:${name}`
    nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1)
  }
  nameIndex.value = new Map(nameCounts)
  nameIndexReady = true
}

/** Synchronous "does this compendium entry exist?" for ref rendering. Loads once,
 *  is patched on every single-entry write and reloads after a sync or import. */
export function useRulesIndex() {
  if (import.meta.client && !nameIndexStarted) {
    nameIndexStarted = true
    loadNameIndex()
    watch(bulkRevision, () => { loadNameIndex() })
  }
  return {
    has: (kind: string, name: string) => nameIndex.value.has(`${kind}:${name.trim().toLowerCase()}`),
    names: nameIndex,
  }
}

export function useRulesRevision() {
  return revision
}

// A sync or edit in another tab: lists and counts refresh (the name index reloads after our own sync/import)
onTablesChanged(['rules'], () => { queryCache.clear(); revision.value++ })

/** For writers outside this module (the sync worker, imports): tell lists, counts and the ref index to reload. */
export function notifyRulesChanged() {
  nameIndexReady = false
  touch()
  bulkRevision.value++
}
