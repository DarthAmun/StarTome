/**
 * The sound player: one audio element for the whole app, a queue, and where
 * the sound goes (the output device picker; a Bluetooth speaker paired to
 * this computer shows up there). Local files are opened through their saved
 * handle, which may ask for permission again after a restart.
 */
import { reactive } from 'vue'
import type { SoundTrack } from '@/domain/schema'
import { deviceHandles, meta } from '@/data/repo'
import { handleKey, sounds } from '@/data/sounds'

export const player = reactive({
  queue: [] as SoundTrack[],
  index: -1,
  playing: false,
  time: 0,
  duration: 0,
  volume: 0.8,
  shuffle: false,
  loop: false,
  /** The playlist or tag the queue came from, for the bar. */
  source: '',
  deviceId: '',
  error: '',
})

interface FileHandle { getFile(): Promise<File>; queryPermission?(o: { mode: 'read' }): Promise<string>; requestPermission?(o: { mode: 'read' }): Promise<string> }
type SinkAudio = HTMLAudioElement & { setSinkId?(id: string): Promise<void> }

let audio: SinkAudio | null = null
let objectUrl: string | null = null

function el(): SinkAudio {
  if (audio) return audio
  const a = new Audio() as SinkAudio
  a.volume = player.volume
  a.addEventListener('timeupdate', () => { player.time = a.currentTime })
  a.addEventListener('durationchange', () => { player.duration = Number.isFinite(a.duration) ? a.duration : 0 })
  a.addEventListener('play', () => { player.playing = true })
  a.addEventListener('pause', () => { player.playing = false })
  a.addEventListener('ended', () => { void next(true) })
  a.addEventListener('error', () => { player.error = 'This track could not be played.' })
  audio = a
  void meta.get<{ volume?: number; deviceId?: string }>('sound.player', {}).then((saved) => {
    if (typeof saved.volume === 'number') setVolume(saved.volume)
    if (saved.deviceId) void setDevice(saved.deviceId)
  })
  return a
}
const remember = () => void meta.set('sound.player', { volume: player.volume, deviceId: player.deviceId })

async function sourceOf(t: SoundTrack): Promise<string | null> {
  if (t.type === 'url') return t.src
  const handle = await deviceHandles.get<FileHandle>(handleKey(t.id))
  if (!handle) { player.error = `“${t.name}” is a file of another device or session: link it again on the Sounds page.`; return null }
  if (handle.queryPermission && await handle.queryPermission({ mode: 'read' }) !== 'granted' && await handle.requestPermission?.({ mode: 'read' }) !== 'granted') { player.error = 'Permission to read the file was not given.'; return null }
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(await handle.getFile())
  return objectUrl
}

async function start(index: number): Promise<void> {
  const t = player.queue[index]
  if (!t) return
  player.index = index
  player.error = ''
  // A Spotify track is a link: it opens there and the queue moves on
  if (t.type === 'spotify') { window.open(t.src, '_blank', 'noopener'); return }
  try {
    const src = await sourceOf(t)
    if (!src) return
    const a = el()
    a.src = src
    await a.play()
  } catch (err) { player.error = err instanceof Error ? err.message : 'This track could not be played.' }
}

/** Plays these tracks from `at`. */
export async function playQueue(tracks: SoundTrack[], at = 0, source = '', opts: { shuffle?: boolean; loop?: boolean } = {}): Promise<void> {
  player.queue = [...tracks]
  player.source = source
  if (opts.shuffle !== undefined) player.shuffle = opts.shuffle
  if (opts.loop !== undefined) player.loop = opts.loop
  await start(player.shuffle && tracks.length > 1 && at === 0 ? Math.floor(Math.random() * tracks.length) : at)
}

export async function playPlaylist(id: string): Promise<boolean> {
  const list = await sounds.playlist(id)
  if (!list) return false
  const all = new Map((await sounds.tracks()).map(t => [t.id, t]))
  const tracks = list.trackIds.map(t => all.get(t)).filter((t): t is SoundTrack => !!t)
  if (!tracks.length) return false
  await playQueue(tracks, 0, list.name, { shuffle: list.shuffle, loop: list.loop })
  return true
}

export function toggle(): void {
  const a = el()
  if (player.index < 0 && player.queue.length) { void start(0); return }
  if (a.paused) void a.play().catch(() => {})
  else a.pause()
}

export async function next(ended = false): Promise<void> {
  const n = player.queue.length
  if (!n) return
  if (player.shuffle && n > 1) { let i = player.index; while (i === player.index) i = Math.floor(Math.random() * n); await start(i); return }
  if (player.index + 1 < n) await start(player.index + 1)
  else if (player.loop || !ended) await start(0)
  else player.playing = false
}

export async function previous(): Promise<void> {
  const a = el()
  if (a.currentTime > 3 || player.index <= 0) { a.currentTime = 0; return }
  await start(player.index - 1)
}

export function seek(seconds: number): void { el().currentTime = seconds }
export function setVolume(v: number): void { player.volume = Math.max(0, Math.min(1, v)); el().volume = player.volume; remember() }
export function stop(): void { el().pause(); player.queue = []; player.index = -1; player.source = '' }

export const canPickDevice = (): boolean => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

/** Output devices. Their names show only once the browser was allowed to use audio devices. */
export async function outputDevices(): Promise<{ id: string; label: string }[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput').map((d, i) => ({ id: d.deviceId, label: d.label || `Output ${i + 1}` }))
}

export async function setDevice(id: string): Promise<void> {
  try { await el().setSinkId?.(id); player.deviceId = id; remember() } catch { player.error = 'That output is not available.' }
}

/** Picks local audio files and keeps their handles, so they play again later without copying them. */
export async function pickSoundFiles(): Promise<{ name: string; handle: unknown }[]> {
  const pick = (window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<(FileHandle & { name: string })[]> }).showOpenFilePicker
  if (!pick) return []
  try { return (await pick({ multiple: true, types: [{ description: 'Audio', accept: { 'audio/*': ['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.opus'] } }] })).map(h => ({ name: h.name, handle: h })) } catch { return [] }
}

export async function linkFile(trackId: string, handle: unknown): Promise<void> {
  await deviceHandles.set(handleKey(trackId), handle)
}
export const hasFile = async (trackId: string): Promise<boolean> => !!(await deviceHandles.get(handleKey(trackId)))
