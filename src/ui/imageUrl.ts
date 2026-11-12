/** Stored images as URLs an <img> can show. Object URLs are made once per image and reused. */
import { ref, watchEffect, type Ref } from 'vue'
import type { ImageRef } from '@/domain/schema'
import { images } from '@/data/repo'

const cache = new Map<string, Promise<string | null>>()

function urlOf(imageId: string): Promise<string | null> {
  let hit = cache.get(imageId)
  if (!hit) {
    hit = images.get(imageId).then(row => (row ? URL.createObjectURL(row.thumb ?? row.blob) : null))
    cache.set(imageId, hit)
  }
  return hit
}

export function useImageUrl(source: () => ImageRef | null | undefined): Ref<string | null> {
  const url = ref<string | null>(null)
  watchEffect(async () => {
    const r = source()
    if (!r) { url.value = null; return }
    if ('url' in r) { url.value = r.url; return }
    url.value = await urlOf(r.imageId)
  })
  return url
}
