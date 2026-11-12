<script setup lang="ts">
/** A compendium entry in the dock. Phase 3 replaces this summary with the full stat block and its rolls. */
import { computed } from 'vue'
import { getRow } from '@/data/repo'
import { renderMarkdown } from '@/ui/markdown'
import { useLive } from '@/ui/useLive'

const props = defineProps<{ rulesId: string }>()
const row = useLive(() => getRow('rules', props.rulesId), undefined, [() => props.rulesId])
const html = computed(() => renderMarkdown(typeof row.value?.description === 'string' ? row.value.description : ''))
const traits = computed(() => (Array.isArray(row.value?.traits) ? row.value.traits.map(String) : []))
</script>

<template>
  <article v-if="row" class="rules">
    <div class="eyebrow">{{ row.kind }} · level {{ row.level }} · {{ row.game }}</div>
    <h1>{{ row.name }}</h1>
    <div v-if="traits.length" class="traits"><span v-for="t in traits" :key="t" class="chip">{{ t }}</span></div>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown -->
    <div class="prose" v-html="html" />
    <p class="faint note">The full stat block with rolls arrives with the Compendium phase.</p>
  </article>
  <p v-else class="empty">Not in the compendium.</p>
</template>

<style scoped>
.rules { padding: 1.2rem 1.4rem 2rem; }
.rules h1 { font-size: 1.5rem; margin: .25rem 0 .6rem; }
.traits { display: flex; flex-wrap: wrap; gap: .3rem; margin-bottom: 1rem; }
.note { margin-top: 1.5rem; font-size: .85rem; }
</style>
