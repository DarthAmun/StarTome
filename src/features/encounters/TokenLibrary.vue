<script setup lang="ts">
/** The token library, shared by all campaigns: search, add, edit, remove. Tokens can be dragged onto an encounter's map. */
import { computed, ref } from 'vue'
import { Pencil, Plus, Trash2 } from 'lucide-vue-next'
import type { Actor, ImageRef } from '@/domain/schema'
import { actors } from '@/data/encounters'
import { confirmDialog } from '@/ui/dialogs'
import { useLive } from '@/ui/useLive'
import ActorDialog from './ActorDialog.vue'
import TokenThumb from './TokenThumb.vue'

defineProps<{ compact?: boolean }>()
const emit = defineEmits<{ pick: [actor: Actor] }>()

const list = useLive(async () => { const all = await actors.list(); return Promise.all(all.map(async a => ({ actor: a, image: await actors.shown(a) as ImageRef | null }))) }, [])
const search = ref('')
const shown = computed(() => { const q = search.value.trim().toLowerCase(); return q ? list.value.filter(x => x.actor.name.toLowerCase().includes(q)) : list.value })
const editing = ref<Actor | null | undefined>(undefined)

async function remove(a: Actor) {
  if (await confirmDialog({ title: `Remove “${a.name}” from the library?`, body: 'Tokens already placed from it stay on their maps.', confirmLabel: 'Remove', danger: true })) await actors.remove(a.id)
}
function drag(e: DragEvent, a: Actor) { e.dataTransfer?.setData('application/x-startome-actor', a.id) }
const kindOf = (a: Actor) => (a.ref.kind === 'character' ? 'party' : a.pinned ? 'PC' : a.ref.kind === 'entry' ? 'NPC' : a.ref.kind === 'rules' ? 'creature' : '')
</script>

<template>
  <section class="lib" :class="{ compact }" data-test="token-library">
    <div class="bar"><input v-model="search" class="input" placeholder="Search tokens…" aria-label="Search tokens" /><button class="btn" data-test="new-actor" @click="editing = null"><Plus :size="14" /> Token</button></div>
    <ul>
      <li v-for="x in shown" :key="x.actor.id" draggable="true" :data-actor="x.actor.name" :title="compact ? 'Drag onto the map, or click to place' : ''" @dragstart="drag($event, x.actor)" @click="emit('pick', x.actor)">
        <TokenThumb :image="x.image" :name="x.actor.name" :size="compact ? 28 : 40" />
        <span class="name">{{ x.actor.name }}</span><span v-if="kindOf(x.actor)" class="chip">{{ kindOf(x.actor) }}</span>
        <button class="btn btn-ghost btn-icon" :aria-label="`Edit ${x.actor.name}`" @click.stop="editing = x.actor"><Pencil :size="13" /></button>
        <button class="btn btn-ghost btn-icon" :aria-label="`Remove ${x.actor.name}`" @click.stop="remove(x.actor)"><Trash2 :size="13" /></button>
      </li>
    </ul>
    <p v-if="!shown.length" class="faint">{{ list.length ? 'No token by that name.' : 'No tokens yet. Party members get theirs when an encounter is built.' }}</p>
    <ActorDialog v-if="editing !== undefined" :actor="editing" @close="editing = undefined" />
  </section>
</template>

<style scoped>
.lib { display: flex; flex-direction: column; gap: .5rem; min-height: 0; } .bar { display: flex; gap: .4rem; }
ul { list-style: none; margin: 0; padding: 0; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: .3rem; }
.compact ul { display: flex; flex-direction: column; gap: 0; max-height: 14rem; }
li { display: flex; align-items: center; gap: .5rem; padding: .25rem .4rem; border-radius: var(--radius); cursor: grab; } li:hover { background: var(--bg-hover); }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } p { margin: 0; }
</style>
