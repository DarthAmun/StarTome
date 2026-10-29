/**
 * Inventory rules (FEATURES_PLAN.md P3, §1–§2, §9.3): owners, the effective
 * values of an entry, moves and splits, coin splits, totals, Bulk and the
 * player-safe projection. Pure; useInventory.ts does the IO.
 *
 * One list for everyone: an entry belongs to a character, the party stash or
 * a VTT encounter (its planned loot). A linked entry inherits name, price,
 * Bulk, level, rarity and traits from its compendium item unless overridden.
 */
import type { BulkTenths, Item, Rarity, Runes } from '~/types/rules'

// ── Owners ────────────────────────────────────────────────────────────────

/** 'stash' | 'character:<id>' | 'encounter:<id>' — one string so it can be indexed. */
export type OwnerKey = string
export type OwnerKind = 'stash' | 'character' | 'encounter'

export const STASH: OwnerKey = 'stash'
export const characterOwner = (id: number): OwnerKey => `character:${id}`
export const encounterOwner = (id: number): OwnerKey => `encounter:${id}`

export function parseOwner(key: OwnerKey): { kind: OwnerKind; id: number | null } {
  if (key === STASH) return { kind: 'stash', id: null }
  const m = key.match(/^(character|encounter):(\d+)$/)
  if (!m) return { kind: 'stash', id: null }
  return { kind: m[1] as OwnerKind, id: Number(m[2]) }
}

// ── Entries ───────────────────────────────────────────────────────────────

export interface InventoryEntry {
  id: number
  owner: OwnerKey
  /** Compendium item; null for a free-text entry. */
  itemId: string | null
  quantity: number
  nameOverride: string | null
  /** Unit price in cp (per the item's `priceFor` batch when linked). */
  priceOverride: number | null
  bulkOverride: BulkTenths | null
  /** GM notes; may hold `> [!hidden]` blocks like any lore text. */
  notes: string
  identified: boolean
  /** What players call it while unidentified; defaults to the item's `unidentified.name`. */
  playerName: string | null
  /** What players read while unidentified; never the linked description. */
  playerDescription: string | null
  runes: Runes | null
  grade: string | null
}

type ItemLike = Pick<Item, 'name' | 'price' | 'priceFor' | 'bulk' | 'level' | 'rarity' | 'traits' | 'unidentified' | 'category'>

export interface EffectiveEntry {
  name: string
  /** Price of one batch (`per` units) in cp; null = unknown. */
  unitPrice: number | null
  per: number
  bulk: BulkTenths
  level: number | null
  rarity: Rarity | null
  traits: string[]
  consumable: boolean
}

export function effective(entry: InventoryEntry, item?: ItemLike | null): EffectiveEntry {
  return {
    name: entry.nameOverride?.trim() || item?.name || 'Unnamed item',
    unitPrice: entry.priceOverride ?? item?.price?.cp ?? null,
    per: Math.max(1, item?.priceFor ?? 1),
    bulk: entry.bulkOverride ?? item?.bulk ?? 0,
    level: item?.level ?? null,
    rarity: item?.rarity ?? null,
    traits: item?.traits ?? [],
    consumable: item?.category === 'consumable' || item?.category === 'ammunition' || !!item?.traits.includes('consumable'),
  }
}

/** Value of the whole stack in cp. Batched items (ammunition) price per batch. */
export function entryValue(entry: InventoryEntry, item?: ItemLike | null): number {
  const e = effective(entry, item)
  if (e.unitPrice == null) return 0
  return Math.round((e.unitPrice * entry.quantity) / e.per)
}

/** Bulk of the whole stack in tenths; batched items count per batch, rounded up. */
export function entryBulk(entry: InventoryEntry, item?: ItemLike | null): number {
  const e = effective(entry, item)
  if (!e.bulk) return 0
  return e.bulk * Math.ceil(entry.quantity / e.per)
}

// ── Moves ─────────────────────────────────────────────────────────────────

export type MovePlan =
  | { type: 'none' }
  /** The whole stack changes owner. */
  | { type: 'reassign'; entryId: number; to: OwnerKey }
  /** Part of the stack: the source keeps `remaining`, a copy with `quantity` goes to `to`. */
  | { type: 'split'; entryId: number; to: OwnerKey; quantity: number; remaining: number }

export function planMove(entry: Pick<InventoryEntry, 'id' | 'owner' | 'quantity'>, to: OwnerKey, quantity?: number): MovePlan {
  if (entry.owner === to) return { type: 'none' }
  const qty = quantity == null ? entry.quantity : Math.floor(quantity)
  if (qty <= 0) return { type: 'none' }
  if (qty >= entry.quantity) return { type: 'reassign', entryId: entry.id, to }
  return { type: 'split', entryId: entry.id, to, quantity: qty, remaining: entry.quantity - qty }
}

/** Two entries are the same thing when everything but owner, quantity and id matches. */
export function sameStack(a: InventoryEntry, b: InventoryEntry): boolean {
  return a.itemId === b.itemId && a.nameOverride === b.nameOverride && a.priceOverride === b.priceOverride
    && a.bulkOverride === b.bulkOverride && a.notes === b.notes && a.identified === b.identified
    && a.playerName === b.playerName && a.playerDescription === b.playerDescription
    && a.grade === b.grade && JSON.stringify(a.runes) === JSON.stringify(b.runes)
}

// ── Currency ──────────────────────────────────────────────────────────────

/** "Split evenly": each recipient gets floor(total / n), the rest stays with the source. */
export function splitCoins(totalCp: number, recipients: number): { each: number; remainder: number } {
  const total = Math.max(0, Math.floor(totalCp))
  if (recipients <= 0) return { each: 0, remainder: total }
  const each = Math.floor(total / recipients)
  return { each, remainder: total - each * recipients }
}

/** Coins a purse is carried as: largest coin first, no pp (as prices are written). */
export function coinCount(cp: number): number {
  const c = Math.max(0, Math.floor(cp))
  return Math.floor(c / 100) + Math.floor((c % 100) / 10) + (c % 10)
}

// ── Bulk ──────────────────────────────────────────────────────────────────

export type Encumbrance = 'ok' | 'encumbered' | 'overloaded'

/**
 * Total Bulk of an owner in tenths. PF2e coins weigh 1 Bulk per 1,000; SF2e
 * credits are digital and weigh nothing.
 */
export function ownerBulk(stacks: number[], purseCp: number, coinsHaveBulk: boolean): number {
  const items = stacks.reduce((a, b) => a + b, 0)
  return items + (coinsHaveBulk ? Math.floor(coinCount(purseCp) / 1000) * 10 : 0)
}

/** Encumbered above 5 + Str, over the limit above 10 + Str. 10 Light = 1 Bulk; leftover Light doesn't count. */
export function encumbrance(bulkTenths: number, strMod: number | null): Encumbrance | null {
  if (strMod == null) return null
  const bulk = Math.floor(bulkTenths / 10)
  if (bulk > 10 + strMod) return 'overloaded'
  if (bulk > 5 + strMod) return 'encumbered'
  return 'ok'
}

// ── Player view ───────────────────────────────────────────────────────────

/** Everything players may see of an entry. Unidentified: no true name, price, level, rarity, traits or GM text. */
export interface PlayerEntry {
  name: string
  quantity: number
  identified: boolean
  description: string
  bulk: BulkTenths
  price: number | null
  level: number | null
  rarity: Rarity | null
  traits: string[]
  runes: Runes | null
  grade: string | null
}

type ItemForPlayer = ItemLike & Pick<Item, 'description'>

/**
 * The projection behind every player-facing output (offers, quest board,
 * exports). `stripGm` removes `[!hidden]` blocks; it is passed in so this
 * module stays free of markdown handling.
 */
export function toPlayerView(entry: InventoryEntry, item: ItemForPlayer | null | undefined, stripGm: (md: string) => string): PlayerEntry {
  const e = effective(entry, item)
  if (entry.identified) {
    const description = [item?.description ?? '', entry.notes].map(s => stripGm(s).trim()).filter(Boolean).join('\n\n')
    return {
      name: e.name, quantity: entry.quantity, identified: true, description, bulk: e.bulk,
      price: e.unitPrice == null ? null : Math.round((e.unitPrice * entry.quantity) / e.per),
      level: e.level, rarity: e.rarity, traits: e.traits, runes: entry.runes, grade: entry.grade,
    }
  }
  return {
    name: entry.playerName?.trim() || item?.unidentified?.name?.trim() || unidentifiedName(item),
    quantity: entry.quantity, identified: false,
    description: stripGm(entry.playerDescription ?? item?.unidentified?.description ?? '').trim(),
    bulk: e.bulk, price: null, level: null, rarity: null, traits: [], runes: null, grade: null,
  }
}

/** A plain default like "Unidentified weapon", from the item category only. */
export function unidentifiedName(item?: Pick<Item, 'category'> | null): string {
  const cat = item?.category
  if (!cat || cat === 'equipment' || cat === 'kit') return 'Unidentified item'
  return `Unidentified ${cat}`
}

// ── Totals ────────────────────────────────────────────────────────────────

export interface OwnerTotal { items: number; coins: number; total: number; bulk: number; unknownPrices: number }
export interface PartyTotals { byOwner: Record<OwnerKey, OwnerTotal>; items: number; coins: number; total: number }

/**
 * Party totals for the GM (true values) or the players (only what they know:
 * unidentified entries count as 0). Encounter loot isn't the party's yet and
 * is left out of the party sums, but still gets its own owner total.
 */
export function partyTotals(
  entries: InventoryEntry[],
  items: Map<string, ItemLike>,
  purses: { owner: OwnerKey; cp: number }[],
  view: 'gm' | 'player',
  coinsHaveBulk = true,
): PartyTotals {
  const byOwner: Record<OwnerKey, OwnerTotal> = {}
  const bulkStacks: Record<OwnerKey, number[]> = {}
  const slot = (o: OwnerKey) => (byOwner[o] ??= { items: 0, coins: 0, total: 0, bulk: 0, unknownPrices: 0 })
  for (const entry of entries) {
    const item = entry.itemId ? items.get(entry.itemId) : undefined
    const t = slot(entry.owner)
    const known = view === 'gm' || entry.identified
    if (known) {
      if (effective(entry, item).unitPrice == null) t.unknownPrices++
      else t.items += entryValue(entry, item)
    }
    ;(bulkStacks[entry.owner] ??= []).push(entryBulk(entry, item))
  }
  for (const p of purses) slot(p.owner).coins += Math.max(0, Math.floor(p.cp))
  let sumItems = 0
  let sumCoins = 0
  for (const [owner, t] of Object.entries(byOwner)) {
    t.total = t.items + t.coins
    t.bulk = ownerBulk(bulkStacks[owner] ?? [], t.coins, coinsHaveBulk)
    if (parseOwner(owner).kind === 'encounter') continue
    sumItems += t.items
    sumCoins += t.coins
  }
  return { byOwner, items: sumItems, coins: sumCoins, total: sumItems + sumCoins }
}
