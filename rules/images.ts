/**
 * User-owned images of compendium entries (portraits, token art).
 *
 * Blobs live in the `images` table; an entry's `img`/`tokenImg` holds the
 * reference "img:<id>". Keeping blobs out of the `rules` rows matters: list
 * queries scan whole rows, and 1,000 inline portraits would make every scan
 * read ~80 MB. Plain http(s) and data URLs are accepted too and passed through.
 */
import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { getDb } from '~/composables/useDb'

const PREFIX = 'img:'

export function isImageRef(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(PREFIX)
}

export function imageRefId(v: string): string {
  return v.slice(PREFIX.length)
}

/** data:image/jpeg;base64,… → Blob. Works in workers and Node (no fetch on data URLs needed). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/s)
  if (!m) throw new Error('Not a data URL')
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type: m[1] })
  const bin = atob(m[3])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: m[1] })
}

/** Stores a blob and returns the reference to put in `img`. */
export async function storeImage(blob: Blob): Promise<string> {
  const id = crypto.randomUUID()
  await getDb().images.put({ id, blob, mime: blob.type, createdAt: new Date().toISOString() })
  return PREFIX + id
}

/** A data URL becomes a stored blob ("img:<id>"); anything else (http URL, ref, null) is returned as is. */
export async function storeInlineImage(src: string | null | undefined): Promise<string | null> {
  if (!src) return null
  return src.startsWith('data:') ? storeImage(dataUrlToBlob(src)) : src
}

/**
 * Moves inline map images of encounter rows into the image store
 * (FORK_PLAN §14 PERF-03). For imports and the legacy import, which bring
 * DM's Tome-style rows with the map inside. Returns how many moved.
 */
export async function moveInlineMaps(): Promise<number> {
  const db = getDb()
  const ids = await db.encounters.filter(e => !!e.map_source?.startsWith('data:')).primaryKeys()
  for (const id of ids) {
    const row = await db.encounters.get(id)
    if (row?.map_source?.startsWith('data:')) await db.encounters.update(id, { map_source: await storeImage(dataUrlToBlob(row.map_source)) })
  }
  return ids.length
}

/** Deletes a stored image and forgets its cached URLs. */
export async function deleteImage(ref: string): Promise<void> {
  if (!isImageRef(ref)) return
  const id = imageRefId(ref)
  await getDb().images.delete(id)
  const url = await urls.get(id)?.catch(() => null)
  if (url) URL.revokeObjectURL(url)
  urls.delete(id)
  dataUrls.delete(id)
}

/** Deletes every stored image that no compendium entry or encounter map points at. Returns how many. */
export async function cleanUpUnusedImages(): Promise<number> {
  const db = getDb()
  const used = new Set<string>()
  await db.rules.each(r => {
    for (const v of [r.img, (r as { tokenImg?: string | null }).tokenImg]) if (isImageRef(v)) used.add(imageRefId(v))
  })
  // Encounter maps live in the store too (and clones share them)
  await db.encounters.each(e => { if (isImageRef(e.map_source)) used.add(imageRefId(e.map_source)) })
  const unused = (await db.images.toCollection().primaryKeys()).filter(id => !used.has(id))
  await db.images.bulkDelete(unused)
  for (const id of unused) { urls.delete(id); dataUrls.delete(id) }
  return unused.length
}

// Object URLs are shared and kept for the session: the same portrait shows in
// lists, stat blocks and the palette, and blobs are immutable.
const urls = new Map<string, Promise<string | null>>()

export function resolveImage(src: string | null | undefined): Promise<string | null> {
  if (!src) return Promise.resolve(null)
  if (!isImageRef(src)) return Promise.resolve(src)
  const id = imageRefId(src)
  let p = urls.get(id)
  if (!p) {
    p = getDb().images.get(id).then(row => (row ? URL.createObjectURL(row.blob) : null))
    urls.set(id, p)
  }
  return p
}

/** Blob → data URL. No FileReader, so it works in the app, workers and Node (tests). */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`
}

const dataUrls = new Map<string, Promise<string | null>>()

/** Like resolveImage, but blobs come back as data URLs: for the VTT canvas
 *  (Pixi picks its loader by extension or data-URL mime, a blob: URL has
 *  neither) and the player window, which can't see this window's object URLs. */
export function resolveImageDataUrl(src: string | null | undefined): Promise<string | null> {
  if (!src) return Promise.resolve(null)
  if (!isImageRef(src)) return Promise.resolve(src)
  const id = imageRefId(src)
  let p = dataUrls.get(id)
  if (!p) {
    p = getDb().images.get(id).then(row => (row ? blobToDataUrl(row.blob) : null)).catch(() => null)
    dataUrls.set(id, p)
  }
  return p
}

/** Reactive URL for an entry's `img` (or any image reference). */
export function useRulesImage(src: Ref<string | null | undefined>): Ref<string | null> {
  const url = ref<string | null>(null)
  let current = 0
  const stop = watch(src, async (v) => {
    const mine = ++current
    const resolved = await resolveImage(v)
    if (mine === current) url.value = resolved
  }, { immediate: true })
  onScopeDispose(stop)
  return url
}
