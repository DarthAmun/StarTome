<script setup lang="ts">
/** Finds a creature, hazard or vehicle in the compendium by name; both games' entries can be used. */
import { ref, shallowRef, watch } from 'vue'
import type { GameId } from '@/domain/game'
import type { RulesEntity, RulesKind } from '@/domain/rules/types'
import { rulesQuery } from '@/data/rules'

const props = withDefaults(defineProps<{ game: GameId; kinds?: RulesKind[]; placeholder?: string; limit?: number }>(), { kinds: () => ['creature', 'hazard', 'vehicle'], placeholder: 'Creature, hazard or vehicle…', limit: 12 })
const emit = defineEmits<{ pick: [entity: RulesEntity] }>()

const text = ref('')
const both = ref(false)
const results = shallowRef<RulesEntity[]>([])
let run = 0
watch([text, both], async () => {
  const mine = ++run
  const q = text.value.trim()
  if (q.length < 2) { results.value = []; return }
  const page = await rulesQuery({ kinds: props.kinds, text: q, games: both.value ? [] : [props.game], limit: props.limit, sort: 'name' })
  if (mine === run) results.value = page.items
})
function pick(e: RulesEntity) { emit('pick', e) }
/** A result can be dragged onto the battle map, where it becomes a token on the square it is dropped on. */
function drag(ev: DragEvent, e: RulesEntity) { ev.dataTransfer?.setData('application/x-startome-rules', e.id); ev.dataTransfer?.setData('text/plain', e.name) }
</script>

<template>
  <div class="picker">
    <div class="row">
      <input v-model="text" class="input" :placeholder="placeholder" data-test="creature-search" @keydown.enter.prevent="results[0] && pick(results[0])" />
      <label class="faint both" title="Also search the other game's compendium"><input v-model="both" type="checkbox" /> both games</label>
    </div>
    <ul v-if="results.length">
      <li v-for="e in results" :key="e.id"><button class="hit" draggable="true" title="Click to add, or drag onto the map" :data-creature="e.name" @click="pick(e)" @dragstart="drag($event, e)"><span class="num lvl">{{ e.level }}</span><span class="name">{{ e.name }}</span><span class="faint">{{ e.kind }}</span></button></li>
    </ul>
    <p v-else-if="text.trim().length >= 2" class="faint none">Nothing by that name. Sync the compendium or add a token by hand.</p>
  </div>
</template>

<style scoped>
.row { display: flex; gap: .5rem; align-items: center; }
.both { white-space: nowrap; font-size: .8rem; }
ul { list-style: none; margin: .3rem 0 0; padding: 0; max-height: 15rem; overflow: auto; }
.hit { display: flex; gap: .5rem; align-items: baseline; width: 100%; padding: .25rem .4rem; background: none; border: 0; border-radius: var(--radius); text-align: left; }
.hit:hover { background: var(--bg-hover); }
.lvl { width: 1.6rem; text-align: right; color: var(--accent); }
.name { flex: 1; }
.none { margin: .4rem 0 0; font-size: .85rem; }
</style>
