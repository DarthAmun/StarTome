import { parseJson } from '~/utils/json'
import { getDb } from '~/composables/useDb'
import type { DbSoundTrack, DbSoundPlaylist } from '~/composables/useDb'

const tracks   = ref<DbSoundTrack[]>([])
const playlists = ref<DbSoundPlaylist[]>([])
const loaded   = ref(false)
let   loadPromise: Promise<void> | null = null

function ts() { return new Date().toISOString() }

export function parseTags(raw?: string[] | string): string[] {
  return parseJson<string[]>(raw, [])
}

function load(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const db = getDb()
    ;[tracks.value, playlists.value] = await Promise.all([
      db.soundTracks.orderBy('name').toArray(),
      db.soundPlaylists.orderBy('name').toArray(),
    ])
    loaded.value = true
  })()
  return loadPromise
}

async function createPlaylist(name: string, color?: string) {
  const now = ts()
  const pl = { name, color, trackIds: [], loop: 0, shuffle: 0, createdAt: now, updatedAt: now } as DbSoundPlaylist
  pl.id = await getDb().soundPlaylists.add(pl)
  playlists.value.push(pl)
  return pl
}

async function updatePlaylist(id: number, data: Partial<DbSoundPlaylist>) {
  const now = ts()
  await getDb().soundPlaylists.update(id, { ...data, updatedAt: now })
  const i = playlists.value.findIndex(p => p.id === id)
  if (i >= 0) playlists.value[i] = { ...playlists.value[i], ...data, updatedAt: now }
}

async function deletePlaylist(id: number) {
  await getDb().soundPlaylists.delete(id)
  playlists.value = playlists.value.filter(p => p.id !== id)
}

async function addTrack(data: Omit<DbSoundTrack, 'id' | 'createdAt' | 'updatedAt'>) {
  const id = await getDb().soundTracks.add({ ...data, createdAt: ts(), updatedAt: ts() })
  const track = await getDb().soundTracks.get(id)
  if (track) tracks.value.push(track)
  return track!
}

async function updateTrack(id: number, data: Partial<DbSoundTrack>) {
  const now = ts()
  await getDb().soundTracks.update(id, { ...data, updatedAt: now })
  const i = tracks.value.findIndex(t => t.id === id)
  if (i >= 0) tracks.value[i] = { ...tracks.value[i], ...data, updatedAt: now }
}

async function deleteTrack(id: number) {
  await getDb().soundTracks.delete(id)
  tracks.value = tracks.value.filter(t => t.id !== id)
  for (const pl of playlists.value) {
    const ids: number[] = parseJson<number[]>(pl.trackIds, [])
    if (ids.includes(id))
      await updatePlaylist(pl.id!, { trackIds: ids.filter(i => i !== id) })
  }
}

function trackCount(pl: DbSoundPlaylist): number {
  return (parseJson<number[]>(pl.trackIds, []) as number[]).length
}

function getPlaylistById(id: number): DbSoundPlaylist | null {
  return playlists.value.find(p => p.id === id) ?? null
}

function getPlaylistTracks(pl: DbSoundPlaylist): DbSoundTrack[] {
  const ids: number[] = parseJson<number[]>(pl.trackIds, [])
  return ids.map(id => tracks.value.find(t => t.id === id)).filter(Boolean) as DbSoundTrack[]
}

async function addTrackToPlaylist(playlistId: number, trackId: number) {
  const pl = playlists.value.find(p => p.id === playlistId)
  if (!pl) return
  const ids: number[] = parseJson<number[]>(pl.trackIds, [])
  if (!ids.includes(trackId))
    await updatePlaylist(playlistId, { trackIds: [...ids, trackId] })
}

async function removeTrackFromPlaylist(playlistId: number, trackId: number) {
  const pl = playlists.value.find(p => p.id === playlistId)
  if (!pl) return
  const ids: number[] = parseJson<number[]>(pl.trackIds, [])
  await updatePlaylist(playlistId, { trackIds: ids.filter(i => i !== trackId) })
}

async function reorderPlaylistTracks(playlistId: number, newIds: number[]) {
  await updatePlaylist(playlistId, { trackIds: [...newIds] })
}

const allTags = computed<string[]>(() => {
  const tagSet = new Set<string>()
  for (const t of tracks.value) {
    for (const tag of parseTags(t.tags)) tagSet.add(tag)
  }
  return [...tagSet].sort()
})

function getTracksByTag(tag: string): DbSoundTrack[] {
  return tracks.value.filter(t => parseTags(t.tags).includes(tag))
}

export function useSounds() {
  if (!loaded.value && import.meta.client) load()
  return {
    tracks,
    playlists,
    loaded,
    load,
    allTags,
    parseTags,
    getTracksByTag,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    addTrack,
    updateTrack,
    deleteTrack,
    trackCount,
    getPlaylistById,
    getPlaylistTracks,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    reorderPlaylistTracks,
  }
}
