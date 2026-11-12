/** Which stored images a set of rows uses: `{ imageId }` references and the `img:<id>` strings compendium rows and battle maps keep. */

const IMG_STRING = /^img:(.+)$/

export function collectImageIds(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    const m = IMG_STRING.exec(value)
    if (m?.[1]) into.add(m[1])
  } else if (Array.isArray(value)) {
    for (const v of value) collectImageIds(v, into)
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'imageId' && typeof v === 'string') into.add(v)
      else collectImageIds(v, into)
    }
  }
  return into
}

const EXT: Record<string, string> = {
  'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif',
}

export function imageFileName(id: string, mime: string): string {
  return `${id.replace(/[^\w.-]/g, '_')}.${EXT[mime] ?? 'bin'}`
}
