/** Stored images as URLs an <img> can show. Object URLs are made once per image and reused. */
import { ref, watchEffect, type Ref } from 'vue'
import type { ImageRef } from '@/domain/schema'
import { images } from '@/data/repo'

const cache = new Map<string, Promise<string | null>>()

function urlOf(imageId: string, full: boolean): Promise<string | null> {
  const key = `${full ? 'full' : 'thumb'}:${imageId}`
  let hit = cache.get(key)
  if (!hit) {
    hit = images.get(imageId).then(row => (row ? URL.createObjectURL(full ? row.blob : row.thumb ?? row.blob) : null))
    cache.set(key, hit)
  }
  return hit
}

/** `full`: the image itself (maps, banners); otherwise its thumbnail when it has one. */
export function useImageUrl(source: () => ImageRef | null | undefined, full = false): Ref<string | null> {
  const url = ref<string | null>(null)
  watchEffect(async () => {
    const r = source()
    if (!r) { url.value = null; return }
    if ('url' in r) { url.value = r.url; return }
    url.value = await urlOf(r.imageId, full)
  })
  return url
}
