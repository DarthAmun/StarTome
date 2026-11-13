/** The sound library: tracks and playlists. A local file's handle stays on this device (deviceHandles); the row keeps its name to link it again. */
import { newId, nowIso } from '@/domain/ids'
import { zSoundPlaylist, zSoundTrack, type SoundPlaylist, type SoundTrack } from '@/domain/schema'
import { getDb } from './db'

const tracks = () => getDb().rows('soundTracks')
const lists = () => getDb().rows('soundPlaylists')
export const handleKey = (trackId: string) => `sound:${trackId}`

export const sounds = {
  tracks: async (): Promise<SoundTrack[]> => (await tracks().toArray()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  playlists: async (): Promise<SoundPlaylist[]> => (await lists().toArray()).sort((a, b) => a.name.localeCompare(b.name)),
  playlist: (id: string) => lists().get(id),
  async saveTrack(input: Partial<SoundTrack> & { name: string; type: SoundTrack['type'] }): Promise<SoundTrack> {
    const old = input.id ? await tracks().get(input.id) : undefined
    const ts = nowIso()
    const row = zSoundTrack.parse({ ...old, ...input, id: old?.id ?? input.id ?? newId(), createdAt: old?.createdAt ?? ts, updatedAt: ts })
    await tracks().put(row)
    return row
  },
  /** Deletes a track, takes it out of every playlist and forgets its file handle. */
  async removeTrack(id: string): Promise<void> {
    const db = getDb()
    await db.transaction('rw', tracks(), lists(), db.deviceHandles, async () => {
      await tracks().delete(id)
      await db.deviceHandles.delete(handleKey(id))
      await lists().toCollection().modify((p) => { p.trackIds = p.trackIds.filter(t => t !== id) })
    })
  },
  async savePlaylist(input: Partial<SoundPlaylist> & { name: string }): Promise<SoundPlaylist> {
    const old = input.id ? await lists().get(input.id) : undefined
    const ts = nowIso()
    const row = zSoundPlaylist.parse({ ...old, ...input, id: old?.id ?? newId(), createdAt: old?.createdAt ?? ts, updatedAt: ts })
    await lists().put(row)
    return row
  },
  removePlaylist: (id: string) => lists().delete(id),
}
