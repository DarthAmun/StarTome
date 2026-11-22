/**
 * The compendium search behind every "add a creature" list (the encounter
 * builder, the battle map's pickers): closest names first, one page at a
 * time, with the total so "Show more" can load the rest.
 */
import { ref, shallowRef, watch, type WatchSource } from 'vue'
import type { RulesEntity } from '@/domain/rules/types'
import { rulesQuery, type RulesQuery } from '@/data/rules'

export function useRulesSearch(query: () => Omit<RulesQuery, 'offset' | 'limit' | 'rank'> | null, opts: { page: number; sources: WatchSource[]; immediate?: boolean }) {
  const results = shallowRef<RulesEntity[]>([])
  const total = ref(0)
  let run = 0
  async function load(offset: number) {
    const mine = ++run
    const q = query()
    if (!q) { results.value = []; total.value = 0; return }
    const page = await rulesQuery({ ...q, rank: true, offset, limit: opts.page })
    if (mine !== run) return
    results.value = offset ? [...results.value, ...page.items] : page.items
    total.value = page.total
  }
  watch(opts.sources, () => load(0), { immediate: opts.immediate })
  /** The next page, after the ones shown. */
  function more() { if (results.value.length < total.value) void load(results.value.length) }
  return { results, total, more }
}
