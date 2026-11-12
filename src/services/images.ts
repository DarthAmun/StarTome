/**
 * Storing images the user adds. An image keeps its format (a PNG stays a PNG,
 * transparency included); only one larger than MAX_EDGE is scaled down, in
 * its own format. A small WebP thumbnail is made for lists.
 */
import { newId, nowIso } from '@/domain/ids'
import type { ImageRef, ImageRow } from '@/domain/schema'
import { images } from '@/data/repo'

export const MAX_EDGE = 2560
const THUMB_EDGE = 256

async function draw(bitmap: ImageBitmap, edge: number, mime: string, quality?: number): Promise<Blob | null> {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h)
  try { return await canvas.convertToBlob({ type: mime, quality }) } catch { return null }
}

/** Stores a picked or dropped image file and returns the reference rows keep. */
export async function storeImage(file: Blob, opts: { keepOriginal?: boolean } = {}): Promise<ImageRef> {
  const mime = file.type || 'image/png'
  let blob: Blob = file
  let thumb: Blob | undefined
  // SVG has no pixel size to shrink; everything else is decoded once for the size check and the thumbnail
  if (mime !== 'image/svg+xml') {
    try {
      const bitmap = await createImageBitmap(file)
      if (!opts.keepOriginal && Math.max(bitmap.width, bitmap.height) > MAX_EDGE) blob = await draw(bitmap, MAX_EDGE, mime, 0.9) ?? file
      thumb = await draw(bitmap, THUMB_EDGE, 'image/webp', 0.8) ?? undefined
      bitmap.close()
    } catch { /* not decodable here: stored as it is */ }
  }
  const row: ImageRow = { id: newId(), blob, mime: blob.type || mime, createdAt: nowIso(), thumb, keepOriginal: opts.keepOriginal }
  await images.put(row)
  return { imageId: row.id }
}

/** Opens the file picker for one image. Resolves null when nothing was picked. */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** The image as a JPEG (smaller, no transparency). Only on request: by itself the app never changes a format. */
export async function toJpeg(file: Blob, quality = 0.88): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, bitmap.width, bitmap.height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/jpeg', quality })
}
