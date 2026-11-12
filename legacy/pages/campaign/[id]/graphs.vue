<template>
  <div class="chronicle screen-in">

    <!-- Left sidebar: graph list -->
    <div class="elist">
      <div class="elist-head">
        <div class="elist-head-title" style="color: var(--accent)">Graphs</div>
        <button class="btn-accent-sm" @click="createGraph">+ New</button>
      </div>

      <div class="elist-body">
        <div v-if="!graphs.length" class="elist-empty">
          <div style="font-size:28px;opacity:0.15">⬡</div>
          <span>No graphs yet</span>
          <button class="btn-accent-sm" style="margin-top:8px" @click="createGraph">Create one</button>
        </div>

        <div
          v-for="g in graphs"
          :key="g.id"
          class="erow"
          :class="{ active: activeGraphId === g.id }"
          @click="selectGraph(g.id!)"
        >
          <div class="erow-dot" :style="{ background: activeGraphId === g.id ? 'var(--accent)' : 'var(--border-hi)' }" />

          <div v-if="editingId === g.id" class="grow-rename-wrap" @click.stop>
            <input
              ref="renameInputRef"
              v-model="editingName"
              class="grow-rename-input"
              @keydown.enter="confirmRename(g.id!)"
              @keydown.escape="cancelRename"
              @blur="confirmRename(g.id!)"
            />
          </div>
          <div v-else class="erow-name">{{ g.name }}</div>

          <div class="enc-actions" @click.stop>
            <button class="enc-act" title="Rename" @click.stop="startRename(g)">✎</button>
            <button class="enc-act enc-act--del" title="Delete" @click.stop="deleteGraph(g.id!)">✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: graph canvas -->
    <div class="gcanvas">
      <div v-if="!graphs.length || !activeGraphId" class="edetail-empty">
        <div class="edetail-empty-icon">⬡</div>
        <div class="edetail-empty-text">Select a graph or create a new one</div>
      </div>
      <div v-else-if="!loaded" class="gcanvas-loading">
        <span>Building graph…</span>
      </div>
      <NotesGraph
        v-else
        :key="activeGraphId"
        :campaign-id="campaignId"
        :graph-id="activeGraphId"
        @navigate="onNavigate"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import { rulesRefRoute } from '~/composables/useRules'
import { dbApi } from '~/composables/useDb'
import type { DbGraphLayout } from '~/composables/useDb'
import { useEntities } from '~/composables/useEntities'

const TYPE_PLURAL_ROUTE: Record<string, string> = {
  npc: 'npcs', location: 'locations', faction: 'factions',
  quest: 'quests', event: 'events', session: 'sessions', note: 'notes',
}

const route = useRoute()
const router = useRouter()
const store = useEntities()
const campaignId = Number(route.params.id)

const graphs = ref<DbGraphLayout[]>([])
const loaded = ref(false)

const activeGraphId = computed(() => {
  const g = route.query.graph
  return g ? Number(g) : null
})

const editingId = ref<number | null>(null)
const editingName = ref('')
const renameInputRef = ref<HTMLInputElement[]>([])

onMounted(async () => {
  await Promise.all([
    store.loadAll(campaignId),
    loadGraphs(),
  ])
  loaded.value = true
  // Auto-select first graph if none in URL
  if (!activeGraphId.value && graphs.value.length) {
    router.replace({ query: { graph: graphs.value[0].id } })
  }
})

async function loadGraphs() {
  graphs.value = await dbApi.graphLayout.list(campaignId)
}

function selectGraph(id: number) {
  router.push({ query: { graph: id } })
}

async function createGraph() {
  const id = await dbApi.graphLayout.create(campaignId, 'New Graph')
  await loadGraphs()
  router.push({ query: { graph: id } })
}

async function deleteGraph(id: number) {
  if (!confirm('Delete this graph?')) return
  await dbApi.graphLayout.delete(id)
  await loadGraphs()
  if (activeGraphId.value === id) {
    const next = graphs.value[0]
    router.replace({ query: next ? { graph: next.id } : {} })
  }
}

function startRename(g: DbGraphLayout) {
  editingId.value = g.id!
  editingName.value = g.name
  nextTick(() => renameInputRef.value[0]?.focus())
}

async function confirmRename(id: number) {
  if (editingId.value !== id) return
  const name = editingName.value.trim() || 'Untitled'
  await dbApi.graphLayout.rename(id, name)
  const g = graphs.value.find(x => x.id === id)
  if (g) g.name = name
  editingId.value = null
}

function cancelRename() {
  editingId.value = null
}

async function onNavigate(type: string, name: string) {
  const entry = store.findByTypeAndName(type, name)
  if (!entry) {
    const rulesRoute = await rulesRefRoute(type, name)
    if (rulesRoute) router.push(rulesRoute)
    return
  }
  router.push(`/campaign/${campaignId}/${TYPE_PLURAL_ROUTE[type] ?? type + 's'}/${entry.id}`)
}
</script>

<style scoped>
.gcanvas {
  flex: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.gcanvas-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text3);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.grow-rename-wrap {
  flex: 1;
  min-width: 0;
}

.grow-rename-input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--accent);
  border-radius: var(--r1);
  color: var(--text);
  font-size: 13px;
  padding: 2px 6px;
  outline: none;
}

.enc-actions {
  display: none;
  gap: 3px;
  flex-shrink: 0;
}
.erow:hover .enc-actions { display: flex; }

.enc-act {
  width: 20px;
  height: 20px;
  border-radius: var(--r1);
  background: none;
  border: 1px solid transparent;
  color: var(--text3);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
}
.enc-act:hover { background: var(--surface-hi); color: var(--text2); border-color: var(--border); }
.enc-act--del:hover { background: var(--danger-bg); color: var(--danger); border-color: var(--danger); }
</style>
