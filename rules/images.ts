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
