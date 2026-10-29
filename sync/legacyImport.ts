/**
 * DM's Tome → StarTome import (FORK_PLAN.md §8, §8.5): campaign data only.
 *
 * 1. Read: a DM's Tome export file, or DM's Tome's own database (reachable
 *    when both apps are served from one github.io site).
 * 2. Summary: what will come over, per campaign, and which library tokens are
 *    left out.
 * 3. Apply: campaigns, entries (with their portraits and images), links,
 *    snapshots, graphs, encounters, walls and library tokens, with fresh ids.
 *
 * DM's Tome's rules library (systems/records) is not imported (decided
 * 2026-10-29): the compendium comes from the Foundry sync. Library tokens that
 * only stood for a library record (monsters) are left out; their placements
 * stay on the map with the token's name and image.
 *
 * Runs in a Web Worker in the app (exports run to ~250 MB) and directly in tests.
 */
import Dexie from 'dexie'
import { getDb, structureColumns } from '~/composables/useDb'
import { LEGACY_DB_NAME } from '~/utils/appNamespace'
import { recordLabel, remapLore, LORE_TABLES, monsterTokenIds, type LegacyLoreTables, type LoreTable, type RemapIssue } from '~/converters/legacy/lore'
import { moveInlineMaps } from '~/rules/images'

// ── Reading ────────────────────────────────────────────────────────────────

export interface LegacyBundle extends LegacyLoreTables {
  from: 'file' | 'browser'
  exportedAt?: string
}

function bundleOf(raw: Record<string, unknown>, from: LegacyBundle['from']): LegacyBundle {
  const out: Record<string, unknown> = { from, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : undefined }
  for (const t of LORE_TABLES) out[t] = Array.isArray(raw[t]) ? raw[t] : []
  // Only the name and picture of records that placements point at (see LegacyLoreTables.recordLabels)
  const wanted = new Set((out.encounterTokens as { linked_record_id?: number | null }[]).map(p => p.linked_record_id).filter((id): id is number => id != null))
  const records = Array.isArray(raw.records) ? raw.records as { id?: number; name?: string; data?: unknown }[] : []
  out.recordLabels = new Map(records.filter(r => r.id != null && wanted.has(r.id)).map(r => [r.id!, recordLabel(r)]))
  return out as unknown as LegacyBundle
}

/** A DM's Tome "Everything" or "Campaigns" export. */
export async function readLegacyFile(file: Blob): Promise<LegacyBundle> {
  let raw: any
  try { raw = JSON.parse(await file.text()) } catch { throw new Error('This file is not valid JSON.') }
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || !Array.isArray(raw.campaigns)) {
    throw new Error('This is not a DM\'s Tome export with campaigns. Use "Settings → Full Backup → Export" or "Campaigns → Export" in DM\'s Tome.')
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
    for (const t of LORE_TABLES) raw[t] = names.has(t) ? await db.table(t).toArray() : []
    // Records only for the placements' names and pictures, read one by one
    const recIds = [...new Set((raw.encounterTokens as { linked_record_id?: number | null }[]).map(p => p.linked_record_id).filter((id): id is number => id != null))]
    raw.records = names.has('records') && recIds.length ? (await db.table('records').bulkGet(recIds)).filter(Boolean) : []
    return bundleOf(raw, 'browser')
  } finally {
    db.close()
  }
}

// ── Summary ────────────────────────────────────────────────────────────────

export interface LegacySummary {
  from: LegacyBundle['from']
  exportedAt?: string
  campaigns: { id: number; name: string; entries: number; encounters: number }[]
  counts: Partial<Record<LoreTable, number>>
  /** Library tokens left out because they only stood for a rules-library record. */
  monsterTokens: number
  /** Campaigns that look imported before (same name and creation time): a second import makes a copy. */
  alreadyImported: string[]
}

export async function summarizeLegacy(bundle: LegacyBundle): Promise<LegacySummary> {
  const existing = await getDb().campaigns.toArray()
  return {
    from: bundle.from,
    exportedAt: bundle.exportedAt,
    campaigns: bundle.campaigns.map(c => ({
      id: c.id!, name: c.name,
      entries: bundle.entities.filter(e => e.campaign_id === c.id).length,
      encounters: bundle.encounters.filter(e => e.campaign_id === c.id).length,
    })),
    counts: Object.fromEntries(LORE_TABLES.map(t => [t, bundle[t].length])),
    monsterTokens: monsterTokenIds(bundle.tokens).size,
    alreadyImported: bundle.campaigns.filter(c => existing.some(e => e.name === c.name && e.created_at === c.created_at)).map(c => c.name),
  }
}

// ── Apply ──────────────────────────────────────────────────────────────────

export type LegacyProgress = { phase: 'read' | 'lore' | 'images' }

export interface LegacyReport {
  written: Partial<Record<LoreTable, number>>
  monsterTokens: number
  issues: RemapIssue[]
  durationMs: number
}

const CHUNK = 500

async function nextId(table: { orderBy(i: string): { last(): Promise<any> } }): Promise<number> {
  const last = await table.orderBy(':id').last()
  return (typeof last?.id === 'number' ? last.id : 0) + 1
}

export async function applyLegacy(bundle: LegacyBundle, opts: { onProgress?: (p: LegacyProgress) => void } = {}): Promise<LegacyReport> {
  const t0 = Date.now()
  const db = getDb()
  const progress = opts.onProgress ?? (() => {})
  progress({ phase: 'lore' })
  const tables = LORE_TABLES.map(t => db.table(t))
  const written: Partial<Record<LoreTable, number>> = {}
  const res = await db.transaction('rw', tables, async () => {
    const start = Object.fromEntries(await Promise.all(LORE_TABLES.map(async t => [t, await nextId(db.table(t))]))) as Record<LoreTable, number>
    const res = remapLore(bundle, start)
    for (const t of LORE_TABLES) {
      const rows = res.tables[t] as { id?: number }[]
      for (let i = 0; i < rows.length; i += CHUNK) await db.table(t).bulkAdd(rows.slice(i, i + CHUNK))
      written[t] = rows.length
    }
    return res
  })
  progress({ phase: 'images' })
  // DM's Tome keeps maps inside the encounter rows; StarTome stores them as images (PERF-03)
  await moveInlineMaps()
  // Anything the converter still left as JSON text becomes a value, 5e cover becomes PF2e cover
  await structureColumns()
  return { written, monsterTokens: res.monsterTokens, issues: res.issues, durationMs: Date.now() - t0 }
}
