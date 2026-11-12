/**
 * What compendium lists filter and sort by, kept in memory: one small record
 * per entry (local edits applied). A new search or filter then reads no rows
 * but the shown page (a scan of 6,900 creatures took about 320 ms each time).
 * Built on first use, patched by single writes, dropped after a sync or import.
 */
import { withLocalEdits } from '@/domain/rules/edits'
import { packOf } from '@/domain/rules/packs'
import type { Rarity, RulesEntity, RulesKind, RulesOrigin } from '@/domain/rules/types'
import { buildNameIndex, searchNames, type NameIndex } from '@/domain/search'
import { getDb } from './db'
import type { RulesQuery } from './rules'

interface Facets {
  id: string
  kind: RulesKind
  /** Stored sortName: what the [kind+sortName] index is keyed by. */
  key: string
  sortName: string
  level: number
  rarity: Rarity
  game: RulesEntity['game']
  origin: RulesOrigin
  pack: string
  traits: string[]
  isFavorite: boolean
  superseded: boolean
  removed: boolean
}

function facetsOf(raw: RulesEntity): Facets {
  const e = withLocalEdits(raw)
  return {
    id: raw.id, kind: raw.kind, key: raw.sortName, sortName: e.sortName, level: e.level, rarity: e.rarity, game: e.game,
    origin: e.origin, pack: e.origin === 'user' ? packOf(e) : '', traits: e.traits ?? [], isFavorite: !!e.isFavorite,
    superseded: !!e.supersededBy, removed: !!e.upstream?.removed,
  }
}

type Filters = Omit<RulesQuery, 'offset' | 'limit'>

function matcher(q: Filters): (e: Facets) => boolean {
  const text = q.text?.trim().toLowerCase() ?? ''
  const kinds = q.kind ? new Set([q.kind]) : q.kinds?.length ? new Set(q.kinds) : null
  const games = q.games?.length ? new Set<string>([...q.games, 'both']) : null
  const rarities = q.rarities?.length ? new Set(q.rarities) : null
  const origins = q.origins?.length ? new Set(q.origins) : null
  const traits = q.traits?.map(t => t.toLowerCase()) ?? []
  const hideSuperseded = q.hideSuperseded ?? true
  const packs = q.packs?.length ? new Set(q.packs) : null
  return (e) => {
    if (kinds && !kinds.has(e.kind)) return false
    if (games && !games.has(e.game)) return false
    if (hideSuperseded && e.superseded) return false
    if (!q.showRemoved && e.removed) return false
    if (q.favoritesOnly && !e.isFavorite) return false
    if (origins && !origins.has(e.origin)) return false
    if (packs && (e.origin !== 'user' || !packs.has(e.pack))) return false
    if (rarities && !rarities.has(e.rarity)) return false
    if (q.levelMin !== null && q.levelMin !== undefined && e.level < q.levelMin) return false
    if (q.levelMax !== null && q.levelMax !== undefined && e.level > q.levelMax) return false
    if (traits.length && !traits.every(t => e.traits.includes(t))) return false
    if (text && !e.sortName.includes(text) && !e.traits.some(t => t === text)) return false
    return true
  }
}

let all: Promise<Facets[]> | null = null
let names: NameIndex | null = null
const queryCache = new Map<string, string[]>()

const byName = (a: Facets, b: Facets) => (a.sortName < b.sortName ? -1 : a.sortName > b.sortName ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

function rows(): Promise<Facets[]> {
  if (!all) {
    const loading = (async () => {
      const out: Facets[] = []
      await (getDb().rows('rules') as unknown as import('dexie').Table<RulesEntity, string>).each((raw) => { out.push(facetsOf(raw)) })
      return out.sort(byName)
    })()
    all = loading
    loading.catch(() => { if (all === loading) all = null })
  }
  return all
}

export function clearRulesIndex(): void {
  all = null
  names = null
  queryCache.clear()
}

/** One entry changed: its record is replaced without reading the store again. */
export function patchRulesIndex(before: RulesEntity | null, after: RulesEntity | null): void {
  queryCache.clear()
  names = null
  if (!all) return
  const id = (before ?? after)?.id
  all = all.then((list) => {
    const next = list.filter(r => r.id !== id)
    if (after) {
      const f = facetsOf(after)
      let lo = 0, hi = next.length
      while (lo < hi) { const mid = (lo + hi) >> 1; if (byName(next[mid] as Facets, f) < 0) lo = mid + 1; else hi = mid }
      next.splice(lo, 0, f)
    }
    return next
  })
}

/** Ids matching a filter set, in order; kept per filter set until the next write. */
export async function indexedIds(q: Filters): Promise<string[]> {
  const cacheKey = JSON.stringify(q)
  const hit = queryCache.get(cacheKey)
  if (hit) return hit
  const list = await rows()
  const sorted = q.sort === 'level' ? [...list].sort((a, b) => a.level - b.level || byName(a, b)) : list
  const keep = matcher(q)
  const ids: string[] = []
  // Both releases ship the same conditions (same Foundry document id): across games one is shown, the PF2e copy
  const twins = !q.games?.length ? new Map<string, number>() : null
  const desc = q.dir === 'desc'
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[desc ? sorted.length - 1 - i : i] as Facets
    if (!keep(row)) continue
    const docId = twins && row.kind === 'condition' && row.origin === 'foundry' && row.game !== 'both' ? row.id.split(':').pop() ?? null : null
    if (twins && docId) {
      const at = twins.get(docId)
      if (at !== undefined) { if (row.game === 'pf2e') ids[at] = row.id; continue }
      twins.set(docId, ids.length)
    }
    ids.push(row.id)
  }
  if (queryCache.size > 20) queryCache.clear()
  queryCache.set(cacheKey, ids)
  return ids
}

/** [kind, stored sortName] of the names a text finds, best first. */
export async function searchRuleNames(text: string): Promise<[string, string][]> {
  const q = text.trim().toLowerCase()
  if (!q) return []
  names ??= buildNameIndex(new Set((await rows()).map(r => `${r.kind}:${r.key}`)))
  return searchNames(names, q).map((k) => { const sep = k.indexOf(':'); return [k.slice(0, sep), k.slice(sep + 1)] as [string, string] })
}

/** Whether a compendium entry of this kind and name exists (for drawing references). */
export async function ruleNameExists(kind: string, name: string): Promise<boolean> {
  const wanted = name.trim().toLowerCase()
  return (await rows()).some(r => r.kind === kind && r.sortName === wanted)
}
