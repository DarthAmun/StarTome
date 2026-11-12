<script setup lang="ts">
/** An entry as a full page. */
import { ArrowLeft } from 'lucide-vue-next'
import EntryView from './EntryView.vue'

defineProps<{ campaignId: string; entryId: string }>()
</script>

<template>
  <div class="page" style="padding-top:.8rem">
    <RouterLink :to="{ name: 'world', params: { campaignId } }" class="btn btn-ghost"><ArrowLeft :size="14" /> World</RouterLink>
    <div class="sheet panel"><EntryView :entry-id="entryId" full /></div>
  </div>
</template>

<style scoped>
.sheet { max-width: 860px; margin: .8rem auto 0; }
</style>
