/** What an open `{{` offers while typing: the types first, then names of that type. */
import { canonicalType, isEntryTypeName } from '@/domain/links'
import { ENTRY_TYPES } from '@/domain/schema'
import { graphs } from '@/data/graphs'
import { encounterNames, entries, rulesNamesLike } from '@/data/repo'
import type { CompleteFn, EditorCompletion } from '@/ui/components/CodeEditor.vue'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'

const RULES_KINDS = ['creature', 'item', 'spell', 'hazard', 'feat', 'action', 'condition', 'ancestry', 'background', 'class', 'deity', 'vehicle', 'starship']

export function linkCompletion(campaignId: () => string | null): CompleteFn {
  return async (before) => {
    const open = before.lastIndexOf('{{')
    if (open === -1 || before.indexOf('}}', open) !== -1) return null
    const inside = before.slice(open + 2)
    const colon = inside.indexOf(':')
    if (colon === -1) {
      const q = inside.trim().toLowerCase()
      const items: EditorCompletion[] = [
        ...ENTRY_TYPES.filter(t => t !== 'region' && t.startsWith(q)).map(t => ({ label: ENTRY_TYPE_INFO[t].label, detail: 'entry', apply: `{{${t === 'random-table' ? 'table' : t}: `, color: ENTRY_TYPE_INFO[t].color })),
        ...RULES_KINDS.filter(k => k.startsWith(q)).map(k => ({ label: k, detail: 'compendium', apply: `{{${k}: ` })),
        ...['encounter', 'graph'].filter(k => k.startsWith(q)).map(k => ({ label: k, detail: 'campaign', apply: `{{${k}: ` })),
        ...('roll'.startsWith(q) ? [{ label: 'roll', detail: 'dice', apply: '{{roll: ' }] : []),
      ]
      return items.length ? { from: open, items } : null
    }
    const type = canonicalType(inside.slice(0, colon).trim())
    const q = inside.slice(colon + 1).trim().toLowerCase()
    const typed = inside.slice(0, colon).trim()
    const camp = campaignId()
    let names: string[] = []
    let color: string | undefined
    if (isEntryTypeName(type)) {
      if (!camp) return null
      color = ENTRY_TYPE_INFO[type].color
      names = (await entries.ofType(camp, type)).map(e => e.name).filter(n => n.toLowerCase().includes(q)).sort((a, b) => Number(b.toLowerCase().startsWith(q)) - Number(a.toLowerCase().startsWith(q)) || a.localeCompare(b)).slice(0, 12)
    } else if (type === 'encounter' || type === 'graph') {
      if (!camp) return null
      const all = type === 'encounter' ? await encounterNames(camp) : (await graphs.ofCampaign(camp)).map(g => g.name)
      names = all.filter(n => n.toLowerCase().includes(q)).slice(0, 12)
    } else if (RULES_KINDS.includes(type)) {
      names = await rulesNamesLike(type, q, 12)
    }
    return names.length ? { from: open, items: names.map(n => ({ label: n, detail: type, apply: `{{${typed}: ${n}}}`, color })) } : null
  }
}
