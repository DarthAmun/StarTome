<script setup lang="ts">
/** The entries of the World list as rows, as a gallery of cards, or as a table. */
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, Star } from 'lucide-vue-next'
import type { Entry, EntryType } from '@/domain/schema'
import { entryMeta, isArchived } from '@/features/shared/facts'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'
import { excerpt } from '@/ui/markdown'
import EntryThumb from './EntryThumb.vue'
import type { Density } from './worldQuery'

const props = defineProps<{ groups: { label: string; entries: Entry[] }[]; density: Density; focusId: string | null; oneType: EntryType | null; facetsOf: (e: Entry) => Record<string, string | string[]> }>()
const emit = defineEmits<{ pick: [entry: Entry]; open: [entry: Entry] }>()

/** Table columns: the fields of the one chosen type, or type and tags across types. */
const columns = computed(() => {
  const first = props.groups.flatMap(g => g.entries)[0]
  return props.oneType && first ? Object.keys(props.facetsOf(first)) : []
})
const cell = (e: Entry, label: string) => { const v = props.facetsOf(e)[label]; return (Array.isArray(v) ? v.join(', ') : v) || '—' }
const typeStyle = (e: Entry) => ({ '--type': ENTRY_TYPE_INFO[e.type].color })

/** Groups folded away (by label), and how many entries are drawn: long lists come a page at a time. */
const PAGE = 200
const folded = ref(new Set<string>())
const limit = ref(PAGE)
const total = computed(() => props.groups.reduce((n, g) => n + (folded.value.has(g.label) ? 0 : g.entries.length), 0))
watch(() => props.groups.map(g => g.label).join('\u0001'), () => { limit.value = PAGE })

function fold(label: string) {
  const next = new Set(folded.value)
  if (next.has(label)) next.delete(label)
  else next.add(label)
  folded.value = next
}

/** What is drawn: each open group's entries until the page limit is used up. */
const drawn = computed(() => {
  let left = limit.value
  return props.groups.map((g) => {
    const open = !folded.value.has(g.label)
    const entries = open ? g.entries.slice(0, Math.max(0, left)) : []
    left -= entries.length
    return { label: g.label, count: g.entries.length, open, entries, preview: open ? '' : g.entries.slice(0, 6).map(e => e.name).join(' · ') + (g.entries.length > 6 ? ' …' : '') }
  }).filter(g => !g.open || g.entries.length || !g.count)
})

// The arrow keys can reach an entry that is folded away or beyond the page: bring it on screen
watch(() => props.focusId, (id) => {
  if (!id) return
  let before = 0
  for (const g of props.groups) {
    const at = g.entries.findIndex(e => e.id === id)
    if (at < 0) { if (!folded.value.has(g.label)) before += g.entries.length; continue }
    if (folded.value.has(g.label)) fold(g.label)
    if (before + at >= limit.value) limit.value = Math.ceil((before + at + 1) / PAGE) * PAGE
    return
  }
})

</script>

<template>
  <div class="world-list" :class="density">
    <section v-for="g in drawn" :key="g.label">
      <h3 v-if="g.label" class="group" :class="{ folded: !g.open }" :aria-expanded="g.open" data-test="world-group" @click="fold(g.label)">
        <component :is="g.open ? ChevronDown : ChevronRight" :size="14" /><span>{{ g.label }}</span><span class="num faint">{{ g.count }}</span><span v-if="!g.open" class="preview">{{ g.preview }}</span>
      </h3>

      <template v-if="!g.open" />
      <table v-else-if="density === 'table'" class="table">
        <thead><tr><th>Name</th><th v-if="!oneType">Type</th><th v-for="c in columns" :key="c">{{ c }}</th><th>Tags</th><th>Changed</th></tr></thead>
        <tbody>
          <tr v-for="e in g.entries" :key="e.id" :class="{ focus: e.id === focusId, archived: isArchived(e) }" :data-entry="e.id" :style="typeStyle(e)" @click="emit('pick', e)" @dblclick="emit('open', e)">
            <td class="name"><Star v-if="e.favorite" :size="11" class="fav" fill="currentColor" /> {{ e.name }}</td>
            <td v-if="!oneType" class="type">{{ ENTRY_TYPE_INFO[e.type].label }}</td>
            <td v-for="c in columns" :key="c">{{ cell(e, c) }}</td>
            <td class="dim">{{ e.tags.map(t => `#${t}`).join(' ') }}</td><td class="num faint">{{ e.updatedAt.slice(0, 10) }}</td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="density === 'gallery'" class="gallery">
        <div v-for="e in g.entries" :key="e.id" class="card" :class="{ focus: e.id === focusId, archived: isArchived(e) }" :data-entry="e.id" :style="typeStyle(e)" tabindex="-1" @click="emit('pick', e)" @dblclick="emit('open', e)">
          <EntryThumb :entry="e" class="big" />
          <div class="card-name">{{ e.name }} <Star v-if="e.favorite" :size="12" class="fav" fill="currentColor" /></div>
          <div class="card-meta dim">{{ entryMeta(e) || ENTRY_TYPE_INFO[e.type].label }}</div>
        </div>
      </div>

      <template v-else>
        <div v-for="e in g.entries" :key="e.id" class="row" :class="{ focus: e.id === focusId, archived: isArchived(e) }" :data-entry="e.id" :style="typeStyle(e)" tabindex="-1" @click="emit('pick', e)" @dblclick="emit('open', e)">
          <EntryThumb :entry="e" />
          <div class="row-main">
            <div class="row-name">{{ e.name }} <Star v-if="e.favorite" :size="12" class="fav" fill="currentColor" /></div>
            <div class="row-meta dim">{{ entryMeta(e) || excerpt(e.body, 90) }}</div>
          </div>
          <span class="row-type">{{ ENTRY_TYPE_INFO[e.type].label }}</span>
        </div>
      </template>
    </section>
    <p v-if="total > limit" class="more"><button class="btn" data-test="world-more" @click="limit += PAGE">Show {{ Math.min(PAGE, total - limit) }} more</button> <button class="btn btn-ghost" @click="limit = total">All {{ total }}</button></p>
  </div>
</template>

<style scoped>
.group { display: flex; gap: .5rem; align-items: baseline; cursor: pointer; margin: 1.1rem 0 .4rem; padding-bottom: .25rem; border-bottom: 1px solid var(--line-strong); color: var(--accent); }
.group.folded { color: var(--text-dim); }
.group :deep(svg) { align-self: center; flex: none; }
.preview { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-ui); font-size: .82rem; font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--text-faint); }
.more { margin: 1rem 0; display: flex; gap: .5rem; justify-content: center; }
.row { display: grid; grid-template-columns: 38px 1fr auto; gap: .8rem; align-items: center; padding: .4rem .7rem; border-left: 2px solid transparent; border-bottom: var(--frame); cursor: pointer; }
.row:hover, .card:hover, tbody tr:hover { background: var(--bg-hover); }
.row.focus { border-left-color: var(--type); background: var(--bg-raised); }
.archived { opacity: .55; }
.row-name { font-weight: 500; }
.row-meta { font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-main { min-width: 0; }
.row-type, .type { font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; color: var(--type); }
.fav { color: var(--accent); }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: .7rem; }
.card { padding: .7rem; border: var(--frame); border-top: 2px solid var(--type); border-radius: var(--radius); background: var(--bg-raised); cursor: pointer; text-align: center; }
.card.focus { border-color: var(--type); box-shadow: 0 0 0 1px var(--type); }
.card :deep(.thumb.big) { width: 96px; height: 96px; margin: 0 auto .5rem; }
.card :deep(.thumb.big svg) { width: 40px; height: 40px; }
.card-name { font-weight: 600; }
.card-meta { font-size: .8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.table { width: 100%; border-collapse: collapse; font-size: .92rem; }
.table th { text-align: left; font-weight: 500; font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; color: var(--text-faint); padding: .3rem .6rem; border-bottom: 1px solid var(--line-strong); position: sticky; top: 0; background: var(--bg); }
.table td { padding: .32rem .6rem; border-bottom: var(--frame); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.table tr { cursor: pointer; }
.table tr.focus td { background: var(--bg-raised); }
.table tr.focus td:first-child { box-shadow: inset 2px 0 0 var(--type); }
.table .name { font-weight: 500; }
</style>
