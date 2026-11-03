/**
 * Attachments: runes, talismans, SF2e upgrades, other affixed accessories and
 * relic gifts, each its own inventory entry pointing at its host (`attachedTo`).
 * An attachment has its own price, level and description, so the host's value
 * is the sum of both with no extra bookkeeping. Pure; useInventory.ts does the IO.
 *
 * The host's `runes` field stays as a summary (fundamental runes and the names
 * of property runes) for the gear check (rules/wealth.ts).
 */
import type { Item, Runes } from '~/types/rules'

export type AttachKind = 'rune' | 'talisman' | 'upgrade' | 'accessory' | 'gift'
export type HostKind = 'weapon' | 'armor' | 'shield'

export const ATTACH_LABEL: Record<AttachKind, string> = {
  rune: 'Rune', talisman: 'Talisman', upgrade: 'Upgrade', accessory: 'Accessory', gift: 'Gift',
}

type AttachableLike = Pick<Item, 'name' | 'traits' | 'category'> & Partial<Pick<Item, 'usage'>>

const HOST_WORDS: [RegExp, HostKind][] = [
  [/\b(weapons?|firearms?|crossbows?|bows?|blades?|daggers?|melee|ranged)\b/, 'weapon'],
  [/\barmor\b/, 'armor'],
  [/\bshields?\b/, 'shield'],
]

/** What an item attaches to, from its usage text ("etched onto a weapon", "affixed to armor or a weapon"). */
export function hostsOf(item: AttachableLike | null | undefined): HostKind[] {
  const usage = item?.usage?.toLowerCase() ?? ''
  if (!/^(etched|affixed|attached|installed)\b/.test(usage)) {
    // SF2e upgrades don't always say where they go
    return item?.traits.includes('upgrade') ? ['weapon', 'armor'] : []
  }
  return HOST_WORDS.filter(([re]) => re.test(usage)).map(([, k]) => k)
}

/** What kind of attachment a compendium item is; null for items that don't attach. */
export function attachKindOf(item: AttachableLike | null | undefined): AttachKind | null {
  if (!item) return null
  if (item.traits.includes('talisman')) return 'talisman'
  if (item.traits.includes('upgrade')) return 'upgrade'
  if (!hostsOf(item).length) return null
  if (item.traits.includes('rune') || item.usage?.toLowerCase().startsWith('etched')) return 'rune'
  return 'accessory'
}

/** The gear kind of a host item; relics can be any item, so they're checked separately. */
export function hostKindOf(item: Pick<Item, 'category'> | null | undefined): HostKind | null {
  const c = item?.category
  return c === 'weapon' || c === 'armor' || c === 'shield' ? c : null
}

/** Whether `attachable` may go on `host`. Free-text hosts take anything (the GM knows what they are). */
export function canAttach(attachable: AttachableLike | null | undefined, host: Pick<Item, 'category'> | null | undefined, hostIsRelic = false): boolean {
  if (!attachable) return false
  const kind = hostKindOf(host)
  if (!host) return true
  if (!kind) return hostIsRelic && hostsOf(attachable).length > 0
  return hostsOf(attachable).includes(kind)
}

// ── Fundamental runes ─────────────────────────────────────────────────────

export type FundamentalSlot = 'weaponPotency' | 'armorPotency' | 'striking' | 'resilient' | 'reinforcing'
export interface Fundamental { slot: FundamentalSlot; value: number }

const TIERS: Record<string, number> = { '': 1, greater: 2, major: 3 }
const REINFORCING: Record<string, number> = { minor: 1, lesser: 2, moderate: 3, greater: 4, major: 5, supreme: 6 }

/** "Weapon Potency (+2)", "Greater Striking", "Striking (Major)", "Reinforcing Rune (Lesser)" → slot and value. */
export function fundamentalOf(name: string): Fundamental | null {
  const n = name.trim().toLowerCase()
  let m = n.match(/^(?:\+(\d) )?(weapon|armor) potency(?: \(\+(\d)\))?$/)
  if (m && (m[1] || m[3])) return { slot: m[2] === 'weapon' ? 'weaponPotency' : 'armorPotency', value: Number(m[1] ?? m[3]) }
  m = n.match(/^(?:(greater|major) )?(striking|resilient)(?: \((greater|major)\))?$/)
  if (m) return { slot: m[2] as 'striking' | 'resilient', value: TIERS[m[1] ?? m[3] ?? ''] }
  m = n.match(/^reinforcing(?: rune)? \((minor|lesser|moderate|greater|major|supreme)\)$/)
  if (m) return { slot: 'reinforcing', value: REINFORCING[m[1]] }
  return null
}

export interface AttachedLike { name: string; kind: AttachKind }

/** The host's `runes` summary from its attached runes; null when it has none. */
export function runesSummary(attached: AttachedLike[]): Runes | null {
  const runes: Runes = { potency: 0, property: [] }
  for (const a of attached) {
    if (a.kind !== 'rune') continue
    const f = fundamentalOf(a.name)
    if (!f) { runes.property.push(a.name.toLowerCase()); continue }
    if (f.slot === 'weaponPotency' || f.slot === 'armorPotency') runes.potency = Math.max(runes.potency, f.value)
    else if (f.slot === 'striking') runes.striking = Math.max(runes.striking ?? 0, f.value)
    else if (f.slot === 'resilient') runes.resilient = Math.max(runes.resilient ?? 0, f.value)
  }
  return runes.potency || runes.striking || runes.resilient || runes.property.length ? runes : null
}

/** A label like "+1 striking flaming" for the host row. */
export function attachedLabel(attached: AttachedLike[]): string {
  const r = runesSummary(attached)
  if (!r) return ''
  const fund = r.striking ? ['striking', 'greater striking', 'major striking'][r.striking - 1]
    : r.resilient ? ['resilient', 'greater resilient', 'major resilient'][r.resilient - 1] : ''
  return [r.potency ? `+${r.potency}` : '', fund, ...r.property].filter(Boolean).join(' ')
}

/** Ids of attachments a new one replaces: a fundamental rune replaces the one in its slot. */
export function replacedBy<A extends AttachedLike & { id: number }>(attached: A[], incoming: AttachedLike): number[] {
  if (incoming.kind !== 'rune') return []
  const f = fundamentalOf(incoming.name)
  if (!f) return []
  return attached.filter(a => a.kind === 'rune' && fundamentalOf(a.name)?.slot === f.slot).map(a => a.id)
}

/**
 * Rule warnings for a host. They never block: feats, relics and house rules
 * all bend these.
 */
export function attachmentWarnings(attached: AttachedLike[], host: { kind: HostKind | null; relic: boolean }): string[] {
  const out: string[] = []
  const runes = attached.filter(a => a.kind === 'rune')
  const property = runes.filter(a => !fundamentalOf(a.name))
  const potency = runesSummary(runes)?.potency ?? 0
  if ((host.kind === 'weapon' || host.kind === 'armor') && property.length > potency) {
    out.push(host.relic
      ? 'Relics take no property runes unless you allow them (GMG p. 95).'
      : potency
        ? `${property.length} property runes but potency +${potency}: only ${potency} fit.`
        : `Property rune${property.length === 1 ? '' : 's'} without a potency rune: none fit.`)
  }
  const talismans = attached.filter(a => a.kind === 'talisman').length
  if (talismans > 1) out.push(`${talismans} talismans affixed: normally only one at a time.`)
  return out
}

// ── Relic gifts ───────────────────────────────────────────────────────────

/**
 * Gold Piece Equivalent of a relic's 1st…5th gift, GMG Table 2–22,
 * https://2e.aonprd.com/Rules.aspx?ID=1101 (checked 2026-11-03): what to
 * take off treasure for it. Further gifts count as the 5th.
 */
export const GIFT_GOLD_EQUIVALENT_CP = [2_000, 16_000, 70_000, 300_000, 1_500_000]

/** Minimum level per gift in the same table. */
export const GIFT_MIN_LEVEL = [1, 5, 9, 13, 17]

export interface GiftLike { id: number; attachedTo?: number | null; attachKind?: AttachKind | null; identified: boolean }

/**
 * Value of every relic gift entry in cp. Awakened (identified) gifts take
 * their relic's next slot in Table 2–22, in the order they were added; a
 * gift that hasn't awakened is worth 0, so planned gifts don't count yet.
 */
export function giftValues(entries: GiftLike[]): Map<number, number> {
  const out = new Map<number, number>()
  const byRelic = new Map<number, GiftLike[]>()
  for (const e of entries) {
    if (e.attachKind !== 'gift' || e.attachedTo == null) continue
    if (!e.identified) { out.set(e.id, 0); continue }
    const list = byRelic.get(e.attachedTo) ?? []
    list.push(e)
    byRelic.set(e.attachedTo, list)
  }
  for (const gifts of byRelic.values()) {
    gifts.sort((a, b) => a.id - b.id)
    gifts.forEach((g, i) => out.set(g.id, GIFT_GOLD_EQUIVALENT_CP[Math.min(i, GIFT_GOLD_EQUIVALENT_CP.length - 1)]))
  }
  return out
}
