/**
 * Image files for the map maker's asset library: picking files or a whole
 * folder, reading what was dropped (folders included), and storing each as a
 * library asset. Large images are scaled down; the format is kept.
 */
import { assetFolder, assetName, isAssetImage, type AssetSource } from '@/domain/rules/mapAssets'
import type { MapAsset } from '@/domain/schema'
import { mapAssets } from '@/data/encounters'
import { storeImage } from './images'

const ASSET_MAX_PX = 1024

async function sized(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    // An SVG without a size reports 0: drawn at the largest size
    const w0 = img.naturalWidth || ASSET_MAX_PX, h0 = img.naturalHeight || ASSET_MAX_PX
    const scale = Math.min(1, ASSET_MAX_PX / Math.max(w0, h0))
    const width = Math.max(1, Math.round(w0 * scale)), height = Math.max(1, Math.round(h0 * scale))
    if (scale === 1 && file.type !== 'image/svg+xml') return { blob: file, width, height }
    const canvas = new OffscreenCanvas(width, height)
    canvas.getContext('2d')?.drawImage(img, 0, 0, width, height)
    const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    return { blob: await canvas.convertToBlob({ type: mime, quality: mime === 'image/jpeg' ? 0.9 : undefined }), width, height }
  } finally { URL.revokeObjectURL(url) }
}

/** Stores one file as a library asset, named after the file and filed under its folders. */
export async function importAsset(source: AssetSource): Promise<MapAsset> {
  const { blob, width, height } = await sized(source.file)
  const ref = await storeImage(blob, { keepOriginal: true })
  if (!('imageId' in ref)) throw new Error('The image could not be stored')
  return mapAssets.add({ name: assetName(source.file.name), imageId: ref.imageId, pxWidth: width, pxHeight: height, folder: assetFolder(source.path) || null })
}

function pick(configure: (input: HTMLInputElement) => void): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    configure(input)
    input.onchange = () => resolve([...(input.files ?? [])])
    input.oncancel = () => resolve([])
    input.click()
  })
}

export async function pickAssetFiles(): Promise<AssetSource[]> {
  return (await pick((i) => { i.accept = 'image/png,image/webp,image/svg+xml,image/jpeg,image/gif' })).map(file => ({ file, path: file.name }))
}

export async function pickAssetFolder(): Promise<AssetSource[]> {
  return (await pick((i) => { i.webkitdirectory = true })).map(file => ({ file, path: file.webkitRelativePath || file.name })).filter(s => isAssetImage(s.file.name))
}

/** The images in a drop, walking into dropped folders. */
export async function droppedAssetFiles(data: DataTransfer): Promise<AssetSource[]> {
  const entries = [...data.items].map(i => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  if (!entries.length) return [...data.files].filter(f => isAssetImage(f.name)).map(file => ({ file, path: file.name }))
  const out: AssetSource[] = []
  const walk = async (entry: FileSystemEntry, dir: string): Promise<void> => {
    if (entry.isFile) {
      if (isAssetImage(entry.name)) out.push({ file: await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)), path: dir + entry.name })
      return
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries hands out about 100 at a time: keep reading until it comes back empty
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
      if (!batch.length) break
      for (const child of batch) await walk(child, `${dir}${entry.name}/`)
    }
  }
  for (const e of entries) await walk(e, '')
  return out
}
