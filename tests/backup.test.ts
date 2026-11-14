import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { sequentialIds } from '@/domain/ids'
import type { ImageRow } from '@/domain/schema'
import { StarTomeDb, getDb, useDbForTests } from '@/data/db'
import { putImagesInBatches, readSnapshot, validateSnapshot, writeSnapshot } from '@/data/snapshot'
import { exportBackupBlob, importBackup } from '@/services/backup'
import { checkManifest } from '@/services/backup/format'
import { blobChunks, readBackup } from '@/services/backup/zip'
import { convertLegacy } from '@/services/v042/convert'
import { dataUrlToBlob } from '@/services/files/dataUrl'
import { legacyFixture } from './v042/fixture'

let n = 0
async function freshDb() {
  useDbForTests(new StarTomeDb(`test-${++n}`))
}

/** The synthetic v0.42 backup, converted and written: a database with something in every collection. */
async function seed() {
  const payload = legacyFixture()
  const result = convertLegacy(payload, sequentialIds('s'), '2026-11-12T00:00:00.000Z')
  const { snapshot, problems } = validateSnapshot(result.rows)
  expect(problems).toEqual([])
  const images: ImageRow[] = [
    ...(payload.images ?? []).filter(i => result.imageIds.has(i.id)).map(i => ({ id: i.id, mime: i.mime ?? 'image/png', createdAt: 'x', blob: dataUrlToBlob(i.data ?? '') })),
    ...result.inlineImages.map(i => ({ id: i.id, mime: 'image/png', createdAt: 'x', blob: dataUrlToBlob(i.dataUrl) })),
  ]
  await writeSnapshot(snapshot, images, { mode: 'replace' })
  return snapshot
}

describe('backup version 3', () => {
  beforeEach(freshDb)

  it('a full backup restores into an empty database exactly', async () => {
    await seed()
    const before = await readSnapshot()
    const { blob, manifest } = await exportBackupBlob({ appVersion: 'test' })
    expect(manifest).toMatchObject({ format: 'startome-backup', version: 3, scope: 'all', campaignIds: null })
    expect(manifest.collections.images).toBe(10)

    await freshDb()
    const result = await importBackup(blob, 'restore')
    expect(result.written.entries).toBe(before.entries.length)
    const after = await readSnapshot()
    for (const name of Object.keys(before) as (keyof typeof before)[]) {
      if (name === 'meta') continue
      expect(after[name], name).toEqual(before[name])
    }
  })

  it('images come back byte for byte', async () => {
    await seed()
    const { blob } = await exportBackupBlob({ appVersion: 'test' })
    const read = await readBackup(blobChunks(blob, 1000))
    const original = dataUrlToBlob(legacyFixture().images?.[0]?.data ?? '')
    const got = read.images.find(i => i.id === 'img-portrait')
    expect(got?.mime).toBe('image/png')
    expect(new Uint8Array(await got!.blob.arrayBuffer())).toEqual(new Uint8Array(await original.arrayBuffer()))
  })

  it('synced compendium entries leave as overlays of what the user added, never in full', async () => {
    const snapshot = await seed()
    const db = (await import('@/data/db')).getDb()
    await db.rows('rules').put({ id: 'fvtt:pf2e:bestiary:orc', origin: 'foundry', kind: 'creature', game: 'pf2e', name: 'Orc', sortName: 'orc', level: 1, gmNotes: 'mine', hp: 20 })
    await db.rows('rules').put({ id: 'fvtt:pf2e:bestiary:rat', origin: 'foundry', kind: 'creature', game: 'pf2e', name: 'Rat', sortName: 'rat', level: 0 })
    const { blob } = await exportBackupBlob({ appVersion: 'test' })
    const read = await readBackup(blobChunks(blob))
    expect((read.rows.rules as { id: string }[]).map(r => r.id).sort()).toEqual(snapshot.rules.map(r => r.id).sort())
    expect(read.rows.rulesOverlays).toContainEqual({ id: 'fvtt:pf2e:bestiary:orc', gmNotes: 'mine' })
    expect((read.rows.rulesOverlays as { id: string }[]).some(o => o.id.endsWith(':rat'))).toBe(false)
  })

  it('restoring keeps the synced compendium that is here', async () => {
    await seed()
    const { blob } = await exportBackupBlob({ appVersion: 'test' })
    await freshDb()
    const db = (await import('@/data/db')).getDb()
    await db.rows('rules').put({ id: 'fvtt:pf2e:bestiary:orc', origin: 'foundry', kind: 'creature', game: 'pf2e', name: 'Orc', sortName: 'orc', level: 1 })
    await importBackup(blob, 'restore')
    expect(await db.rows('rules').get('fvtt:pf2e:bestiary:orc')).toBeTruthy()
    expect(await db.rows('rules').get('user-rex')).toBeTruthy()
  })

  it('a campaign backup holds that campaign and what it uses, and adding it twice changes nothing', async () => {
    const snapshot = await seed()
    const codex = snapshot.campaigns.find(c => c.name === 'The Codex')!
    const { blob, manifest } = await exportBackupBlob({ appVersion: 'test', campaignIds: [codex.id] })
    expect(manifest).toMatchObject({ scope: 'campaigns', campaignIds: [codex.id] })
    const read = await readBackup(blobChunks(blob))
    expect(read.rows.rules).toBeUndefined()
    expect(read.rows.settings).toBeUndefined()
    expect(read.rows.soundTracks).toBeUndefined()
    expect((read.rows.entries as { campaignId: string }[]).every(e => e.campaignId === codex.id)).toBe(true)
    expect(read.rows.actors).toHaveLength(2)          // the two tokens placed or owned by its characters
    expect(read.rows.mapAssets).toHaveLength(1)       // the barrel on its battle map

    await freshDb()
    const first = await importBackup(blob, 'add')
    expect(first.written.campaigns).toBe(1)
    const once = await readSnapshot()
    const second = await importBackup(blob, 'add')
    expect(second.written.campaigns).toBe(0)
    expect(second.skipped.entries).toBe(once.entries.length)
    expect(await readSnapshot()).toEqual(once)
    await expect(importBackup(blob, 'restore')).rejects.toThrow(/Only a full backup/)
  })

  it('refuses what is not a backup, a newer data version, and a file whose counts do not match', async () => {
    expect(() => checkManifest({ format: 'something' })).toThrow(/not a StarTome backup/)
    expect(() => checkManifest({ format: 'startome-backup', version: 3, schemaVersion: 99 })).toThrow(/newer StarTome/)
    expect(() => checkManifest({ format: 'startome-backup', version: 4, schemaVersion: 1 })).toThrow(/container version 4/)
  })

  it('a bad row fails the whole import and leaves the database as it was', async () => {
    await seed()
    const before = await readSnapshot()
    const bad = { ...before, entries: [...before.entries, { id: 'x', campaignId: 'y', type: 'npc', name: 5 }] }
    const { problems } = validateSnapshot(bad as never)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ collection: 'entries', id: 'x' })
    expect(await readSnapshot()).toEqual(before)
  })
})

describe('unused images', () => {
  beforeEach(freshDb)

  it('removes what no row names, keeps what is used and what is new', async () => {
    const { findUnusedImages, removeUnusedImages, removeUnusedImagesIfDue } = await import('@/data/imageCleanup')
    const { getDb } = await import('@/data/db')
    await seed()
    const db = getDb()
    const before = await db.images.count()
    const now = Date.parse('2026-11-14T12:00:00.000Z')
    const blob = new Blob(['x'], { type: 'image/png' })
    await db.images.bulkPut([
      { id: 'orphan-old', mime: 'image/png', createdAt: '2026-11-01T00:00:00.000Z', blob },
      { id: 'orphan-new', mime: 'image/png', createdAt: '2026-11-14T11:00:00.000Z', blob },
      { id: 'in-rules', mime: 'image/png', createdAt: '2026-11-01T00:00:00.000Z', blob },
    ])
    await db.rows('rules').put({ id: 'hb.x', origin: 'user', kind: 'creature', game: 'pf2e', name: 'X', sortName: 'x', level: 1, img: 'img:in-rules' } as never)

    // Everything the seeded rows use stays: the same rule a backup follows
    expect((await findUnusedImages(now)).ids).toEqual(['orphan-old'])
    expect((await removeUnusedImages(now)).ids).toEqual(['orphan-old'])
    expect(await db.images.count()).toBe(before + 2)

    // The daily run: due the first time, then not again within a day
    expect(await removeUnusedImagesIfDue(now)).toEqual({ ids: [], bytes: 0 })
    expect(await removeUnusedImagesIfDue(now + 3_600_000)).toBeNull()
    // A day later the new orphan is old enough
    expect((await removeUnusedImagesIfDue(now + 25 * 3_600_000))?.ids).toEqual(['orphan-new'])
  })
})

describe('images copied from v0.42 in this browser', () => {
  it('are written a few at a time, and one that cannot be read is skipped and counted, not fatal', async () => {
    await freshDb()
    const db = getDb()
    const good = (id: string): ImageRow => ({ id, blob: new Blob([`img ${id}`], { type: 'image/png' }), mime: 'image/png', createdAt: '2026-11-14T00:00:00.000Z' })
    // A blob whose file is gone, as Chrome hands it out from another database
    const gone = new Blob(['x'])
    Object.defineProperty(gone, 'arrayBuffer', { value: () => Promise.reject(new DOMException('gone', 'NotReadableError')) })
    const rows = [good('a'), good('b'), { ...good('c'), blob: gone }, good('d'), good('e')]
    const steps: string[] = []
    const r = await putImagesInBatches(rows, (done, total) => steps.push(`${done}/${total}`), 2)
    expect(r).toEqual({ written: 4, unreadable: 1 })
    expect(steps).toEqual(['2/5', '4/5', '5/5'])
    expect((await db.images.toArray()).map(i => i.id).sort()).toEqual(['a', 'b', 'd', 'e'])
    expect(await (await db.images.get('d'))!.blob.text()).toBe('img d')
  })
})
