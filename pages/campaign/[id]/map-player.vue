<template>
  <div class="map-player-view">
    <WorldMap
      v-if="locationId"
      :campaign-id="campaignId"
      :root-location-id="locationId"
      :location-stack="[]"
      :player-mode="true"
    />
    <div v-else class="map-waiting">
      <OhVueIcon name="gi-treasure-map" scale="4" style="opacity:0.12;margin-bottom:20px" />
      <p class="map-waiting-text">Waiting for the GM to share a map…</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { channelName } from '~/utils/appNamespace'
// window.dmstome used for file dialog / IPC only
import { useEntities } from '~/composables/useEntities'

const route = useRoute()
const store = useEntities()

const campaignId = Number(route.params.id)
const locationId = ref<number | null>(
  route.query.locationId ? Number(route.query.locationId) : null
)

onMounted(async () => {
  await store.loadAll(campaignId)

  window.dmstome.window.onMapSync(async (newLocationId) => {
    locationId.value = newLocationId
    if (newLocationId) await store.loadAll(campaignId)
  })

  window.addEventListener('beforeunload', () => {
    const ch = new BroadcastChannel(channelName('map'))
    ch.postMessage({ type: 'map-player-closed' })
    ch.close()
  })
})

onUnmounted(() => {
  window.dmstome.window.offMapSync()
})
</script>

<style scoped>
.map-player-view {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--void);
}

.map-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.3); /* translucent white on void — no variable */
}

.map-waiting-text {
  font-family: var(--font-body);
  font-size: 14px;
  font-style: italic;
}
</style>
