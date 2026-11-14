/**
 * The legacy import (REWORK_PLAN.md §10): brings a v0.42 database into this
 * app, from a backup file or straight from the old database in this browser.
 * It replaces everything here; the source is never modified.
 */
import { newId, nowIso } from '@/domain/ids'
import type { ImageRow } from '@/domain/schema'
import { legacyDbExists, readLegacyDb } from '@/data/legacyDb'
import { meta } from '@/data/repo'
import { putImagesInBatches, SnapshotInvalidError, validateSnapshot, writeSnapshot } from '@/data/snapshot'
import { dataUrlToBlob, mimeOfDataUrl } from '@/services/files/dataUrl'
import { readJsonFile } from '@/services/files/jsonStream'
import type { LegacyPayload, LegacyReport } from './context'
import { convertLegacy, isLegacyPayload } from './convert'
import { checkReferences } from './verify'

export interface LegacyImportResult {
  report: LegacyReport
  written: Record<string, number>
  /** Images rows point at that the source did not have. */
  missingImages: number
  /** References that point at nothing after the conversion; should be empty. */
  dangling: string[]
}

type StoredImages = Map<string, { blob: Blob; mime: string; createdAt: string }>

export type Progress = (step: string) => void

async function importPayload(payload: LegacyPayload, stored: StoredImages, source: string, progress: Progress): Promise<LegacyImportResult> {
  progress('Converting')
  const now = nowIso()
  const result = convertLegacy(payload, () => newId(), now)
  const { snapshot, problems } = validateSnapshot(result.rows)
  if (problems.length) throw new SnapshotInvalidError(problems)

  progress('Reading images')
  const images: ImageRow[] = []
  const have = new Set<string>()
  const add = (id: string, blob: Blob, mime: string, createdAt: string) => {
    if (have.has(id) || !result.imageIds.has(id)) return
    have.add(id)
    images.push({ id, blob, mime: mime || blob.type || 'application/octet-stream', createdAt: createdAt || now })
  }
  for (const [id, img] of stored) add(id, img.blob, img.mime, img.createdAt)
  for (const img of payload.images ?? []) {
    if (typeof img?.id === 'string' && typeof img.data === 'string' && result.imageIds.has(img.id)) add(img.id, dataUrlToBlob(img.data), img.mime ?? mimeOfDataUrl(img.data), now)
  }
  for (const img of result.inlineImages) add(img.id, dataUrlToBlob(img.dataUrl), mimeOfDataUrl(img.dataUrl), now)
  const missingImages = [...result.imageIds].filter(id => !have.has(id)).length
  if (missingImages) result.report.notes.push(`${missingImages} image${missingImages === 1 ? '' : 's'} that entries point at ${missingImages === 1 ? 'was' : 'were'} not in the source; those show as missing`)

  progress('Writing')
  const { written } = await writeSnapshot(snapshot, [], { mode: 'replace' })
  const pics = await putImagesInBatches(images, (done, total) => progress(`Copying images ${done} of ${total}`))
  written.images = pics.written
  if (pics.unreadable) result.report.notes.push(`${pics.unreadable} image${pics.unreadable === 1 ? '' : 's'} could not be read from the source and ${pics.unreadable === 1 ? 'was' : 'were'} left out; those show as missing`)
  const dangling = checkReferences(snapshot)
  await meta.set('legacyImport', { at: now, source, tables: result.report.tables, notes: result.report.notes.length, dangling: dangling.length })
  return { report: result.report, written, missingImages: missingImages + pics.unreadable, dangling }
}

/** A `version: 2` backup or campaign file of v0.42 (any size: big files are read as a stream). */
export async function importLegacyFile(file: Blob, progress: Progress = () => {}): Promise<LegacyImportResult> {
  progress('Reading the file')
  const payload = await readJsonFile(file)
  if (!isLegacyPayload(payload)) throw new Error('This is not a StarTome v0.42 backup or campaign file.')
  return importPayload(payload, new Map(), 'file', progress)
}

export { legacyDbExists }

/** v0.42's keys in this browser's localStorage, without the Play Buddy pairing token. */
function readLegacyLocalState(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('startome.') || key === 'startome.playbuddy') continue
      const value = localStorage.getItem(key)
      if (value !== null) out[key] = value
    }
  } catch { /* storage blocked: start without the old layouts */ }
  return out
}

/** The v0.42 database of this browser, with its localStorage state. */
export async function importLegacyFromBrowser(progress: Progress = () => {}): Promise<LegacyImportResult> {
  progress('Reading the old database')
  const { tables, images } = await readLegacyDb(table => progress(`Reading ${table}`))
  const payload: LegacyPayload = { version: 2, app: 'startome', type: 'all', ...tables, localState: readLegacyLocalState() }
  return importPayload(payload, images, 'browser', progress)
}
