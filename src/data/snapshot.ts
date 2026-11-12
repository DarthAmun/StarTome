/**
 * Whole-database reads and writes, used by backups and the legacy import.
 * A write validates every row first and then runs in one transaction: a bad
 * row or a failure leaves the database as it was.
 */
import { COLLECTIONS, COLLECTION_NAMES, emptySnapshot, type CollectionName, type ImageRow, type Snapshot } from '@/domain/schema'
import { getDb } from './db'

export interface RowProblem { collection: CollectionName; index: number; id: string | null; message: string }

export class SnapshotInvalidError extends Error {
  constructor(public readonly problems: RowProblem[]) {
    super(`${problems.length} row${problems.length === 1 ? '' : 's'} failed validation; first: ${problems[0]?.collection} #${problems[0]?.index}: ${problems[0]?.message}`)
    this.name = 'SnapshotInvalidError'
  }
}

/** Runs every row through its schema (filling defaults). Returns the checked snapshot and what failed. */
export function validateSnapshot(input: Partial<Record<CollectionName, unknown[]>>): { snapshot: Snapshot; problems: RowProblem[] } {
  const snapshot = emptySnapshot()
  const problems: RowProblem[] = []
  for (const name of COLLECTION_NAMES) {
    const schema = COLLECTIONS[name]
    const out = snapshot[name] as unknown[]
    ;(input[name] ?? []).forEach((row, index) => {
      const parsed = schema.safeParse(row)
      if (parsed.success) out.push(parsed.data)
      else {
        const issue = parsed.error.issues[0]
        const id = row && typeof row === 'object' && 'id' in row ? String((row as { id: unknown }).id) : null
        problems.push({ collection: name, index, id, message: `${issue?.path.join('.') || '(row)'}: ${issue?.message ?? 'invalid'}` })
      }
    })
  }
  return { snapshot, problems }
}

export interface WriteOptions {
  /** 'replace' empties every collection first; 'add' writes beside what is there and skips ids that exist. */
  mode: 'replace' | 'add'
  /** Collections 'replace' leaves alone (a restore keeps the synced compendium). */
  keep?: CollectionName[]
}

export interface WriteResult { written: Record<string, number>; skipped: Record<string, number> }

export async function writeSnapshot(snapshot: Snapshot, images: ImageRow[], opts: WriteOptions): Promise<WriteResult> {
  const db = getDb()
  const written: Record<string, number> = {}
  const skipped: Record<string, number> = {}
  const keep = new Set(opts.keep ?? [])
  await db.transaction('rw', [...COLLECTION_NAMES.map(n => db.table(n)), db.images], async () => {
    for (const name of COLLECTION_NAMES) {
      const table = db.table(name)
      let rows = snapshot[name] as { id?: string; key?: string; game?: string }[]
      if (opts.mode === 'replace') {
        if (!keep.has(name)) await table.clear()
      } else if (rows.length) {
        const keys = rows.map(r => table.schema.primKey.keyPath === 'id' ? r.id : (r as Record<string, unknown>)[table.schema.primKey.keyPath as string]) as string[]
        const existing = await table.bulkGet(keys)
        const fresh = rows.filter((_, i) => existing[i] === undefined)
        skipped[name] = rows.length - fresh.length
        rows = fresh
      }
      if (rows.length) await table.bulkPut(rows)
      written[name] = rows.length
    }
    if (opts.mode === 'replace') await db.images.clear()
    if (images.length) await db.images.bulkPut(images)
    written.images = images.length
  })
  return { written, skipped }
}

export async function readSnapshot(): Promise<Snapshot> {
  const db = getDb()
  const snapshot = emptySnapshot()
  for (const name of COLLECTION_NAMES) (snapshot as Record<string, unknown[]>)[name] = await db.table(name).toArray()
  return snapshot
}

export async function countRows(): Promise<Record<string, number>> {
  const db = getDb()
  const out: Record<string, number> = {}
  for (const name of [...COLLECTION_NAMES, 'images'] as const) out[name] = await db.table(name).count()
  return out
}

/** Empties every collection, images and device handles included. */
export async function wipeDatabase(): Promise<void> {
  const db = getDb()
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear() })
}
