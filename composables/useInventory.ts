/**
 * Inventory repository (FEATURES_PLAN.md P3): entries, purses, moves and
 * identification. The only module that writes `inventory` and `purses`.
 *
 * The party view is a query over every owner of the campaign, never a stored
 * copy. Linked compendium items are cached here so totals stay synchronous.
 */
import { computed, ref } from 'vue'
import { getDb, now, type DbInventory, type DbPurse } from '~/composables/useDb'
import { onTablesChanged } from '~/db/changes'
import { rulesFindByName, rulesGet, rulesGetMany } from '~/composables/useRules'
import { attachKindOf, giftValues, replacedBy, runesSummary, type AttachKind } from '~/rules/attachments'
import { parseOwner, planMove, sameStack, splitCoins, STASH, type InventoryEntry, type OwnerKey } from '~/rules/inventory'
import type { BulkTenths, Item, RelicGift, Runes } from '~/types/rules'
import type { MirrorItem } from '~/partylink/port'

export function toEntry(r: DbInventory): InventoryEntry {
  return {
    id: r.id!, owner: r.owner, itemId: r.item_id ?? null, quantity: r.quantity,
    nameOverride: r.name_override ?? null, priceOverride: r.price_override ?? null, bulkOverride: r.bulk_override ?? null,
    notes: r.notes ?? '', identified: !!r.identified,
    playerName: r.player_name ?? null, playerDescription: r.player_description ?? null,
    runes: r.runes ?? null, grade: r.grade ?? null, containerId: r.container_id ?? null,
    attachedTo: r.attached_to ?? null, attachKind: r.attach_kind ?? null, relic: r.relic ?? null,
    implanted: !!r.implanted, upgradeSlots: r.upgrade_slots ?? null,
    pbEntryId: r.pb_entry_id ?? null, pbOfferId: r.pb_offer_id ?? null,
  }
}

const entries = ref<InventoryEntry[]>([])
const purses = ref<Record<OwnerKey, number>>({})
const items = ref<Map<string, Item>>(new Map())
/** Relic gifts linked by gift entries; kept apart from items, they have no price or Bulk of their own. */
const gifts = ref<Map<string, RelicGift>>(new Map())
const loadedCampaign = ref<number | null>(null)

async function cacheItems(ids: (string | null)[]) {
  const missing = [...new Set(ids.filter((id): id is string => !!id && !items.value.has(id) && !gifts.value.has(id)))]
  if (!missing.length) return
  const found = await rulesGetMany(missing)
  const next = new Map(items.value)
  const nextGifts = new Map(gifts.value)
  for (const e of found) {
    if (e.kind === 'item') next.set(e.id, e)
    else if (e.kind === 'relicGift') nextGifts.set(e.id, e)
  }
  items.value = next
  gifts.value = nextGifts
}

/** Entries with each relic gift's value (rules/attachments.ts giftValues) filled in. */
function withGiftValues(list: InventoryEntry[]): InventoryEntry[] {
  const values = giftValues(list)
  return values.size ? list.map(e => (values.has(e.id) ? { ...e, giftValue: values.get(e.id) } : e)) : list
}

async function load(campaignId: number) {
  const db = getDb()
  const [rows, coinRows] = await Promise.all([
    db.inventory.where('campaign_id').equals(campaignId).toArray(),
    db.purses.where('campaign_id').equals(campaignId).toArray(),
  ])
  if (loadedCampaign.value !== campaignId) { items.value = new Map(); gifts.value = new Map() }
  await cacheItems(rows.map(r => r.item_id))
  loadedCampaign.value = campaignId
  entries.value = withGiftValues(rows.map(toEntry))
  const hosts = new Set(rows.map(r => r.attached_to))
  if (rows.some(r => legacyRunes(r) && !hosts.has(r.id!) && !triedLegacy.has(legacyKey(r)))) void migrateLegacyRunes(campaignId)
  purses.value = Object.fromEntries(coinRows.map(p => [p.owner, p.cp]))
}

async function reloadIfLoaded(campaignId: number) {
  if (loadedCampaign.value === campaignId) await load(campaignId)
}

// Moves made in another window (resolve dialog in a second tab, a future Play Buddy sync) show up here too
onTablesChanged(['inventory', 'purses'], () => {
  if (loadedCampaign.value != null) void load(loadedCampaign.value)
})

/** One owner's rows in one campaign, via the [campaign_id+owner] index (the stash key repeats across campaigns). */
function ownerRows(campaignId: number, owner: OwnerKey) {
  return getDb().inventory.where('[campaign_id+owner]').equals([campaignId, owner])
}

function purseRow(campaignId: number, owner: OwnerKey) {
  return getDb().purses.where('[campaign_id+owner]').equals([campaignId, owner]).first()
}

/** Rows of a stack that a moved or added entry can merge into. An item with runes (or anything attached) never merges. */
async function findStack(campaignId: number, owner: OwnerKey, like: InventoryEntry, exceptId?: number): Promise<DbInventory | undefined> {
  const rows = await ownerRows(campaignId, owner).filter(r => r.id !== exceptId).toArray()
  const hosts = new Set(rows.map(r => r.attached_to).filter((id): id is number => id != null))
  if (like.id != null && hosts.has(like.id)) return undefined
  return rows.find(r => !hosts.has(r.id!) && sameStack(toEntry(r), like))
}

/** Entries attached to a host entry. */
async function attachmentsOf(hostId: number) {
  const db = getDb()
  const h = await db.inventory.get(hostId)
  if (!h) return []
  return ownerRows(h.campaign_id, h.owner).filter(r => r.attached_to === hostId).toArray()
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
  // Find-and-grow in one transaction, so a double click can't make two stacks
  const id = await db.transaction('rw', db.inventory, async () => {
    const existing = await findStack(input.campaignId, input.owner, toEntry({ ...row, id: -1 }))
    if (!existing) return await db.inventory.add(row) as number
    await db.inventory.update(existing.id!, { quantity: existing.quantity + row.quantity, updated_at: ts })
    return existing.id!
  })
  await cacheItems([row.item_id])
  await reloadIfLoaded(input.campaignId)
  return id
}

export type EntryPatch = Partial<Pick<InventoryEntry,
  'quantity' | 'nameOverride' | 'priceOverride' | 'notes' | 'identified' | 'playerName' | 'playerDescription' | 'runes' | 'grade' | 'upgradeSlots'>>
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
    // Runes are etched onto one item: a stack of them would copy the runes for free
    changes.quantity = row.attached_to != null || row.implanted || (await attachmentsOf(id)).length ? 1 : q
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
  if (patch.upgradeSlots !== undefined) changes.upgrade_slots = patch.upgradeSlots == null || !Number.isFinite(patch.upgradeSlots) ? null : Math.max(0, Math.floor(patch.upgradeSlots))
  await db.inventory.update(id, changes)
  await reloadIfLoaded(row.campaign_id)
}

/** Entries stored in a container entry. */
async function contentsOf(containerId: number) {
  const db = getDb()
  const c = await db.inventory.get(containerId)
  if (!c) return []
  return ownerRows(c.campaign_id, c.owner).filter(r => r.container_id === containerId).toArray()
}

async function removeEntry(id: number) {
  const db = getDb()
  const row = await db.inventory.get(id)
  if (!row) return
  // What was inside falls out loose; what was etched on goes with it
  await db.transaction('rw', db.inventory, async () => {
    for (const c of await contentsOf(id)) await db.inventory.update(c.id!, { container_id: null })
    await deleteWithAttachments(id)
  })
  if (row.attached_to != null) await syncHost(row.attached_to)
  await reloadIfLoaded(row.campaign_id)
}

async function deleteWithAttachments(id: number) {
  const db = getDb()
  for (const a of await attachmentsOf(id)) await db.inventory.delete(a.id!)
  await db.inventory.delete(id)
}

// ── Attachments (rules/attachments.ts) ─────────────────────────────────────

export type AttachSource = { entryId: number } | { itemId: string }

/** The host's `runes` summary, rebuilt from what's attached, for the gear check and Play Buddy. */
async function syncHost(hostId: number) {
  const db = getDb()
  const attached = await attachmentsOf(hostId)
  await cacheItems(attached.map(a => a.item_id))
  const runes = runesSummary(attached.map(a => ({ name: attachedName(a), kind: a.attach_kind ?? 'accessory' })))
  await db.inventory.update(hostId, { runes, updated_at: now() })
}

function attachedName(r: Pick<DbInventory, 'item_id' | 'name_override'>): string {
  return r.name_override || (r.item_id ? items.value.get(r.item_id)?.name ?? gifts.value.get(r.item_id)?.name : '') || ''
}

/**
 * Attaches a rune, talisman, upgrade, accessory or relic gift to a host: a
 * loose entry of the same owner (one of its stack) or a new one from the
 * compendium. A host stack of several splits one off first. A fundamental
 * rune replaces the one in its slot (striking → greater striking).
 * Returns the attachment's id.
 */
async function attach(hostId: number, source: AttachSource): Promise<number | null> {
  const db = getDb()
  const host0 = await db.inventory.get(hostId)
  if (!host0 || host0.attached_to != null || host0.pb_entry_id || host0.pb_offer_id) return null
  const src = 'entryId' in source ? await db.inventory.get(source.entryId) : undefined
  if ('entryId' in source && (!src || src.owner !== host0.owner || src.campaign_id !== host0.campaign_id || src.id === hostId)) return null
  const itemId = src ? src.item_id : (source as { itemId: string }).itemId
  const linked = itemId ? await rulesGet(itemId) : undefined
  const kind: AttachKind = linked?.kind === 'relicGift' ? 'gift' : attachKindOf(linked?.kind === 'item' ? linked : null) ?? 'accessory'
  await cacheItems([itemId])
  const name = src ? attachedName(src) : linked?.name ?? ''
  const ts = now()
  let newHost = hostId
  const id = await db.transaction('rw', db.inventory, async () => {
    let host = host0
    if (host.quantity > 1) {
      // One of the stack gets the rune; the rest stays plain
      await db.inventory.update(host.id!, { quantity: host.quantity - 1, updated_at: ts })
      const { id: _id, ...copy } = host
      newHost = await db.inventory.add({ ...copy, quantity: 1, created_at: ts, updated_at: ts }) as number
      host = (await db.inventory.get(newHost))!
    }
    const existing = await attachmentsOf(newHost)
    for (const old of replacedBy(existing.map(r => ({ id: r.id!, name: attachedName(r), kind: r.attach_kind ?? 'accessory' })), { name, kind })) {
      await db.inventory.delete(old)
    }
    const fields = { attached_to: newHost, attach_kind: kind, owner: host.owner, container_id: null, updated_at: ts }
    if (src) {
      if (src.quantity > 1) {
        await db.inventory.update(src.id!, { quantity: src.quantity - 1, updated_at: ts })
        const { id: _id, ...copy } = src
        return await db.inventory.add({ ...copy, ...fields, quantity: 1, created_at: ts }) as number
      }
      await db.inventory.update(src.id!, fields)
      return src.id!
    }
    return await db.inventory.add({
      campaign_id: host.campaign_id, item_id: itemId, quantity: 1, name_override: itemId ? null : 'Unnamed item',
      price_override: null, bulk_override: null, notes: '', identified: host.identified,
      player_name: null, player_description: null, runes: null, grade: null, created_at: ts, ...fields,
    } satisfies DbInventory) as number
  })
  await syncHost(newHost)
  await reloadIfLoaded(host0.campaign_id)
  return id
}

/**
 * Takes an attachment off: a rune or talisman becomes a loose entry of the
 * same owner again (merging into an identical one); a relic gift is removed.
 */
async function detach(id: number) {
  const db = getDb()
  const row = await db.inventory.get(id)
  if (!row || row.attached_to == null) return
  const hostId = row.attached_to
  await db.transaction('rw', db.inventory, async () => {
    if (row.attach_kind === 'gift') { await db.inventory.delete(id); return }
    const loose = { ...row, attached_to: null, attach_kind: null }
    const target = await findStack(row.campaign_id, row.owner, toEntry(loose), id)
    if (target) {
      await db.inventory.update(target.id!, { quantity: target.quantity + row.quantity, updated_at: now() })
      await db.inventory.delete(id)
    } else {
      await db.inventory.update(id, { attached_to: null, attach_kind: null, updated_at: now() })
    }
  })
  await syncHost(hostId)
  await reloadIfLoaded(row.campaign_id)
}

/**
 * Implants an augmentation in the character that owns it (or removes it). One
 * item of a stack is implanted; the rest stay a loose stack.
 */
async function setImplanted(id: number, implanted: boolean) {
  const db = getDb()
  const row = await db.inventory.get(id)
  if (!row || row.attached_to != null || row.pb_entry_id || row.pb_offer_id) return
  if (parseOwner(row.owner).kind !== 'character') return
  const ts = now()
  await db.transaction('rw', db.inventory, async () => {
    if (!implanted) {
      await db.inventory.update(id, { implanted: 0, updated_at: ts })
      const merged = await findStack(row.campaign_id, row.owner, { ...toEntry(row), implanted: false }, id)
      if (merged) {
        await db.inventory.update(merged.id!, { quantity: merged.quantity + row.quantity, updated_at: ts })
        await db.inventory.delete(id)
      }
      return
    }
    if (row.quantity > 1) {
      await db.inventory.update(id, { quantity: row.quantity - 1, updated_at: ts })
      const { id: _id, ...copy } = row
      await db.inventory.add({ ...copy, quantity: 1, implanted: 1, container_id: null, created_at: ts, updated_at: ts })
    } else {
      await db.inventory.update(id, { implanted: 1, container_id: null, updated_at: ts })
    }
  })
  await reloadIfLoaded(row.campaign_id)
}

/** Marks an entry as a relic (with its aspects) or back to a plain item (null). Its gifts stay attached. */
async function setRelic(id: number, relic: { aspects: string[] } | null) {
  const db = getDb()
  const row = await db.inventory.get(id)
  if (!row || row.attached_to != null) return
  await db.inventory.update(id, { relic: relic ? { aspects: [...relic.aspects] } : null, quantity: relic ? 1 : row.quantity, updated_at: now() })
  await reloadIfLoaded(row.campaign_id)
}

// ── Legacy runes ──────────────────────────────────────────────────────────
// Entries from before attachments carry runes only as the `runes` field (the
// old Potency/Striking dropdowns). They become attached rune entries once the
// compendium has every rune; until then they keep the field as it is.

const legacyRunes = (r: DbInventory) => !!r.runes && !r.pb_entry_id && !r.pb_offer_id
/** Entries whose runes aren't all in the compendium: not looked up again this session. */
const triedLegacy = new Set<string>()
const legacyKey = (r: DbInventory) => `${r.id}:${JSON.stringify(r.runes)}`
let migrating = false

function legacyRuneNames(runes: Runes, category: string | undefined): string[][] {
  const out: string[][] = []
  const gear = category === 'armor' ? 'Armor' : 'Weapon'
  if (runes.potency) out.push([`${gear} Potency (+${runes.potency})`, `+${runes.potency} ${gear} Potency`])
  const second = gear === 'Weapon' ? runes.striking : runes.resilient
  const base = gear === 'Weapon' ? 'Striking' : 'Resilient'
  if (second) {
    const tier = ['', 'Greater', 'Major'][second - 1]
    out.push(tier ? [`${tier} ${base}`, `${base} (${tier})`] : [base])
  }
  // Foundry's property slugs: "ghostTouch", "greaterFlaming"
  for (const p of runes.property) out.push([p.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ')])
  return out
}

async function migrateLegacyRunes(campaignId: number) {
  if (migrating) return
  migrating = true
  try {
    const db = getDb()
    const rows = await db.inventory.where('campaign_id').equals(campaignId).toArray()
    const hosts = new Set(rows.map(r => r.attached_to))
    for (const host of rows.filter(r => legacyRunes(r) && !hosts.has(r.id!) && !triedLegacy.has(legacyKey(r)))) {
      triedLegacy.add(legacyKey(host))
      const linked = host.item_id ? await rulesGet(host.item_id) : undefined
      const category = linked?.kind === 'item' ? linked.category : undefined
      const found: Item[] = []
      for (const names of legacyRuneNames(host.runes!, category)) {
        let hit: Item | undefined
        for (const n of names) {
          const e = await rulesFindByName('item', n)
          if (e?.kind === 'item') { hit = e; break }
        }
        if (hit) found.push(hit)
      }
      if (found.length !== legacyRuneNames(host.runes!, category).length) continue
      const ts = now()
      const hostIds: number[] = []
      await db.transaction('rw', db.inventory, async () => {
        const current = await db.inventory.get(host.id!)
        if (!current || JSON.stringify(current.runes) !== JSON.stringify(host.runes)) return
        // A stack with runes becomes one entry per item, each with its own runes
        hostIds.push(current.id!)
        if (current.quantity > 1) {
          await db.inventory.update(current.id!, { quantity: 1, updated_at: ts })
          const { id: _id, ...copy } = current
          for (let i = 1; i < current.quantity; i++) hostIds.push(await db.inventory.add({ ...copy, quantity: 1, created_at: ts, updated_at: ts }) as number)
        }
        for (const hostId of hostIds) {
          for (const rune of found) {
            await db.inventory.add({
              campaign_id: current.campaign_id, owner: current.owner, item_id: rune.id, quantity: 1, name_override: null,
              price_override: null, bulk_override: null, notes: '', identified: current.identified, player_name: null,
              player_description: null, runes: null, grade: null, container_id: null, attached_to: hostId,
              attach_kind: attachKindOf(rune) ?? 'rune', created_at: ts, updated_at: ts,
            } satisfies DbInventory)
          }
        }
      })
      for (const hostId of hostIds) await syncHost(hostId)
    }
  } finally {
    migrating = false
  }
}

/**
 * Stores an entry in a container of the same owner (or takes it out with
 * null). A stack already in that container merges. Containers don't nest.
 */
async function store(id: number, containerId: number | null) {
  const db = getDb()
  const row = await db.inventory.get(id)
  if (!row || row.attached_to != null || (row.container_id ?? null) === containerId || id === containerId) return
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
  const campaignId = await moveRow(id, to, quantity)
  if (campaignId != null) await reloadIfLoaded(campaignId)
}

/** The move itself, in its own (or the caller's) transaction; doesn't reload. Returns the campaign id. */
async function moveRow(id: number, to: OwnerKey, quantity?: number): Promise<number | null> {
  const db = getDb()
  const row = await db.inventory.get(id)
  if (!row) return null
  // An attachment moves with its host only; detach it first to hand it over.
  // An implanted augmentation is part of its character's body.
  if (row.attached_to != null || row.implanted) return null
  const plan = planMove(toEntry(row), to, quantity)
  if (plan.type === 'none') return null
  const ts = now()
  const moved = plan.type === 'split' ? plan.quantity : row.quantity
  const contents = await contentsOf(id)
  const attached = await attachmentsOf(id)
  await db.transaction('rw', db.inventory, async () => {
    // A container with contents (or an item with runes) goes whole and unmerged,
    // its contents and runes with it; a partial move leaves them in the stack that stays.
    if ((contents.length || attached.length) && plan.type === 'reassign') {
      await db.inventory.update(row.id!, { owner: to, container_id: null, updated_at: ts })
      for (const c of [...contents, ...attached]) await db.inventory.update(c.id!, { owner: to, updated_at: ts })
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
      // The runes stay on the part that stays
      const { id: _id, ...copy } = row
      await db.inventory.add({ ...copy, ...(attached.length ? { runes: null, relic: null } : {}), owner: to, quantity: moved, container_id: null, created_at: ts, updated_at: ts })
    }
  })
  return row.campaign_id
}

// ── Purses ────────────────────────────────────────────────────────────────

async function writePurse(campaignId: number, owner: OwnerKey, cp: number) {
  const db = getDb()
  const value = Math.max(0, Math.floor(cp))
  const row = await purseRow(campaignId, owner)
  if (row) await db.purses.update(row.id!, { cp: value, updated_at: now() })
  else if (value > 0) await db.purses.add({ campaign_id: campaignId, owner, cp: value, updated_at: now() } satisfies DbPurse)
}

async function purseOf(campaignId: number, owner: OwnerKey): Promise<number> {
  return (await purseRow(campaignId, owner))?.cp ?? 0
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

/** Hands an owner's items and coins to the stash, e.g. when a character leaves the party. One transaction, one reload. */
async function releaseOwner(campaignId: number, owner: OwnerKey) {
  if (owner === STASH) return
  const db = getDb()
  await db.transaction('rw', db.inventory, db.purses, async () => {
    // Containers first, so their contents travel inside them
    const rows = await ownerRows(campaignId, owner).toArray()
    rows.sort((a, b) => Number(a.container_id != null) - Number(b.container_id != null))
    for (const r of rows) {
      const current = await db.inventory.get(r.id!)
      if (current?.owner === owner) await moveRow(r.id!, STASH)
    }
    const coins = await purseOf(campaignId, owner)
    if (coins) await writePurse(campaignId, STASH, (await purseOf(campaignId, STASH)) + coins)
    const purse = await purseRow(campaignId, owner)
    if (purse) await db.purses.delete(purse.id!)
  })
  await reloadIfLoaded(campaignId)
}

// ── Play Buddy (PLAYBUDDY_API.md) ──────────────────────────────────────────

/**
 * Replaces a linked character's items and coins with what Play Buddy shares.
 * Their app owns that inventory, so these rows are a read-only mirror;
 * `items: null` (inventory not shared) leaves the rows alone.
 */
async function replaceMirror(campaignId: number, owner: OwnerKey, items: MirrorItem[] | null, coinsCp: number | null, linkedCharacterId?: number) {
  const db = getDb()
  const ts = now()
  await db.transaction('rw', db.inventory, db.purses, db.characters, async () => {
    // A status read that finishes after the character was removed or unlinked writes nothing
    if (linkedCharacterId !== undefined && !(await db.characters.get(linkedCharacterId))?.pb_player_id) return
    if (items) {
      await ownerRows(campaignId, owner).delete()
      const ids = new Map<string, number>()
      for (const i of items) {
        const id = await db.inventory.add({
          campaign_id: campaignId, owner, item_id: i.rulesId, quantity: i.quantity,
          // Without a compendium match the row carries Play Buddy's own name, price and Bulk
          name_override: i.rulesId ? null : i.name,
          price_override: i.rulesId ? null : Math.round(i.price / (i.priceFor || 1)),
          bulk_override: i.rulesId ? null : i.bulk,
          notes: '', identified: i.identified ? 1 : 0,
          player_name: i.identified ? null : i.name, player_description: null,
          runes: runesSummary(i.attachments ?? []), grade: null, container_id: null, relic: i.relic ?? null, pb_entry_id: i.entryId, created_at: ts, updated_at: ts,
        } satisfies DbInventory) as number
        ids.set(i.entryId, id)
        for (const a of i.attachments ?? []) {
          await db.inventory.add({
            campaign_id: campaignId, owner, item_id: a.rulesId, quantity: 1,
            name_override: a.rulesId ? null : a.name, price_override: a.rulesId || a.kind === 'gift' ? null : a.price,
            bulk_override: null, notes: '', identified: a.identified ? 1 : 0, player_name: a.identified ? null : a.name, player_description: null,
            runes: null, grade: null, container_id: null, attached_to: id, attach_kind: a.kind, pb_entry_id: a.entryId, created_at: ts, updated_at: ts,
          } satisfies DbInventory)
        }
      }
      for (const i of items) {
        const container = i.containerEntryId ? ids.get(i.containerEntryId) : undefined
        if (container) await db.inventory.update(ids.get(i.entryId)!, { container_id: container })
      }
    }
    if (coinsCp !== null) await writePurse(campaignId, owner, coinsCp)
  })
  if (items) await cacheItems(items.flatMap(i => [i.rulesId, ...(i.attachments ?? []).map(a => a.rulesId)]))
  await reloadIfLoaded(campaignId)
}

/** Marks stash stacks as offered (a linkOffers row id) or clears the mark (null). */
async function markOffered(campaignId: number, ids: number[], linkOfferId: number | null) {
  await getDb().inventory.where('id').anyOf(ids).modify({ pb_offer_id: linkOfferId, updated_at: now() })
  await reloadIfLoaded(campaignId)
}

/** An item offer was answered: accepted takes the offered quantities out of the stash; anything else just unmarks. */
async function settleOffered(campaignId: number, stacks: { inventoryId: number; quantity: number }[], accepted: boolean) {
  const db = getDb()
  await db.transaction('rw', db.inventory, async () => {
    for (const s of stacks) {
      const row = await db.inventory.get(s.inventoryId)
      if (!row) continue
      const left = accepted ? row.quantity - s.quantity : row.quantity
      if (left <= 0) await deleteWithAttachments(row.id!)
      else await db.inventory.update(row.id!, { quantity: left, pb_offer_id: null, updated_at: now() })
    }
  })
  await reloadIfLoaded(campaignId)
}

// ── Encounter loot ────────────────────────────────────────────────────────

/**
 * What `transferAll` moved: copies of the source's stacks and its coins. `id`
 * is the row the stack ended up as (its own row, or `mergedInto` an identical
 * stack); records from before v0.12.2 have neither.
 */
export interface SnapshotEntry extends Omit<DbInventory, 'id'> {
  id?: number
  mergedInto?: number
}
export interface OwnerSnapshot {
  entries: SnapshotEntry[]
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
    const rows = await ownerRows(campaignId, from).toArray()
    const holders = new Set([...rows.map(r => r.container_id), ...rows.map(r => r.attached_to)].filter((id): id is number => id != null))
    const ts = now()
    const entries: SnapshotEntry[] = []
    for (const row of rows) {
      // A container with contents keeps its id so the contents still point at it
      const target = holders.has(row.id!) ? undefined : await findStack(campaignId, to, { ...toEntry(row), owner: to }, row.id)
      if (target) {
        await db.inventory.update(target.id!, { quantity: target.quantity + row.quantity, updated_at: ts })
        await db.inventory.delete(row.id!)
        entries.push({ ...row, id: row.id, mergedInto: target.id })
      } else {
        await db.inventory.update(row.id!, { owner: to, updated_at: ts })
        entries.push({ ...row })
      }
    }
    const cp = await purseOf(campaignId, from)
    if (cp) {
      await writePurse(campaignId, from, 0)
      await writePurse(campaignId, to, (await purseOf(campaignId, to)) + cp)
    }
    return { entries, cp }
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
    // Snapshot row id → row id back at `from`, so contents find their container (BUG-07)
    const idMap = new Map<number, number>()
    const container = (id: number | null | undefined) => (id == null ? null : idMap.get(id) ?? null)
    // Hosts keep their id when they move back; one that came back as a copy is found in idMap
    const host = (id: number | null | undefined) => (id == null ? null : idMap.get(id) ?? id)
    const rank = (e: SnapshotEntry) => Number(e.container_id != null) + Number(e.attached_to != null)
    const ordered = [...snapshot.entries].sort((a, b) => rank(a) - rank(b))
    for (const e of ordered) {
      let taken = 0
      // The row itself, still where the resolve put it: move it back, id and all
      if (e.id != null && e.mergedInto == null) {
        const row = await db.inventory.get(e.id)
        if (row && row.owner === to && row.campaign_id === campaignId) {
          taken = Math.min(e.quantity, row.quantity)
          if (row.quantity > taken) {
            // More of it was added since: that part stays
            await db.inventory.update(row.id!, { quantity: row.quantity - taken, updated_at: ts })
            const { id: _id, ...copy } = row
            idMap.set(e.id, await db.inventory.add({ ...copy, owner: from, quantity: taken, container_id: container(e.container_id), attached_to: host(e.attached_to), updated_at: ts }) as number)
          } else {
            await db.inventory.update(row.id!, { owner: from, container_id: container(e.container_id), attached_to: host(e.attached_to), updated_at: ts })
            idMap.set(e.id, row.id!)
          }
        }
      }
      // Otherwise out of the stack it merged into (or an identical one, for old records)
      if (!taken) {
        const { id: _id, mergedInto: _m, ...rest } = e
        const like = { ...toEntry({ ...rest, id: -1 }), owner: to }
        const merged = e.mergedInto != null ? await db.inventory.get(e.mergedInto) : undefined
        const stack = merged?.owner === to && merged.campaign_id === campaignId ? merged : await findStack(campaignId, to, like)
        taken = Math.min(e.quantity, stack?.quantity ?? 0)
        if (stack && taken) {
          if (stack.quantity > taken) await db.inventory.update(stack.id!, { quantity: stack.quantity - taken, updated_at: ts })
          else await db.inventory.delete(stack.id!)
          const back = await findStack(campaignId, from, { ...like, owner: from, containerId: container(e.container_id) })
          if (back) {
            await db.inventory.update(back.id!, { quantity: back.quantity + taken, updated_at: ts })
            if (e.id != null) idMap.set(e.id, back.id!)
          } else {
            const id = await db.inventory.add({ ...rest, owner: from, quantity: taken, container_id: container(e.container_id), attached_to: host(e.attached_to), updated_at: ts }) as number
            if (e.id != null) idMap.set(e.id, id)
          }
        }
      }
      if (taken < e.quantity) short.names.push(e.name_override || e.item_id || 'item')
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
    gifts,
    loadedCampaign,
    purseList: computed(() => Object.entries(purses.value).map(([owner, cp]) => ({ owner, cp }))),
    load, addEntry, updateEntry, removeEntry, setIdentified, move, store, attach, detach, setRelic, setImplanted,
    setPurse, adjustPurse, transferCoins, splitPurse, releaseOwner,
    transferAll, restoreSnapshot, replaceMirror, markOffered, settleOffered, reload: reloadIfLoaded,
  }
}
