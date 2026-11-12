/**
 * Backups of this database: export everything or some campaigns, restore a
 * backup, or add its campaigns beside what is here.
 */
import { collectImageIds } from '@/domain/images'
import { nowIso } from '@/domain/ids'
import type { ImageRow, Snapshot } from '@/domain/schema'
import { images as imageRepo, meta } from '@/data/repo'
import { SnapshotInvalidError, readSnapshot, validateSnapshot, writeSnapshot, type WriteResult } from '@/data/snapshot'
import { BackupError, buildManifest, forCampaigns, forFullBackup, type Manifest } from './format'
import { blobChunks, readBackup, writeBackup, type BackupImage, type Sink } from './zip'

export { BackupError } from './format'
export type { Manifest } from './format'

export interface ExportOptions { campaignIds?: string[]; appVersion: string }

async function* imagesOf(ids: Set<string>): AsyncIterable<BackupImage> {
  for (const id of ids) {
    const row = await imageRepo.get(id)
    if (row) yield { id: row.id, mime: row.mime, createdAt: row.createdAt, blob: row.blob }
  }
}

/** Writes a backup of this database to `sink`. Returns its manifest. */
export async function exportBackup(opts: ExportOptions, sink: Sink): Promise<Manifest> {
  const db = await readSnapshot()
  const rows: Snapshot = opts.campaignIds ? forCampaigns(db, opts.campaignIds) : forFullBackup(db)
  const wanted = collectImageIds(rows)
  const have = new Set(await imageRepo.ids())
  const ids = new Set([...wanted].filter(id => have.has(id)))
  const manifest = buildManifest(rows, ids.size, opts.campaignIds ? 'campaigns' : 'all', opts.appVersion, nowIso())
  await writeBackup(manifest, rows, imagesOf(ids), sink)
  if (!opts.campaignIds) await meta.set('lastBackupAt', manifest.exportedAt)
  return manifest
}

export async function exportBackupBlob(opts: ExportOptions): Promise<{ blob: Blob; manifest: Manifest }> {
  const parts: Uint8Array[] = []
  const manifest = await exportBackup(opts, (chunk) => { parts.push(chunk) })
  return { blob: new Blob(parts as BlobPart[], { type: 'application/zip' }), manifest }
}

export function backupFileName(manifest: Manifest, campaignName?: string): string {
  const what = manifest.scope === 'all' ? 'all' : (campaignName ?? 'campaigns').replace(/[/\\:*?"<>|]/g, '_')
  return `startome-${what}-${manifest.exportedAt.slice(0, 10)}.startome.zip`
}

export interface ImportResult extends WriteResult { manifest: Manifest }

/**
 * 'restore' replaces the whole database with a full backup (the synced
 * compendium stays); 'add' writes the backup's rows beside what is here and
 * skips rows that exist already, so importing a file twice changes nothing.
 */
export async function importBackup(file: Blob, mode: 'restore' | 'add'): Promise<ImportResult> {
  const read = await readBackup(blobChunks(file))
  if (mode === 'restore' && read.manifest.scope !== 'all') throw new BackupError('Only a full backup can be restored. This file holds single campaigns: add them instead.')
  const { snapshot, problems } = validateSnapshot(read.rows)
  if (problems.length) throw new SnapshotInvalidError(problems)
  const imageRows: ImageRow[] = read.images.map(i => ({ id: i.id, mime: i.mime, createdAt: i.createdAt, blob: i.blob }))
  if (mode === 'add') {
    // Settings and the like belong to this device's database, not to an added campaign
    snapshot.settings = []
    snapshot.syncState = []
  }
  const result = await writeSnapshot(snapshot, imageRows, mode === 'restore'
    ? { mode: 'replace', keep: ['rules', 'syncState', 'meta', 'linkOutbox'] }
    : { mode: 'add' })
  return { ...result, manifest: read.manifest }
}
