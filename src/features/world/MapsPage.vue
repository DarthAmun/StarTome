<script setup lang="ts">
/** Maps: the locations of the campaign, those with a map image first. */
import { computed } from 'vue'
import type { Entry, EntryOf } from '@/domain/schema'
import { entries } from '@/data/repo'
import { useLive } from '@/ui/useLive'
import EntryThumb from './EntryThumb.vue'
import WorldTabs from './WorldTabs.vue'

const props = defineProps<{ campaignId: string }>()
const all = useLive<Entry[]>(() => entries.ofType(props.campaignId, 'location'), [], [() => props.campaignId])
const locations = computed(() => all.value.filter((e): e is EntryOf<'location'> => e.type === 'location').sort((a, b) => Number(!!b.data.map) - Number(!!a.data.map) || a.name.localeCompare(b.name)))
</script>

<template>
  <div class="wrap">
    <WorldTabs />
    <div class="page">
      <div class="page-head"><h1>Maps</h1><span class="faint">{{ locations.filter(l => l.data.map).length }} with a map image</span></div>
      <p v-if="!locations.length" class="empty">Maps belong to locations. Create a location in World › Entries and give it a map image.</p>
      <div class="grid">
        <RouterLink v-for="l in locations" :key="l.id" :to="{ name: 'map', params: { campaignId, entryId: l.id } }" class="card panel" :class="{ none: !l.data.map }">
          <EntryThumb :entry="l" /><div><div class="name">{{ l.name }}</div><div class="faint">{{ l.data.map ? 'Open map' : 'No map image yet' }}</div></div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap { height: 100%; display: flex; flex-direction: column; }
.wrap .page { flex: 1; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: .6rem; }
.card { display: flex; align-items: center; gap: .7rem; padding: .6rem .8rem; color: var(--text); }
.card:hover { border-color: var(--accent); text-decoration: none; }
.card.none { opacity: .55; }
.name { font-weight: 600; }
</style>
