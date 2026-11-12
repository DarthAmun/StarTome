/** Shared pieces of the Foundry → StarTome conversion. */
import type { GameId } from '~/types/game'
import type { ActionCost, BulkTenths, Money, Publication, Rarity } from '~/types/rules'
import { parseActionCost } from '~/rules/format'
import { foundryInline, foundryText, type TextContext } from './text'

export interface FoundryDoc {
  _id: string
  name: string
  type: string
  img?: string
  system: any
  items?: FoundryDoc[]
  _stats?: { compendiumSource?: string | null; systemId?: string; systemVersion?: string }
}

export interface ConvertIssue { code: string; detail: string }

export interface ConvertContext extends TextContext {
  game: GameId
  version: string
  pack: string
}

/** 'Compendium.pf2e.equipment-srd.Item.abc' → 'fvtt:pf2e:equipment-srd:abc' */
export function rulesIdFromSource(source: string): string | null {
  const m = source.match(/^Compendium\.([\w-]+)\.([\w-]+)\.(?:\w+\.)?([\w-]+)$/)
  return m ? `fvtt:${m[1]}:${m[2]}:${m[3]}` : null
}

/** The document's canonical Foundry UUID (every release document carries it). */
export function sourceOf(doc: FoundryDoc, ctx: Pick<ConvertContext, 'game' | 'pack'>): string {
  return doc._stats?.compendiumSource || `Compendium.${ctx.game}.${ctx.pack}.Item.${doc._id}`
}

export function publicationOf(pub: any): Publication | undefined {
  if (!pub || (!pub.title && pub.remaster === undefined)) return undefined
  return { title: pub.title || '', remaster: !!pub.remaster, ...(pub.license ? { license: pub.license } : {}) }
}

export function rarityOf(traits: any): Rarity {
  const r = traits?.rarity
  return r === 'uncommon' || r === 'rare' || r === 'unique' ? r : 'common'
}

export function traitsOf(traits: any): string[] {
  return Array.isArray(traits?.value) ? traits.value.filter((t: unknown) => typeof t === 'string') : []
}

const DENOM_CP: Record<string, number> = { pp: 1000, gp: 100, sp: 10, cp: 1, credits: 10, upb: 10 }

/** { gp: 4, sp: 5 } → { cp: 450 }; an empty or zero price is "no price". */
export function moneyOf(value: any): Money | null {
  if (!value || typeof value !== 'object') return null
  let cp = 0
  for (const [k, v] of Object.entries(value)) cp += (DENOM_CP[k] ?? 0) * (Number(v) || 0)
  return cp > 0 ? { cp: Math.round(cp) } : null
}

/** Foundry bulk (0.1 = L) → tenths. */
export function bulkOf(value: unknown): BulkTenths {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 10) : 0
}

/** actionType + actions → ActionCost. */
export function costOf(actionType: any, actions: any): ActionCost {
  const type = actionType?.value ?? actionType
  const n = actions?.value ?? actions
  if (type === 'reaction') return 'reaction'
  if (type === 'free') return 'free'
  if (type === 'passive' || type === undefined || type === null) return null
  return n === 1 || n === 2 || n === 3 ? n : 1
}

/** Spell cast time: '2', 'reaction', '1 to 3', '1 minute', '1 or 2'. */
export function castOf(time: string | undefined | null): ActionCost {
  const t = (time ?? '').trim()
  if (!t) return null
  const or = t.match(/^([123]) or ([123])$/)
  if (or) return { text: `${'◆'.repeat(Number(or[1]))} or ${'◆'.repeat(Number(or[2]))}` }
  return parseActionCost(t.toLowerCase() === 'reaction' ? 'reaction' : t)
}

const PER: Record<string, string> = {
  day: 'day', round: 'round', turn: 'turn', hour: 'hour', PT1H: 'hour', PT10M: '10 minutes', PT1M: 'minute',
  P1W: 'week', P1M: 'month', P1Y: 'year', PT24H: 'day', PT8H: '8 hours',
}

/** { max: 1, per: 'day' } → 'once per day' */
export function frequencyOf(freq: any): string | undefined {
  if (!freq?.per) return undefined
  const max = Number(freq.max) || 1
  const times = max === 1 ? 'once' : max === 2 ? 'twice' : `${max} times`
  return `${times} per ${PER[freq.per] ?? freq.per}`
}

/** 'cold-iron' → 'cold iron', 'low-light-vision' → 'low-light vision' */
export function humanizeSlug(slug: string): string {
  return slug === 'low-light-vision' ? 'low-light vision' : slug.replace(/-/g, ' ')
}

/** 'worncloak' → 'worn cloak', 'held-in-one-hand' → 'held in one hand' */
export function usageOf(value: string | undefined): string | undefined {
  if (!value) return undefined
  const v = value.startsWith('worn') && value.length > 4 && !value.includes('-') ? `worn ${value.slice(4)}` : value
  return v.replace(/-/g, ' ')
}

export function handsOf(usage: string | undefined): string | undefined {
  switch (usage) {
    case 'held-in-one-hand': return '1'
    case 'held-in-two-hands': return '2'
    case 'held-in-one-plus-hands': return '1+'
    case 'held-in-one-or-two-hands': return '1 or 2'
    default: return undefined
  }
}

export function text(html: string | null | undefined, ctx: ConvertContext): string {
  return foundryText(html, ctx)
}

export function inline(html: string | null | undefined, ctx: ConvertContext): string {
  return foundryInline(html, ctx)
}

/** Fields every converted entry shares. */
export function baseFields(doc: FoundryDoc, ctx: ConvertContext, opts: { level: number; traits: any; publication: any }) {
  const source = sourceOf(doc, ctx)
  return {
    id: rulesIdFromSource(source) ?? `fvtt:${ctx.game}:${ctx.pack}:${doc._id}`,
    origin: 'foundry' as const,
    game: ctx.game,
    name: doc.name,
    sortName: doc.name.toLowerCase(),
    level: Number(opts.level) || 0,
    rarity: rarityOf(opts.traits),
    traits: traitsOf(opts.traits),
    publication: publicationOf(opts.publication),
    sourceRefs: [{ system: 'foundry', id: source, version: ctx.version }],
    // Timestamps belong to the stored row; the sync sets them when it writes
    createdAt: '',
    updatedAt: '',
  }
}
