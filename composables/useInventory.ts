/**
 * Inventory repository (FEATURES_PLAN.md P3): entries, purses, moves and
 * identification. The only module that writes `inventory` and `purses`.
 *
 * The party view is a query over every owner of the campaign, never a stored
 * copy. Linked compendium items are cached here so totals stay synchronous.
 */
import { computed, ref } from 'vue'
import { getDb, now, type DbInventory, type DbPurse } from '~/composables/useDb'
import { rulesGetMany } from '~/composables/useRules'
import { planMove, sameStack, splitCoins, STASH, type InventoryEntry, type OwnerKey } from '~/rules/inventory'
import type { BulkTenths, Item, Runes } from '~/types/rules'

export function toEntry(r: DbInventory): InventoryEntry {
  return {
    id: r.id!, owner: r.owner, itemId: r.item_id ?? null, quantity: r.quantity,
    nameOverride: r.name_override ?? null, priceOverride: r.price_override ?? null, bulkOverride: r.bulk_override ?? null,
    notes: r.notes ?? '', identified: !!r.identified,
    playerName: r.player_name ?? null, playerDescription: r.player_description ?? null,
    runes: r.runes ?? null, grade: r.grade ?? null, containerId: r.container_id ?? null,
  }
}

const entries = ref<InventoryEntry[]>([])
const purses = ref<Record<OwnerKey, number>>({})
const items = ref<Map<string, Item>>(new Map())
const loadedCampaign = ref<number | null>(null)

async function cacheItems(ids: (string | null)[]) {
  const missing = [...new Set(ids.filter((id): id is string => !!id && !items.value.has(id)))]
  if (!missing.length) return
  const found = await rulesGetMany(missing)
  const next = new Map(items.value)
  for (const e of found) if (e.kind === 'item') next.set(e.id, e)
  items.value = next
}

async function load(campaignId: number) {
  const db = getDb()
  const [rows, coinRows] = await Promise.all([
    db.inventory.where('campaign_id').equals(campaignId).toArray(),
    db.purses.where('campaign_id').equals(campaignId).toArray(),
  ])
  if (loadedCampaign.value !== campaignId) items.value = new Map()
  await cacheItems(rows.map(r => r.item_id))
  loadedCampaign.value = campaignId
  entries.value = rows.map(toEntry)
  purses.value = Object.fromEntries(coinRows.map(p => [p.owner, p.cp]))
}

async function reloadIfLoaded(campaignId: number) {
  if (loadedCampaign.value === campaignId) await load(campaignId)
}

/** Rows of a stack that a moved or added entry can merge into. */
async function findStack(campaignId: number, owner: OwnerKey, like: InventoryEntry, exceptId?: number): Promise<DbInventory | undefined> {
  const rows = await getDb().inventory.where('owner').equals(owner).filter(r => r.campaign_id === campaignId && r.id !== exceptId).toArray()
  return rows.find(r => sameStack(toEntry(r), like))
}

export interface AddEntryInput {
  campaignId: number
  owner: OwnerKey
  itemId?: string | null
  name?: string
  quantity?: number
  priceOverride?: number | null
  identified?: boolean
}

/** Adds a stack; an identical stack of the same owner just grows. Returns the entry id. */
async function addEntry(input: AddEntryInput): Promise<number> {
  const db = getDb()
  const ts = now()
  const row: DbInventory = {
    campaign_id: input.campaignId, owner: input.owner, item_id: input.itemId ?? null,
    quantity: Math.max(1, Math.floor(input.quantity ?? 1)),
    name_override: input.itemId ? null : (input.name?.trim() || 'Unnamed item'),
    price_override: input.priceOverride ?? null, bulk_override: null, notes: '',
    identified: input.identified === false ? 0 : 1, player_name: null, player_description: null,
    runes: null, grade: null, container_id: null, created_at: ts, updated_at: ts,
  }
  const existing = await findStack(input.campaignId, input.owner, toEntry({ ...row, id: -1 }))
  let id: number
  if (existing) {
    await db.inventory.update(existing.id!, { quantity: existing.quantity + row.quantity, updated_at: ts })
    id = existing.id!
  } else {
    id = await db.inventory.add(row) as number
  }
  await cacheItems([row.item_id])
  await reloadIfLoaded(input.campaignId)
  return id
}

export type EntryPatch = Partial<Pick<InventoryEntry,
  'quantity' | 'nameOverride' | 'priceOverride' | 'notes' | 'identified' | 'playerName' | 'playerDescription' | 'runes' | 'grade'>>
  & { bulkOverride?: BulkTenths | null }

async function updateEntry(id: number, patch: EntryPatch) {
  const db = getDb()
  const row = await db.inventory.get(id)
  if (!row) return
  const changes: Partial<DbInventory> = { updated_at: now() }
  if (patch.quantity !== undefined) {
    const q = Math.floor(patch.quantity)
    if (!Number.isFinite(q)) return
    if (q <= 0) return removeEntry(id)
    changes.quantity = q
  }
  if (patch.nameOverride !== undefined) changes.name_override = patch.nameOverride?.trim() || (row.item_id ? null : 'Unnamed item')
  if (patch.priceOverride !== undefined) changes.price_override = patch.priceOverride
  if (patch.bulkOverride !== undefined) changes.bulk_override = patch.bulkOverride
  if (patch.notes !== undefined) changes.notes = patch.notes
  if (patch.identified !== undefined) changes.identified = patch.identified ? 1 : 0
  if (patch.playerName !== undefined) changes.player_name = patch.playerName?.trim() || null
  if (patch.playerDescription !== undefined) changes.player_description = patch.playerDescription?.trim() || null
  if (patch.runes !== undefined) changes.runes = patch.runes as Runes | null
  if (patch.grade !== undefined) changes.grade = patch.grade || null
  await db.inventory.update(id, changes)
  await reloadIfLoaded(row.campaign_id)
}

/** Entries stored in a container entry. */
async function contentsOf(containerId: number) {
  const db = getDb()
  const c = await db.inventory.get(containerId)
  if (!c) return []
  return db.inventory.where('owner').equals(c.owner).filter(r => r.campaign_id === c.campaign_id && r.container_id === containerId).toArray()
}

async function removeEntry(id: number) {
  const db = getDb()
  const row = await db.inventory.get(id)
  if (!row) return
  // What was inside falls out loose
  await db.transaction('rw', db.inventory, async () => {
    for (const c of await contentsOf(id)) await db.inventory.update(c.id!, { container_id: null })
    await db.inventory.delete(id)
  })
  await reloadIfLoaded(row.campaign_id)
}

/**
 * Stores an entry in a container of the same owner (or takes it out with
 * null). A stack already in that container merges. Containers don't nest.
 */
async function store(id: number, containerId: number | null) {
  const db = getDb()
  const row = await db.inventory.get(id)
  if (!row || (row.container_id ?? null) === containerId || id === containerId) return
  if (containerId != null) {
    const c = await db.inventory.get(containerId)
    if (!c || c.owner !== row.owner || c.campaign_id !== row.campaign_id || c.container_id != null) return
    if ((await contentsOf(id)).length) return
  }
  await db.transaction('rw', db.inventory, async () => {
    const target = await findStack(row.campaign_id, row.owner, { ...toEntry(row), containerId }, row.id)
    if (target) {
      await db.inventory.update(target.id!, { quantity: target.quantity + row.quantity, updated_at: now() })
      await db.inventory.delete(row.id!)
    } else {
      await db.inventory.update(row.id!, { container_id: containerId, updated_at: now() })
    }
  })
  await reloadIfLoaded(row.campaign_id)
}

/** Identify (or un-identify, as an undo). */
async function setIdentified(id: number, identified: boolean) {
  await updateEntry(id, { identified })
}

/**
 * Moves an entry (or `quantity` of it) to another owner. A partial move splits
 * the stack; the moved part merges into an identical stack at the target.
 */
async function move(id: number, to: OwnerKey, quantity?: number) {
  const db = getDb()
  const row = await db.inventory.get(id)
  if (!row) return
  const plan = planMove(toEntry(row), to, quantity)
  if (plan.type === 'none') return
  const ts = now()
  const moved = plan.type === 'split' ? plan.quantity : row.quantity
  const contents = await contentsOf(id)
  await db.transaction('rw', db.inventory, async () => {
    // A container with contents goes whole and unmerged, its contents with it;
    // a partial move of it leaves the contents in the stack that stays.
    if (contents.length && plan.type === 'reassign') {
      await db.inventory.update(row.id!, { owner: to, container_id: null, updated_at: ts })
      for (const c of contents) await db.inventory.update(c.id!, { owner: to, updated_at: ts })
      return
    }
    const target = await findStack(row.campaign_id, to, { ...toEntry(row), owner: to, containerId: null }, row.id)
    if (plan.type === 'reassign') {
      if (target) {
        await db.inventory.update(target.id!, { quantity: target.quantity + moved, updated_at: ts })
        await db.inventory.delete(row.id!)
      } else {
        await db.inventory.update(row.id!, { owner: to, container_id: null, updated_at: ts })
      }
      return
    }
    await db.inventory.update(row.id!, { quantity: plan.remaining, updated_at: ts })
    if (target) await db.inventory.update(target.id!, { quantity: target.quantity + moved, updated_at: ts })
    else {
      const { id: _id, ...copy } = row
      await db.inventory.add({ ...copy, owner: to, quantity: moved, container_id: null, created_at: ts, updated_at: ts })
    }
  })
  await reloadIfLoaded(row.campaign_id)
}

// ── Purses ────────────────────────────────────────────────────────────────

async function writePurse(campaignId: number, owner: OwnerKey, cp: number) {
  const db = getDb()
  const value = Math.max(0, Math.floor(cp))
  const row = await db.purses.where('owner').equals(owner).filter(p => p.campaign_id === campaignId).first()
  if (row) await db.purses.update(row.id!, { cp: value, updated_at: now() })
  else if (value > 0) await db.purses.add({ campaign_id: campaignId, owner, cp: value, updated_at: now() } satisfies DbPurse)
}

async function purseOf(campaignId: number, owner: OwnerKey): Promise<number> {
  return (await getDb().purses.where('owner').equals(owner).filter(p => p.campaign_id === campaignId).first())?.cp ?? 0
}

async function setPurse(campaignId: number, owner: OwnerKey, cp: number) {
  await writePurse(campaignId, owner, cp)
  await reloadIfLoaded(campaignId)
}

/** Adds (or with a negative amount, removes) coins; never below 0. */
async function adjustPurse(campaignId: number, owner: OwnerKey, deltaCp: number) {
  const db = getDb()
  await db.transaction('rw', db.purses, async () => {
    await writePurse(campaignId, owner, (await purseOf(campaignId, owner)) + deltaCp)
  })
  await reloadIfLoaded(campaignId)
}

/** Moves up to `cp` from one purse to another. Returns what was moved. */
async function transferCoins(campaignId: number, from: OwnerKey, to: OwnerKey, cp: number): Promise<number> {
  if (from === to) return 0
  const db = getDb()
  let moved = 0
  await db.transaction('rw', db.purses, async () => {
    const have = await purseOf(campaignId, from)
    moved = Math.max(0, Math.min(have, Math.floor(cp)))
    if (!moved) return
    await writePurse(campaignId, from, have - moved)
    await writePurse(campaignId, to, (await purseOf(campaignId, to)) + moved)
  })
  await reloadIfLoaded(campaignId)
  return moved
}

/** "Split evenly": each recipient gets floor(purse / n); the remainder stays with the source. */
async function splitPurse(campaignId: number, from: OwnerKey, recipients: OwnerKey[]) {
  const targets = recipients.filter(r => r !== from)
  if (!targets.length) return { each: 0, remainder: 0 }
  const db = getDb()
  let result = { each: 0, remainder: 0 }
  await db.transaction('rw', db.purses, async () => {
    result = splitCoins(await purseOf(campaignId, from), targets.length)
    if (!result.each) return
    await writePurse(campaignId, from, result.remainder)
    for (const t of targets) await writePurse(campaignId, t, (await purseOf(campaignId, t)) + result.each)
  })
  await reloadIfLoaded(campaignId)
  return result
}

/** Hands an owner's items and coins to the stash, e.g. when a character leaves the party. */
async function releaseOwner(campaignId: number, owner: OwnerKey) {
  if (owner === STASH) return
  const db = getDb()
  // Containers first, so their contents travel inside them
  const rows = await db.inventory.where('owner').equals(owner).filter(r => r.campaign_id === campaignId).toArray()
  rows.sort((a, b) => Number(a.container_id != null) - Number(b.container_id != null))
  for (const r of rows) {
    const current = await db.inventory.get(r.id!)
    if (current?.owner === owner) await move(r.id!, STASH)
  }
  const coins = await purseOf(campaignId, owner)
  if (coins) await transferCoins(campaignId, owner, STASH, coins)
  const purse = await db.purses.where('owner').equals(owner).filter(p => p.campaign_id === campaignId).first()
  if (purse) await db.purses.delete(purse.id!)
  await reloadIfLoaded(campaignId)
}

// ── Encounter loot ────────────────────────────────────────────────────────

/** What `transferAll` moved: copies of the source's stacks and its coins. */
export interface OwnerSnapshot {
  entries: Omit<DbInventory, 'id'>[]
  cp: number
}

/**
 * Moves everything `from` owns (stacks and coins) to `to`, merging into
 * identical stacks there, in one transaction. Doesn't reload, so it can run
 * inside a caller's transaction. Returns what moved, for `restoreSnapshot`.
 */
async function transferAll(campaignId: number, from: OwnerKey, to: OwnerKey): Promise<OwnerSnapshot> {
  const db = getDb()
  return db.transaction('rw', db.inventory, db.purses, async () => {
    const rows = await db.inventory.where('owner').equals(from).filter(r => r.campaign_id === campaignId).toArray()
    const holders = new Set(rows.map(r => r.container_id).filter((id): id is number => id != null))
    const ts = now()
    for (const row of rows) {
      // A container with contents keeps its id so the contents still point at it
      const target = holders.has(row.id!) ? undefined : await findStack(campaignId, to, { ...toEntry(row), owner: to }, row.id)
      if (target) {
        await db.inventory.update(target.id!, { quantity: target.quantity + row.quantity, updated_at: ts })
        await db.inventory.delete(row.id!)
      } else {
        await db.inventory.update(row.id!, { owner: to, updated_at: ts })
      }
    }
    const cp = await purseOf(campaignId, from)
    if (cp) {
      await writePurse(campaignId, from, 0)
      await writePurse(campaignId, to, (await purseOf(campaignId, to)) + cp)
    }
    return { entries: rows.map(({ id: _id, ...r }) => r), cp }
  })
}

/** What `restoreSnapshot` couldn't take back because it was already used up or moved on. */
export interface RestoreShortfall { names: string[]; cp: number }

/**
 * Undo of `transferAll`: takes the snapshot's stacks and coins back from `to`
 * as far as they're still there. Doesn't reload.
 */
async function restoreSnapshot(campaignId: number, snapshot: OwnerSnapshot, from: OwnerKey, to: OwnerKey): Promise<RestoreShortfall> {
  const db = getDb()
  const short: RestoreShortfall = { names: [], cp: 0 }
  await db.transaction('rw', db.inventory, db.purses, async () => {
    const ts = now()
    for (const e of snapshot.entries) {
      const stack = await findStack(campaignId, to, { ...toEntry({ ...e, id: -1 }), owner: to })
      const taken = Math.min(e.quantity, stack?.quantity ?? 0)
      if (taken < e.quantity) short.names.push(e.name_override || e.item_id || 'item')
      if (!stack || !taken) continue
      if (stack.quantity > taken) await db.inventory.update(stack.id!, { quantity: stack.quantity - taken, updated_at: ts })
      else await db.inventory.delete(stack.id!)
      const back = await findStack(campaignId, from, { ...toEntry({ ...e, id: -1 }), owner: from })
      if (back) await db.inventory.update(back.id!, { quantity: back.quantity + taken, updated_at: ts })
      else await db.inventory.add({ ...e, owner: from, quantity: taken, updated_at: ts })
    }
    if (snapshot.cp) {
      const have = await purseOf(campaignId, to)
      const taken = Math.min(have, snapshot.cp)
      short.cp = snapshot.cp - taken
      if (taken) {
        await writePurse(campaignId, to, have - taken)
        await writePurse(campaignId, from, (await purseOf(campaignId, from)) + taken)
      }
    }
  })
  return short
}

export function useInventory() {
  return {
    entries,
    purses,
    items,
    loadedCampaign,
    purseList: computed(() => Object.entries(purses.value).map(([owner, cp]) => ({ owner, cp }))),
    load, addEntry, updateEntry, removeEntry, setIdentified, move, store,
    setPurse, adjustPurse, transferCoins, splitPurse, releaseOwner,
    transferAll, restoreSnapshot, reload: reloadIfLoaded,
  }
}
