<script setup lang="ts">
/** The views of World: the same entries as a list, on maps, as graphs, on a timeline. */
import { useRoute } from 'vue-router'
import { campaignId } from '@/ui/workbench'

const route = useRoute()
const TABS = [['world', 'Entries'], ['maps', 'Maps'], ['graphs', 'Graphs'], ['timeline', 'Timeline']] as const
const on = (name: string) => route.name === name || (name === 'maps' && route.name === 'map') || (name === 'world' && route.name === 'entry')
</script>

<template>
  <nav v-if="campaignId" class="tabs" aria-label="World views">
    <RouterLink v-for="[name, label] in TABS" :key="name" :to="{ name, params: { campaignId } }" class="tab" :class="{ on: on(name) }">{{ label }}</RouterLink>
  </nav>
</template>

<style scoped>
.tabs { display: flex; gap: 2px; padding: 0 1rem; border-bottom: var(--frame); background: var(--bg-sunken); }
.tab { padding: .45rem .9rem; color: var(--text-faint); border-bottom: 2px solid transparent; font-size: .9rem; }
.tab:hover { color: var(--text); text-decoration: none; }
.tab.on { color: var(--accent); border-bottom-color: var(--accent); }
</style>
