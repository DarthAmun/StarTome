<script setup lang="ts">
/**
 * A lore entry on the Desk: its picture, facts and text. The pencil swaps the card for the entry's
 * full view, so it is edited where it stands; the name opens it in the dock. A random table is rolled
 * here, and a location with a map shows it: a pinned location with a map of its own steps into it.
 */
import { computed, ref } from 'vue'
import { ArrowLeft, Check, Pencil } from 'lucide-vue-next'
import { rollOnTable } from '@/domain/rules/sessionBoard'
import type { Entry, EntryOf, MapPin } from '@/domain/schema'
import { entries } from '@/data/repo'
import { entryFacts, entryImage } from '@/features/shared/facts'
import ProseText from '@/features/shared/ProseText.vue'
import EntryView from '@/features/world/EntryView.vue'
import MapCanvas from '@/features/world/MapCanvas.vue'
import { useImageUrl } from '@/ui/imageUrl'
import { useLive } from '@/ui/useLive'
import { peek } from '@/ui/workbench'

const props = defineProps<{ entryId: string }>()
const entry = useLive(async () => (await entries.get(props.entryId)) ?? null, undefined, [() => props.entryId])
const img = useImageUrl(() => (entry.value ? entryImage(entry.value) : null))
const result = ref('')
const editing = ref(false)

// The map shown: this location's, or the one stepped into from a pin
const trail = ref<EntryOf<'location'>[]>([])
const shownMap = computed<EntryOf<'location'> | null>(() => {
  const e = trail.value.at(-1) ?? entry.value
  return e?.type === 'location' && e.data.map ? e : null
})
function onPin(_pin: MapPin, target: Entry) {
  if (target.type === 'location' && target.data.map) trail.value = [...trail.value, target]
  else peek({ kind: 'entry', id: target.id })
}

function roll() { const e = entry.value; if (e?.type === 'random-table') { const r = rollOnTable(e.data); result.value = `${r.roll}: ${r.result}` } }
</script>

<template>
  <div v-if="entry && editing" class="edit" data-test="desk-entry-edit">
    <button class="btn done" @click="editing = false"><Check :size="13" /> Done</button>
    <EntryView :entry-id="entry.id" />
  </div>
  <div v-else-if="entry" class="ew" :class="{ mapped: shownMap }">
    <div class="card">
      <img v-if="img" :src="img" alt="" />
      <div class="body">
        <div class="head"><button class="name" @click="peek({ kind: 'entry', id: entry.id })">{{ entry.name }}</button><button class="btn btn-ghost btn-icon" title="Edit here" :aria-label="`Edit ${entry.name} here`" data-test="desk-entry-pencil" @click="editing = true"><Pencil :size="13" /></button></div>
        <p v-if="entryFacts(entry).length" class="facts faint"><span v-for="[k, v] in entryFacts(entry)" :key="k"><i>{{ k }}</i> {{ v }}</span></p>
        <div v-if="entry.type === 'random-table'" class="roll"><button class="btn" @click="roll">Roll {{ entry.data.die }}</button><ProseText v-if="result" :text="result" :campaign-id="entry.campaignId" /></div>
        <ProseText :text="entry.body" :campaign-id="entry.campaignId" />
      </div>
    </div>
    <div v-if="shownMap" class="map" data-test="desk-map" @wheel.stop @pointerdown.stop>
      <div v-if="trail.length" class="crumb"><button class="btn" @click="trail = trail.slice(0, -1)"><ArrowLeft :size="13" /> Back</button> <button class="name" @click="peek({ kind: 'entry', id: shownMap.id })">{{ shownMap.name }}</button></div>
      <MapCanvas :map="shownMap" @pin="onPin" @region="peek({ kind: 'entry', id: $event.id })" />
    </div>
  </div>
  <p v-else-if="entry === null" class="faint">This entry was deleted.</p>
</template>

<style scoped>
.ew { display: flex; flex-direction: column; gap: .5rem; height: 100%; } .card { display: flex; gap: .6rem; } .ew.mapped .card { max-height: 40%; overflow: auto; flex: none; }
.map { flex: 1; min-height: 140px; position: relative; display: flex; flex-direction: column; border: var(--frame); border-radius: var(--radius); overflow: hidden; } .map > :last-child { flex: 1; min-height: 0; }
.crumb { display: flex; gap: .5rem; align-items: center; padding: .25rem .4rem; border-bottom: var(--frame); } .head { display: flex; align-items: start; gap: .3rem; } .head .name { flex: 1; }
.edit { position: relative; margin: -.2rem; } .done { position: sticky; top: 0; z-index: 2; float: right; }
img { width: 64px; height: 64px; object-fit: cover; border-radius: var(--radius); flex: none; } .body { min-width: 0; flex: 1; }
.name { background: none; border: 0; padding: 0; font-family: var(--font-title); font-size: 1rem; color: var(--text); text-align: left; } .name:hover { color: var(--accent); }
.facts { display: flex; flex-wrap: wrap; gap: .1rem .7rem; margin: .1rem 0 .3rem; font-size: .8rem; } .facts i { font-style: normal; color: var(--text-faint); } .roll { display: flex; gap: .5rem; align-items: center; margin-bottom: .3rem; }
</style>
