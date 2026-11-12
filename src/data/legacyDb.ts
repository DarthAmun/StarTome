/**
 * Reads the v0.42 app's database (`startome`) when it lives in this browser:
 * same origin, so its IndexedDB is reachable. Read-only; the old database is
 * never changed, so v0.42 keeps working beside the rework.
 */
import Dexie from 'dexie'

export const LEGACY_DB_NAME = 'startome'

export interface LegacyDbContents {
  /** Rows per old table. */
  tables: Record<string, unknown[]>
  /** The old image store: id → blob. */
  images: Map<string, { blob: Blob; mime: string; createdAt: string }>
}

export async function legacyDbExists(): Promise<boolean> {
  try { return await Dexie.exists(LEGACY_DB_NAME) } catch { return false }
}

export async function readLegacyDb(onProgress?: (table: string) => void): Promise<LegacyDbContents> {
  // Opened without a schema: Dexie reads whatever version is there and never upgrades it
  const db = new Dexie(LEGACY_DB_NAME)
  await db.open()
  try {
    const tables: Record<string, unknown[]> = {}
    const images: LegacyDbContents['images'] = new Map()
    for (const table of db.tables) {
      onProgress?.(table.name)
      if (table.name === 'images') {
        await table.each((row: { id: string; blob: Blob; mime?: string; createdAt?: string }) => {
          if (row?.id && row.blob) images.set(row.id, { blob: row.blob, mime: row.mime ?? row.blob.type, createdAt: row.createdAt ?? '' })
        })
      } else {
        tables[table.name] = await table.toArray()
      }
    }
    return { tables, images }
  } finally {
    db.close()
  }
}
