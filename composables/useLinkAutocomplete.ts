/**
 * What `{{type: Name}}` link autocomplete offers while typing: campaign
 * entries, encounters, graphs and (once the kind is unambiguous) compendium
 * entries. Shared by the markdown editor and the session board's capture bar,
 * which also offers `@name` mentions of campaign entries.
 */
import type { Ref } from 'vue'
import { useEntities } from '~/composables/useEntities'
import { dbApi } from '~/composables/useDb'
import { rulesQuery } from '~/composables/useRules'
import { RULES_KINDS } from '~/types/rules'
import type { GameId } from '~/types/game'

export interface LinkCandidate { type: string; name: string; id: number }
export interface LinkCandidates { items: LinkCandidate[]; triggerStart: number }

export function useLinkAutocomplete(
  campaignId: () => number,
  encounters: Ref<{ id: number; name: string }[]>,
  gameId: Ref<GameId>,
) {
  const store = useEntities()

  /** Candidates for an open `{{type: partial` before the cursor; null when there is none. */
  async function linkCandidates(before: string): Promise<LinkCandidates | null> {
    const match = before.match(/\{\{(\w+):\s*([^}@]*)$/)
    if (!match) return null
    const partialType = match[1].toLowerCase()
    if (partialType === 'roll') return null
    const partialName = match[2]
    const has = (name: string) => !partialName || name.toLowerCase().includes(partialName.toLowerCase())

    const campaignCandidates = store.entities
      .filter(e => e.campaignId === campaignId() && (!partialType || e.type.startsWith(partialType)) && has(e.name))
      .map(e => ({ type: e.type, name: e.name, id: e.id }))
    const encounterCandidates = 'encounter'.startsWith(partialType)
      ? encounters.value.filter(e => has(e.name)).map(e => ({ type: 'encounter', name: e.name, id: e.id }))
      : []
    let graphCandidates: LinkCandidate[] = []
    if ('graph'.startsWith(partialType)) {
      const graphs = await dbApi.graphLayout.list(campaignId())
      graphCandidates = graphs
        .filter(g => has(g.name ?? 'Default'))
        .map(g => ({ type: 'graph', name: g.name ?? 'Default', id: g.id! }))
    }
    // Compendium entries once the typed kind is unambiguous ({{spell: fir…)
    let rulesCandidates: LinkCandidate[] = []
    const rulesKinds = RULES_KINDS.filter(k => k.startsWith(partialType))
    if (partialType && rulesKinds.length === 1 && partialName.trim()) {
      const page = await rulesQuery({ kind: rulesKinds[0], text: partialName.trim(), games: [gameId.value], limit: 6 })
      rulesCandidates = page.items.map(e => ({ type: e.kind, name: e.name, id: -1 }))
    }
    return {
      items: [...campaignCandidates, ...encounterCandidates, ...graphCandidates, ...rulesCandidates].slice(0, 8),
      triggerStart: before.length - match[0].length,
    }
  }

  /** Candidates for an `@partial` mention before the cursor (campaign entries only). */
  function mentionCandidates(before: string): LinkCandidates | null {
    const match = before.match(/(^|\s)@([^\s@{}][^@{}\n]{0,40})$|(^|\s)@$/)
    if (!match) return null
    const partial = (match[2] ?? '').toLowerCase()
    const at = before.lastIndexOf('@')
    const items = store.entities
      .filter(e => e.campaignId === campaignId() && e.type !== 'session' && (!partial || e.name.toLowerCase().includes(partial)))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(partial)) - Number(!b.name.toLowerCase().startsWith(partial)))
      .slice(0, 8)
      .map(e => ({ type: e.type, name: e.name, id: e.id }))
    return { items, triggerStart: at }
  }

  return { linkCandidates, mentionCandidates }
}
