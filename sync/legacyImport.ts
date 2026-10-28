/**
 * DM's Tome → StarTome legacy import (FORK_PLAN.md §8, phase 4).
 *
 * 1. Read: a DM's Tome export file, or DM's Tome's own database (reachable
 *    when both apps are served from one github.io site).
 * 2. Analyse: match every library record against the synced compendium.
 *    Exact name matches are linked automatically; fuzzy matches and records
 *    without a match go to a review list with a default decision.
 * 3. Apply: attach portraits to the matched entries, turn kept records into
 *    'legacy' entries, import the campaign data with fresh ids and re-point
 *    token links at the compendium. Optionally carry the old library over so
 *    encounters keep working until phase 5 switches them to the compendium.
 *
 * Runs in a Web Worker in the app (the export is ~250 MB) and directly in tests.
 */
import Dexie from 'dexie'
import { getDb, type DbImage } from '~/composables/useDb'
import { LEGACY_DB_NAME } from '~/utils/appNamespace'
import { remapLibrary, remapLore, LORE_TABLES, type LibraryTables, type LoreTable, type LoreTables, type RemapIssue } from '~/converters/legacy/lore'
import { CompendiumNameIndex, normalizeName, type MatchTarget, type MatchVia, type RankedCandidate } from '~/converters/legacy/match'
import {
  convertLegacyRecord, legacyKindOf, legacyLevel, recordData, recordImage, type LegacyRecord,
} from '~/converters/legacy/records'
import { newRulesId } from '~/rules/factory'
import { dataUrlToBlob, isImageRef } from '~/rules/images'
import { isRulesKind, type RulesEntity, type RulesKind } from '~/types/rules'

// ── Reading ────────────────────────────────────────────────────────────────

export interface LegacyBundle extends LoreTables, LibraryTables {
  from: 'file' | 'browser'
  exportedAt?: string
}

const BUNDLE_TABLES = [...LORE_TABLES, 'systems', 'records'] as const

function bundleOf(raw: Record<string, unknown>, from: LegacyBundle['from']): LegacyBundle {
  const out: Record<string, unknown> = { from, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : undefined }
  for (const t of BUNDLE_TABLES) out[t] = Array.isArray(raw[t]) ? raw[t] : []
  return out as unknown as LegacyBundle
}

/** A DM's Tome "Everything" or "Campaigns" export. */
export async function readLegacyFile(file: Blob): Promise<LegacyBundle> {
  let raw: any
  try { raw = JSON.parse(await file.text()) } catch { throw new Error('This file is not valid JSON.') }
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || !(Array.isArray(raw.campaigns) || Array.isArray(raw.records))) {
    throw new Error('This is not a DM\'s Tome export. Use "Settings → Full Backup → Export" in DM\'s Tome.')
  }
  return bundleOf(raw, 'file')
}

export async function hasLegacyDb(): Promise<boolean> {
  return Dexie.exists(LEGACY_DB_NAME)
}

/** Reads DM's Tome's database read-only. Opened without a schema, so Dexie never upgrades it. */
export async function readLegacyDb(): Promise<LegacyBundle> {
  if (!(await hasLegacyDb())) throw new Error('No DM\'s Tome database in this browser. Import an export file instead.')
  const db = new Dexie(LEGACY_DB_NAME)
  await db.open()
  try {
    const names = new Set(db.tables.map(t => t.name))
    const raw: Record<string, unknown> = {}
    for (const t of BUNDLE_TABLES) raw[t] = names.has(t) ? await db.table(t).toArray() : []
    return bundleOf(raw, 'browser')
  } finally {
    db.close()
  }
}

// ── Analysis ───────────────────────────────────────────────────────────────

export type RecordDecision = { action: 'link'; rulesId: string } | { action: 'keep' } | { action: 'drop' }

export interface CandidateInfo {
  id: string
  name: string
  level: number
  game: string
  pub?: string
  remaster: boolean
  superseded: boolean
}

export interface RecordUsage {
  image: boolean
  tokens: number
  placements: number
  refs: number
  carried?: string
  homebrew: boolean
}

export interface RecordReview {
  recordId: number
  kind: RulesKind
  name: string
  level: number | null
  source: string
  status: 'fuzzy' | 'unmatched'
  via?: MatchVia
  candidates: CandidateInfo[]
  usage: RecordUsage
  decision: RecordDecision
}

export interface KindStats { total: number; exact: number; fuzzy: number; unmatched: number }

export interface LegacyAnalysis {
  from: LegacyBundle['from']
  exportedAt?: string
  campaigns: string[]
  counts: Record<string, number>
  compendiumSize: number
  kinds: Partial<Record<RulesKind, KindStats>>
  images: { total: number; exact: number; fuzzy: number }
  placements: { linked: number; broken: number; exact: number; fuzzy: number }
  review: RecordReview[]
  /** Campaigns of this bundle that already exist here (same name and creation time). */
  alreadyImported: string[]
}

/** What the worker keeps between analysis and apply. */
export interface AnalysedRecord {
  rec: LegacyRecord
  kind: RulesKind
  decision: RecordDecision
}

export interface AnalyseResult {
  analysis: LegacyAnalysis
  records: Map<number, AnalysedRecord>
  index: CompendiumNameIndex
}

export type LegacyProgress = { phase: 'read' | 'analyse' | 'images' | 'records' | 'library' | 'lore'; done?: number; total?: number }

const HOMEBREW_SOURCE = /self ?made|homebrew|eigen/i

function candidateInfo(c: MatchTarget | RankedCandidate): CandidateInfo {
  return { id: c.id, name: c.name, level: c.level, game: c.game, pub: c.pubTitle, remaster: c.remaster, superseded: c.superseded }
}

/** {{kind: Name}} refs in all campaign text, counted by "kind:normalised name". */
function countRefs(bundle: LegacyBundle): Map<string, number> {
  const counts = new Map<string, number>()
  const scan = (s: unknown) => {
    if (typeof s !== 'string' || !s.includes('{{')) return
    for (const m of s.matchAll(/\{\{(\w+):\s*([^}]+?)\s*\}\}/g)) {
      const kind = m[1].toLowerCase()
      if (!isRulesKind(kind)) continue
      const key = `${kind}:${normalizeName(m[2])}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  for (const e of bundle.entities) { scan(e.content); scan(e.attributes) }
  for (const c of bundle.campaigns) scan(c.description)
  for (const s of bundle.entitySnapshots) scan(s.content)
  return counts
}

export async function loadMatchTargets(): Promise<MatchTarget[]> {
  const out: MatchTarget[] = []
  await getDb().rules.where('origin').equals('foundry').each(r => {
    if (r.upstream?.removed) return
    out.push({
      id: r.id, kind: r.kind, name: r.name, level: r.level, game: r.game,
      remaster: !!r.publication?.remaster, pubTitle: r.publication?.title, superseded: !!r.supersededBy,
    })
  })
  return out
}

export async function analyseLegacy(
  bundle: LegacyBundle,
  onProgress?: (p: LegacyProgress) => void,
  targets?: MatchTarget[],
): Promise<AnalyseResult> {
  onProgress?.({ phase: 'analyse' })
  targets ??= await loadMatchTargets()
  const index = new CompendiumNameIndex(targets)

  const tokenUse = new Map<number, number>()
  for (const t of bundle.tokens) if (t.linked_record_id) tokenUse.set(t.linked_record_id, (tokenUse.get(t.linked_record_id) ?? 0) + 1)
  const placementUse = new Map<number, number>()
  for (const t of bundle.encounterTokens) if (t.linked_record_id) placementUse.set(t.linked_record_id, (placementUse.get(t.linked_record_id) ?? 0) + 1)
  const refUse = countRefs(bundle)

  const kinds: LegacyAnalysis['kinds'] = {}
  const records = new Map<number, AnalysedRecord>()
  const review: RecordReview[] = []
  const images = { total: 0, exact: 0, fuzzy: 0 }

  for (const rec of bundle.records as unknown as LegacyRecord[]) {
    const kind = legacyKindOf(rec.entityTypeId)
    if (!kind || rec.id === undefined) continue
    const d = recordData(rec)
    const info = { kind, name: rec.name, level: legacyLevel(kind, d), source: String(d.source ?? '') }
    const usage: RecordUsage = {
      image: !!recordImage(d),
      tokens: tokenUse.get(rec.id) ?? 0,
      placements: placementUse.get(rec.id) ?? 0,
      refs: refUse.get(`${kind}:${normalizeName(rec.name)}`) ?? 0,
      ...(d.carried ? { carried: String(d.carried) } : {}),
      homebrew: HOMEBREW_SOURCE.test(info.source),
    }
    const stats = (kinds[kind] ??= { total: 0, exact: 0, fuzzy: 0, unmatched: 0 })
    stats.total++
    if (usage.image) images.total++

    const m = usage.homebrew ? { via: null, candidates: [] } : index.match(info)
    let decision: RecordDecision
    if (m.via === 'exact') {
      stats.exact++
      if (usage.image) images.exact++
      decision = { action: 'link', rulesId: m.candidates[0].id }
    } else if (m.via) {
      stats.fuzzy++
      if (usage.image) images.fuzzy++
      decision = { action: 'link', rulesId: m.candidates[0].id }
      review.push({ recordId: rec.id, ...info, status: 'fuzzy', via: m.via, candidates: m.candidates.slice(0, 6).map(candidateInfo), usage, decision })
    } else {
      stats.unmatched++
      const inUse = usage.image || usage.tokens || usage.placements || usage.refs || usage.carried || usage.homebrew
      decision = inUse ? { action: 'keep' } : { action: 'drop' }
      const suggestions = usage.homebrew ? [] : index.suggest(info)
      review.push({ recordId: rec.id, ...info, status: 'unmatched', candidates: suggestions.map(candidateInfo), usage, decision })
    }
    records.set(rec.id, { rec, kind, decision })
  }

  const status = new Map(review.map(r => [r.recordId, r.status]))
  const linkedPlacements = bundle.encounterTokens.filter(t => t.linked_record_id)
  const valid = linkedPlacements.filter(t => records.has(t.linked_record_id!))
  const placements = {
    linked: valid.length,
    broken: linkedPlacements.length - valid.length,
    exact: valid.filter(t => !status.has(t.linked_record_id!)).length,
    fuzzy: valid.filter(t => status.get(t.linked_record_id!) === 'fuzzy').length,
  }

  const db = getDb()
  const existing = await db.campaigns.toArray()
  const alreadyImported = bundle.campaigns
    .filter(c => existing.some(e => e.name === c.name && e.created_at === c.created_at))
    .map(c => c.name)

  const counts: Record<string, number> = {}
  for (const t of BUNDLE_TABLES) counts[t] = bundle[t].length

  review.sort((a, b) => a.status.localeCompare(b.status) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  return {
    analysis: {
      from: bundle.from, exportedAt: bundle.exportedAt, campaigns: bundle.campaigns.map(c => c.name), counts,
      compendiumSize: targets.length, kinds, images, placements, review, alreadyImported,
    },
    records,
    index,
  }
}

// ── Apply ──────────────────────────────────────────────────────────────────

export interface ApplyOptions {
  /** recordId → decision, overriding the analysis default. */
  decisions?: Record<number, RecordDecision>
  lore: boolean
  /** Also carry the old systems/records library over (until phase 5/6 retire it). */
  library: boolean
  onProgress?: (p: LegacyProgress) => void
}

export interface LegacyReport {
  linked: number
  kept: number
  dropped: number
  imagesAttached: number
  entriesWithImages: number
  written: Partial<Record<LoreTable | 'systems' | 'records', number>>
  placements: { linkedToCompendium: number; linkedToFoundry: number; cleared: number }
  issues: RemapIssue[]
  durationMs: number
}

const CHUNK = 500

async function nextId(table: { orderBy(i: string): { last(): Promise<any> } }): Promise<number> {
  const last = await table.orderBy(':id').last()
  return (typeof last?.id === 'number' ? last.id : 0) + 1
}

export async function applyLegacy(bundle: LegacyBundle, analysed: AnalyseResult, opts: ApplyOptions): Promise<LegacyReport> {
  const t0 = Date.now()
  const db = getDb()
  const ts = new Date().toISOString()
  const progress = opts.onProgress ?? (() => {})
  const report: LegacyReport = {
    linked: 0, kept: 0, dropped: 0, imagesAttached: 0, entriesWithImages: 0, written: {},
    placements: { linkedToCompendium: 0, linkedToFoundry: 0, cleared: 0 }, issues: [], durationMs: 0,
  }

  const decisionOf = (a: AnalysedRecord): RecordDecision => opts.decisions?.[a.rec.id] ?? a.decision
  const rulesLinks = new Map<number, string>()
  const refRenames = new Map<string, string>()
  const images: DbImage[] = []
  const imgFor = new Map<string, string>()          // rules id → image ref to attach
  const newEntries: RulesEntity[] = []

  // Kept records that an earlier import already created are reused, not duplicated
  const priorLegacy = new Map<number, RulesEntity>()
  await db.rules.where('origin').equals('legacy').each(r => {
    const id = Number((r.legacy as any)?.recordId)
    if (Number.isFinite(id)) priorLegacy.set(id, r)
  })

  function addImage(dataUrl: string): string {
    const id = crypto.randomUUID()
    const blob = dataUrlToBlob(dataUrl)
    images.push({ id, blob, mime: blob.type, createdAt: ts })
    return `img:${id}`
  }

  progress({ phase: 'records', done: 0, total: analysed.records.size })
  const targetNames = new Map<string, { name: string; kind: RulesKind }>()
  for (const t of await loadMatchTargets()) targetNames.set(t.id, { name: t.name, kind: t.kind })

  for (const a of analysed.records.values()) {
    const decision = decisionOf(a)
    const d = recordData(a.rec)
    const dataUrl = recordImage(d)
    if (decision.action === 'link' && targetNames.has(decision.rulesId)) {
      report.linked++
      rulesLinks.set(a.rec.id, decision.rulesId)
      const target = targetNames.get(decision.rulesId)!
      if (normalizeName(target.name) !== normalizeName(a.rec.name)) refRenames.set(`${a.kind}:${normalizeName(a.rec.name)}`, target.name)
      if (dataUrl) {
        const ref = addImage(dataUrl)
        report.imagesAttached++
        // Legacy/remaster twins share the portrait, so it shows whichever one the user browses
        for (const twin of analysed.index.named(target.kind, target.name)) if (!imgFor.has(twin.id)) imgFor.set(twin.id, ref)
        imgFor.set(decision.rulesId, ref)
      }
    } else if (decision.action === 'keep' || decision.action === 'link') {
      const prior = priorLegacy.get(a.rec.id)
      if (prior) {
        rulesLinks.set(a.rec.id, prior.id)
        report.kept++
        continue
      }
      const converted = convertLegacyRecord(a.rec)
      if (!converted) { report.dropped++; continue }
      const entry = { ...converted, id: newRulesId(), createdAt: ts, updatedAt: ts } as RulesEntity
      if (dataUrl) { entry.img = addImage(dataUrl); report.imagesAttached++ }
      newEntries.push(entry)
      rulesLinks.set(a.rec.id, entry.id)
      report.kept++
    } else {
      report.dropped++
    }
  }

  progress({ phase: 'images', done: 0, total: images.length })
  for (let i = 0; i < images.length; i += CHUNK) {
    await db.images.bulkPut(images.slice(i, i + CHUNK))
    progress({ phase: 'images', done: Math.min(i + CHUNK, images.length), total: images.length })
  }
  // Attach to synced entries without overwriting an image the user already set
  const ids = [...imgFor.keys()]
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = (await db.rules.bulkGet(ids.slice(i, i + CHUNK))).filter((r): r is RulesEntity => !!r)
    const writes = rows.filter(r => !r.img || !isImageRef(r.img)).map(r => ({ ...r, img: imgFor.get(r.id)!, updatedAt: ts }))
    report.entriesWithImages += writes.length
    if (writes.length) await db.rules.bulkPut(writes)
  }
  for (let i = 0; i < newEntries.length; i += CHUNK) await db.rules.bulkAdd(newEntries.slice(i, i + CHUNK))
  report.entriesWithImages += newEntries.filter(e => e.img).length

  // The old library as it was (all record types), so encounters keep their stat blocks until phase 5
  let recordIds: Map<number, number> | undefined
  let systemIds: Map<number, number> | undefined
  if (opts.library && bundle.systems.length) {
    progress({ phase: 'library' })
    const lib = remapLibrary(bundle, { systems: await nextId(db.systems), records: await nextId(db.records) })
    await db.transaction('rw', db.systems, db.records, async () => {
      await db.systems.bulkAdd(lib.systems)
      for (let i = 0; i < lib.records.length; i += CHUNK) await db.records.bulkAdd(lib.records.slice(i, i + CHUNK))
    })
    recordIds = lib.recordIds
    systemIds = lib.systemIds
    report.written.systems = lib.systems.length
    report.written.records = lib.records.length
  }

  if (opts.lore) {
    progress({ phase: 'lore' })
    const tables = LORE_TABLES.map(t => db.table(t))
    const res = await db.transaction('rw', tables, async () => {
      const start = Object.fromEntries(await Promise.all(LORE_TABLES.map(async t => [t, await nextId(db.table(t))]))) as Record<LoreTable, number>
      const res = remapLore(bundle, start, { rulesLinks, recordIds, systemIds, refRenames }, normalizeName)
      for (const t of LORE_TABLES) {
        const rows = res.tables[t] as { id?: number }[]
        for (let i = 0; i < rows.length; i += CHUNK) await db.table(t).bulkAdd(rows.slice(i, i + CHUNK))
        report.written[t] = rows.length
      }
      return res
    })
    report.issues = res.issues
    const origins = new Map<string, string>()
    const linked = res.tables.encounterTokens.filter(t => t.linked_rules_id)
    for (const r of await db.rules.bulkGet([...new Set(linked.map(t => t.linked_rules_id!))])) if (r) origins.set(r.id, r.origin)
    report.placements = {
      linkedToCompendium: linked.length,
      linkedToFoundry: linked.filter(t => origins.get(t.linked_rules_id!) === 'foundry').length,
      cleared: res.issues.filter(i => i.table === 'encounterTokens' && i.detail.startsWith('link to record')).length,
    }
  }

  report.durationMs = Date.now() - t0
  return report
}
