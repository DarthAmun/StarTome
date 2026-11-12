<script setup lang="ts">
/** Timeline: the campaign's events in the order of their dates (dates sort as text, so write them year first). */
import { computed } from 'vue'
import type { Entry, EntryOf } from '@/domain/schema'
import { entries } from '@/data/repo'
import { excerpt } from '@/ui/markdown'
import { useLive } from '@/ui/useLive'
import { peek } from '@/ui/workbench'
import WorldTabs from './WorldTabs.vue'

const props = defineProps<{ campaignId: string }>()
const all = useLive<Entry[]>(() => entries.ofType(props.campaignId, 'event'), [], [() => props.campaignId])
const events = computed(() => all.value.filter((e): e is EntryOf<'event'> => e.type === 'event').sort((a, b) => (a.data.date || '\uffff').localeCompare(b.data.date || '\uffff') || a.name.localeCompare(b.name)))
const COLOR: Record<string, string> = { critical: 'var(--danger)', major: 'var(--accent)', minor: 'var(--text-faint)' }
</script>

<template>
  <div class="wrap">
    <WorldTabs />
    <div class="page">
      <div class="page-head"><h1>Timeline</h1><span class="faint">{{ events.length }} events</span></div>
      <p v-if="!events.length" class="empty">No events yet. Create one in World › Entries.</p>
      <ol class="line">
        <li v-for="e in events" :key="e.id" :style="{ '--c': COLOR[e.data.significance ?? ''] ?? 'var(--t-event)' }" @click="peek({ kind: 'entry', id: e.id })">
          <div class="date num">{{ e.data.date || 'undated' }}</div>
          <div class="what"><h3>{{ e.name }}</h3><p class="dim">{{ [e.data.location && `@ ${e.data.location}`, excerpt(e.body, 200)].filter(Boolean).join(' · ') }}</p></div>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.wrap { height: 100%; display: flex; flex-direction: column; }
.wrap .page { flex: 1; }
.line { list-style: none; margin: 0; padding: 0 0 0 1rem; border-left: 2px solid var(--line-strong); max-width: 820px; }
.line li { position: relative; display: grid; grid-template-columns: 130px 1fr; gap: 1rem; padding: .6rem 0 .6rem 1.2rem; cursor: pointer; }
.line li::before { content: ''; position: absolute; left: calc(-1rem - 7px); top: 1rem; width: 12px; height: 12px; border-radius: 50%; background: var(--c); border: 2px solid var(--bg); }
.line li:hover h3 { color: var(--accent); }
.date { color: var(--c); padding-top: .1rem; }
.what p { margin: .2rem 0 0; }
</style>
