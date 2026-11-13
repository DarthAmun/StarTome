<script setup lang="ts">
/** The token library as a page of its own. */
import EncounterTabs from './EncounterTabs.vue'
import TokenLibrary from './TokenLibrary.vue'

defineProps<{ campaignId: string }>()
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>Encounters</h1></div>
    <EncounterTabs :campaign-id="campaignId" />
    <p class="faint">Tokens you place again and again, shared by all campaigns. Open an encounter to drag them onto its map.</p>
    <TokenLibrary />
  </div>
</template>
