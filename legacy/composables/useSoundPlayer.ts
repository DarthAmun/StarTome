import type { DbSoundTrack, DbSoundPlaylist } from '~/composables/useDb'

// ── Module-level singletons ────────────────────────────────────────────────
let audio: HTMLAudioElement | null = null
let currentObjectUrl: string | null = null
let rafId: number | null = null
let queueTracks: DbSoundTrack[] = []

// ── Reactive state ─────────────────────────────────────────────────────────
const currentTrack    = ref<DbSoundTrack | null>(null)
const currentPlaylist = ref<DbSoundPlaylist | null>(null)
const currentIndex    = ref(-1)
const isPlaying       = ref(false)
const isLoading       = ref(false)
const playerError     = ref<string | null>(null)
const volume          = ref(0.8)
const currentTime     = ref(0)
const duration        = ref(0)

// ── Audio element ──────────────────────────────────────────────────────────
function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
    audio.volume = volume.value
    audio.addEventListener('play',      () => { isPlaying.value = true;  startRaf() })
    audio.addEventListener('pause',     () => { isPlaying.value = false; stopRaf() })
    audio.addEventListener('ended',     () => { isPlaying.value = false; stopRaf(); autoNext() })
    audio.addEventListener('loadstart', () => { isLoading.value = true })
    audio.addEventListener('canplay',   () => {
      isLoading.value = false
      duration.value = isFinite(audio!.duration) ? audio!.duration : 0
    })
    audio.addEventListener('error', () => {
      isLoading.value = false
      isPlaying.value = false
      const err = audio?.error
      playerError.value = err ? `Audio error (${err.code}): ${err.message || 'failed to load'}` : 'Failed to load audio'
    })
    setupRemotePlayback(audio)
  }
  return audio
}

function startRaf() {
  if (rafId !== null || !import.meta.client) return
  const tick = () => {
    if (audio) {
      currentTime.value = audio.currentTime
      if (isFinite(audio.duration)) duration.value = audio.duration
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

function stopRaf() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
}

function revokeObjectUrl() {
  if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null }
}

// ── Output device selection ────────────────────────────────────────────────
const outputDevices    = ref<MediaDeviceInfo[]>([])
const selectedDeviceId = ref<string>('')

// ── Remote Playback API ────────────────────────────────────────────────────
const remoteAvailable  = ref(false)
const remoteSupported  = ref(false)
const remoteState      = ref<'disconnected' | 'connecting' | 'connected'>('disconnected')

function setupRemotePlayback(el: HTMLAudioElement) {
  const remote = (el as any).remote
  if (!remote) return
  remote.watchAvailability((available: boolean) => {
    remoteAvailable.value = available
  }).then(() => {
    remoteSupported.value = true
  }).catch(() => {})
  remote.addEventListener('connecting', () => { remoteState.value = 'connecting' })
  remote.addEventListener('connect',    () => { remoteState.value = 'connected' })
  remote.addEventListener('disconnect', () => { remoteState.value = 'disconnected' })
}

async function promptRemotePlayback() {
  const remote = (audio as any)?.remote
  if (!remote) {
    playerError.value = 'Remote playback is not supported in this browser'
    return
  }
  try {
    await remote.prompt()
  } catch (e: any) {
    if (e?.name === 'NotFoundError') {
      playerError.value = 'No cast devices found nearby'
    } else if (e?.name !== 'AbortError') {
      // AbortError = user dismissed the picker, not an error worth showing
      playerError.value = `Cast error: ${e?.message ?? e}`
    }
  }
}

async function loadOutputDevices() {
  if (!import.meta.client || !navigator.mediaDevices?.enumerateDevices) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(t => t.stop())
  } catch {
    // No mic permission — device labels will be empty strings
  }
  const all = await navigator.mediaDevices.enumerateDevices()
  outputDevices.value = all.filter(d => d.kind === 'audiooutput')
}

async function setOutputDevice(deviceId: string) {
  selectedDeviceId.value = deviceId
  if (audio && 'setSinkId' in audio) {
    await (audio as any).setSinkId(deviceId)
  }
}

// ── File handle resolution ─────────────────────────────────────────────────
async function resolveUrl(track: DbSoundTrack): Promise<string | null> {
  if (track.type === 'url') return track.src
  if (track.type !== 'file' || !track.fileHandle) return null
  const handle = track.fileHandle as any

  // Fallback path: handle is a File/Blob object stored directly
  if (typeof handle.queryPermission !== 'function') {
    revokeObjectUrl()
    currentObjectUrl = URL.createObjectURL(handle as File)
    return currentObjectUrl
  }

  // FSA path: FileSystemFileHandle — request permission if needed
  let perm = await handle.queryPermission({ mode: 'read' })
  if (perm === 'prompt') perm = await handle.requestPermission({ mode: 'read' })
  if (perm !== 'granted') return null
  revokeObjectUrl()
  const file = await handle.getFile()
  currentObjectUrl = URL.createObjectURL(file)
  return currentObjectUrl
}

// ── Playback control ───────────────────────────────────────────────────────
async function playTrack(track: DbSoundTrack, playlist?: DbSoundPlaylist, index?: number) {
  currentTrack.value = track
  playerError.value = null
  if (playlist !== undefined) currentPlaylist.value = playlist
  if (index !== undefined) currentIndex.value = index

  if (track.type === 'spotify') {
    isPlaying.value = false
    window.open(track.src, '_blank', 'noopener')
    return
  }

  // Initialise audio element synchronously (within user-gesture activation window)
  // before any async work so el.play() is not blocked by autoplay policy.
  const el = getAudio()
  isLoading.value = true

  let url: string | null
  try {
    url = await resolveUrl(track)
  } catch (e: any) {
    isLoading.value = false
    playerError.value = `Could not open file: ${e?.message ?? e}`
    return
  }
  if (!url) {
    isLoading.value = false
    playerError.value = track.fileHandle
      ? 'File access denied — re-add the track to grant permission'
      : 'Could not load track'
    return
  }

  el.pause()
  el.src = url
  el.volume = volume.value
  el.currentTime = 0
  currentTime.value = 0
  duration.value = 0
  try {
    await el.play()
  } catch (e: any) {
    playerError.value = e?.name === 'NotAllowedError'
      ? 'Playback blocked — click play to start'
      : `Playback error: ${e?.message ?? e}`
  }
}

async function playPlaylist(playlist: DbSoundPlaylist, tracks: DbSoundTrack[], startIndex = 0) {
  queueTracks = tracks
  currentPlaylist.value = playlist
  if (!tracks.length) return
  const idx = Math.max(0, Math.min(startIndex, tracks.length - 1))
  await playTrack(tracks[idx], playlist, idx)
}

async function autoNext() {
  if (!queueTracks.length || !currentPlaylist.value) return
  const playlist = currentPlaylist.value
  const doShuffle = playlist.shuffle === 1
  const doLoop    = playlist.loop === 1
  let next: number

  if (doShuffle) {
    next = Math.floor(Math.random() * queueTracks.length)
  } else {
    next = currentIndex.value + 1
    if (next >= queueTracks.length) {
      if (!doLoop) return
      next = 0
    }
  }
  await playTrack(queueTracks[next], playlist, next)
}

async function nextTrack() {
  if (!queueTracks.length || !currentPlaylist.value) return
  const next = (currentIndex.value + 1) % queueTracks.length
  await playTrack(queueTracks[next], currentPlaylist.value, next)
}

async function prevTrack() {
  if (!queueTracks.length || !currentPlaylist.value) return
  // If more than 3s in, restart; otherwise go to previous
  if (audio && audio.currentTime > 3) {
    seek(0); return
  }
  const prev = (currentIndex.value - 1 + queueTracks.length) % queueTracks.length
  await playTrack(queueTracks[prev], currentPlaylist.value, prev)
}

function pause()       { audio?.pause() }
function resume()      { audio?.play()  }
function togglePlay()  { isPlaying.value ? pause() : resume() }

function seek(t: number) {
  if (audio) { audio.currentTime = t; currentTime.value = t }
}

function setVolume(v: number) {
  volume.value = v
  if (audio) audio.volume = v
}

function toggleShuffle() {
  if (!currentPlaylist.value) return
  currentPlaylist.value = { ...currentPlaylist.value, shuffle: currentPlaylist.value.shuffle ? 0 : 1 }
}

function toggleLoop() {
  if (!currentPlaylist.value) return
  currentPlaylist.value = { ...currentPlaylist.value, loop: currentPlaylist.value.loop ? 0 : 1 }
}

function stopPlayback() {
  audio?.pause()
  if (audio) { audio.src = ''; audio.currentTime = 0 }
  revokeObjectUrl()
  queueTracks = []
  currentTrack.value    = null
  currentPlaylist.value = null
  currentIndex.value    = -1
  isPlaying.value       = false
  currentTime.value     = 0
  duration.value        = 0
}

// ── Public API ─────────────────────────────────────────────────────────────
export function useSoundPlayer() {
  return {
    currentTrack,
    currentPlaylist,
    currentIndex,
    isPlaying,
    isLoading,
    playerError,
    volume,
    currentTime,
    duration,
    outputDevices,
    selectedDeviceId,
    loadOutputDevices,
    setOutputDevice,
    remoteAvailable,
    remoteSupported,
    remoteState,
    promptRemotePlayback,
    playTrack,
    playPlaylist,
    nextTrack,
    prevTrack,
    togglePlay,
    pause,
    resume,
    seek,
    setVolume,
    toggleShuffle,
    toggleLoop,
    stopPlayback,
  }
}
