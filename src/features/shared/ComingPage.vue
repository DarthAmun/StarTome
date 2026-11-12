<script setup lang="ts">
/** A place of the new app that a later phase of the rework builds. */
defineProps<{ title: string; phase: number; holds: string }>()
</script>

<template>
  <div class="page coming">
    <div class="eyebrow">Phase {{ phase }} of the rework</div>
    <h1>{{ title }}</h1>
    <p class="dim">{{ holds }}</p>
    <p class="faint">Not built yet. Your data for it is already imported and kept; until this is ready, use v0.42 for it.</p>
  </div>
</template>

<style scoped>
.coming { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: .6rem; }
.coming p { max-width: 520px; }
</style>
