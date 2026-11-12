<script setup lang="ts">
/** Graphs: several named relationship graphs per campaign. */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MonitorUp, Plus, Trash2 } from 'lucide-vue-next'
import type { GraphEdge } from '@/domain/schema'
import { entriesNamed } from '@/data/entries'
import { graphs } from '@/data/graphs'
import { workspace } from '@/data/repo'
import { onPlayerMessage, openPlayerWindow, sendToPlayers } from '@/services/playerLink'
import { confirmDialog, notify } from '@/ui/dialogs'
import { ENTRY_TYPES } from '@/domain/schema'
import { useLive } from '@/ui/useLive'
import GraphCanvas from './GraphCanvas.vue'
import WorldTabs from './WorldTabs.vue'

const props = defineProps<{ campaignId: string; graphId?: string }>()
const router = useRouter()

const list = useLive(() => graphs.ofCampaign(props.campaignId), [], [() => props.campaignId])
const graph = computed(() => list.value.find(g => g.id === props.graphId) ?? null)
watch([list, () => props.graphId], ([all, id]) => { if (!id && all[0]) void router.replace({ name: 'graphs', params: { campaignId: props.campaignId, graphId: all[0].id } }) }, { immediate: true })

watch(() => props.graphId, id => sendToPlayers({ type: 'graph', graphId: id ?? null }), { immediate: true })
onPlayerMessage('hello', (m) => { if (m.channel === 'graph') sendToPlayers({ type: 'graph', graphId: props.graphId ?? null }) })

const mentions = ref(true)
// Whether nodes list their facts; kept per campaign, and the players' window follows it
const facts = ref(false)
watch(() => props.campaignId, async (id) => { facts.value = await workspace.get(id, 'graph.facts', false) }, { immediate: true })
const setFacts = (on: boolean) => { facts.value = on; void workspace.set(props.campaignId, 'graph.facts', on) }
const addName = ref('')
const candidates = useLive(() => entriesNamed(props.campaignId, ENTRY_TYPES.filter(t => t !== 'session')), [], [() => props.campaignId])

async function create() {
  const g = await graphs.create(props.campaignId, `Graph ${list.value.length + 1}`)
  void router.push({ name: 'graphs', params: { campaignId: props.campaignId, graphId: g.id } })
}
async function remove() {
  const g = graph.value
  if (!g || !await confirmDialog({ title: `Delete “${g.name}”?`, body: 'The graph and its layout are removed. Entries and their connections stay.', confirmLabel: 'Delete', danger: true })) return
  await graphs.remove(g.id)
  void router.replace({ name: 'graphs', params: { campaignId: props.campaignId } })
}
async function addEntry() {
  const g = graph.value
  const hit = candidates.value.find(c => c.name.toLowerCase() === addName.value.trim().toLowerCase())
  if (!g || !hit) return
  addName.value = ''
  if (g.nodes.some(n => n.entryId === hit.id)) { notify(`${hit.name} is on this graph already.`); return }
  // New nodes land beside the last one, not on top of each other
  await graphs.patch(g.id, (x) => { x.nodes.push({ entryId: hit.id, x: 40 + (x.nodes.length % 5) * 240, y: 40 + Math.floor(x.nodes.length / 5) * 170, playerHidden: false, hiddenAttrs: [] }) })
}

// ── A connection drawn by hand ──
const editing = ref<Partial<GraphEdge> & { sourceEntryId: string; targetEntryId: string } | null>(null)
const startEdge = (sourceEntryId: string, targetEntryId: string) => { editing.value = { sourceEntryId, targetEntryId, label: '', direction: 'one-way', style: 'default', color: null } }
async function saveEdge() {
  if (!editing.value) return
  await graphs.saveEdge({ ...editing.value, campaignId: props.campaignId })
  editing.value = null
}
async function deleteEdge() {
  if (editing.value?.id) await graphs.removeEdge(editing.value.id)
  editing.value = null
}
</script>

<template>
  <div class="graphs">
    <WorldTabs />
    <header class="bar">
      <select class="input pick" :value="graphId ?? ''" aria-label="Graph" @change="router.push({ name: 'graphs', params: { campaignId, graphId: ($event.target as HTMLSelectElement).value } })">
        <option v-if="!list.length" value="">No graphs yet</option>
        <option v-for="g in list" :key="g.id" :value="g.id">{{ g.name }}</option>
      </select>
      <button class="btn" @click="create"><Plus :size="14" /> New graph</button>
      <template v-if="graph">
        <input class="input name" :value="graph.name" aria-label="Graph name" @change="graphs.rename(graph.id, ($event.target as HTMLInputElement).value)" />
        <input v-model="addName" class="input add" list="graph-candidates" placeholder="Add an entry…" aria-label="Add an entry" @change="addEntry" />
        <datalist id="graph-candidates"><option v-for="c in candidates" :key="c.id" :value="c.name">{{ c.type }}</option></datalist>
        <label class="check"><input v-model="mentions" type="checkbox" /> Mentions</label>
        <label class="check" title="List each entry's facts on its node; hide single facts from the players with the eye"><input type="checkbox" :checked="facts" @change="setFacts(($event.target as HTMLInputElement).checked)" /> Facts</label>
        <span class="grow" />
        <button class="btn" title="Open this graph in a window for the players" @click="openPlayerWindow('/player/graph', 'graph')"><MonitorUp :size="14" /> Player view</button>
        <button class="btn btn-ghost btn-icon" title="Delete this graph" @click="remove"><Trash2 :size="14" /></button>
      </template>
    </header>
    <div class="body">
      <GraphCanvas v-if="graph" :key="graph.id" :graph="graph" :mentions="mentions" :facts="facts" @connect="startEdge" @edge="e => editing = { ...e }" />
      <p v-else class="empty">A graph shows how entries relate. Make one, add entries, then drag from one entry's lower dot to another to connect them.</p>
      <form v-if="editing" class="edge panel" @submit.prevent="saveEdge">
        <div class="eyebrow">Connection</div>
        <input v-model="editing.label" class="input" placeholder="Label: owes money to…" aria-label="Label" autofocus />
        <select v-model="editing.direction" class="input" aria-label="Direction"><option value="one-way">One-way →</option><option value="two-way">Both ways ↔</option><option value="none">No direction —</option></select>
        <select v-model="editing.style" class="input" aria-label="Line"><option value="default">Curved</option><option value="smoothstep">Smooth step</option><option value="straight">Straight</option><option value="step">Step</option></select>
        <label class="check"><input type="color" :value="editing.color ?? '#b5a78d'" @change="editing.color = ($event.target as HTMLInputElement).value" /> Colour <button v-if="editing.color" type="button" class="btn btn-ghost" @click="editing.color = null">default</button></label>
        <div class="row"><button v-if="editing.id" type="button" class="btn btn-danger" @click="deleteEdge">Delete</button><span class="grow" /><button type="button" class="btn" @click="editing = null">Cancel</button><button class="btn btn-primary">Save</button></div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.graphs { height: 100%; display: flex; flex-direction: column; }
.bar { display: flex; align-items: center; gap: .5rem; padding: .5rem 1rem; border-bottom: var(--frame); }
.pick { width: 200px; } .name { width: 180px; } .add { width: 220px; }
.check { display: flex; align-items: center; gap: .4rem; color: var(--text-dim); }
.grow { flex: 1; }
.body { flex: 1; min-height: 0; position: relative; }
.edge { position: absolute; top: 1rem; right: 1rem; width: 280px; padding: .9rem; display: flex; flex-direction: column; gap: .5rem; box-shadow: var(--shadow); z-index: 6; }
.row { display: flex; gap: .4rem; }
</style>
