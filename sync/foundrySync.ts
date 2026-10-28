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
import { convertFoundryDoc, kindOfFoundryType, sourceOf, type FoundryDoc } from '~/converters/foundry'
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
      checksum: `${(f as any)._data?.crc32 ?? ''}:${size(f)}`, defaultSelected: defaultSelected(name),
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

  // Pass 1: every selected document's UUID → kind + name, for links in text
  const index = new Map<string, { kind: string; name: string }>()
  for (const [i, p] of selected.entries()) {
    progress({ phase: 'index', pack: p.name, packIndex: i, docs: index.size })
    for (const d of await source.readPack(p.name)) {
      const kind = kindOfFoundryType(d.type)
      if (kind) index.set(sourceOf(d, { game, pack: p.name }), { kind, name: d.name })
    }
  }

  const previous = await db.syncState.get(game)
  const existing = new Map<string, RulesEntity>()
  await db.rules.where('origin').equals('foundry').each(r => { if (r.game === game) existing.set(r.id, r) })

  // Pass 2: convert and merge pack by pack
  const seenByPack = new Map<string, Set<string>>()
  for (const [i, p] of selected.entries()) {
    const unchangedPack = !opts.force && previous?.version === version && previous.packs[p.name]?.hash === p.checksum
    if (unchangedPack) {
      report.packs.push({ name: p.name, converted: 0, skipped: true })
      continue
    }
    progress({ phase: 'convert', pack: p.name, packIndex: i, docs: 0 })
    const seen = new Set<string>()
    seenByPack.set(p.name, seen)
    const writes: RulesEntity[] = []
    let converted = 0
    for (const doc of await source.readPack(p.name)) {
      const { entity, issues } = convertFoundryDoc(doc, { game, version, pack: p.name, resolveUuid: u => index.get(u) ?? null, localize })
      for (const iss of issues) addIssue(iss.code, iss.detail)
      if (!entity) continue
      converted++
      seen.add(entity.id)
      const merged = merge(entity, existing.get(entity.id), p.name, version, report)
      if (merged) writes.push(merged)
    }
    for (let w = 0; w < writes.length; w += WRITE_CHUNK) {
      await db.rules.bulkPut(writes.slice(w, w + WRITE_CHUNK))
      progress({ phase: 'convert', pack: p.name, packIndex: i, docs: Math.min(w + WRITE_CHUNK, writes.length) })
    }
    report.packs.push({ name: p.name, converted, skipped: false })
  }

  progress({ phase: 'finish', packIndex: selected.length, docs: 0 })

  // Entries that disappeared from a pack that was synced this time
  const removedRows: RulesEntity[] = []
  for (const row of existing.values()) {
    const pack = row.upstream?.pack
    if (!pack || !seenByPack.has(pack) || seenByPack.get(pack)!.has(row.id) || row.upstream?.removed) continue
    removedRows.push({ ...row, upstream: { ...row.upstream!, removed: true }, updatedAt: new Date().toISOString() })
  }
  for (let w = 0; w < removedRows.length; w += WRITE_CHUNK) await db.rules.bulkPut(removedRows.slice(w, w + WRITE_CHUNK))
  report.removed = removedRows.length

  report.superseded = await pairLegacyWithRemaster(game)

  const state: DbSyncState = {
    game, channel: 'release', version,
    packs: {
      ...(previous?.version === version ? previous.packs : {}),
      ...Object.fromEntries(selected.map(p => [p.name, { hash: p.checksum, count: report.packs.find(r => r.name === p.name)?.converted ?? previous?.packs[p.name]?.count ?? 0 }])),
    },
    syncedAt: new Date().toISOString(),
  }
  await db.syncState.put(state)
  report.durationMs = Date.now() - t0
  return report
}

/** New upstream entity + stored row → row to write, or null if nothing changed. */
function merge(entity: RulesEntity, prev: RulesEntity | undefined, pack: string, version: string, report: SyncReport): RulesEntity | null {
  const hash = contentHash(entity)
  const now = new Date().toISOString()
  if (!prev) {
    report.created++
    return { ...entity, upstream: { pack, version, hash }, createdAt: now, updatedAt: now }
  }
  if (prev.upstream?.hash === hash && !prev.upstream.removed) {
    report.unchanged++
    return null
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
  return {
    ...entity,
    ...userOwned,
    ...(prev.supersededBy ? { supersededBy: prev.supersededBy } : {}),
    upstream: { pack, version, hash },
    createdAt: prev.createdAt,
    updatedAt: now,
  } as RulesEntity
}

/** Stable hash of the converted rules content (bookkeeping and version excluded). */
export function contentHash(entity: RulesEntity): string {
  const { sourceRefs, upstream, createdAt, updatedAt, ...content } = entity as any
  const s = stableStringify(content)
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995)
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${s.length.toString(36)}`
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
    const key = `${r.kind}:${r.sortName}`
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
