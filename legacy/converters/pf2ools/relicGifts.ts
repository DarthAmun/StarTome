/**
 * Pf2ools relic gifts → homebrew entries (HOMEBREW_FORMAT.md), so they go
 * through the normal homebrew check and import.
 *
 * Source: https://github.com/Pf2ools/pf2ools-data (MIT), the bundle
 * `bundles/byDatatype/core/relicGift.json` or single files from
 * `data/core/<book>/relicGift/`. Its text uses 5etools-style tags
 * (`{@item flaming}`, `{@damage 6d6}`); they become our links and rolls.
 */
import { GIFT_TIERS, type GiftTier } from '~/types/rules'

const BOOKS: Record<string, string> = {
  CRB: 'Core Rulebook', GMG: 'Gamemastery Guide', TV: 'Treasure Vault', SoM: 'Secrets of Magic',
  LOHh: 'Lost Omens: Highhelm', RoE: 'Rage of Elements', SKT1: 'Sky King\'s Tomb',
}

/** Pre-Remaster spell schools: the Remaster dropped them as traits. */
const SCHOOLS = new Set(['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation'])

/** The pack every imported gift lands in (rules/packs.ts), so a newer bundle updates it. */
export const PF2OOLS_RELIC_PACK = 'Relic Gifts (pf2ools)'

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Whether parsed JSON is pf2ools relic gift data: the bundle, a list or one gift. */
export function isPf2oolsRelicGifts(data: unknown): boolean {
  const list = pf2oolsList(data)
  return !!list?.length && list.every(e => isObj(e) && e.type === 'relicGift' && isObj(e.data))
}

function pf2oolsList(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data
  if (isObj(data) && Array.isArray(data.relicGift)) return data.relicGift
  if (isObj(data) && data.type === 'relicGift') return [data]
  return null
}

const ACTIONS: Record<string, string> = { '1': '◆', '2': '◆◆', '3': '◆◆◆', a: '◆', d: '◆◆', t: '◆◆◆', f: '◇', r: '↺', '0': '◇' }

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** One tag's content → our markdown. `parts` are the `|`-separated fields: name|source|display. */
function tag(name: string, body: string): string {
  const parts = body.split('|').map(p => p.trim())
  const shown = parts[2] || parts[0]
  switch (name) {
    case 'item': case 'spell': case 'creature': case 'feat': case 'action':
      return `{{${name}: ${capital(parts[0])}}}`
    case 'relicGift':
      return `{{relicGift: ${capital(parts[0])}}}`
    case 'condition': {
      // "enfeebled 1": the value stays outside the link
      const m = parts[0].match(/^(.*?)(?:\s+(\d+))?$/)!
      return `{{condition: ${capital(m[1])}}}${m[2] ? ` ${m[2]}` : ''}`
    }
    case 'damage': case 'dice': return `::dice[${parts[0].replace(/\s+/g, '')}]`
    case 'd20': return `::dice[1d20${parts[0].replace(/\s+/g, '')}]`
    case 'b': case 'bold': return `**${parts[0]}**`
    case 'i': case 'italic': case 'note': return `*${parts[0]}*`
    case 'as': return ACTIONS[parts[0]] ?? parts[0]
    case 'quickref': return parts[3] || parts[0]
    case 'filter': return parts[0]
    default: return shown
  }
}

/** Replaces tags innermost first, so `{@note gains the {@item flaming} rune}` works. */
export function convertTags(text: string): string {
  // Our own {{links}} are parked as \x01…\x02 while outer tags are still being matched
  let out = text
  let prev = ''
  while (prev !== out) {
    prev = out
    out = out.replace(/\{@(\w+)\s*([^{}]*)\}/g, (_, n: string, b: string) => tag(n, b).replace(/\{\{/g, '\x01').replace(/\}\}/g, '\x02'))
  }
  // The source has a few unbalanced tags; what's left of them is dropped
  return out.replace(/\{@\w+\s*/g, '').replace(/\x01/g, '{{').replace(/\x02/g, '}}')
}

type Activation = { cost: number | 'reaction' | 'free' | null; traits?: string[]; frequency?: string; trigger?: string; text?: string }

function costOf(activity: any): Activation['cost'] {
  if (!isObj(activity)) return null
  if (activity.unit === 'reaction') return 'reaction'
  if (activity.unit === 'free') return 'free'
  if (activity.unit === 'action') return Number(activity.number) || 1
  return null
}

function glyph(cost: Activation['cost'], activity: any): string {
  if (cost === 'reaction') return '↺'
  if (cost === 'free') return '◇'
  if (typeof cost === 'number') return '◆'.repeat(cost)
  return isObj(activity) ? `${activity.number} ${activity.unit}${activity.number === 1 ? '' : 's'}` : ''
}

function frequencyOf(f: any): string | undefined {
  if (!f) return undefined
  if (typeof f === 'string') return convertTags(f)
  if (isObj(f)) {
    if (f.special) return convertTags(String(f.special))
    const times = f.number === 1 || f.number == null ? 'once' : `${f.number} times`
    return `${times} per ${f.interval && f.interval > 1 ? `${f.interval} ` : ''}${f.unit}${f.interval > 1 ? 's' : ''}`
  }
  return undefined
}

function blocks(entries: unknown[], activations: Activation[]): string[] {
  const out: string[] = []
  for (const e of entries) {
    if (typeof e === 'string') { out.push(convertTags(e)); continue }
    if (!isObj(e)) continue
    if (e.type === 'list' && Array.isArray(e.items)) {
      out.push(e.items.map((i: unknown) => `- ${typeof i === 'string' ? convertTags(i) : blocks([i], activations).join(' ')}`).join('\n'))
    } else if (e.type === 'ability') {
      const cost = costOf(e.activity)
      const traits = Array.isArray(e.traits) ? e.traits.map((t: any) => String(t.trait ?? t).toLowerCase()) : []
      const components = Array.isArray(e.components) ? e.components.map((c: unknown) => convertTags(String(c))) : []
      const frequency = frequencyOf(e.frequency)
      const trigger = e.trigger ? convertTags(String(e.trigger)) : undefined
      const text = blocks(Array.isArray(e.entries) ? e.entries : [], activations).join('\n\n')
      activations.push({ cost, ...(traits.length ? { traits } : {}), ...(frequency ? { frequency } : {}), ...(trigger ? { trigger } : {}), ...(text ? { text } : {}) })
      const head = [`**Activate${e.name ? ` — ${e.name}` : ''}** ${glyph(cost, e.activity)}`, components.length || traits.length ? `(${[...components, ...traits].join(', ')})` : '']
        .filter(Boolean).join(' ')
      const lines = [head + (frequency ? `; **Frequency** ${frequency}` : '') + (trigger ? `; **Trigger** ${trigger}` : '')]
      if (text) lines.push(`**Effect** ${text}`)
      out.push(lines.join('\n'))
    } else if (Array.isArray(e.entries)) {
      out.push(...blocks(e.entries, activations))
    }
  }
  return out
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** One pf2ools gift → a homebrew `relicGift` entry (before the homebrew check). */
export function convertPf2oolsGift(raw: any): Record<string, unknown> {
  const d = raw.data ?? {}
  const name = String(raw.name?.primary ?? raw.name ?? '').trim() + (raw.name?.specifier ? ` (${raw.name.specifier})` : '')
  const tier = String(d.tier ?? '').toLowerCase() as GiftTier
  const activations: Activation[] = []
  const text = blocks(Array.isArray(d.entries) ? d.entries : [], activations)
  const source = raw.source?.ID ? `${BOOKS[raw.source.ID] ?? raw.source.ID}${raw.source.page ? ` p. ${raw.source.page}` : ''}` : ''
  const aspects = (Array.isArray(d.aspects) ? d.aspects : []).map((a: any) => String(a.name ?? a).toLowerCase()).filter(Boolean)
  const aspectNotes = (Array.isArray(d.aspects) ? d.aspects : []).filter((a: any) => a.note).map((a: any) => `${a.name}: ${convertTags(String(a.note))}`)
  const traits = (Array.isArray(d.traits) ? d.traits : []).map((t: any) => String(t.trait ?? t).toLowerCase()).filter((t: string) => t && !SCHOOLS.has(t))
  const rune = d._tags?.misc?.['Is rune'] ? JSON.stringify(d.entries ?? []).match(/\{@item ([^|}]+)/)?.[1] : undefined
  const prerequisites = typeof d.prerequisites === 'string' ? [convertTags(d.prerequisites)] : Array.isArray(d.prerequisites) ? d.prerequisites.map((p: unknown) => convertTags(String(p))) : []
  const description = [
    ...text,
    aspectNotes.length ? `**Aspects** ${aspectNotes.join('; ')}` : '',
    source ? `*Source: ${source}*` : '',
  ].filter(Boolean).join('\n\n')
  return {
    id: `pf2ools:relicGift:${raw.source?.ID ?? 'x'}:${slug(name)}`,
    kind: 'relicGift',
    game: 'pf2e',
    name,
    level: 0,
    rarity: 'common',
    traits,
    description,
    tier: (GIFT_TIERS as string[]).includes(tier) ? tier : 'minor',
    aspects,
    ...(prerequisites.length ? { prerequisites } : {}),
    ...(activations.length ? { activation: activations } : {}),
    ...(rune ? { grantsRune: capital(rune.trim()) } : {}),
    publication: { title: PF2OOLS_RELIC_PACK, remaster: false },
  }
}

/** The bundle (or a list, or one gift) → homebrew entries. */
export function convertPf2oolsRelicGifts(data: unknown): Record<string, unknown>[] {
  return (pf2oolsList(data) ?? []).filter(isObj).map(convertPf2oolsGift)
}
