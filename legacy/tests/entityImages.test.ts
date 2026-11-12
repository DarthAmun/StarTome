import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { dbApi, getDb } from '~/composables/useDb'
import {
  cleanUpUnusedImages, entityImageIds, imageRefId, imageSrc, moveInlineEntityImages, splitInlineImages, storeImage,
} from '~/rules/images'
import { CAMPAIGN_TABLES, exportAllPayload, exportCampaignsPayload, importPayload, jsonBlob, type BackupPayload } from '~/sync/backup'

const PNG = 'data:image/png;base64,iVBORw=='
const JPG = 'data:image/jpeg;base64,/9j/4A=='
const ALL = new Set<string>([...CAMPAIGN_TABLES, 'rules', 'rulesOverlays'])

const attrsOf = async (id: number) => (await getDb().entities.get(id))!.attributes as Record<string, any>
const readBack = async (p: BackupPayload): Promise<BackupPayload> => JSON.parse(await jsonBlob(p).text())

async function campaign(name = 'The Codex') {
  return await getDb().campaigns.add({ name, description: '', game: 'pf2e', created_at: '', updated_at: '' }) as number
}

describe('images inside lore entries', () => {
  beforeEach(async () => {
    const db = getDb()
    await Promise.all([...CAMPAIGN_TABLES.map(t => db.table(t).clear()), db.images.clear()])
  })

  it('splitInlineImages swaps data URLs for refs and leaves the rest', () => {
    const attrs = { portraitSource: PNG, logoSource: 'https://example.com/logo.png', imageSource: 'img:abc', title: 'Scout' }
    const { attrs: out, images } = splitInlineImages(attrs)
    expect(images).toHaveLength(1)
    expect(images[0].mime).toBe('image/png')
    expect(out).toEqual({ ...attrs, portraitSource: `img:${images[0].id}` })
    expect(attrs.portraitSource).toBe(PNG) // not mutated
    expect(splitInlineImages({ title: 'x' }).attrs).toEqual({ title: 'x' })
  })

  it('stores images when an entry is created or saved', async () => {
    const campaignId = await campaign()
    const created = await dbApi.entities.create({ campaignId, type: 'npc', name: 'Kib', attributes: { portraitSource: PNG } })
    const ref = (created!.attributes as any).portraitSource
    expect(ref).toMatch(/^img:/)
    expect((await getDb().images.get(imageRefId(ref)))?.blob.size).toBe(4)

    const saved = await dbApi.entities.update({ id: created!.id!, attributes: { portraitSource: ref, logoSource: JPG } })
    const a = saved!.attributes as any
    expect(a.portraitSource).toBe(ref)              // a ref stays as it is
    expect(a.logoSource).toMatch(/^img:/)
    expect(await getDb().images.count()).toBe(2)
  })

  it('stores snapshot images', async () => {
    const snap = await dbApi.snapshots.create({ entity_id: 1, label: 'Before', note: '', name: 'Kib', content: '', attributes: { portraitSource: PNG }, created_at: '' } as any)
    expect((snap.attributes as any).portraitSource).toMatch(/^img:/)
    expect(((await getDb().entitySnapshots.get(snap.id!))!.attributes as any).portraitSource).toMatch(/^img:/)
  })

  it('moveInlineEntityImages moves what imports left inline', async () => {
    const db = getDb()
    const campaignId = await campaign()
    const id = await db.entities.add({ campaign_id: campaignId, type: 'location', name: 'Keep', content: '', attributes: { imageSource: PNG, logoSource: JPG }, created_at: '', updated_at: '' }) as number
    await db.entitySnapshots.add({ entity_id: id, label: 'Old', attributes: { imageSource: PNG }, created_at: '' } as any)
    expect(await moveInlineEntityImages()).toBe(2)
    const a = await attrsOf(id)
    expect(a.imageSource).toMatch(/^img:/)
    expect(a.logoSource).toMatch(/^img:/)
    expect(await db.images.count()).toBe(3)
    expect(await moveInlineEntityImages()).toBe(0)
  })

  it('clean-up keeps images that entries and snapshots use', async () => {
    const db = getDb()
    const campaignId = await campaign()
    const portrait = await storeImage(new Blob(['p'], { type: 'image/png' }))
    const old = await storeImage(new Blob(['o'], { type: 'image/png' }))
    const unused = await storeImage(new Blob(['u'], { type: 'image/png' }))
    const id = await db.entities.add({ campaign_id: campaignId, type: 'npc', name: 'Kib', content: '', attributes: { portraitSource: portrait }, created_at: '', updated_at: '' }) as number
    await db.entitySnapshots.add({ entity_id: id, label: 'Old', attributes: { portraitSource: old }, created_at: '' } as any)
    expect(await cleanUpUnusedImages()).toBe(1)
    expect(await db.images.get(imageRefId(unused))).toBeUndefined()
    expect(await db.images.get(imageRefId(portrait))).toBeDefined()
    expect(await db.images.get(imageRefId(old))).toBeDefined()
  })

  it('backups and campaign files carry the images; imports restore them', async () => {
    const db = getDb()
    const campaignId = await campaign()
    await dbApi.entities.create({ campaignId, type: 'npc', name: 'Kib', attributes: { portraitSource: PNG } })

    for (const payload of [await exportAllPayload(), await exportCampaignsPayload([campaignId])]) {
      const file = await readBack(payload)
      expect(entityImageIds(file.entities!)).toHaveLength(1)
      expect(file.images!.map(i => i.id)).toEqual(entityImageIds(file.entities!))
    }

    // Replace: the same ids come back; merge: a copy that still finds its image
    const file = await readBack(await exportCampaignsPayload([campaignId]))
    await db.images.clear()
    await importPayload(file, { mode: 'replace', sections: ALL })
    const [kib] = await db.entities.toArray()
    expect(await db.images.get(imageRefId((kib.attributes as any).portraitSource))).toBeDefined()
    await importPayload(file, { mode: 'merge', sections: ALL })
    expect(await db.entities.count()).toBe(2)
    for (const e of await db.entities.toArray()) {
      expect(await db.images.get(imageRefId((e.attributes as any).portraitSource))).toBeDefined()
    }
  })

  it('imports files with inline images (older files, hand-written ones)', async () => {
    const file: BackupPayload = {
      version: 2, app: 'startome', type: 'campaigns', exportedAt: '',
      campaigns: [{ id: 7, name: 'Old', description: '', created_at: '', updated_at: '' } as any],
      entities: [{ id: 3, campaign_id: 7, type: 'npc', name: 'Kib', content: '', attributes: { portraitSource: PNG }, created_at: '', updated_at: '' } as any],
    }
    for (const mode of ['merge', 'replace'] as const) {
      await importPayload(file, { mode, sections: ALL })
      const rows = await getDb().entities.toArray()
      const ref = (rows.at(-1)!.attributes as any).portraitSource
      expect(ref).toMatch(/^img:/)
      expect((await getDb().images.get(imageRefId(ref)))?.mime).toBe('image/png')
    }
  })

  it('imageSrc passes URLs through and resolves stored images', async () => {
    expect(imageSrc(null)).toBeNull()
    expect(imageSrc(PNG)).toBe(PNG)
    expect(imageSrc('https://example.com/a.png', 'thumb')).toBe('https://example.com/a.png')
    const ref = await storeImage(new Blob(['x'], { type: 'image/png' }))
    expect(imageSrc(ref)).toBeNull() // resolving
    await new Promise(r => setTimeout(r, 30))
    expect(imageSrc(ref)).toMatch(/^blob:/)
    // No canvas in Node: the thumbnail falls back to the image itself
    imageSrc(ref, 'thumb')
    await new Promise(r => setTimeout(r, 30))
    expect(imageSrc(ref, 'thumb')).toMatch(/^blob:/)
  })
})
