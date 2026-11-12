<template>
  <div class="graph-player-view">
    <NotesGraph
      v-if="loaded && graphId"
      :campaign-id="campaignId"
      :graph-id="graphId"
      :player-view="true"
    />
    <div v-else class="graph-player-loading">
      <span>Loading graph…</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEntities } from '~/composables/useEntities'

const route = useRoute()
const store = useEntities()

const campaignId = Number(route.params.id)
const graphId = computed(() => {
  const g = route.query.graphId
  return g ? Number(g) : null
})
const loaded = ref(false)

onMounted(async () => {
  await store.loadAll(campaignId)
  loaded.value = true
})
</script>

<style scoped>
.graph-player-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow: hidden;
}

.graph-player-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text3);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
</style>
