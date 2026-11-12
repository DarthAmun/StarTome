<script setup lang="ts">
/** The rail: seven places instead of a tree of links. */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { campaignId } from '@/ui/workbench'
import { PLACES, UTILITIES, type Place } from './places'

const route = useRoute()
const logo = `${import.meta.env.BASE_URL}icons/icon-192.png`
const active = computed(() => (route.name === 'entry' ? 'world' : String(route.name ?? '')))

function to(p: Place) {
  if (!p.campaign) return { name: p.name }
  return campaignId.value ? { name: p.name, params: { campaignId: campaignId.value } } : { name: 'welcome' }
}
</script>

<template>
  <nav class="rail" aria-label="Places">
    <RouterLink :to="{ name: 'welcome' }" class="mark" title="Campaigns"><img :src="logo" alt="StarTome" width="30" height="30" /></RouterLink>
    <RouterLink v-for="p in PLACES" :key="p.name" :to="to(p)" class="place" :class="{ on: active === p.name, later: p.phase, off: p.campaign && !campaignId }" :title="p.label">
      <component :is="p.icon" :size="20" :stroke-width="1.6" /><span>{{ p.label }}</span>
    </RouterLink>
    <div class="gap" />
    <RouterLink v-for="p in UTILITIES" :key="p.name" :to="to(p)" class="place small" :class="{ on: active === p.name, later: p.phase }" :title="p.label">
      <component :is="p.icon" :size="18" :stroke-width="1.6" />
    </RouterLink>
  </nav>
</template>

<style scoped>
.rail { grid-row: 1 / -1; display: flex; flex-direction: column; align-items: stretch; background: var(--bg-sunken); border-right: var(--frame); padding: .5rem 0; gap: 2px; }
.mark { display: grid; place-items: center; height: 40px; margin-bottom: .5rem; }
.place { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: .5rem 0 .4rem; color: var(--text-faint); border-left: 2px solid transparent; font-size: .62rem; letter-spacing: .06em; text-transform: uppercase; }
.place:hover { color: var(--text); text-decoration: none; background: var(--bg-hover); }
.place.on { color: var(--accent); border-left-color: var(--accent); background: var(--accent-soft); }
.place.later { opacity: .5; }
.place.off { pointer-events: none; opacity: .3; }
.place.small { padding: .55rem 0; }
.gap { flex: 1; }
</style>
