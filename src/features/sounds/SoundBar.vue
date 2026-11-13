<script setup lang="ts">
/** The player, on every screen while something is queued: transport, seek, volume, shuffle and loop, a playlist menu, and where the sound goes. */
import { computed, ref } from 'vue'
import { ListMusic, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Speaker, Volume2, X } from 'lucide-vue-next'
import { sounds } from '@/data/sounds'
import { canPickDevice, next, outputDevices, playPlaylist, player, previous, seek, setDevice, setVolume, stop, toggle } from '@/services/soundPlayer'
import { useLive } from '@/ui/useLive'

const playlists = useLive(() => sounds.playlists(), [])
const track = computed(() => player.queue[player.index] ?? null)
const menu = ref<'none' | 'lists' | 'devices'>('none')
const devices = ref<{ id: string; label: string }[]>([])
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
async function openDevices() { menu.value = menu.value === 'devices' ? 'none' : 'devices'; devices.value = await outputDevices() }
</script>

<template>
  <div v-if="player.queue.length" class="soundbar panel" data-test="sound-bar">
    <button class="btn btn-ghost btn-icon" aria-label="Previous track" @click="previous"><SkipBack :size="14" /></button>
    <button class="btn btn-icon btn-primary" :aria-label="player.playing ? 'Pause' : 'Play'" @click="toggle"><Pause v-if="player.playing" :size="15" /><Play v-else :size="15" /></button>
    <button class="btn btn-ghost btn-icon" aria-label="Next track" @click="next()"><SkipForward :size="14" /></button>
    <span class="what" :title="player.error || track?.name"><b>{{ track?.name ?? '—' }}</b><small :class="player.error ? 'err' : 'faint'">{{ player.error || player.source }}</small></span>
    <input class="seek" type="range" min="0" :max="player.duration || 0" step="1" :value="player.time" aria-label="Seek" @input="seek(Number(($event.target as HTMLInputElement).value))" />
    <span class="num faint time">{{ clock(player.time) }}<template v-if="player.duration"> / {{ clock(player.duration) }}</template></span>
    <button class="btn btn-ghost btn-icon" :class="{ on: player.shuffle }" title="Shuffle" @click="player.shuffle = !player.shuffle"><Shuffle :size="14" /></button>
    <button class="btn btn-ghost btn-icon" :class="{ on: player.loop }" title="Loop" @click="player.loop = !player.loop"><Repeat :size="14" /></button>
    <Volume2 :size="14" class="faint" /><input class="vol" type="range" min="0" max="1" step="0.02" :value="player.volume" aria-label="Volume" @input="setVolume(Number(($event.target as HTMLInputElement).value))" />
    <button class="btn btn-ghost btn-icon" title="Playlists" @click="menu = menu === 'lists' ? 'none' : 'lists'"><ListMusic :size="14" /></button>
    <button v-if="canPickDevice()" class="btn btn-ghost btn-icon" title="Where the sound goes" @click="openDevices"><Speaker :size="14" /></button>
    <button class="btn btn-ghost btn-icon" aria-label="Stop and close the player" @click="stop"><X :size="14" /></button>
    <div v-if="menu !== 'none'" class="menu panel">
      <template v-if="menu === 'lists'"><button v-for="p in playlists" :key="p.id" @click="playPlaylist(p.id); menu = 'none'">{{ p.name }}</button><span v-if="!playlists.length" class="faint">No playlists yet.</span></template>
      <template v-else><button v-for="d in devices" :key="d.id" :class="{ on: player.deviceId === d.id }" @click="setDevice(d.id); menu = 'none'">{{ d.label }}</button><span v-if="!devices.length" class="faint">No outputs found.</span></template>
    </div>
  </div>
</template>

<style scoped>
.soundbar { position: fixed; right: 1rem; bottom: calc(var(--tray-h) + .5rem); z-index: 20; display: flex; align-items: center; gap: .3rem; padding: .3rem .5rem; box-shadow: var(--shadow); max-width: min(52rem, 92vw); }
.what { display: flex; flex-direction: column; width: 11rem; min-width: 0; line-height: 1.15; } .what b, .what small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .err { color: var(--danger); }
.seek { width: 9rem; } .vol { width: 5rem; } .time { font-size: .76rem; white-space: nowrap; } .on { color: var(--accent); }
.menu { position: absolute; right: 0; bottom: 100%; margin-bottom: .3rem; display: flex; flex-direction: column; padding: .3rem; min-width: 12rem; max-height: 50vh; overflow: auto; box-shadow: var(--shadow); }
.menu button { background: none; border: 0; text-align: left; padding: .25rem .5rem; border-radius: var(--radius); } .menu button:hover { background: var(--bg-hover); } .menu span { padding: .25rem .5rem; }
</style>
