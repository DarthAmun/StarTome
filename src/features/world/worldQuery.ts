/**
 * What the World list shows: search, filters, sort and grouping over the
 * campaign's entries. The view choices are remembered per campaign.
 */
import { computed, reactive, watch, type Ref } from 'vue'
import type { Entry, EntryType } from '@/domain/schema'
import { workspace } from '@/data/repo'
import { entryFacets, isArchived } from '@/features/shared/facts'
import { ENTRY_TYPE_INFO, ENTRY_TYPE_ORDER } from '@/ui/entryTypes'

export type Density = 'list' | 'gallery' | 'table'
export type Sort = 'name' | 'updated' | 'type'

interface Saved { sort: Sort; group: string; density: Density; showArchived: boolean }
const DEFAULTS: Saved = { sort: 'name', group: 'none', density: 'list', showArchived: true }

const values = (v: string | string[] | undefined) => (Array.isArray(v) ? v : [v ?? '']).filter(Boolean)
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function useWorldQuery(all: Ref<Entry[]>, campaignId: Ref<string | null>) {
  const state = reactive({
    query: '', types: new Set<EntryType>(), favoritesOnly: false, tag: null as string | null,
    /** Field filters: label → the values ticked. Only offered while one type is chosen. */
    facets: {} as Record<string, string[]>,
    ...DEFAULTS,
  })

  watch(campaignId, async (id) => {
    Object.assign(state, DEFAULTS, id ? await workspace.get<Partial<Saved>>(id, 'world.view', {}) : {})
  }, { immediate: true })
  watch(() => [state.sort, state.group, state.density, state.showArchived], () => {
    if (campaignId.value) void workspace.set(campaignId.value, 'world.view', { sort: state.sort, group: state.group, density: state.density, showArchived: state.showArchived })
  })

  /** The one type chosen, when exactly one is: field filters, field groups and field columns depend on it. */
  const oneType = computed<EntryType | null>(() => (state.types.size === 1 ? [...state.types][0] ?? null : null))
  watch(oneType, () => { state.facets = {}; if (!['none', 'type', 'tag'].includes(state.group)) state.group = 'none' })

  const counts = computed(() => {
    const c: Partial<Record<EntryType, number>> = {}
    for (const e of all.value) c[e.type] = (c[e.type] ?? 0) + 1
    return c
  })
  const tags = computed(() => {
    const c = new Map<string, number>()
    for (const e of all.value) for (const t of e.tags) c.set(t, (c.get(t) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
  })

  function passes(e: Entry, skipFacet?: string): boolean {
    const q = state.query.trim().toLowerCase()
    if (state.types.size && !state.types.has(e.type)) return false
    if (state.favoritesOnly && !e.favorite) return false
    if (!state.showArchived && isArchived(e)) return false
    if (state.tag && !e.tags.includes(state.tag)) return false
    if (q && !(e.name.toLowerCase().includes(q) || e.tags.some(t => t.toLowerCase().includes(q)) || e.body.toLowerCase().includes(q))) return false
    const facets = entryFacets(e)
    for (const [label, wanted] of Object.entries(state.facets)) {
      if (label === skipFacet || !wanted.length) continue
      if (!values(facets[label]).some(v => wanted.includes(v))) return false
    }
    return true
  }

  /** Per field of the chosen type: its values with how many entries each would leave (the other filters applied). */
  const facetOptions = computed(() => {
    if (!oneType.value) return []
    const labels = new Set<string>()
    for (const e of all.value) if (e.type === oneType.value) for (const k of Object.keys(entryFacets(e))) labels.add(k)
    return [...labels].map((label) => {
      const c = new Map<string, number>()
      for (const e of all.value) if (passes(e, label)) for (const v of values(entryFacets(e)[label])) c.set(v, (c.get(v) ?? 0) + 1)
      for (const v of state.facets[label] ?? []) if (!c.has(v)) c.set(v, 0)
      return { label, options: [...c.entries()].sort((a, b) => collator.compare(a[0], b[0])) }
    }).filter(f => f.options.length > 1 || (state.facets[f.label]?.length ?? 0) > 0)
  })

  const shown = computed(() => all.value.filter(e => passes(e)).sort((a, b) => (
    state.sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt)
      : state.sort === 'type' ? ENTRY_TYPE_ORDER.indexOf(a.type) - ENTRY_TYPE_ORDER.indexOf(b.type) || collator.compare(a.name, b.name)
        : Number(b.favorite) - Number(a.favorite) || collator.compare(a.name, b.name))))

  const groupChoices = computed(() => [['none', 'No groups'], ['type', 'Type'], ['tag', 'First tag'], ...facetOptions.value.map(f => [f.label, f.label])] as [string, string][])

  const groups = computed<{ label: string; entries: Entry[] }[]>(() => {
    if (state.group === 'none') return [{ label: '', entries: shown.value }]
    const map = new Map<string, Entry[]>()
    const keyOf = (e: Entry) => (state.group === 'type' ? ENTRY_TYPE_INFO[e.type].plural : state.group === 'tag' ? e.tags[0] ?? '' : values(entryFacets(e)[state.group])[0] ?? '')
    for (const e of shown.value) {
      const k = keyOf(e)
      map.set(k, [...(map.get(k) ?? []), e])
    }
    const order = state.group === 'type' ? ENTRY_TYPE_ORDER.map(t => ENTRY_TYPE_INFO[t].plural) : [...map.keys()].sort((a, b) => Number(!a) - Number(!b) || collator.compare(a, b))
    return order.filter(k => map.has(k)).map(k => ({ label: k || '—', entries: map.get(k) ?? [] }))
  })

  /** The entries in the order they are on screen, for the arrow keys. */
  const flat = computed(() => groups.value.flatMap(g => g.entries))

  function toggleType(t: EntryType) {
    const next = new Set(state.types)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    state.types = next
  }
  function toggleFacet(label: string, value: string) {
    const now = state.facets[label] ?? []
    state.facets = { ...state.facets, [label]: now.includes(value) ? now.filter(v => v !== value) : [...now, value] }
  }
  function clear() {
    state.query = ''; state.types = new Set(); state.favoritesOnly = false; state.tag = null; state.facets = {}; state.showArchived = true
  }

  return { state, oneType, counts, tags, facetOptions, shown, groups, groupChoices, flat, toggleType, toggleFacet, clear }
}
