<script setup lang="ts">
/** The players' map window: the map the GM has open, without hidden pins and without any GM controls. */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { entries } from '@/data/repo'
import { onPlayerMessage, sendToPlayers } from '@/services/playerLink'
import { useLive } from '@/ui/useLive'
import MapCanvas from './MapCanvas.vue'

const mapId = ref<string | null>(null)
const entry = useLive(() => (mapId.value ? entries.get(mapId.value) : Promise.resolve(undefined)), undefined, [mapId])
const map = computed(() => (entry.value?.type === 'location' ? entry.value : null))
let stop: (() => void) | null = null
onMounted(() => {
  stop = onPlayerMessage('map', (m) => { mapId.value = m.mapEntryId })
  // Ask the GM window which map is open (it may have been open before this window)
  sendToPlayers({ type: 'hello', channel: 'map' })
})
onUnmounted(() => stop?.())
</script>

<template>
  <div class="player">
    <MapCanvas v-if="map" :map="map" player />
    <p v-else class="empty">Waiting for the GM to open a map…</p>
  </div>
</template>

<style scoped>
.player { height: 100vh; background: var(--bg-sunken); display: grid; }
</style>
