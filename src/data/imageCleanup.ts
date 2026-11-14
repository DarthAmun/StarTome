/**
 * Stored images nothing points at any more (decision F11): a replaced portrait,
 * the art of a deleted entry, a map asset removed from the library. An image
 * counts as used when any row of any collection names it, which is also the
 * rule a backup uses to decide what to write.
 */
import { collectImageIds } from '@/domain/images'
import { COLLECTION_NAMES } from '@/domain/schema'
import { getDb } from './db'

/** Images younger than this are left alone: one may be picked in a dialog that is not saved yet. */
export const IMAGE_GRACE_MS = 24 * 60 * 60 * 1000

export interface UnusedImages { ids: string[]; bytes: number }

export async function findUnusedImages(now = Date.now(), graceMs = IMAGE_GRACE_MS): Promise<UnusedImages> {
  const db = getDb()
  const used = new Set<string>()
  for (const name of COLLECTION_NAMES) await db.table(name).each((row) => { collectImageIds(row, used) })
  const ids: string[] = []
  let bytes = 0
  await db.images.each((img) => {
    if (used.has(img.id)) return
    const made = Date.parse(img.createdAt)
    if (Number.isFinite(made) && now - made < graceMs) return
    ids.push(img.id)
    bytes += img.blob.size + (img.thumb?.size ?? 0)
  })
  return { ids, bytes }
}

/** Deletes them. An image that came into use since the look is kept: the check runs again inside the write. */
export async function removeUnusedImages(now = Date.now(), graceMs = IMAGE_GRACE_MS): Promise<UnusedImages> {
  const db = getDb()
  return db.transaction('rw', db.tables, async () => {
    const found = await findUnusedImages(now, graceMs)
    if (found.ids.length) await db.images.bulkDelete(found.ids)
    return found
  })
}

const LAST_KEY = 'lastImageCleanupAt'

/** The automatic run: at most once a day. Returns what it removed, or null when it was not due. */
export async function removeUnusedImagesIfDue(now = Date.now()): Promise<UnusedImages | null> {
  const db = getDb()
  const last = (await db.rows('meta').get(LAST_KEY))?.value
  if (typeof last === 'string' && now - Date.parse(last) < IMAGE_GRACE_MS) return null
  const removed = await removeUnusedImages(now)
  await db.rows('meta').put({ key: LAST_KEY, value: new Date(now).toISOString() })
  return removed
}
