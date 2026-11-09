/**
 * `{{` link completion for the CodeMirror editors (notes, random table rows):
 * what an open link before the cursor offers, as CodeEditor's `complete`.
 */
import { useEntities } from '~/composables/useEntities'
import { getDb } from '~/composables/useDb'
import { useEntityRendering, typeColorMap } from '~/composables/useEntityRendering'
import { useLinkAutocomplete } from '~/composables/useLinkAutocomplete'
import type { EditorCompletions } from '~/components/CodeEditor.vue'

export function useLinkCompletion(campaignId: () => number) {
  const store = useEntities()
  const { campaignEncounters, campaignGameId } = useEntityRendering(campaignId)
  const { linkCandidates } = useLinkAutocomplete(campaignId, campaignEncounters, campaignGameId)
  const localTypeColorMap: Record<string, string> = { ...typeColorMap, snapshot: 'var(--gold)' }

  /**
   * What an open `{{` before the cursor offers: before the colon, this
   * campaign's entries by type or name; after `{{type: ` entries, encounters,
   * graphs and compendium entries (useLinkAutocomplete); after
   * `{{type: Name @` that entry's historical states. `before` is the line up
   * to the cursor.
   */
  function completeLinks(before: string): EditorCompletions | null | Promise<EditorCompletions | null> {
    const snapMatch = before.match(/\{\{(\w+):\s*([^@|}\n]+?)\s*@\s*([^}|]*)$/)
    if (snapMatch) return completeSnapshots(snapMatch)
    // Before the colon (`{{`, `{{fac`, `{{obsid`): this campaign's entries whose type or name fits; no database read
    const open = before.match(/\{\{\s*([\w-]*)$/)
    if (open) {
      const word = open[1].toLowerCase()
      const items = store.entities
        .filter((e) => e.campaignId === campaignId() && (!word || e.type.startsWith(word) || e.name.toLowerCase().includes(word)))
        .sort((a, b) => Number(!a.type.startsWith(word)) - Number(!b.type.startsWith(word)) || a.name.localeCompare(b.name))
        .slice(0, 8)
      if (!items.length) return null
      return {
        from: open.index!,
        items: items.map((e) => ({ label: e.name, detail: e.type, apply: `{{${e.type}: ${e.name}}}`, color: localTypeColorMap[e.type] ?? '#888' })),
      }
    }
    return completeAfterColon(before)
  }

  /** `{{type: Name @ partial`: that entry's historical states */
  async function completeSnapshots(snapMatch: RegExpMatchArray): Promise<EditorCompletions | null> {
    const [, partialType, entityName, partialLabel] = snapMatch
    const ent = store.findByTypeAndName(partialType.toLowerCase(), entityName.trim())
    if (!ent) return null
    const snaps = await getDb().entitySnapshots.where('entity_id').equals(ent.id).toArray()
    const q = partialLabel.trim().toLowerCase()
    const items = snaps
      .filter((s) => !q || s.label.toLowerCase().includes(q))
      .slice(0, 8)
      .map((s) => ({ label: s.label, detail: 'snapshot', apply: `@ ${s.label}}}`, color: localTypeColorMap.snapshot }))
    return items.length ? { from: snapMatch.index! + snapMatch[0].indexOf('@'), items } : null
  }

  /** After `{{type: `: entries, encounters, graphs and compendium entries */
  async function completeAfterColon(before: string): Promise<EditorCompletions | null> {
    const found = await linkCandidates(before)
    if (!found || !found.items.length) return null
    return {
      from: found.triggerStart,
      items: found.items.map((item) => ({
        label: item.name,
        detail: item.type,
        apply: `{{${item.type}: ${item.name}}}`,
        color: localTypeColorMap[item.type] ?? '#888',
      })),
    }
  }

  return { completeLinks }
}
