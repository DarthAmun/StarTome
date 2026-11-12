<script setup lang="ts">
/** One lore entry: name, typed fields, text, links and history. Used by the peek dock and the full page. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { History, SlidersHorizontal, Star, Trash2 } from 'lucide-vue-next'
import { emitDomainEvent } from '@/domain/events'
import { isEntryTypeName } from '@/domain/links'
import type { Entry } from '@/domain/schema'
import { deleteEntry, saveEntry } from '@/data/entries'
import { entries, mapsPinning } from '@/data/repo'
import ProseEditor from '@/features/shared/ProseEditor.vue'
import { confirmDialog, reportError } from '@/ui/dialogs'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'
import { useImageUrl } from '@/ui/imageUrl'
import { useLive } from '@/ui/useLive'
import { closePeek, dock, peek } from '@/ui/workbench'
import EntryExtras from './EntryExtras.vue'
import EntryFields from './EntryFields.vue'
import EntryHistory from './EntryHistory.vue'
import { entryImage } from './facts'
import { FIELDS } from './fields'

const props = withDefaults(defineProps<{ entryId: string; full?: boolean }>(), { full: false })
const router = useRouter()

const entry = useLive<Entry | undefined>(() => entries.get(props.entryId), undefined, [() => props.entryId])
const outgoing = useLive(() => entries.linksFrom(props.entryId), [], [() => props.entryId])
const incoming = useLive(async () => {
  const links = await entries.linksTo(props.entryId)
  const sources = await Promise.all([...new Set(links.map(l => l.sourceId))].map(id => entries.get(id)))
  return sources.filter((e): e is Entry => !!e)
}, [] as Entry[], [() => props.entryId])
/** Maps this entry is pinned on. */
const pinnedOn = useLive(() => mapsPinning(props.entryId), [] as Entry[], [() => props.entryId])

const info = computed(() => (entry.value ? ENTRY_TYPE_INFO[entry.value.type] : null))
const image = useImageUrl(() => (entry.value ? entryImage(entry.value) : null))
const showFields = ref(props.full)
const showHistory = ref(false)
const resolved = computed(() => new Set(outgoing.value.filter(l => l.targetEntryId).map(l => `${l.targetType}|${l.targetName.toLowerCase()}`)))
const resolves = (type: string, name: string) => !isEntryTypeName(type) || resolved.value.has(`${type}|${name.toLowerCase()}`)

async function save(patch: Parameters<typeof saveEntry>[1]) {
  try { await saveEntry(props.entryId, patch) } catch (err) { reportError('Saving', err) }
}

// The text is saved shortly after typing stops, and at once when the entry is left
const body = ref('')
let pending: ReturnType<typeof setTimeout> | null = null
let dirty = false
watch(entry, (e) => { if (e && !dirty) body.value = e.body }, { immediate: true })
function onBody(text: string) {
  body.value = text
  dirty = true
  if (pending) clearTimeout(pending)
  pending = setTimeout(flush, 600)
}
function flush() {
  if (pending) { clearTimeout(pending); pending = null }
  if (!dirty) return
  dirty = false
  void save({ body: body.value })
}
onBeforeUnmount(flush)
watch(() => props.entryId, flush, { flush: 'sync' })

// ── Name and tags ──
const renaming = ref(false)
const nameDraft = ref('')
function startRename() { nameDraft.value = entry.value?.name ?? ''; renaming.value = true }
function commitRename() {
  renaming.value = false
  if (nameDraft.value.trim() && nameDraft.value.trim() !== entry.value?.name) void save({ name: nameDraft.value })
}
const tagDraft = ref('')
function addTag() {
  const t = tagDraft.value.trim().replace(/^#/, '')
  tagDraft.value = ''
  if (t && entry.value && !entry.value.tags.includes(t)) void save({ tags: [...entry.value.tags, t] })
}

function onData(data: Record<string, unknown>) {
  const e = entry.value
  if (e?.type === 'quest' && data.status === 'completed' && e.data.status !== 'completed') emitDomainEvent('questCompleted', { campaignId: e.campaignId, entryId: e.id, name: e.name, milestone: e.data.milestone })
  void save({ data })
}

async function remove() {
  const e = entry.value
  if (!e || !await confirmDialog({ title: `Delete “${e.name}”?`, body: 'The entry, its history and its pins are removed. Text elsewhere that names it stays and shows the link as missing.', confirmLabel: 'Delete', danger: true })) return
  dirty = false
  await deleteEntry(e.id)
  emitDomainEvent('entryDeleted', { campaignId: e.campaignId, entryId: e.id })
  const at = dock.stack.findIndex(t => t.kind === 'entry' && t.id === e.id)
  if (at >= 0) closePeek(at)
  if (props.full) void router.push({ name: 'world', params: { campaignId: e.campaignId } })
}

const openMap = () => entry.value && void router.push({ name: 'map', params: { campaignId: entry.value.campaignId, entryId: entry.value.id } })
</script>

<template>
  <article v-if="entry && info" class="entry" :style="{ '--type': info.color }">
    <header class="entry-head">
      <img v-if="image" :src="image" alt="" class="entry-img" :class="entry.type" />
      <div class="entry-title">
        <div class="eyebrow entry-type"><component :is="info.icon" :size="13" /> {{ info.label }}</div>
        <input v-if="renaming" v-model="nameDraft" class="input name-input" aria-label="Name" autofocus @blur="commitRename" @keyup.enter="commitRename" @keyup.esc="renaming = false" />
        <h1 v-else title="Click to rename" @click="startRename">{{ entry.name }}</h1>
        <div class="entry-tags">
          <button v-for="t in entry.tags" :key="t" class="chip tag" title="Click to remove" @click="save({ tags: entry.tags.filter(x => x !== t) })">#{{ t }}</button>
          <input v-model="tagDraft" class="tag-input" placeholder="+ tag" aria-label="Add a tag" @keyup.enter="addTag" @blur="addTag" />
        </div>
      </div>
      <div class="actions no-print">
        <button class="btn btn-ghost btn-icon" :class="{ on: entry.favorite }" :title="entry.favorite ? 'Remove from favourites' : 'Add to favourites'" @click="save({ favorite: !entry.favorite })"><Star :size="16" :fill="entry.favorite ? 'currentColor' : 'none'" /></button>
        <button v-if="FIELDS[entry.type].length" class="btn btn-ghost btn-icon" :class="{ on: showFields }" title="Fields" @click="showFields = !showFields"><SlidersHorizontal :size="16" /></button>
        <button class="btn btn-ghost btn-icon" :class="{ on: showHistory }" title="History" @click="showHistory = !showHistory"><History :size="16" /></button>
        <button class="btn btn-ghost btn-icon" title="Delete" @click="remove"><Trash2 :size="16" /></button>
      </div>
    </header>

    <EntryFields v-if="showFields && FIELDS[entry.type].length" :entry="entry" @change="onData" />
    <EntryHistory v-if="showHistory" :entry-id="entry.id" />
    <EntryExtras :entry="entry" @change="onData" @map="openMap" />

    <ProseEditor :key="entry.id" :model-value="body" :campaign-id="entry.campaignId" :resolves="resolves" @update:model-value="onBody" />

    <footer v-if="incoming.length || pinnedOn.length" class="backlinks">
      <template v-if="incoming.length">
        <div class="eyebrow">Referenced by</div>
        <button v-for="s in incoming" :key="s.id" class="chip link" :style="{ color: ENTRY_TYPE_INFO[s.type].color }" @click="peek({ kind: 'entry', id: s.id })">
          <component :is="ENTRY_TYPE_INFO[s.type].icon" :size="12" /> {{ s.name }}
        </button>
      </template>
      <template v-if="pinnedOn.length">
        <div class="eyebrow">Found on maps</div>
        <RouterLink v-for="m in pinnedOn" :key="m.id" class="chip link" :to="{ name: 'map', params: { campaignId: m.campaignId, entryId: m.id } }">{{ m.name }}</RouterLink>
      </template>
    </footer>
  </article>
  <p v-else class="empty">This entry no longer exists.</p>
</template>

<style scoped>
.entry { padding: 1.2rem 1.4rem 2rem; }
.entry-head { display: flex; gap: 1rem; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid color-mix(in srgb, var(--type) 45%, var(--line)); margin-bottom: 1rem; }
.entry-img { width: 84px; height: 84px; object-fit: cover; border-radius: var(--radius); border: var(--frame); flex: none; }
.entry-img.npc { border-radius: 50%; border-color: var(--type); }
.entry-type { display: flex; align-items: center; gap: .4em; color: var(--type); margin-bottom: .25rem; }
.entry-title { flex: 1; min-width: 0; }
.entry-title h1 { font-size: 1.5rem; cursor: text; }
.name-input { font-family: var(--font-title); font-size: 1.3rem; }
.entry-tags { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .5rem; align-items: center; }
.tag { background: none; cursor: pointer; }
.tag:hover { text-decoration: line-through; }
.tag-input { width: 70px; background: none; border: 0; border-bottom: 1px dashed var(--line); color: var(--text-dim); font-size: .8rem; }
.tag-input:focus { outline: none; border-color: var(--accent); }
.actions { display: flex; gap: 2px; align-self: start; }
.actions .on { color: var(--accent); }
.backlinks { margin-top: 1.6rem; padding-top: 1rem; border-top: var(--frame); display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; }
.backlinks .eyebrow { width: 100%; margin: .2rem 0; }
.link { background: none; cursor: pointer; color: var(--text-dim); }
.link:hover { border-color: currentColor; text-decoration: none; }
</style>
