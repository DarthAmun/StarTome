/**
 * User-owned images of compendium entries (portraits, token art).
 *
 * Blobs live in the `images` table; an entry's `img`/`tokenImg` holds the
 * reference "img:<id>". Keeping blobs out of the `rules` rows matters: list
 * queries scan whole rows, and 1,000 inline portraits would make every scan
 * read ~80 MB. Plain http(s) and data URLs are accepted too and passed through.
 */
import { onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { getDb } from '~/composables/useDb'
import { propImages } from '~/rules/battlemap'

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

// ── Images inside lore entries (NPC portraits, location maps, banners) ──────

/** Attribute keys of entities and snapshots that hold an image. */
export const ENTITY_IMAGE_KEYS = ['portraitSource', 'imageSource', 'logoSource'] as const

export interface NewImageRow { id: string; blob: Blob; mime: string; createdAt: string }

/**
 * The attributes with every inline (data URL) image swapped for a ref, and
 * the image rows to store for them. Pure: the caller writes the rows. Lore
 * entries are read whole by every campaign list, so a 20 MB map inside one
 * made each of them slow (the same reason as PERF-03 for encounter maps).
 */
export function splitInlineImages<T extends Record<string, any>>(attrs: T): { attrs: T; images: NewImageRow[] } {
  const images: NewImageRow[] = []
  let out: T = attrs
  for (const key of ENTITY_IMAGE_KEYS) {
    const v = attrs?.[key]
    if (typeof v !== 'string' || !v.startsWith('data:')) continue
    let blob: Blob
    try { blob = dataUrlToBlob(v) } catch { continue }
    const id = crypto.randomUUID()
    images.push({ id, blob, mime: blob.type, createdAt: new Date().toISOString() })
    if (out === attrs) out = { ...attrs }
    ;(out as Record<string, unknown>)[key] = PREFIX + id
  }
  return { attrs: out, images }
}

/** splitInlineImages, with the images written to the store. */
export async function storeInlineAttributes<T extends Record<string, any>>(attrs: T): Promise<T> {
  const { attrs: out, images } = splitInlineImages(attrs)
  if (images.length) await getDb().images.bulkPut(images)
  return out
}

/** Moves inline images of every entity and snapshot into the store. Returns how many rows changed. */
export async function moveInlineEntityImages(): Promise<number> {
  const db = getDb()
  const inline = (r: { attributes?: unknown }) => {
    const a = r.attributes as Record<string, unknown> | null
    return !!a && typeof a === 'object' && ENTITY_IMAGE_KEYS.some(k => typeof a[k] === 'string' && (a[k] as string).startsWith('data:'))
  }
  let moved = 0
  for (const table of [db.entities, db.entitySnapshots] as const) {
    const ids = await (table as typeof db.entities).filter(inline).primaryKeys()
    for (const id of ids) {
      await db.transaction('rw', table, db.images, async () => {
        const row = await (table as typeof db.entities).get(id)
        if (!row || !inline(row)) return
        const { attrs, images } = splitInlineImages(row.attributes as Record<string, any>)
        await db.images.bulkPut(images)
        await (table as typeof db.entities).update(id, { attributes: attrs })
        moved++
      })
    }
  }
  return moved
}

/** Image-store ids that entity or snapshot rows point at. */
export function entityImageIds(rows: { attributes?: unknown }[]): string[] {
  const ids: string[] = []
  for (const r of rows) {
    const a = r.attributes as Record<string, unknown> | null
    if (!a || typeof a !== 'object') continue
    for (const k of ENTITY_IMAGE_KEYS) if (isImageRef(a[k])) ids.push(imageRefId(a[k] as string))
  }
  return ids
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
  forgetSync(id)
}

/** Deletes every stored image that no compendium entry, encounter map or map asset points at. Returns how many. */
export async function cleanUpUnusedImages(): Promise<number> {
  const db = getDb()
  const used = new Set<string>()
  await db.rules.each(r => {
    for (const v of [r.img, (r as { tokenImg?: string | null }).tokenImg]) if (isImageRef(v)) used.add(imageRefId(v))
  })
  // Encounter maps live in the store too (and clones share them), as do the
  // map maker's assets: in its library and placed on maps
  await db.encounters.each(e => {
    for (const v of [e.map_source, ...propImages(e.battlemap)]) if (isImageRef(v)) used.add(imageRefId(v))
  })
  await db.mapAssets.each(a => { if (isImageRef(a.image)) used.add(imageRefId(a.image)) })
  // Portraits, maps and banners of lore entries, and of their snapshots
  for (const table of [db.entities, db.entitySnapshots] as const) {
    await (table as typeof db.entities).each(r => { for (const id of entityImageIds([r])) used.add(id) })
  }
  const unused = (await db.images.toCollection().primaryKeys()).filter(id => !used.has(id))
  await db.images.bulkDelete(unused)
  for (const id of unused) { urls.delete(id); dataUrls.delete(id); forgetSync(id) }
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

// ── Synchronous, reactive URLs (templates and HTML-string renderers) ────────

/** Longest side of a list thumbnail, in px. */
export const THUMB_SIZE = 512   // gallery cards on HiDPI screens stay sharp

const syncUrls = new Map<string, string | null>()
const syncPending = new Set<string>()
// One version for all: a resolved batch re-renders once, not once per image
const syncVersion = shallowRef(0)
let flushQueued = false
function bumpSync() {
  if (flushQueued) return
  flushQueued = true
  setTimeout(() => { flushQueued = false; syncVersion.value++ }, 16)
}
function forgetSync(id: string) {
  for (const size of ['full', 'thumb']) { syncUrls.delete(`${size}:${id}`); syncPending.delete(`${size}:${id}`) }
  const t = thumbUrls.get(id)
  thumbUrls.delete(id)
  t?.then(u => { if (u?.startsWith('blob:')) URL.revokeObjectURL(u) }).catch(() => {})
}

/**
 * The URL to show for an image source, right now: http and data URLs as they
 * are, a stored image's object URL once it is resolved (null until then; the
 * caller re-renders when it is ready, as reading this is reactive). With
 * `thumb`, a stored image comes back as a small thumbnail for lists and chips.
 */
export function imageSrc(src: string | null | undefined, size: 'full' | 'thumb' = 'full'): string | null {
  if (!src) return null
  if (!isImageRef(src)) return src
  void syncVersion.value
  const id = imageRefId(src)
  const key = `${size}:${id}`
  if (syncUrls.has(key)) return syncUrls.get(key)!
  if (!syncPending.has(key)) {
    syncPending.add(key)
    ;(size === 'thumb' ? resolveThumb(id) : resolveImage(src))
      .catch(() => null)
      .then(url => { syncPending.delete(key); syncUrls.set(key, url); bumpSync() })
  }
  return null
}

const thumbUrls = new Map<string, Promise<string | null>>()
let thumbsRunning = 0
const thumbQueue: (() => void)[] = []
async function thumbSlot<T>(run: () => Promise<T>): Promise<T> {
  // Decoding a 20 MB map takes memory: two at a time
  if (thumbsRunning >= 2) await new Promise<void>(r => thumbQueue.push(r))
  thumbsRunning++
  try { return await run() } finally { thumbsRunning--; thumbQueue.shift()?.() }
}

/** Object URL of a stored image's thumbnail, made (and kept on its row) the first time. */
export function resolveThumb(id: string): Promise<string | null> {
  let p = thumbUrls.get(id)
  if (!p) {
    p = (async () => {
      const row = await getDb().images.get(id)
      if (!row) return null
      if (row.thumb) return URL.createObjectURL(row.thumb)
      const thumb = await thumbSlot(() => makeThumb(row.blob)).catch(() => null)
      if (!thumb) return resolveImage(PREFIX + id)   // small already, or this browser can't scale it
      await getDb().images.update(id, { thumb }).catch(() => {})
      return URL.createObjectURL(thumb)
    })()
    thumbUrls.set(id, p)
  }
  return p
}

/** A scaled-down WebP of an image, or null when it is no bigger than a thumbnail. */
async function makeThumb(blob: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return null
  const full = await createImageBitmap(blob)
  const scale = THUMB_SIZE / Math.max(full.width, full.height)
  if (scale >= 1) { full.close(); return null }
  const w = Math.max(1, Math.round(full.width * scale)), h = Math.max(1, Math.round(full.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(full, 0, 0, w, h)
  full.close()
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })
}
