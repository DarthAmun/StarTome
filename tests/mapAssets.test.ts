import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { dbApi, getDb } from '~/composables/useDb'
import { assetFolder, assetFolders, assetKey, assetName, filterAssets, isAssetImage } from '~/rules/mapAssets'

describe('map asset folders', () => {
  it('keeps only images, skipping hidden files', () => {
    expect(['oak.PNG', 'rug.webp', 'x.svg', 'a.jpeg', 'notes.txt', '.DS_Store', '._oak.png', 'Thumbs.db'].filter(isAssetImage))
      .toEqual(['oak.PNG', 'rug.webp', 'x.svg', 'a.jpeg'])
  })

  it('names assets after the file and folders after the path', () => {
    expect(assetName('dark_oak-tree.png')).toBe('dark oak tree')
    expect(assetFolder('Forest Pack/Trees/oak.png')).toBe('Forest Pack / Trees')
    expect(assetFolder('oak.png')).toBe('')
    expect(assetKey('Pack', 'Oak')).toBe(assetKey('pack', 'oak'))
    expect(assetKey('Pack', 'Oak')).not.toBe(assetKey('', 'Oak'))
  })

  it('filters by folder (subfolders included), loose files and search', () => {
    const lib = [
      { name: 'oak', folder: 'Forest / Trees' },
      { name: 'fern', folder: 'Forest' },
      { name: 'table', folder: 'Forester' },
      { name: 'barrel' },
    ]
    expect(assetFolders(lib)).toEqual(['Forest', 'Forest / Trees', 'Forester'])
    expect(filterAssets(lib, 'Forest', '').map(a => a.name)).toEqual(['oak', 'fern'])
    expect(filterAssets(lib, '', '').map(a => a.name)).toEqual(['barrel'])
    expect(filterAssets(lib, null, 'trees').map(a => a.name)).toEqual(['oak'])
    expect(filterAssets(lib, null, 'BAR').map(a => a.name)).toEqual(['barrel'])
  })

  it('stores the folder, and removes several assets at once', async () => {
    await getDb().mapAssets.clear()
    const png = new Blob(['png'], { type: 'image/png' })
    const a = await dbApi.mapAssets.add('oak', png, 64, 64, 'Forest / Trees')
    const b = await dbApi.mapAssets.add('barrel', png, 64, 64)
    expect((await dbApi.mapAssets.list()).map(x => [x.name, x.folder])).toEqual([['barrel', undefined], ['oak', 'Forest / Trees']])
    await dbApi.mapAssets.deleteMany([a.id!, b.id!])
    expect(await dbApi.mapAssets.list()).toEqual([])
  })
})
