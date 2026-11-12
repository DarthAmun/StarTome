/**
 * Foundry release → compendium sync (FORK_PLAN.md §7.3).
 *
 * Source: a release's json-assets.zip (one JSON array per pack + lang files),
 * dropped into the app by the user. Runs in a Web Worker in the app and directly
 * in tests; it only touches the database through getDb().
 *
 * Merge rules (§7.6): the sync owns every rules field of a Foundry entry; the
 * user's img/tokenImg/gmNotes/tags/isFavorite/unidentified/localEdits survive;
 * a local edit whose upstream value changed is reported as a conflict; entries
 * gone from a synced pack are marked removed, never deleted.
 */
import JSZip from 'jszip'
import { getDb, type DbSyncState } from '~/composables/useDb'
import { CONVERTER_VERSION, convertFoundryDoc, kindOfFoundryType, sourceOf, type FoundryDoc } from '~/converters/foundry'
import { defaultSelected, packGroup, packLabel, type PackGroup } from '~/converters/foundry/packs'
import { getPath, USER_OWNED_FIELDS } from '~/rules/edits'
import type { GameId } from '~/types/game'
import type { RulesEntity, RulesKind } from '~/types/rules'
import { buildLocalizer, LANG_ORDER } from './foundryLang'

// ── Source ─────────────────────────────────────────────────────────────────

export interface PackInfo {
  name: string
  label: string
  group: PackGroup
  size: number            // uncompressed bytes
  checksum: string        // changes when the pack's content changes
  defaultSelected: boolean
}

export interface ReleaseInfo { game: GameId; version: string; packs: PackInfo[] }

export interface FoundrySource extends ReleaseInfo {
  readPack(name: string): Promise<FoundryDoc[]>
  readLang(): Promise<unknown[]>
}

/** Opens a release's json-assets.zip. Game and version come from the documents, not the filename. */
export async function openReleaseZip(data: Blob | ArrayBuffer | Uint8Array): Promise<FoundrySource> {
  const zip = await JSZip.loadAsync(data)
  const packFiles = Object.values(zip.files).filter(f => /^packs\/[^/]+\.json$/.test(f.name) && !f.name.endsWith('_folders.json'))
  if (!packFiles.length) throw new Error('This ZIP has no packs/ folder. Use the json-assets.zip of a PF2e or SF2e release.')

  const readPack = async (name: string): Promise<FoundryDoc[]> => {
    const f = zip.file(`packs/${name}.json`)
    if (!f) throw new Error(`Pack ${name} is not in this ZIP.`)
    const data = JSON.parse(await f.async('string'))
    return Array.isArray(data) ? data : []
  }

  // Identify the release from a small pack that both games ship
  const probeName = packFiles.some(f => f.name === 'packs/conditions.json') ? 'conditions'
    : packFiles.reduce((a, b) => (size(a) <= size(b) ? a : b)).name.slice(6, -5)
  const probe = (await readPack(probeName)).find(d => d._stats?.systemId)
  const systemId = probe?._stats?.systemId
  if (systemId !== 'pf2e' && systemId !== 'sf2e') throw new Error(`Unrecognised game system "${systemId ?? 'unknown'}". Expected a PF2e or SF2e release.`)
  const version = probe?._stats?.systemVersion ?? 'unknown'

  const packs = packFiles.map(f => {
    const name = f.name.slice(6, -5)
    return {
      name, label: packLabel(name), group: packGroup(name), size: size(f),
      // JSZip's stored CRC (private field); empty when missing, then the sync hashes the pack text
      checksum: crcOf(f) != null ? `${crcOf(f)}:${size(f)}` : '', defaultSelected: defaultSelected(name),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  return {
    game: systemId, version, packs, readPack,
    async readLang() {
      const out: unknown[] = []
      for (const name of LANG_ORDER) {
        const f = zip.file(`lang/${name}`)
        if (f) out.push(JSON.parse(await f.async('string')))
      }
      return out
    },
  }
}

function size(f: JSZip.JSZipObject): number {
  return (f as any)._data?.uncompressedSize ?? 0
}

function crcOf(f: JSZip.JSZipObject): number | null {
  const crc = (f as any)._data?.crc32
  return typeof crc === 'number' ? crc : null
}

/** Parsed packs kept between the index pass and the convert pass, up to a memory budget. */
const PACK_CACHE_BUDGET = 64 * 1024 * 1024
const PACK_CACHE_MAX_PACK = 8 * 1024 * 1024

// ── Sync ───────────────────────────────────────────────────────────────────

export interface SyncProgress {
  phase: 'lang' | 'index' | 'convert' | 'finish'
  pack?: string
  packIndex: number
  packCount: number
  docs: number
}

export interface SyncReport {
  game: GameId
  version: string
  packs: { name: string; converted: number; skipped: boolean }[]
  created: number
  updated: number
  unchanged: number
  removed: number
  superseded: number
  conflicts: { id: string; kind: RulesKind; name: string; paths: string[] }[]
  issues: Record<string, { count: number; examples: string[] }>
  durationMs: number
}

export interface SyncOptions {
  packs: string[]
  onProgress?: (p: SyncProgress) => void
  /** Re-convert packs even when their checksum matches the last sync. */
  force?: boolean
}

const WRITE_CHUNK = 500

export async function runFoundrySync(source: FoundrySource, opts: SyncOptions): Promise<SyncReport> {
  const t0 = Date.now()
  const db = getDb()
  const { game, version } = source
  const selected = source.packs.filter(p => opts.packs.includes(p.name) && p.group !== 'skip')
  const report: SyncReport = {
    game, version, packs: [], created: 0, updated: 0, unchanged: 0, removed: 0, superseded: 0, conflicts: [], issues: {}, durationMs: 0,
  }
  const progress = (p: Omit<SyncProgress, 'packCount'>) => opts.onProgress?.({ ...p, packCount: selected.length })
  const addIssue = (code: string, detail: string) => {
    const e = (report.issues[code] ??= { count: 0, examples: [] })
    e.count++
    if (e.examples.length < 5) e.examples.push(detail)
  }

  progress({ phase: 'lang', packIndex: 0, docs: 0 })
  const localize = buildLocalizer(await source.readLang())

  // Pass 1: every selected document's UUID → kind + name, for links in text.
  // Small packs stay parsed for pass 2; big ones are read again (PERF-06).
  const index = new Map<string, { kind: string; name: string }>()
  const parsed = new Map<string, FoundryDoc[]>()
  const checksums = new Map<string, string>()
  let cached = 0
  for (const [i, p] of selected.entries()) {
    progress({ phase: 'index', pack: p.name, packIndex: i, docs: index.size })
    const docs = await source.readPack(p.name)
    for (const d of docs) {
      const kind = kindOfFoundryType(d.type)
      if (kind) index.set(sourceOf(d, { game, pack: p.name }), { kind, name: d.name })
    }
    // No CRC from the ZIP: fall back to a hash of the content (BUG-17)
    checksums.set(p.name, p.checksum || `h:${hashString(JSON.stringify(docs))}`)
    if (p.size <= PACK_CACHE_MAX_PACK && cached + p.size <= PACK_CACHE_BUDGET) {
      parsed.set(p.name, docs)
      cached += p.size
    }
  }

  // Only what the merge decision needs is kept for every row; full rows are
  // read per pack, for the entries that changed.
  const previous = await db.syncState.get(game)
  const known = new Map<string, { hash?: string; pack?: string; removed?: boolean }>()
  await db.rules.where('origin').equals('foundry').each(r => {
    if (r.game === game) known.set(r.id, { hash: r.upstream?.hash, pack: r.upstream?.pack, removed: r.upstream?.removed })
  })

  // Pass 2: convert and merge pack by pack
  const seenByPack = new Map<string, Set<string>>()
  for (const [i, p] of selected.entries()) {
    const checksum = checksums.get(p.name)!
    const prevPack = previous?.version === version ? previous.packs[p.name] : undefined
    const unchangedPack = !opts.force && prevPack?.hash === checksum && (prevPack.converter ?? 1) === CONVERTER_VERSION
    if (unchangedPack) {
      report.packs.push({ name: p.name, converted: 0, skipped: true })
      parsed.delete(p.name)
      continue
    }
    progress({ phase: 'convert', pack: p.name, packIndex: i, docs: 0 })
    const seen = new Set<string>()
    seenByPack.set(p.name, seen)
    const changed: { entity: RulesEntity; hash: string }[] = []
    let converted = 0
    const docs = parsed.get(p.name) ?? await source.readPack(p.name)
    parsed.delete(p.name)
    for (const doc of docs) {
      const { entity, issues } = convertFoundryDoc(doc, { game, version, pack: p.name, resolveUuid: u => index.get(u) ?? null, localize })
      for (const iss of issues) addIssue(iss.code, iss.detail)
      if (!entity) continue
      converted++
      seen.add(entity.id)
      const hash = contentHash(entity)
      const k = known.get(entity.id)
      if (k && k.hash === hash && !k.removed) { report.unchanged++; continue }
      changed.push({ entity, hash })
    }
    const prevRows = await db.rules.bulkGet(changed.map(c => c.entity.id))
    const writes = changed.map(({ entity, hash }, j) => merge(entity, hash, prevRows[j], p.name, version, report))
    for (let w = 0; w < writes.length; w += WRITE_CHUNK) {
      await db.rules.bulkPut(writes.slice(w, w + WRITE_CHUNK))
      progress({ phase: 'convert', pack: p.name, packIndex: i, docs: Math.min(w + WRITE_CHUNK, writes.length) })
    }
    report.packs.push({ name: p.name, converted, skipped: false })
  }

  progress({ phase: 'finish', packIndex: selected.length, docs: 0 })

  // Entries that disappeared from a pack that was synced this time
  const goneIds: string[] = []
  for (const [id, k] of known) {
    if (!k.pack || !seenByPack.has(k.pack) || seenByPack.get(k.pack)!.has(id) || k.removed) continue
    goneIds.push(id)
  }
  const ts = new Date().toISOString()
  for (let w = 0; w < goneIds.length; w += WRITE_CHUNK) {
    const rows = (await db.rules.bulkGet(goneIds.slice(w, w + WRITE_CHUNK))).filter((r): r is RulesEntity => !!r)
    await db.rules.bulkPut(rows.map(row => ({ ...row, upstream: { ...row.upstream!, removed: true }, updatedAt: ts })))
  }
  report.removed = goneIds.length

  report.superseded = await pairLegacyWithRemaster(game)

  const state: DbSyncState = {
    game, channel: 'release', version,
    packs: {
      ...(previous?.version === version ? previous.packs : {}),
      ...Object.fromEntries(selected.map(p => {
        const r = report.packs.find(x => x.name === p.name)
        const prev = previous?.packs[p.name]
        const hash = checksums.get(p.name)!
        return [p.name, r?.skipped
          ? { hash, count: prev?.count ?? 0, converter: prev?.converter ?? 1 }
          : { hash, count: r?.converted ?? 0, converter: CONVERTER_VERSION }]
      })),
    },
    syncedAt: new Date().toISOString(),
  }
  await db.syncState.put(state)
  report.durationMs = Date.now() - t0
  return report
}

/** New upstream entity (whose hash changed or is new) + stored row → row to write. */
function merge(entity: RulesEntity, hash: string, prev: RulesEntity | undefined, pack: string, version: string, report: SyncReport): RulesEntity {
  const now = new Date().toISOString()
  if (!prev) {
    report.created++
    return { ...entity, upstream: { pack, version, hash }, createdAt: now, updatedAt: now }
  }
  // Local edits whose upstream value moved since the user made them
  const conflictPaths = Object.keys(prev.localEdits ?? {}).filter(path =>
    JSON.stringify(getPath(prev, path)) !== JSON.stringify(getPath(entity, path)))
  if (conflictPaths.length) report.conflicts.push({ id: entity.id, kind: entity.kind, name: entity.name, paths: conflictPaths })

  const userOwned: Record<string, unknown> = {}
  for (const key of USER_OWNED_FIELDS) {
    const v = (prev as any)[key]
    if (v !== undefined) userOwned[key] = v
  }
  report.updated++
  const next = {
    ...entity,
    ...userOwned,
    ...(prev.supersededBy ? { supersededBy: prev.supersededBy } : {}),
    upstream: { pack, version, hash },
    createdAt: prev.createdAt,
    updatedAt: now,
  } as RulesEntity
  // A local rename keeps steering search and refs (BUG-05)
  const localName = next.localEdits?.name
  if (typeof localName === 'string') next.sortName = localName.toLowerCase()
  return next
}

function hashString(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995)
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${s.length.toString(36)}`
}

/** Stable hash of the converted rules content (bookkeeping and version excluded). */
export function contentHash(entity: RulesEntity): string {
  const { sourceRefs, upstream, createdAt, updatedAt, ...content } = entity as any
  return hashString(stableStringify(content))
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter(k => (v as any)[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableStringify((v as any)[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

/**
 * A legacy (pre-remaster) entry whose name and kind match a remaster entry of the
 * same game gets `supersededBy`, so browse views hide it by default (§7.3).
 */
export async function pairLegacyWithRemaster(game: GameId): Promise<number> {
  const db = getDb()
  const groups = new Map<string, RulesEntity[]>()
  await db.rules.where('origin').equals('foundry').each(r => {
    if (r.game !== game || r.upstream?.removed) return
    // By the upstream name: a local rename doesn't unpair a legacy/remaster twin
    const key = `${r.kind}:${r.name.toLowerCase()}`
    const g = groups.get(key)
    if (g) g.push(r); else groups.set(key, [r])
  })
  const writes: RulesEntity[] = []
  let superseded = 0
  for (const rows of groups.values()) {
    const remaster = rows.find(r => r.publication?.remaster)
    for (const r of rows) {
      const want = remaster && r !== remaster && r.publication && !r.publication.remaster ? remaster.id : undefined
      if (want) superseded++
      if (r.supersededBy !== want) writes.push({ ...r, supersededBy: want })
    }
  }
  for (let w = 0; w < writes.length; w += WRITE_CHUNK) await db.rules.bulkPut(writes.slice(w, w + WRITE_CHUNK))
  return superseded
}
