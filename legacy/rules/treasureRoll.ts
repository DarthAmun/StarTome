/**
 * Treasure rolls (FEATURES_PLAN.md §10.4): fill a share of a level's Party
 * Treasure by Level row with random compendium items of the right level and
 * kind. Pure; the random source is injected so tests can seed it.
 */
import type { TreasureRow } from '~/rules/registry'
import type { ItemCategory, Rarity } from '~/types/rules'

export type SlotKind = 'permanent' | 'consumable'
export type GearFilter = 'weapons' | 'armor' | 'worn' | 'consumables'
export const GEAR_FILTERS: GearFilter[] = ['weapons', 'armor', 'worn', 'consumables']

export interface TreasureSlot { kind: SlotKind; level: number }

export interface TreasureCandidate {
  id: string
  name: string
  level: number
  rarity: Rarity
  category: ItemCategory
  /** Price in cp for `quantity` (ammunition comes in priced batches); candidates without a price are left out. */
  price: number
  quantity?: number
}

export interface RolledSlot { slot: TreasureSlot; item: TreasureCandidate | null }

export interface RollOptions {
  /** Share of the row to hand out, 0–1. */
  share: number
  partySize: number
  rarities: Rarity[]
  gear: GearFilter[]
  /** Compendium ids to skip (items the party already owns). */
  skipIds?: Set<string>
  random?: () => number
}

const CONSUMABLE: ItemCategory[] = ['consumable', 'ammunition']

/** Which filter an item category falls under. Treasure (gems, art) and kits are never rolled. */
export function gearFilterOf(category: ItemCategory): GearFilter | null {
  if (CONSUMABLE.includes(category)) return 'consumables'
  if (category === 'weapon') return 'weapons'
  if (category === 'armor' || category === 'shield') return 'armor'
  if (category === 'equipment' || category === 'container') return 'worn'
  return null
}

/** Every item slot in a row: permanent items and consumables by item level. */
export function rowSlots(row: TreasureRow): TreasureSlot[] {
  const slots: TreasureSlot[] = []
  for (const [lvl, n] of Object.entries(row.permanent)) for (let i = 0; i < n; i++) slots.push({ kind: 'permanent', level: Number(lvl) })
  for (const [lvl, n] of Object.entries(row.consumables)) for (let i = 0; i < n; i++) slots.push({ kind: 'consumable', level: Number(lvl) })
  return slots.sort((a, b) => (a.kind === b.kind ? b.level - a.level : a.kind === 'permanent' ? -1 : 1))
}

/** Currency for the share, with the row's per-character change for parties other than four. */
export function rowCurrency(row: TreasureRow, partySize: number, share: number): number {
  return Math.max(0, Math.round((row.currency + (partySize - 4) * row.perExtraPc) * clampShare(share)))
}

function clampShare(share: number) {
  return Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0))
}

/** Candidates that fit a slot under the filters. */
export function slotCandidates(slot: TreasureSlot, candidates: TreasureCandidate[], opts: Pick<RollOptions, 'rarities' | 'gear' | 'skipIds'>): TreasureCandidate[] {
  return candidates.filter(c => {
    if (c.level !== slot.level || !opts.rarities.includes(c.rarity) || opts.skipIds?.has(c.id)) return false
    const f = gearFilterOf(c.category)
    if (!f) return false
    return slot.kind === 'consumable' ? f === 'consumables' : f !== 'consumables' && opts.gear.includes(f)
  })
}

/** Picks a random fitting item for a slot, avoiding `taken` while there are others. */
export function rollSlot(slot: TreasureSlot, candidates: TreasureCandidate[], opts: RollOptions, taken: Set<string> = new Set()): TreasureCandidate | null {
  const random = opts.random ?? Math.random
  const pool = slotCandidates(slot, candidates, opts)
  const fresh = pool.filter(c => !taken.has(c.id))
  const from = fresh.length ? fresh : pool
  return from.length ? from[Math.floor(random() * from.length)] : null
}

/**
 * Rolls the share of a row: picks that share of its slots at random (consumable
 * slots only when consumables are wanted), fills each with an item, and adds
 * the share of the currency.
 */
export function rollTreasure(row: TreasureRow, candidates: TreasureCandidate[], opts: RollOptions): { slots: RolledSlot[]; currency: number } {
  const random = opts.random ?? Math.random
  const share = clampShare(opts.share)
  const all = rowSlots(row)
  const count = Math.round(all.length * share)
  // Shuffle, take the share, then show permanent items first, highest level first
  const order = all.map((slot, i) => ({ slot, i, r: random() })).sort((a, b) => a.r - b.r).slice(0, count)
  const chosen = order.sort((a, b) => a.i - b.i).map(o => o.slot)
    .filter(s => s.kind === 'permanent' || opts.gear.includes('consumables'))
  const taken = new Set<string>()
  const slots = chosen.map((slot) => {
    const item = rollSlot(slot, candidates, { ...opts, random }, taken)
    if (item) taken.add(item.id)
    return { slot, item }
  })
  return { slots, currency: rowCurrency(row, opts.partySize, share) }
}

/** The level range a row's slots need, for loading candidates. */
export function rowLevelRange(row: TreasureRow): [number, number] {
  const levels = rowSlots(row).map(s => s.level)
  return [Math.min(...levels), Math.max(...levels)]
}
