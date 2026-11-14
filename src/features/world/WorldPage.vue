<script setup lang="ts">
import { isEntryTypeName } from '@/domain/links'
/**
 * World: every lore entry of the campaign in one browser. Type is a filter
 * beside search, favourites, tags and (for one type) its fields. A click
 * opens the entry in the dock; Shift+Enter or a double-click opens its page.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LayoutGrid, List, Plus, Search, Table2 } from 'lucide-vue-next'
import type { Entry, EntryType } from '@/domain/schema'
import { createEntry, saveEntry } from '@/data/entries'
import { npcPlaces } from '@/data/relations'
import { entries as entryRepo } from '@/data/repo'
import { reportError } from '@/ui/dialogs'
import { ENTRY_TYPE_INFO, ENTRY_TYPE_ORDER } from '@/ui/entryTypes'
import { useLive } from '@/ui/useLive'
import { campaignId, peek } from '@/ui/workbench'
import WorldList from './WorldList.vue'
import WorldTabs from './WorldTabs.vue'
import { useWorldQuery, type Density } from './worldQuery'

const router = useRouter()
const all = useLive<Entry[]>(() => (campaignId.value ? entryRepo.ofCampaign(campaignId.value) : Promise.resolve([])), [], [campaignId])
// An NPC's factions and locations come from its links and pins
const places = useLive(() => (campaignId.value ? npcPlaces(campaignId.value) : Promise.resolve({})), {}, [campaignId])
const { state, facetsOf, oneType, counts, tags, facetOptions, shown, groups, groupChoices, flat, toggleType, toggleFacet, clear } = useWorldQuery(all, campaignId, places)

const searchEl = ref<HTMLInputElement | null>(null)
const focusId = ref<string | null>(null)
const adding = ref(false)
const DENSITIES: [Density, typeof List, string][] = [['list', List, 'Rows'], ['gallery', LayoutGrid, 'Gallery'], ['table', Table2, 'Table']]
/** Letters that start an entry on screen, for the jump rail. */
const letters = computed(() => (state.sort === 'name' && state.group === 'none' && flat.value.length > 24 ? [...new Set(flat.value.map(e => e.name.charAt(0).toUpperCase()))].sort() : []))

async function add(t: EntryType) {
  adding.value = false
  if (!campaignId.value) return
  try { peek({ kind: 'entry', id: (await createEntry(campaignId.value, t)).id }) } catch (err) { reportError('Creating the entry', err) }
}
const pick = (e: Entry) => { focusId.value = e.id; peek({ kind: 'entry', id: e.id }) }
const openFull = (e: Entry) => void router.push({ name: 'entry', params: { campaignId: e.campaignId, entryId: e.id } })
const reveal = (id: string) => document.querySelector(`[data-entry="${id}"]`)?.scrollIntoView({ block: 'nearest' })
function jump(letter: string) {
  const e = flat.value.find(x => x.name.charAt(0).toUpperCase() === letter && !x.favorite) ?? flat.value.find(x => x.name.charAt(0).toUpperCase() === letter)
  if (e) { focusId.value = e.id; document.querySelector(`[data-entry="${e.id}"]`)?.scrollIntoView({ block: 'start' }) }
}

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
  if (e.key === '/' && !typing) { e.preventDefault(); searchEl.value?.focus(); return }
  if (e.key === 'Escape' && target === searchEl.value) { state.query = ''; searchEl.value?.blur(); return }
  if (typing && target !== searchEl.value) return
  const list = flat.value
  const at = list.findIndex(x => x.id === focusId.value)
  const row = list[at]
  const move = (to: number) => { const next = list[Math.max(0, Math.min(list.length - 1, to))]; if (next) { focusId.value = next.id; reveal(next.id) } }
  if (e.key === 'ArrowDown') { e.preventDefault(); move(at + 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(at - 1) }
  else if (e.key === 'Enter' && row) { e.preventDefault(); if (e.shiftKey) openFull(row); else pick(row) }
  else if (e.key === ' ' && row && target !== searchEl.value) { e.preventDefault(); void saveEntry(row.id, { favorite: !row.favorite }) }
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  // A count on the start page links here with its type
  const wanted = router.currentRoute.value.query.type
  if (typeof wanted === 'string' && isEntryTypeName(wanted)) setTimeout(() => { state.types = new Set([wanted]) }, 50)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="wrap">
    <WorldTabs />
    <div class="world">
      <aside class="filters">
        <div class="head"><h1>World</h1>
          <div class="new">
            <button class="btn btn-primary" @click="adding = !adding"><Plus :size="14" /> New</button>
            <div v-if="adding" class="menu panel">
              <button v-for="t in ENTRY_TYPE_ORDER.filter(x => x !== 'session')" :key="t" class="type" :style="{ '--type': ENTRY_TYPE_INFO[t].color }" @click="add(t)"><component :is="ENTRY_TYPE_INFO[t].icon" :size="14" /> <span>{{ ENTRY_TYPE_INFO[t].label }}</span><span /></button>
            </div>
          </div>
        </div>
        <p class="faint count"><span class="num">{{ shown.length }}</span> of <span class="num">{{ all.length }}</span> entries</p>
        <label class="search"><Search :size="14" /><input ref="searchEl" v-model="state.query" class="input" placeholder="Search names, tags, text…" /><span class="kbd">/</span></label>

        <div class="eyebrow">Type</div>
        <button v-for="t in ENTRY_TYPE_ORDER" :key="t" class="type" :class="{ on: state.types.has(t) }" :style="{ '--type': ENTRY_TYPE_INFO[t].color }" @click="toggleType(t)">
          <component :is="ENTRY_TYPE_INFO[t].icon" :size="14" /> <span>{{ ENTRY_TYPE_INFO[t].plural }}</span> <span class="num faint">{{ counts[t] ?? 0 }}</span>
        </button>

        <template v-for="f in facetOptions" :key="f.label">
          <div class="eyebrow">{{ f.label }}</div>
          <div class="tags">
            <button v-for="[v, n] in f.options" :key="v" class="chip" :class="{ on: state.facets[f.label]?.includes(v) }" @click="toggleFacet(f.label, v)">{{ v }} <span class="num faint">{{ n }}</span></button>
          </div>
        </template>
        <p v-if="!oneType" class="faint hint">Choose one type to filter and group by its fields.</p>

        <div class="eyebrow">Show</div>
        <label class="check"><input v-model="state.favoritesOnly" type="checkbox" /> Favourites only</label>
        <label class="check"><input v-model="state.showArchived" type="checkbox" /> Dead, destroyed, closed, false</label>
        <template v-if="tags.length">
          <div class="eyebrow">Tags</div>
          <div class="tags"><button v-for="[t, n] in tags" :key="t" class="chip" :class="{ on: state.tag === t }" @click="state.tag = state.tag === t ? null : t">#{{ t }} <span class="num faint">{{ n }}</span></button></div>
        </template>
        <button class="btn btn-ghost clear" @click="clear">Clear filters</button>
      </aside>

      <div class="main">
        <div class="tools">
          <select v-model="state.sort" class="input" aria-label="Sort"><option value="name">Name, favourites first</option><option value="updated">Last changed</option><option value="type">Type, then name</option></select>
          <select v-model="state.group" class="input" aria-label="Group by"><option v-for="[v, l] in groupChoices" :key="v" :value="v">{{ v === 'none' ? l : `Group: ${l}` }}</option></select>
          <span class="grow" />
          <button v-for="[d, icon, label] in DENSITIES" :key="d" class="btn btn-ghost btn-icon" :class="{ on: state.density === d }" :title="label" @click="state.density = d"><component :is="icon" :size="16" /></button>
        </div>
        <div class="scroll">
          <div class="list">
            <div v-if="!shown.length" class="empty">
              <template v-if="all.length">Nothing matches. <button class="btn" @click="clear">Clear filters</button></template>
              <template v-else>This campaign has no entries yet.</template>
            </div>
            <WorldList :groups="groups" :density="state.density" :focus-id="focusId" :one-type="oneType" :facets-of="facetsOf" @pick="pick" @open="openFull" />
            <p v-if="shown.length" class="hint faint"><span class="kbd">↑</span> <span class="kbd">↓</span> move · <span class="kbd">Enter</span> open beside · <span class="kbd">Shift</span>+<span class="kbd">Enter</span> or double-click opens the page · <span class="kbd">Space</span> favourite</p>
          </div>
          <nav v-if="letters.length" class="rail" aria-label="Jump to letter"><button v-for="l in letters" :key="l" @click="jump(l)">{{ l }}</button></nav>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap { height: 100%; display: flex; flex-direction: column; }
.world { display: grid; grid-template-columns: 260px minmax(0, 1fr); flex: 1; min-height: 0; }
.filters { padding: 1.2rem 1rem 2rem 1.4rem; border-right: var(--frame); overflow: auto; display: flex; flex-direction: column; gap: .15rem; background-image: var(--wash); }
.head { display: flex; align-items: center; justify-content: space-between; }
.new { position: relative; }
.menu { position: absolute; z-index: 5; top: calc(100% + 4px); right: 0; width: 190px; padding: .3rem; display: flex; flex-direction: column; box-shadow: var(--shadow); }
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
.tags .chip.on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.hint { font-size: .82rem; margin-top: .6rem; }
.clear { margin-top: 1rem; align-self: start; }
.main { display: flex; flex-direction: column; min-height: 0; }
.tools { display: flex; align-items: center; gap: .5rem; padding: .5rem 1.2rem; border-bottom: var(--frame); }
.tools .input { width: auto; }
.tools .on { color: var(--accent); }
.grow { flex: 1; }
.scroll { flex: 1; min-height: 0; display: flex; }
.list { flex: 1; overflow: auto; padding: .4rem 1.2rem 2rem; }
.rail { display: flex; flex-direction: column; justify-content: center; padding: 0 .3rem; border-left: var(--frame); }
.rail button { background: none; border: 0; color: var(--text-faint); font-size: .7rem; padding: 1px 4px; }
.rail button:hover { color: var(--accent); }
</style>
