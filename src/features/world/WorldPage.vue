<script setup lang="ts">
/**
 * World: every lore entry of the campaign in one browser. Type is a filter
 * beside search, favourites and tags, instead of ten separate list pages.
 * A click opens the entry in the dock; Enter or a double-click opens it full.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Star } from 'lucide-vue-next'
import type { Entry, EntryType } from '@/domain/schema'
import { entries as entryRepo } from '@/data/repo'
import { ENTRY_TYPE_INFO, ENTRY_TYPE_ORDER } from '@/ui/entryTypes'
import { excerpt } from '@/ui/markdown'
import { useLive } from '@/ui/useLive'
import { campaignId, peek } from '@/ui/workbench'
import { entryMeta, isArchived } from './facts'
import EntryThumb from './EntryThumb.vue'

const router = useRouter()
const all = useLive<Entry[]>(() => (campaignId.value ? entryRepo.ofCampaign(campaignId.value) : Promise.resolve([])), [], [campaignId])

const query = ref('')
const types = ref<Set<EntryType>>(new Set())
const favoritesOnly = ref(false)
const showArchived = ref(true)
const tag = ref<string | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)
const focus = ref(0)

const counts = computed(() => {
  const c: Partial<Record<EntryType, number>> = {}
  for (const e of all.value) c[e.type] = (c[e.type] ?? 0) + 1
  return c
})
const tags = computed(() => {
  const c = new Map<string, number>()
  for (const e of all.value) for (const t of e.tags) c.set(t, (c.get(t) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24)
})

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return all.value.filter(e =>
    (!types.value.size || types.value.has(e.type))
    && (!favoritesOnly.value || e.favorite)
    && (showArchived.value || !isArchived(e))
    && (!tag.value || e.tags.includes(tag.value))
    && (!q || e.name.toLowerCase().includes(q) || e.tags.some(t => t.toLowerCase().includes(q)) || e.body.toLowerCase().includes(q)),
  ).sort((a, b) => Number(b.favorite) - Number(a.favorite) || collator.compare(a.name, b.name))
})

function toggleType(t: EntryType) {
  const next = new Set(types.value)
  if (next.has(t)) next.delete(t)
  else next.add(t)
  types.value = next
  focus.value = 0
}

function clear() {
  query.value = ''; types.value = new Set(); favoritesOnly.value = false; tag.value = null; showArchived.value = true
}

function openFull(e: Entry) {
  void router.push({ name: 'entry', params: { campaignId: e.campaignId, entryId: e.id } })
}

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
  if (e.key === '/' && !typing) { e.preventDefault(); searchEl.value?.focus(); return }
  if (e.key === 'Escape' && target === searchEl.value) { query.value = ''; searchEl.value?.blur(); return }
  if (typing && target !== searchEl.value) return
  const row = shown.value[focus.value]
  if (e.key === 'ArrowDown') { e.preventDefault(); focus.value = Math.min(shown.value.length - 1, focus.value + 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); focus.value = Math.max(0, focus.value - 1) }
  else if (e.key === 'Enter' && row) { e.preventDefault(); if (e.shiftKey) openFull(row); else peek({ kind: 'entry', id: row.id }) }
  else return
  document.querySelector(`[data-row="${focus.value}"]`)?.scrollIntoView({ block: 'nearest' })
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="world">
    <aside class="filters">
      <h1>World</h1>
      <p class="faint count"><span class="num">{{ shown.length }}</span> of <span class="num">{{ all.length }}</span> entries</p>
      <label class="search">
        <Search :size="14" />
        <input ref="searchEl" v-model="query" class="input" placeholder="Search names, tags, text…" @input="focus = 0" />
        <span class="kbd">/</span>
      </label>
      <div class="eyebrow">Type</div>
      <button v-for="t in ENTRY_TYPE_ORDER" :key="t" class="type" :class="{ on: types.has(t) }" :style="{ '--type': ENTRY_TYPE_INFO[t].color }" @click="toggleType(t)">
        <component :is="ENTRY_TYPE_INFO[t].icon" :size="14" /> <span>{{ ENTRY_TYPE_INFO[t].plural }}</span> <span class="num faint">{{ counts[t] ?? 0 }}</span>
      </button>
      <div class="eyebrow">Show</div>
      <label class="check"><input v-model="favoritesOnly" type="checkbox" /> Favourites only</label>
      <label class="check"><input v-model="showArchived" type="checkbox" /> Dead, destroyed, closed, false</label>
      <template v-if="tags.length">
        <div class="eyebrow">Tags</div>
        <div class="tags">
          <button v-for="[t, n] in tags" :key="t" class="chip" :class="{ on: tag === t }" @click="tag = tag === t ? null : t">#{{ t }} <span class="num faint">{{ n }}</span></button>
        </div>
      </template>
      <button class="btn btn-ghost clear" @click="clear">Clear filters</button>
    </aside>

    <div class="list">
      <div v-if="!shown.length" class="empty">
        <template v-if="all.length">Nothing matches. <button class="btn" @click="clear">Clear filters</button></template>
        <template v-else>This campaign has no entries yet.</template>
      </div>
      <div v-for="(e, i) in shown" :key="e.id" class="row" :class="{ focus: i === focus, archived: isArchived(e) }" :data-row="i"
        :style="{ '--type': ENTRY_TYPE_INFO[e.type].color }" tabindex="-1" @click="focus = i; peek({ kind: 'entry', id: e.id })" @dblclick="openFull(e)">
        <EntryThumb :entry="e" />
        <div class="row-main">
          <div class="row-name">{{ e.name }} <Star v-if="e.favorite" :size="12" class="fav" fill="currentColor" /></div>
          <div class="row-meta dim">{{ entryMeta(e) || excerpt(e.body, 90) }}</div>
        </div>
        <span class="row-type">{{ ENTRY_TYPE_INFO[e.type].label }}</span>
      </div>
      <p v-if="shown.length" class="hint faint"><span class="kbd">↑</span> <span class="kbd">↓</span> move · <span class="kbd">Enter</span> peek · <span class="kbd">Shift</span>+<span class="kbd">Enter</span> or double-click opens the page</p>
    </div>
  </div>
</template>

<style scoped>
.world { display: grid; grid-template-columns: 250px 1fr; height: 100%; }
.filters { padding: 1.4rem 1rem 2rem 1.4rem; border-right: var(--frame); overflow: auto; display: flex; flex-direction: column; gap: .15rem; background-image: var(--wash); }
.count { margin: .2rem 0 .8rem; }
.search { display: flex; align-items: center; gap: .4rem; color: var(--text-faint); margin-bottom: .4rem; }
.eyebrow { margin: .9rem 0 .3rem; }
.type { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: .4rem; padding: .28rem .5rem; background: none; border: 1px solid transparent; border-radius: var(--radius); text-align: left; color: var(--text-dim); }
.type :deep(svg) { color: var(--type); }
.type:hover { background: var(--bg-hover); color: var(--text); }
.type.on { border-color: var(--type); background: color-mix(in srgb, var(--type) 12%, transparent); color: var(--text); }
.check { display: flex; gap: .5rem; align-items: center; color: var(--text-dim); padding: .15rem .5rem; }
.tags { display: flex; flex-wrap: wrap; gap: .3rem; }
.tags .chip { background: none; cursor: pointer; }
.tags .chip.on { border-color: var(--accent); color: var(--accent); }
.clear { margin-top: 1rem; align-self: start; }
.list { overflow: auto; padding: .8rem 1.2rem 2rem; }
.row { display: grid; grid-template-columns: 38px 1fr auto; gap: .8rem; align-items: center; padding: .4rem .7rem; border-left: 2px solid transparent; border-bottom: var(--frame); cursor: pointer; }
.row:hover { background: var(--bg-hover); }
.row.focus { border-left-color: var(--type); background: var(--bg-raised); }
.row.archived { opacity: .55; }
.row-name { font-weight: 500; }
.row-meta { font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-main { min-width: 0; }
.row-type { font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; color: var(--type); }
.fav { color: var(--accent); }
.hint { margin-top: 1rem; font-size: .82rem; }
</style>
