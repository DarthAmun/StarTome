<script setup lang="ts">
/** The players' graph window: the graph the GM has open, without hidden entries or hidden facts. */
import { onMounted, onUnmounted, ref } from 'vue'
import { graphs } from '@/data/graphs'
import { workspace } from '@/data/repo'
import { onPlayerMessage, sendToPlayers } from '@/services/playerLink'
import { useLive } from '@/ui/useLive'
import GraphCanvas from './GraphCanvas.vue'

const graphId = ref<string | null>(null)
const graph = useLive(() => (graphId.value ? graphs.get(graphId.value) : Promise.resolve(undefined)), undefined, [graphId])
const facts = useLive(() => (graph.value ? workspace.get(graph.value.campaignId, 'graph.facts', false) : Promise.resolve(false)), false, [() => graph.value?.campaignId])
let stop: (() => void) | null = null
onMounted(() => {
  stop = onPlayerMessage('graph', (m) => { graphId.value = m.graphId })
  sendToPlayers({ type: 'hello', channel: 'graph' })
})
onUnmounted(() => stop?.())
</script>

<template>
  <div class="player">
    <GraphCanvas v-if="graph" :key="graph.id" :graph="graph" :facts="facts" player />
    <p v-else class="empty">Waiting for the GM to open a graph…</p>
  </div>
</template>

<style scoped>
.player { height: 100vh; display: grid; }
</style>
