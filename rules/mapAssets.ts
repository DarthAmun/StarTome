/**
 * Map maker asset library: naming, folders and filtering. Pure, so it can be tested
 * without a browser; the picking and decoding of image files is in utils/image.ts.
 */

/** File extensions imported as assets; everything else in a folder is skipped. */
export const ASSET_EXTENSIONS = ['png', 'webp', 'svg', 'jpg', 'jpeg', 'gif'] as const

/** A file to import and where it was in the chosen folder ("Pack/Trees/oak.png"; just the name for loose files). */
export interface AssetSource<F = File> {
  file: F
  path: string
}

export function isAssetImage(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return !fileName.startsWith('.') && (ASSET_EXTENSIONS as readonly string[]).includes(ext)
}

/** "dark_oak-tree.png" → "dark oak tree". */
export function assetName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || fileName
}

/** The folders above a file, "Pack/Trees/oak.png" → "Pack / Trees"; '' for a loose file. */
export function assetFolder(path: string): string {
  return path.split(/[\\/]/).slice(0, -1).filter(Boolean).join(' / ')
}

/** Same folder and name: imported before, so importing the folder again skips it. */
export function assetKey(folder: string | undefined, name: string): string {
  return `${(folder ?? '').toLowerCase()}\n${name.toLowerCase()}`
}

/** The folders in the library, sorted; '' (loose files) is left out. */
export function assetFolders(assets: { folder?: string }[]): string[] {
  return [...new Set(assets.map(a => a.folder ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

/** Folder filter: null = everything, '' = loose files, otherwise that folder and its subfolders. Search matches name or folder. */
export function filterAssets<T extends { name: string; folder?: string }>(assets: T[], folder: string | null, query: string): T[] {
  const q = query.trim().toLowerCase()
  return assets.filter((a) => {
    const f = a.folder ?? ''
    if (folder === '' && f) return false
    if (folder && f !== folder && !f.startsWith(`${folder} / `)) return false
    return !q || a.name.toLowerCase().includes(q) || f.toLowerCase().includes(q)
  })
}
