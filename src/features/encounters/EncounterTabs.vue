<script setup lang="ts">
/** The views of Encounters: the list, the builder and the token library. */
defineProps<{ campaignId: string }>()
const TABS = [['encounters', 'Encounters'], ['encounter-builder', 'Builder'], ['encounter-tokens', 'Token library']] as const
</script>

<template>
  <nav class="tabs">
    <RouterLink v-for="[name, label] in TABS" :key="name" :to="{ name, params: { campaignId } }" class="tab" exact-active-class="on">{{ label }}</RouterLink>
  </nav>
</template>

<style scoped>
.tabs { display: flex; gap: .2rem; margin-bottom: 1.1rem; border-bottom: var(--frame); }
.tab { padding: .4rem .9rem; color: var(--text-dim); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab:hover { color: var(--text); text-decoration: none; } .tab.on { color: var(--accent); border-bottom-color: var(--accent); }
</style>
