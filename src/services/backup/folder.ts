/**
 * The backup folder: a folder on this computer the app writes full backups
 * into by itself, so campaign work does not live in the browser profile
 * alone. Needs Chromium's file access (showDirectoryPicker).
 *
 * Each backup is one `.startome.zip`; the newest KEEP are kept.
 */
import { deviceHandles, meta } from '@/data/repo'
import { exportBackup } from './index'

const HANDLE_KEY = 'backupFolder'
const KEEP = 3
/** A backup is due when the last one is older than this. */
export const BACKUP_EVERY_MS = 24 * 60 * 60 * 1000

interface DirHandle {
  name: string
  queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{ createWritable(): Promise<WritableStreamDefaultWriter<Uint8Array> & { write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> }>
  removeEntry(name: string): Promise<void>
  keys(): AsyncIterable<string>
}

export function backupFolderSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export interface FolderState { name: string | null; permission: PermissionState | null; lastBackupAt: string | null }

export async function backupFolderState(): Promise<FolderState> {
  const handle = await deviceHandles.get<DirHandle>(HANDLE_KEY)
  return {
    name: handle?.name ?? null,
    permission: handle ? await handle.queryPermission({ mode: 'readwrite' }) : null,
    lastBackupAt: await meta.get<string | null>('lastBackupAt', null),
  }
}

/** Asks for a folder (a click must have started this) and remembers it. */
export async function chooseBackupFolder(): Promise<string> {
  const pick = (window as unknown as { showDirectoryPicker(opts: { mode: 'readwrite'; id: string }): Promise<DirHandle> }).showDirectoryPicker
  const handle = await pick({ mode: 'readwrite', id: 'startome-backups' })
  await deviceHandles.set(HANDLE_KEY, handle)
  return handle.name
}

export async function forgetBackupFolder(): Promise<void> {
  await deviceHandles.remove(HANDLE_KEY)
}

/**
 * Writes a full backup into the folder and prunes old ones. `ask` may show the
 * browser's permission prompt (only from a click); without it a folder that
 * needs asking again is skipped.
 */
export async function backupToFolder(appVersion: string, ask: boolean): Promise<{ file: string } | { skipped: 'no-folder' | 'no-permission' }> {
  const handle = await deviceHandles.get<DirHandle>(HANDLE_KEY)
  if (!handle) return { skipped: 'no-folder' }
  let permission = await handle.queryPermission({ mode: 'readwrite' })
  if (permission !== 'granted' && ask) permission = await handle.requestPermission({ mode: 'readwrite' })
  if (permission !== 'granted') return { skipped: 'no-permission' }

  // The time is in the name, so two backups on one day don't overwrite each other
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
  const file = `startome-all-${stamp}.startome.zip`
  const writable = await (await handle.getFileHandle(file, { create: true })).createWritable()
  try {
    // A writable stream only replaces the file on close: a backup that was cut off leaves nothing behind
    await exportBackup({ appVersion }, chunk => writable.write(chunk))
    await writable.close()
  } catch (err) {
    await writable.abort().catch(() => {})
    await handle.removeEntry(file).catch(() => {})
    throw err
  }

  const backups: string[] = []
  for await (const name of handle.keys()) if (/^startome-all-.*\.startome\.zip$/.test(name)) backups.push(name)
  for (const old of backups.sort().slice(0, -KEEP)) await handle.removeEntry(old).catch(() => {})
  return { file }
}

/** On start: a backup when the last one is a day old and the folder may be written without asking. */
export async function backupIfDue(appVersion: string): Promise<void> {
  if (!backupFolderSupported()) return
  const last = await meta.get<string | null>('lastBackupAt', null)
  if (last && Date.now() - Date.parse(last) < BACKUP_EVERY_MS) return
  await backupToFolder(appVersion, false)
}
