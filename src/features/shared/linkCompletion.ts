/** What an open `{{` offers while typing: the types first, then names of that type. */
import { canonicalType, isEntryTypeName } from '@/domain/links'
import { RULES_KINDS } from '@/domain/rules/types'
import { ENTRY_TYPES } from '@/domain/schema'
import { graphs } from '@/data/graphs'
import { encounterNames, entries, rulesNamesLike } from '@/data/repo'
import type { CompleteFn, EditorCompletion } from '@/ui/components/CodeEditor.vue'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'

/** Compendium kinds as they are typed in a reference (lower case) → the kind. */
const KIND_BY_WORD = new Map(RULES_KINDS.map(k => [k.toLowerCase(), k]))
const KIND_WORDS = [...KIND_BY_WORD.keys()]

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
        ...KIND_WORDS.filter(k => k.startsWith(q)).map(k => ({ label: KIND_BY_WORD.get(k) ?? k, detail: 'compendium', apply: `{{${KIND_BY_WORD.get(k) ?? k}: ` })),
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
    } else if (KIND_BY_WORD.has(type)) {
      names = await rulesNamesLike(KIND_BY_WORD.get(type) ?? type, q, 12)
    }
    return names.length ? { from: open, items: names.map(n => ({ label: n, detail: type, apply: `{{${typed}: ${n}}}`, color })) } : null
  }
}

/**
 * For one-line fields (the capture bar): `{{` completes as everywhere, and `@Name` finds any
 * entry of the campaign by name and writes its link.
 */
export function mentionCompletion(campaignId: () => string | null): CompleteFn {
  const links = linkCompletion(campaignId)
  return async (before) => {
    const viaBraces = await links(before)
    if (viaBraces) return viaBraces
    const m = /(^|[\s(])@([^@{}\n]{0,40})$/.exec(before)
    const camp = campaignId()
    if (!m || !camp) return null
    const q = (m[2] ?? '').toLowerCase()
    const found = (await entries.ofCampaign(camp)).filter(e => e.type !== 'session' && e.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name)).slice(0, 12)
    if (!found.length) return null
    return { from: before.length - (m[2] ?? '').length - 1, items: found.map(e => ({ label: e.name, detail: ENTRY_TYPE_INFO[e.type].label, apply: `{{${e.type === 'random-table' ? 'table' : e.type}: ${e.name}}}`, color: ENTRY_TYPE_INFO[e.type].color })) }
  }
}
