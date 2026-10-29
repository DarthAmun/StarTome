<template>
  <Teleport to="body" :disabled="inline">

    <!-- ── FAB + encounter music notification ──────────────────── -->
    <div v-if="!inline" class="sp-fab-group no-print">
      <Transition name="sp-notif">
        <div v-if="linkedPlaylistNotif" class="sp-notif">
          <span class="sp-notif-name">♫ {{ linkedPlaylistNotif.name }}</span>
          <button class="sp-notif-play" @click="playLinkedPlaylist">Play</button>
          <button class="sp-notif-dismiss" @click="dismissNotif">×</button>
        </div>
      </Transition>
      <button
        class="sp-fab"
        :class="{ 'sp-fab--open': panelOpen, 'sp-fab--playing': isPlaying }"
        @click="panelOpen = !panelOpen"
      >
        <span class="sp-fab-icon">
          <span v-if="isPlaying" class="sp-eq">
            <span class="sp-eq-bar" /><span class="sp-eq-bar" /><span class="sp-eq-bar" />
          </span>
          <span v-else>♫</span>
        </span>
        <span class="sp-fab-label">{{ currentTrack ? currentTrack.name : 'Music' }}</span>
      </button>
    </div>

    <!-- ── Panel ───────────────────────────────────────────────── -->
    <Transition :name="inline ? '' : 'sp-panel'">
      <div
        v-if="panelOpen || inline"
        class="sp-panel"
        :class="{ 'sp-panel--inline': inline }"
        @mousedown.stop
        @keydown.escape="closePanel"
      >

        <!-- Playlist picker when nothing is playing -->
        <template v-if="!currentTrack">
          <div class="sp-pl-header">Playlists</div>
          <div v-if="!playlists.length" class="sp-empty">No playlists yet — go to Sounds to add one.</div>
          <div v-else class="sp-pl-list">
            <button
              v-for="pl in playlists"
              :key="pl.id"
              class="sp-pl-item"
              :style="{ '--pl-color': pl.color ?? 'var(--accent)' }"
              @click="startPlaylist(pl)"
            >
              <span class="sp-pl-dot" />
              <span class="sp-pl-name">{{ pl.name }}</span>
              <span class="sp-pl-count">{{ trackCount(pl) }}</span>
            </button>
          </div>
        </template>

        <!-- Track header -->
        <template v-else>
        <div class="sp-hdr">
          <div class="sp-hdr-icon" :class="`sp-hdr-icon--${currentTrack!.type}`">
            <span v-if="currentTrack!.type === 'file'">♫</span>
            <span v-else-if="currentTrack!.type === 'url'">🔗</span>
            <span v-else style="color:#1db954">●</span>
          </div>
          <div class="sp-hdr-meta">
            <span class="sp-hdr-name">{{ currentTrack!.name }}</span>
            <span v-if="playerError" class="sp-hdr-error" :title="playerError">⚠ {{ playerError }}</span>
            <span v-else-if="currentPlaylist" class="sp-hdr-sub">{{ currentPlaylist.name }}</span>
          </div>
          <button class="sp-hdr-stop" title="Stop" @click="stopPlayback">✕</button>
        </div>

        <!-- Spotify: link-out -->
        <template v-if="currentTrack!.type === 'spotify'">
          <div class="sp-spotify-row">
            <span class="sp-spotify-msg">Playing in Spotify</span>
            <a :href="currentTrack!.src" target="_blank" rel="noopener" class="sp-spotify-link">Open ↗</a>
          </div>
        </template>

        <!-- File/URL: full controls -->
        <template v-else>
          <!-- Progress -->
          <div class="sp-progress">
            <span class="sp-time">{{ fmtSeconds(currentTime) }}</span>
            <input
              class="sp-seek"
              type="range"
              :min="0"
              :max="duration || 0"
              :value="currentTime"
              step="0.5"
              @change="seek(Number(($event.target as HTMLInputElement).value))"
            />
            <span class="sp-time sp-time--r">{{ fmtSeconds(duration) }}</span>
          </div>

          <!-- Transport -->
          <div class="sp-transport">
            <button class="sp-btn" title="Previous" @click="prevTrack">⏮</button>
            <button class="sp-btn sp-btn--play" :title="isPlaying ? 'Pause' : 'Play'" @click="togglePlay">
              <span v-if="isLoading" class="sp-spin">↻</span>
              <span v-else>{{ isPlaying ? '⏸' : '▶' }}</span>
            </button>
            <button class="sp-btn" title="Next" @click="nextTrack">⏭</button>
          </div>

          <!-- Volume -->
          <div class="sp-vol-row">
            <span class="sp-vol-icon">🔊</span>
            <input
              class="sp-vol"
              type="range"
              min="0"
              max="1"
              step="0.02"
              :value="volume"
              @input="setVolume(Number(($event.target as HTMLInputElement).value))"
            />
          </div>

          <!-- Footer: shuffle / loop / device -->
          <div class="sp-footer">
            <button
              v-if="currentPlaylist"
              class="sp-btn sp-btn--sm"
              :class="{ active: currentPlaylist.shuffle }"
              title="Shuffle"
              @click="toggleShuffle"
            >⇄ Shuffle</button>
            <button
              v-if="currentPlaylist"
              class="sp-btn sp-btn--sm"
              :class="{ active: currentPlaylist.loop }"
              title="Loop"
              @click="toggleLoop"
            >↺ Loop</button>

            <!-- Remote playback (Cast / AirPlay) -->
            <button
              v-if="remoteSupported"
              class="sp-btn sp-btn--sm"
              :class="{
                active: remoteState !== 'disconnected',
                'sp-btn--cast-available': remoteAvailable,
              }"
              :title="remoteAvailable ? 'Cast to a network speaker or TV' : 'No cast devices found'"
              @click="promptRemotePlayback"
            >
              <span v-if="remoteState === 'connecting'" class="sp-spin">↻</span>
              <span v-else>⊕</span>
              {{ remoteState === 'connected' ? 'Connected' : 'Cast' }}
            </button>

            <!-- Output device -->
            <div class="sp-dev-wrap" ref="devWrapRef">
              <button
                class="sp-btn sp-btn--sm"
                :class="{ active: selectedDeviceId }"
                title="Local audio output device"
                @click="toggleDevicePicker"
              >⇥ Output</button>

              <div v-if="showDevicePicker" class="sp-dev-menu">
                <div class="sp-dev-label">Output Device</div>
                <div v-if="!outputDevices.length" class="sp-dev-empty">
                  No devices found.
                  <button class="sp-dev-refresh" @click="loadOutputDevices">Refresh</button>
                </div>
                <button
                  v-for="d in outputDevices"
                  :key="d.deviceId"
                  class="sp-dev-item"
                  :class="{ active: selectedDeviceId === d.deviceId }"
                  @click="selectDevice(d.deviceId)"
                >
                  <span class="sp-dev-check">{{ selectedDeviceId === d.deviceId ? '✓' : '' }}</span>
                  {{ d.label || `Device ${d.deviceId.slice(0, 8)}` }}
                </button>
                <div class="sp-dev-note">Routes audio to a local output (sound card, USB DAC). Use Cast for network speakers.</div>
              </div>
            </div>
          </div>
        </template>
        </template>

      </div>
    </Transition>

  </Teleport>
</template>

<script setup lang="ts">
import { useSoundPlayer } from '~/composables/useSoundPlayer'
import { useSounds } from '~/composables/useSounds'
import { useEncounterStore } from '~/stores/encounter'
import type { DbSoundPlaylist } from '~/composables/useDb'
import { fmtSeconds } from '~/utils/time'

const props = defineProps<{ inline?: boolean }>()

const {
  currentTrack, currentPlaylist,
  isPlaying, isLoading, playerError,
  volume, currentTime, duration,
  outputDevices, selectedDeviceId,
  loadOutputDevices, setOutputDevice,
  remoteAvailable, remoteSupported, remoteState, promptRemotePlayback,
  togglePlay, nextTrack, prevTrack, playPlaylist,
  seek, setVolume, stopPlayback,
  toggleShuffle, toggleLoop,
} = useSoundPlayer()

const { playlists, trackCount, getPlaylistById, getPlaylistTracks } = useSounds()

const panelOpen = ref(false)

function closePanel() { if (!props.inline) panelOpen.value = false }

function startPlaylist(pl: DbSoundPlaylist) {
  const tracks = getPlaylistTracks(pl)
  if (tracks.length) playPlaylist(pl, tracks)
}

// ── Encounter-linked playlist notification ─────────────────────────────────
const encounterStore = useEncounterStore()
const notifDismissedId = ref<number | null>(null)

const linkedPlaylistNotif = computed(() => {
  const id = encounterStore.current?.soundPlaylistId
  if (!id || notifDismissedId.value === id) return null
  if (currentPlaylist.value?.id === id) return null
  return getPlaylistById(id)
})

watch(() => encounterStore.current?.soundPlaylistId, () => {
  notifDismissedId.value = null
})

function dismissNotif() {
  notifDismissedId.value = linkedPlaylistNotif.value!.id!
}

async function playLinkedPlaylist() {
  const pl = linkedPlaylistNotif.value
  if (!pl) return
  const tracks = getPlaylistTracks(pl)
  await playPlaylist(pl, tracks)
  notifDismissedId.value = pl.id ?? null
  panelOpen.value = false
}

// ── Device picker ──────────────────────────────────────────────────────────
const showDevicePicker = ref(false)
const devWrapRef = ref<HTMLElement | null>(null)

async function toggleDevicePicker() {
  if (!showDevicePicker.value) {
    if (!outputDevices.value.length) await loadOutputDevices()
    showDevicePicker.value = true
  } else {
    showDevicePicker.value = false
  }
}

async function selectDevice(deviceId: string) {
  await setOutputDevice(deviceId)
  showDevicePicker.value = false
}

function onDocClick(e: MouseEvent) {
  if (devWrapRef.value && !devWrapRef.value.contains(e.target as Node))
    showDevicePicker.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))
</script>

<style scoped>
/* ── FAB group (positions both FAB and notification) ─────────── */
.sp-fab-group {
  position: fixed;
  bottom: 68px;
  right: 20px;
  z-index: 199;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-direction: row;
}

/* ── FAB trigger ────────────────────────────────────────────── */
.sp-fab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px 8px 10px;
  border-radius: 99px;
  background: var(--surface-solid, var(--bg2));
  border: 1px solid var(--border);
  box-shadow: var(--sh-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--text2);
  transition: border-color 0.18s, color 0.18s, box-shadow 0.18s;
  user-select: none;
  max-width: 200px;
}
.sp-fab:hover { border-color: var(--border-hi, var(--border)); color: var(--text); }
.sp-fab--open { border-color: var(--border-hi, var(--border)); color: var(--text); }
.sp-fab--playing {
  border-color: color-mix(in oklch, var(--accent) 60%, var(--border));
  animation: sp-pulse 2.4s ease-in-out infinite;
}
@keyframes sp-pulse {
  0%, 100% { box-shadow: var(--sh-md), 0 0 0 0 color-mix(in oklch, var(--accent) 30%, transparent); }
  50%       { box-shadow: var(--sh-md), 0 0 0 6px color-mix(in oklch, var(--accent) 0%, transparent); }
}

.sp-fab-icon { font-size: 15px; line-height: 1; flex-shrink: 0; }
.sp-fab-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Encounter music notification chip ───────────────────────── */
.sp-notif {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 99px;
  background: var(--surface-solid, var(--bg2));
  border: 1px solid color-mix(in oklch, var(--accent) 50%, var(--border));
  box-shadow: var(--sh-md);
  font-size: 12px;
  font-family: var(--font-body);
  white-space: nowrap;
  max-width: 260px;
}
.sp-notif-name {
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.sp-notif-play {
  background: var(--accent-l, var(--accent));
  color: var(--bg, #fff);
  border: none;
  border-radius: 99px;
  padding: 2px 10px;
  font-size: 11px;
  font-family: var(--font-body);
  cursor: pointer;
  white-space: nowrap;
  font-weight: 600;
}
.sp-notif-play:hover { filter: brightness(1.1); }
.sp-notif-dismiss {
  background: none;
  border: none;
  color: var(--text3);
  font-size: 15px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}
.sp-notif-dismiss:hover { color: var(--text); }

/* Notification slide-in transition */
.sp-notif-enter-active { transition: opacity 0.2s, transform 0.2s; }
.sp-notif-leave-active { transition: opacity 0.15s, transform 0.15s; }
.sp-notif-enter-from  { opacity: 0; transform: translateX(12px); }
.sp-notif-leave-to    { opacity: 0; transform: translateX(12px); }

/* Equaliser bars */
.sp-eq { display: flex; align-items: flex-end; gap: 2px; height: 14px; }
.sp-eq-bar {
  width: 3px; border-radius: 1px;
  background: color-mix(in oklch, var(--accent) 80%, var(--text));
  animation: sp-eq 1s ease-in-out infinite;
}
.sp-eq-bar:nth-child(1) { height: 7px; animation-delay: 0s; }
.sp-eq-bar:nth-child(2) { height: 13px; animation-delay: 0.2s; }
.sp-eq-bar:nth-child(3) { height: 5px; animation-delay: 0.4s; }
@keyframes sp-eq {
  0%, 100% { transform: scaleY(1); }
  50%       { transform: scaleY(0.35); }
}

/* ── Panel ───────────────────────────────────────────────────── */
.sp-panel {
  position: fixed;
  bottom: 116px;
  right: 20px;
  z-index: 201;
  width: 300px;
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--r3);
  box-shadow: var(--sh-lg);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sp-panel--inline {
  position: static;
  width: 100%;
  box-shadow: none;
  border-radius: var(--r2);
  background: transparent;
  border: none;
}

/* Playlist picker */
.sp-pl-header { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text3); font-family: var(--fm); }
.sp-pl-list { display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow-y: auto; }
.sp-pl-item {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 7px 8px; border: none; border-radius: var(--r1);
  background: none; cursor: pointer; text-align: left;
  transition: background 0.12s;
}
.sp-pl-item:hover { background: var(--surface-hi); }
.sp-pl-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pl-color); flex-shrink: 0; }
.sp-pl-name { flex: 1; font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-pl-count { font-size: 11px; color: var(--text3); flex-shrink: 0; }
.sp-empty { font-size: 12px; color: var(--text3); text-align: center; padding: 8px 0; }

/* Header */
.sp-hdr { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sp-hdr-icon {
  width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 13px;
  background: color-mix(in oklch, var(--accent) 12%, transparent);
}
.sp-hdr-meta { flex: 1; min-width: 0; }
.sp-hdr-name { display: block; font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-hdr-sub  { display: block; font-size: 10px; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-hdr-error { display: block; font-size: 10px; color: var(--danger, #e05555); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: help; }
.sp-hdr-stop { background: none; border: none; color: var(--text3); cursor: pointer; font-size: 11px; padding: 4px; border-radius: 3px; flex-shrink: 0; }
.sp-hdr-stop:hover { color: var(--text); background: var(--bg); }

/* Spotify */
.sp-spotify-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.sp-spotify-msg { font-size: 12px; color: var(--text3); }
.sp-spotify-link { font-size: 12px; font-weight: 600; color: #1db954; text-decoration: none; }
.sp-spotify-link:hover { text-decoration: underline; }

/* Progress */
.sp-progress { display: flex; align-items: center; gap: 6px; }
.sp-time { font-size: 10px; color: var(--text3); font-family: var(--fm); width: 28px; flex-shrink: 0; }
.sp-time--r { text-align: right; }
.sp-seek {
  flex: 1; height: 3px; appearance: none;
  background: var(--border); border-radius: 2px; cursor: pointer; accent-color: var(--accent);
}
.sp-seek::-webkit-slider-thumb { appearance: none; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); cursor: pointer; }

/* Transport */
.sp-transport { display: flex; align-items: center; justify-content: center; gap: 12px; }
.sp-btn {
  background: none; border: none; cursor: pointer;
  font-size: 14px; color: var(--text2); padding: 3px 6px; border-radius: 4px;
  transition: color 0.1s; line-height: 1;
}
.sp-btn:hover { color: var(--text); }
.sp-btn--play { font-size: 20px; color: var(--text); }
.sp-btn--sm { font-size: 11px; color: var(--text3); }
.sp-btn--sm:hover { color: var(--text); }
.sp-btn--sm.active { color: var(--accent-l, var(--accent)); }
.sp-btn--cast-available { color: var(--text2); }
.sp-spin { display: inline-block; animation: sp-spin 0.8s linear infinite; }
@keyframes sp-spin { to { transform: rotate(360deg); } }

/* Volume */
.sp-vol-row { display: flex; align-items: center; gap: 8px; }
.sp-vol-icon { font-size: 13px; flex-shrink: 0; }
.sp-vol {
  flex: 1; height: 3px; appearance: none;
  background: var(--border); border-radius: 2px; accent-color: var(--accent); cursor: pointer;
}
.sp-vol::-webkit-slider-thumb { appearance: none; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); cursor: pointer; }

/* Footer */
.sp-footer { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; border-top: 1px solid var(--border); padding-top: 8px; }

/* Device picker */
.sp-dev-wrap { position: relative; margin-left: auto; }
.sp-dev-menu {
  position: absolute; bottom: calc(100% + 6px); right: 0;
  width: 240px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 6px 0; box-shadow: 0 4px 20px rgba(0,0,0,0.25); z-index: 10;
}
.sp-dev-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text3); font-family: var(--fm); padding: 4px 12px 6px; }
.sp-dev-empty { font-size: 12px; color: var(--text3); padding: 8px 12px; text-align: center; }
.sp-dev-refresh { display: inline-block; margin-top: 6px; font-size: 11px; background: none; border: 1px solid var(--border); border-radius: 4px; padding: 3px 10px; cursor: pointer; color: var(--text2); }
.sp-dev-refresh:hover { color: var(--text); }
.sp-dev-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 12px; background: none; border: none; cursor: pointer; font-size: 12px; color: var(--text2); text-align: left; transition: background 0.1s; }
.sp-dev-item:hover { background: var(--bg); color: var(--text); }
.sp-dev-item.active { color: var(--accent-l, var(--accent)); }
.sp-dev-check { width: 14px; font-size: 11px; flex-shrink: 0; }
.sp-dev-note { font-size: 10px; color: var(--text3); padding: 8px 12px 4px; border-top: 1px solid var(--border); margin-top: 4px; line-height: 1.5; }

/* Transition */
.sp-panel-enter-active, .sp-panel-leave-active { transition: transform 0.15s ease, opacity 0.15s ease; }
.sp-panel-enter-from, .sp-panel-leave-to { transform: translateY(8px) scale(0.97); opacity: 0; }
</style>
