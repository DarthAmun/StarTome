/**
 * The backup container: a zip with manifest.json, data/<collection>.ndjson and
 * images/<file> (docs/formats/BACKUP_V3.md). Written and read as a stream, so
 * no part of a backup has to fit in one string.
 */
import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate'
import { imageFileName } from '@/domain/images'
import { COLLECTION_NAMES, type CollectionName, type Snapshot } from '@/domain/schema'
import { BackupError, checkManifest, type Manifest } from './format'

export interface BackupImage { id: string; mime: string; createdAt: string; blob: Blob }

export type Sink = (chunk: Uint8Array) => void | Promise<void>

/** Writes a backup to `sink`, chunk by chunk. `images` is read one at a time. */
export async function writeBackup(manifest: Manifest, rows: Snapshot, images: AsyncIterable<BackupImage> | Iterable<BackupImage>, sink: Sink): Promise<void> {
  let failure: unknown = null
  let pending: Promise<void> = Promise.resolve()
  const zip = new Zip((err, chunk) => {
    if (err) { failure = err; return }
    pending = pending.then(() => sink(chunk))
  })
  const addText = (name: string, text: string) => {
    const file = new ZipDeflate(name, { level: 6 })
    zip.add(file)
    file.push(strToU8(text), true)
  }

  addText('manifest.json', JSON.stringify(manifest, null, 2))
  for (const name of COLLECTION_NAMES) {
    const list = rows[name]
    if (!list.length) continue
    const file = new ZipDeflate(`data/${name}.ndjson`, { level: 6 })
    zip.add(file)
    // One row per push: a collection is never one string
    list.forEach((row, i) => file.push(strToU8(`${JSON.stringify(row)}\n`), i === list.length - 1))
    await pending
  }

  const index: string[] = []
  for await (const img of images) {
    const fileName = imageFileName(img.id, img.mime)
    const bytes = new Uint8Array(await img.blob.arrayBuffer())
    // Images are compressed already: stored as they are
    const file = new ZipPassThrough(`images/${fileName}`)
    zip.add(file)
    file.push(bytes, true)
    index.push(JSON.stringify({ id: img.id, mime: img.mime, createdAt: img.createdAt, file: fileName, bytes: bytes.length }))
    await pending
    if (failure) throw failure
  }
  addText('images/index.ndjson', index.length ? `${index.join('\n')}\n` : '')
  zip.end()
  await pending
  if (failure) throw failure
}

export interface ReadBackup {
  manifest: Manifest
  rows: Partial<Record<CollectionName, unknown[]>>
  images: BackupImage[]
}

function ndjson(text: string): unknown[] {
  return text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as unknown)
}

/** Reads a backup zip chunk by chunk. Rows are returned unvalidated; the caller runs them through the schemas. */
export async function readBackup(chunks: AsyncIterable<Uint8Array>): Promise<ReadBackup> {
  const texts = new Map<string, Uint8Array[]>()
  const binaries = new Map<string, Uint8Array[]>()
  let failure: unknown = null
  const unzip = new Unzip((file) => {
    const isImage = file.name.startsWith('images/') && file.name !== 'images/index.ndjson'
    const parts: Uint8Array[] = []
    ;(isImage ? binaries : texts).set(file.name, parts)
    file.ondata = (err, data) => {
      if (err) failure = err
      else if (data.length) parts.push(data)
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  for await (const chunk of chunks) {
    unzip.push(chunk, false)
    if (failure) throw failure
  }
  unzip.push(new Uint8Array(0), true)
  if (failure) throw failure

  const textOf = (name: string): string | null => {
    const parts = texts.get(name)
    if (!parts) return null
    // Decoded as a stream, so a character cut by a chunk border stays whole
    const decoder = new TextDecoder()
    return parts.map(p => decoder.decode(p, { stream: true })).join('') + decoder.decode()
  }
  const manifestText = textOf('manifest.json')
  if (manifestText === null) throw new BackupError('This zip is not a StarTome backup (it has no manifest.json).')
  const manifest = checkManifest(JSON.parse(manifestText))

  const rows: Partial<Record<CollectionName, unknown[]>> = {}
  for (const name of COLLECTION_NAMES) {
    const text = textOf(`data/${name}.ndjson`)
    if (text !== null) rows[name] = ndjson(text)
    const expected = manifest.collections[name] ?? 0
    if ((rows[name]?.length ?? 0) !== expected) throw new BackupError(`The backup is incomplete: ${name} has ${rows[name]?.length ?? 0} rows, its manifest says ${expected}.`)
  }

  const images: BackupImage[] = []
  for (const line of ndjson(textOf('images/index.ndjson') ?? '') as { id: string; mime: string; createdAt?: string; file: string }[]) {
    const parts = binaries.get(`images/${line.file}`)
    if (!parts) throw new BackupError(`The backup is incomplete: image ${line.file} is listed but missing.`)
    images.push({ id: line.id, mime: line.mime, createdAt: line.createdAt ?? manifest.exportedAt, blob: new Blob(parts as BlobPart[], { type: line.mime }) })
  }
  return { manifest, rows, images }
}

/** A blob as chunks, for readBackup. */
export async function* blobChunks(blob: Blob, size = 4 * 1024 * 1024): AsyncIterable<Uint8Array> {
  for (let at = 0; at < blob.size; at += size) yield new Uint8Array(await blob.slice(at, at + size).arrayBuffer())
}
