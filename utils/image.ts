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

const ASSET_MAX_PX = 1024

/**
 * A map asset file as a stored image: at most 1024 px on its longest side,
 * PNG so transparency stays (JPEGs stay JPEG). SVGs are drawn to a bitmap.
 */
export async function fileToAssetImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    // SVGs without a size report 0; draw them at the largest size
    const w0 = img.naturalWidth || ASSET_MAX_PX
    const h0 = img.naturalHeight || ASSET_MAX_PX
    const scale = Math.min(1, ASSET_MAX_PX / Math.max(w0, h0))
    const width = Math.max(1, Math.round(w0 * scale))
    const height = Math.max(1, Math.round(h0 * scale))
    const isSvg = file.type === 'image/svg+xml'
    if (scale === 1 && !isSvg) return { blob: file, width, height }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
    const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, mime, mime === 'image/jpeg' ? IMAGE_QUALITY : undefined))
    if (!blob) throw new Error(`${file.name} could not be read as an image`)
    return { blob, width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Opens a file picker for several images; resolves with the files, empty when cancelled. */
export function pickImageFiles(): Promise<File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/webp,image/svg+xml,image/jpeg,image/gif'
    input.multiple = true
    input.onchange = () => resolve([...(input.files ?? [])])
    input.oncancel = () => resolve([])
    input.click()
  })
}
