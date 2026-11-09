/**
 * Full-text search for the app's own data (MiniSearch). Pure: documents in,
 * ranked hits out; composables/useSearchIndex.ts reads the database.
 *
 * Matching: whole words, word beginnings ("gob" → Goblin) and small typos
 * ("aldirc" → Aldric) in names, tags and text, names counting most. Exact and
 * leading name matches rank first. A name that merely contains the text
 * ("blin" in Goblin) still matches, after the rest, as search always did.
 */
import MiniSearch, { type Options, type SearchOptions } from 'minisearch'

export type SearchDocKind = 'campaign' | 'entity' | 'encounter' | 'graph' | 'panel'

export interface SearchDoc {
  /** Unique across kinds: `${kind}:${refId}` */
  id: string
  kind: SearchDocKind
  refId: number
  name: string
  /** Space-separated tags */
  tags?: string
  /** Body text: an entry's content and text fields, a panel's content */
  text?: string
  campaignId?: number
  /** Entity type or panel kind */
  type?: string
  sessionId?: number
}

export interface SearchHit extends Omit<SearchDoc, 'text' | 'tags'> {
  score: number
  /** Where it matched: the name ranks above tags and text */
  match: 'name' | 'tags' | 'text'
}

/** Lower case without accents: "Élan" and "elan" find each other. */
export function foldTerm(term: string): string {
  return term.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

const SEARCH: SearchOptions = {
  boost: { name: 4, tags: 2, text: 1 },
  prefix: true,
  // Typos only in words long enough to tell apart: one edit for 4-5 letters, two from 6
  // (two letters swapped count as two edits)
  fuzzy: (term: string) => (term.length < 4 ? false : term.length < 6 ? 1 : 2),
  combineWith: 'AND',
}

const OPTIONS: Options<SearchDoc> = {
  fields: ['name', 'tags', 'text'],
  storeFields: ['kind', 'refId', 'name', 'campaignId', 'type', 'sessionId'],
  processTerm: term => foldTerm(term) || null,
  searchOptions: SEARCH,
}

export interface SearchIndex {
  mini: MiniSearch<SearchDoc>
  /** Folded names for the contains fallback */
  names: { id: string; name: string; doc: SearchDoc }[]
}

export function buildSearchIndex(docs: SearchDoc[]): SearchIndex {
  const mini = new MiniSearch<SearchDoc>(OPTIONS)
  mini.addAll(docs)
  return { mini, names: docs.map(doc => ({ id: doc.id, name: foldTerm(doc.name), doc })) }
}

/** The best `limit` hits of one kind (or every kind), best first. */
export function searchDocs(index: SearchIndex, query: string, opts: { kind?: SearchDocKind; limit?: number } = {}): SearchHit[] {
  const q = foldTerm(query.trim())
  if (!q) return []
  const limit = opts.limit ?? 10
  const filter = opts.kind ? (r: { kind: SearchDocKind }) => r.kind === opts.kind : undefined

  const raw = index.mini.search(query, { ...SEARCH, filter: filter as any })
  const hits: SearchHit[] = raw.map(r => {
    const name = String(r.name)
    const folded = foldTerm(name)
    const fields = new Set(Object.values(r.match).flat())
    return {
      id: r.id as string, kind: r.kind, refId: r.refId, name,
      campaignId: r.campaignId, type: r.type, sessionId: r.sessionId,
      // Whole name, then the name's start, then the score
      score: r.score + (folded === q ? 1000 : folded.startsWith(q) ? 100 : 0),
      match: fields.has('name') ? 'name' : fields.has('tags') ? 'tags' : 'text',
    }
  })
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  if (hits.length < limit) {
    // Names containing the text mid-word, which word search doesn't see
    const seen = new Set(hits.map(h => h.id))
    for (const n of index.names) {
      if (hits.length >= limit) break
      if (seen.has(n.id) || (opts.kind && n.doc.kind !== opts.kind) || !n.name.includes(q)) continue
      const { text: _t, tags: _g, ...rest } = n.doc
      hits.push({ ...rest, score: 0, match: 'name' })
    }
  }
  return hits.slice(0, limit)
}

/** Plain text of a note: `{{npc: Aldric Vane | entry}}` reads as "Aldric Vane", markdown marks go. */
export function plainText(markdown: string | null | undefined): string {
  if (!markdown) return ''
  return markdown
    .replace(/\{\{\s*[\w-]+\s*:\s*([^|@}]+?)\s*(?:[|@][^}]*)?\}\}/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`=|-]+/g, ' ')
}

/**
 * Searchable text in an entry's attributes: string values, except image
 * sources, ids and structured data (a session's board, a table's rows).
 */
export function attributeText(attrs: Record<string, unknown> | null | undefined): string {
  if (!attrs) return ''
  const out: string[] = []
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'tags' || key === 'board' || /Source$|Id$|^id$|Url$/.test(key)) continue
    if (typeof value === 'string' && value && !value.startsWith('img:') && !value.startsWith('data:')) out.push(value)
  }
  return out.join(' ')
}

// ── Compendium names ─────────────────────────────────────────────────────────

/**
 * The compendium has tens of thousands of entries: its index holds names
 * only, keyed `kind:name` as useRules' name list is. Same matching and
 * ranking as above.
 */
export interface NameIndex { mini: MiniSearch<{ id: string; name: string }>; keys: string[] }

export function buildNameIndex(keys: Iterable<string>): NameIndex {
  const mini = new MiniSearch<{ id: string; name: string }>({
    fields: ['name'], processTerm: term => foldTerm(term) || null, searchOptions: SEARCH,
  })
  const all = [...keys]
  mini.addAll(all.map(id => ({ id, name: id.slice(id.indexOf(':') + 1) })))
  return { mini, keys: all }
}

/** `kind:name` keys, best first: whole name, name start, word matches, then names containing the text. */
export function searchNames(index: NameIndex, query: string): string[] {
  const q = foldTerm(query.trim())
  if (!q) return []
  const nameOf = (key: string) => foldTerm(key.slice(key.indexOf(':') + 1))
  const scored = index.mini.search(query).map(r => {
    const n = nameOf(r.id as string)
    return { key: r.id as string, n, score: r.score + (n === q ? 1000 : n.startsWith(q) ? 100 : 0) }
  })
  scored.sort((a, b) => b.score - a.score || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0))
  const seen = new Set(scored.map(s => s.key))
  const contains = index.keys.filter(k => !seen.has(k) && nameOf(k).includes(q)).sort()
  return [...scored.map(s => s.key), ...contains]
}
