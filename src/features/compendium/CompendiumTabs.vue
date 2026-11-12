<script setup lang="ts">
/** The views of the compendium: browse it, sync it from Foundry, bring in homebrew. */
import { useRoute } from 'vue-router'

const route = useRoute()
const TABS = [['compendium', 'Browse'], ['compendium-sync', 'Foundry sync'], ['compendium-homebrew', 'Homebrew'], ['compendium-art', 'Art']] as const
</script>

<template>
  <nav class="tabs" aria-label="Compendium views">
    <RouterLink v-for="[name, label] in TABS" :key="name" :to="{ name }" class="tab" :class="{ on: route.name === name }">{{ label }}</RouterLink>
  </nav>
</template>

<style scoped>
.tabs { display: flex; gap: 2px; padding: 0 1rem; border-bottom: var(--frame); background: var(--bg-sunken); }
.tab { padding: .45rem .9rem; color: var(--text-faint); border-bottom: 2px solid transparent; font-size: .9rem; }
.tab:hover { color: var(--text); text-decoration: none; }
.tab.on { color: var(--accent); border-bottom-color: var(--accent); }
</style>
