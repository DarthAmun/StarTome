/**
 * Compendium repository — the only module that reads or writes the `rules` table.
 *
 * Reads return the *effective* entry (local edits applied, see rules/edits.ts).
 * Writes route by origin: a user/legacy entry is changed in place; a Foundry
 * entry's rules fields go to its `localEdits` overlay so a re-sync keeps them.
 */
import { ref, shallowRef, toRaw, watch } from 'vue'
import { getDb } from '~/composables/useDb'
import { newRulesEntity, newRulesId } from '~/rules/factory'
import { isOverlayPath, setPath, withLocalEdits } from '~/rules/edits'
import { dataUrlToBlob, storeImage } from '~/rules/images'
import type { GameId } from '~/types/game'
import { isRulesKind, RULES_KIND_CONFIG, RULES_KINDS, type Rarity, type RulesEntity, type RulesKind, type RulesOrigin } from '~/types/rules'

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
  favoritesOnly?: boolean
  sort?: 'name' | 'level'
  dir?: 'asc' | 'desc'
  offset?: number
  limit?: number
}

export interface RulesPage { items: RulesEntity[]; total: number }

/** Bumped on every write; components watch it to refresh lists, counts and the ref index. */
const revision = ref(0)
function touch() { revision.value++ }

function now() { return new Date().toISOString() }

function matcher(q: RulesQuery): (e: RulesEntity) => boolean {
  const text = q.text?.trim().toLowerCase() ?? ''
  const games = q.games?.length ? new Set<string>([...q.games, 'both']) : null
  const rarities = q.rarities?.length ? new Set(q.rarities) : null
  const origins = q.origins?.length ? new Set(q.origins) : null
  const traits = q.traits?.map(t => t.toLowerCase()) ?? []
  const hideSuperseded = q.hideSuperseded ?? true
  return (raw) => {
    const e = withLocalEdits(raw)
    if (games && !games.has(e.game)) return false
    if (hideSuperseded && e.supersededBy) return false
    if (q.favoritesOnly && !e.isFavorite) return false
    if (origins && !origins.has(e.origin)) return false
    if (rarities && !rarities.has(e.rarity)) return false
    if (q.levelMin !== null && q.levelMin !== undefined && e.level < q.levelMin) return false
    if (q.levelMax !== null && q.levelMax !== undefined && e.level > q.levelMax) return false
    if (traits.length && !traits.every(t => e.traits.includes(t))) return false
    if (text && !e.sortName.includes(text) && !e.traits.some(t => t === text)) return false
    return true
  }
}

export async function rulesQuery(q: RulesQuery): Promise<RulesPage> {
  const db = getDb()
  const byLevel = q.sort === 'level'
  // [kind+level+sortName] sorts by level, then by name within a level
  const index = byLevel ? '[kind+level+sortName]' : '[kind+sortName]'
  const lower = byLevel ? [q.kind, -Infinity, ''] : [q.kind, '']
  const upper = byLevel ? [q.kind, Infinity, '￿'] : [q.kind, '￿']
  let coll = db.rules.where(index).between(lower, upper, true, true)
  if (q.dir === 'desc') coll = coll.reverse()
  coll = coll.filter(matcher(q))
  const total = await coll.clone().count()
  const offset = q.offset ?? 0
  const limit = q.limit ?? 100
  const items = (await coll.offset(offset).limit(limit).toArray()).map(withLocalEdits)
  return { items, total }
}

/**
 * Name search across all kinds (global search, quick lookup). Prefix matches
 * come first via the index; a contains-scan fills up the rest.
 */
export async function rulesSearch(text: string, limit = 8, games?: GameId[]): Promise<RulesEntity[]> {
  const q = text.trim().toLowerCase()
  if (!q) return []
  const gameSet = games?.length ? new Set<string>([...games, 'both']) : null
  const keep = (e: RulesEntity) => !e.supersededBy && (!gameSet || gameSet.has(e.game))
  const db = getDb()
  const prefix = await db.rules.where('sortName').startsWith(q).filter(keep).limit(limit).toArray()
  if (prefix.length >= limit) return prefix.map(withLocalEdits)
  const seen = new Set(prefix.map(e => e.id))
  const rest = await db.rules
    .filter(e => !seen.has(e.id) && e.sortName.includes(q) && keep(e))
    .limit(limit - prefix.length)
    .toArray()
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
    if (raw.supersededBy || (gameSet && !gameSet.has(raw.game))) return
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
  touch()
  return entity
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
    if (path === 'name') next.sortName = String(value).toLowerCase()
  }
  next.updatedAt = now()
  await db.rules.put(next)
  touch()
  return withLocalEdits(next)
}

/** Sets a portrait or token art from a data URL (stored as a blob) or an http URL. */
export async function rulesSetImage(id: string, field: 'img' | 'tokenImg', source: string | null): Promise<RulesEntity | undefined> {
  const value = source?.startsWith('data:') ? await storeImage(dataUrlToBlob(source)) : source
  return rulesUpdate(id, field, value)
}

/** Drops local edits — all of them, or only one path. */
export async function rulesResetEdits(id: string, path?: string): Promise<RulesEntity | undefined> {
  const db = getDb()
  const row = await db.rules.get(id)
  if (!row?.localEdits) return row && withLocalEdits(row)
  const edits = { ...row.localEdits }
  if (path) delete edits[path]
  const next = { ...row, localEdits: path && Object.keys(edits).length ? edits : undefined, updatedAt: now() }
  await db.rules.put(next)
  touch()
  return withLocalEdits(next)
}

/** Copies the effective entry as a new homebrew entry the user fully owns. */
export async function rulesDuplicate(id: string): Promise<RulesEntity | undefined> {
  const src = await rulesGet(id)
  if (!src) return undefined
  const ts = now()
  const copy: RulesEntity = {
    ...structuredClone(toRaw(src)),
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
  }
  await getDb().rules.add(copy)
  touch()
  return copy
}

/** Only user and legacy entries can be deleted; a synced entry would come back with the next sync. */
export async function rulesDelete(id: string): Promise<void> {
  const row = await getDb().rules.get(id)
  if (!row) return
  if (row.origin === 'foundry') throw new Error('Synced compendium entries cannot be deleted.')
  await getDb().rules.delete(id)
  touch()
}

export async function rulesCounts(): Promise<Record<RulesKind, number>> {
  const db = getDb()
  const counts = await Promise.all(RULES_KINDS.map(k => db.rules.where('kind').equals(k).count()))
  return Object.fromEntries(RULES_KINDS.map((k, i) => [k, counts[i]])) as Record<RulesKind, number>
}

// ── Name index for {{kind: Name}} refs ──────────────────────────────────────
// Rendering is synchronous, so names are kept in memory. Only the compound
// index keys are read — no rows are loaded.

const nameIndex = shallowRef<Set<string>>(new Set())
let nameIndexStarted = false

async function loadNameIndex() {
  const keys = await getDb().rules.orderBy('[kind+sortName]').keys() as unknown as [string, string][]
  nameIndex.value = new Set(keys.map(([kind, name]) => `${kind}:${name}`))
}

/** Synchronous "does this compendium entry exist?" for ref rendering. Loads once,
 *  then reloads after every compendium write. */
export function useRulesIndex() {
  if (import.meta.client && !nameIndexStarted) {
    nameIndexStarted = true
    loadNameIndex()
    watch(revision, () => { loadNameIndex() })
  }
  return {
    has: (kind: string, name: string) => nameIndex.value.has(`${kind}:${name.trim().toLowerCase()}`),
    names: nameIndex,
  }
}

export function useRulesRevision() {
  return revision
}

/** For writers outside this module (the sync worker): tell lists, counts and the ref index to reload. */
export function notifyRulesChanged() {
  touch()
}
