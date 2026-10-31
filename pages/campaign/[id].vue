<template>
  <NuxtPage />
</template>

<script setup lang="ts">
import { useEntities } from '~/composables/useEntities'
import { usePlayBuddy } from '~/composables/usePlayBuddy'
const route = useRoute()
const notesStore = useEntities()
const playBuddy = usePlayBuddy()

// Pre-load entities for this campaign so sidebar counts work
onMounted(async () => {
  const id = Number(route.params.id)
  if (id) await notesStore.loadAll(id)
})

// Follow the linked Play Buddy game (if any) while this campaign is open
watch(() => Number(route.params.id), (id) => { if (id) void playBuddy.startLive(id) }, { immediate: true })
onUnmounted(() => playBuddy.stopLive())
</script>
