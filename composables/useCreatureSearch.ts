/**
 * Debounced compendium search for things that can stand on the map: creatures
 * and hazards of the campaign's game. Backs the encounter's Creatures tab, the
 * "Link to Stat Block?" dialog and the token modals' creature pickers.
 */
import { ref, shallowRef, watch, type Ref } from 'vue'
import { rulesQuery } from '~/composables/useRules'
import { resolveImage } from '~/rules/images'
import type { GameId } from '~/types/game'
import type { RulesEntity } from '~/types/rules'

export interface CreatureOption {
  id: string
  name: string
  level: number
  kind: 'creature' | 'hazard'
  /** Displayable URL (portraits are resolved from the image store). */
  img: string | null
}

export async function toCreatureOption(e: RulesEntity): Promise<CreatureOption> {
  const art = (e as { tokenImg?: string | null }).tokenImg || e.img
  return { id: e.id, name: e.name, level: e.level, kind: e.kind as CreatureOption['kind'], img: await resolveImage(art) }
}

export function useCreatureSearch(game: Ref<GameId>, opts: { limit?: number; hazards?: boolean; emptyLists?: boolean } = {}) {
  const search = ref('')
  const results = shallowRef<CreatureOption[]>([])
  const total = ref(0)
  const loading = ref(false)
  let run = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  async function refresh() {
    const mine = ++run
    const text = search.value.trim()
    if (!text && !opts.emptyLists) { results.value = []; total.value = 0; return }
    loading.value = true
    try {
      const limit = opts.limit ?? 50
      const kinds = opts.hazards ? (['creature', 'hazard'] as const) : (['creature'] as const)
      const pages = await Promise.all(kinds.map(kind => rulesQuery({ kind, games: [game.value], text, limit, sort: 'name' })))
      const items = pages.flatMap(p => p.items).sort((a, b) => a.sortName.localeCompare(b.sortName)).slice(0, limit)
      const options = await Promise.all(items.map(toCreatureOption))
      if (mine !== run) return
      results.value = options
      total.value = pages.reduce((n, p) => n + p.total, 0)
    } finally {
      if (mine === run) loading.value = false
    }
  }

  watch([search, game], () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(refresh, 150)
  })

  function reset() {
    search.value = ''
    results.value = []
    total.value = 0
  }

  return { search, results, total, loading, refresh, reset }
}
