<script setup lang="ts">
/** A lore entry on the Desk: its picture, facts and text. Its name opens it in the dock, where it is edited. A random table can be rolled here. */
import { ref } from 'vue'
import { rollOnTable } from '@/domain/rules/sessionBoard'
import { entries } from '@/data/repo'
import { entryFacts, entryImage } from '@/features/shared/facts'
import ProseText from '@/features/shared/ProseText.vue'
import { useImageUrl } from '@/ui/imageUrl'
import { useLive } from '@/ui/useLive'
import { peek } from '@/ui/workbench'

const props = defineProps<{ entryId: string }>()
const entry = useLive(async () => (await entries.get(props.entryId)) ?? null, undefined, [() => props.entryId])
const img = useImageUrl(() => (entry.value ? entryImage(entry.value) : null))
const result = ref('')
function roll() { const e = entry.value; if (e?.type === 'random-table') { const r = rollOnTable(e.data); result.value = `${r.roll}: ${r.result}` } }
</script>

<template>
  <div v-if="entry" class="ew">
    <img v-if="img" :src="img" alt="" />
    <div class="body">
      <button class="name" @click="peek({ kind: 'entry', id: entry.id })">{{ entry.name }}</button>
      <p v-if="entryFacts(entry).length" class="facts faint"><span v-for="[k, v] in entryFacts(entry)" :key="k"><i>{{ k }}</i> {{ v }}</span></p>
      <div v-if="entry.type === 'random-table'" class="roll"><button class="btn" @click="roll">Roll {{ entry.data.die }}</button><ProseText v-if="result" :text="result" :campaign-id="entry.campaignId" /></div>
      <ProseText :text="entry.body" :campaign-id="entry.campaignId" />
    </div>
  </div>
  <p v-else-if="entry === null" class="faint">This entry was deleted.</p>
</template>

<style scoped>
.ew { display: flex; gap: .6rem; } img { width: 64px; height: 64px; object-fit: cover; border-radius: var(--radius); flex: none; } .body { min-width: 0; flex: 1; }
.name { background: none; border: 0; padding: 0; font-family: var(--font-title); font-size: 1rem; color: var(--text); text-align: left; } .name:hover { color: var(--accent); }
.facts { display: flex; flex-wrap: wrap; gap: .1rem .7rem; margin: .1rem 0 .3rem; font-size: .8rem; } .facts i { font-style: normal; color: var(--text-faint); } .roll { display: flex; gap: .5rem; align-items: center; margin-bottom: .3rem; }
</style>
