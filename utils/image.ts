/**
 * Browser image helpers: pick a file, downscale and re-encode it as a data URL.
 * DOM-only (canvas, FileReader), so they live outside the database module.
 */

const IMAGE_MAX_PX = 1920
const IMAGE_QUALITY = 0.8

/** "url" for http(s) sources, "file" for data URLs / local paths. */
export function imageTypeOf(src: string): 'file' | 'url' {
  return src.startsWith('http') ? 'url' : 'file'
}

/** Reads a File, resizes it to ≤1920 px and re-encodes it (JPEG by default). */
export async function fileToDataUrl(file: File, toJpeg = true): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  return compressDataUrl(raw, toJpeg)
}

export function compressDataUrl(dataUrl: string, toJpeg = true): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img
      const scale = Math.min(1, IMAGE_MAX_PX / Math.max(w, h))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      const originalMime = dataUrl.match(/^data:([^;]+);/)?.[1] ?? 'image/png'
      const mime = toJpeg ? 'image/jpeg' : originalMime
      const quality = (mime === 'image/jpeg' || mime === 'image/webp') ? IMAGE_QUALITY : undefined
      resolve(canvas.toDataURL(mime, quality))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/** Opens a file picker for an image and returns it as a compressed data URL, or null. */
export function pickImageFile(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? await fileToDataUrl(file) : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
