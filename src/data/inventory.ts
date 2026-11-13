/**
 * The one inventory: stacks owned by the stash, a character or an encounter
 * (its planned loot), and a purse per owner. Every write keeps what hangs on
 * a stack in step: what is stored in it, what is attached to it.
 */
import { newId, nowIso } from '@/domain/ids'
import { attachKindOf, replacedBy, runesSummary, type AttachKind } from '@/domain/rules/attachments'
import { parseOwner, planMove, sameStack, splitCoins, STASH, type InventoryEntry as Stack, type OwnerKey } from '@/domain/rules/inventory'
import type { Runes } from '@/domain/rules/types'
import { zInventoryEntry, type InventoryEntry as Row, type Owner, type Purse } from '@/domain/schema'
import { getDb } from './db'
import { rulesGet } from './rules'

const table = () => getDb().rows('inventory')
const purseTable = () => getDb().rows('purses')

export function ownerOf(key: OwnerKey): Owner {
  const o = parseOwner(key)
  return o.kind === 'stash' || !o.id ? { kind: 'stash' } : { kind: o.kind, id: o.id }
}

/** A stored row as the inventory rules read it. */
export function toStack(r: Row): Stack {
  return {
    id: r.id, owner: r.ownerKey, itemId: r.itemId, quantity: r.quantity, nameOverride: r.nameOverride, priceOverride: r.priceOverride, bulkOverride: r.bulkOverride,
    notes: r.notes, identified: r.identified, playerName: r.playerName, playerDescription: r.playerDescription, runes: r.runes as Runes | null, grade: r.grade,
    containerId: r.containerId, attachedTo: r.attachedTo, attachKind: r.attachKind as AttachKind | null, relic: r.relic, implanted: r.implanted, upgradeSlots: r.upgradeSlots,
    pbEntryId: r.link?.remoteEntryId ?? null, pbOfferId: r.link?.offerId ?? null,
  }
}

const ownerRows = (campaignId: string, owner: OwnerKey) => table().where('[campaignId+ownerKey]').equals([campaignId, owner])
const put = (row: Row, patch: Partial<Row>) => table().put({ ...row, ...patch, updatedAt: nowIso() })

// ── Reads ──────────────────────────────────────────────────────────────────

export const inventory = {
  ofCampaign: (campaignId: string): Promise<Row[]> => table().where('campaignId').equals(campaignId).toArray(),
  purses: (campaignId: string): Promise<Purse[]> => purseTable().where('campaignId').equals(campaignId).toArray(),
}

const attachmentsOf = async (host: Row) => (await ownerRows(host.campaignId, host.ownerKey).toArray()).filter(r => r.attachedTo === host.id)
const contentsOf = async (c: Row) => (await ownerRows(c.campaignId, c.ownerKey).toArray()).filter(r => r.containerId === c.id)

/** An identical stack of that owner the entry can merge into. Mirrored and offered stacks never merge. */
async function findStack(campaignId: string, owner: OwnerKey, probe: Stack, exceptId?: string): Promise<Row | undefined> {
  return (await ownerRows(campaignId, owner).toArray()).find(r => r.id !== exceptId && !r.link && sameStack(toStack(r), { ...probe, owner }))
}

// ── Stacks ─────────────────────────────────────────────────────────────────

export interface AddEntryInput { campaignId: string; owner: OwnerKey; itemId?: string | null; name?: string; quantity?: number; priceOverride?: number | null; identified?: boolean }

/** Adds a stack; an identical stack of the same owner just grows. Returns the entry's id. */
export async function addEntry(input: AddEntryInput): Promise<string> {
  const ts = nowIso()
  const row = zInventoryEntry.parse({
    id: newId(), campaignId: input.campaignId, owner: ownerOf(input.owner), ownerKey: input.owner, itemId: input.itemId ?? null,
    quantity: Math.max(1, Math.floor(input.quantity ?? 1)), nameOverride: input.itemId ? null : (input.name?.trim() || 'Unnamed item'),
    priceOverride: input.priceOverride ?? null, identified: input.identified !== false, createdAt: ts, updatedAt: ts,
  })
  // Find-and-grow in one transaction, so a double click can't make two stacks
  return getDb().transaction('rw', table(), async () => {
    const existing = await findStack(input.campaignId, input.owner, toStack(row))
    if (!existing) { await table().put(row); return row.id }
    await put(existing, { quantity: existing.quantity + row.quantity })
    return existing.id
  })
}

export type EntryPatch = Partial<Pick<Row, 'quantity' | 'nameOverride' | 'priceOverride' | 'bulkOverride' | 'notes' | 'identified' | 'playerName' | 'playerDescription' | 'grade' | 'upgradeSlots'>>

export async function updateEntry(id: string, patch: EntryPatch): Promise<void> {
  const row = await table().get(id)
  if (!row) return
  const next: Partial<Row> = {}
  if (patch.quantity !== undefined) {
    const q = Math.floor(patch.quantity)
    if (!Number.isFinite(q)) return
    if (q <= 0) return removeEntry(id)
    // Runes are etched onto one item: a stack of them would copy the runes for free
    next.quantity = row.attachedTo || row.implanted || (await attachmentsOf(row)).length ? 1 : q
  }
  if (patch.nameOverride !== undefined) next.nameOverride = patch.nameOverride?.trim() || (row.itemId ? null : 'Unnamed item')
  if (patch.priceOverride !== undefined) next.priceOverride = patch.priceOverride
  if (patch.bulkOverride !== undefined) next.bulkOverride = patch.bulkOverride
  if (patch.notes !== undefined) next.notes = patch.notes
  if (patch.identified !== undefined) next.identified = patch.identified
  if (patch.playerName !== undefined) next.playerName = patch.playerName?.trim() || null
  if (patch.playerDescription !== undefined) next.playerDescription = patch.playerDescription?.trim() || null
  if (patch.grade !== undefined) next.grade = patch.grade || null
  if (patch.upgradeSlots !== undefined) next.upgradeSlots = patch.upgradeSlots === null || !Number.isFinite(patch.upgradeSlots) ? null : Math.max(0, Math.floor(patch.upgradeSlots))
  await put(row, next)
}

async function deleteWithAttachments(row: Row): Promise<void> {
  for (const a of await attachmentsOf(row)) await table().delete(a.id)
  await table().delete(row.id)
}

export async function removeEntry(id: string): Promise<void> {
  const row = await table().get(id)
  if (!row) return
  // What was inside falls out loose; what was etched on goes with it
  await getDb().transaction('rw', table(), async () => {
    for (const c of await contentsOf(row)) await put(c, { containerId: null })
    await deleteWithAttachments(row)
  })
  if (row.attachedTo) await syncHost(row.attachedTo)
}

// ── Attachments ────────────────────────────────────────────────────────────

async function attachedName(r: Pick<Row, 'itemId' | 'nameOverride'>): Promise<string> {
  return r.nameOverride || (r.itemId ? (await rulesGet(r.itemId))?.name : '') || ''
}

/** The host's `runes` summary, rebuilt from what is attached, for the gear check. */
async function syncHost(hostId: string): Promise<void> {
  const host = await table().get(hostId)
  if (!host) return
  const attached = await Promise.all((await attachmentsOf(host)).map(async a => ({ name: await attachedName(a), kind: (a.attachKind ?? 'accessory') as AttachKind })))
  await put(host, { runes: runesSummary(attached) as Row['runes'] })
}

export type AttachSource = { entryId: string } | { itemId: string }

/**
 * Attaches a rune, talisman, upgrade, accessory or relic gift to a host: a
 * loose entry of the same owner (one of its stack) or a new one from the
 * compendium. A host stack of several splits one off first. A fundamental rune
 * replaces the one in its slot. Returns the attachment's id.
 */
export async function attach(hostId: string, source: AttachSource): Promise<string | null> {
  const host0 = await table().get(hostId)
  if (!host0 || host0.attachedTo || host0.link) return null
  const src = 'entryId' in source ? await table().get(source.entryId) : undefined
  if ('entryId' in source && (!src || src.ownerKey !== host0.ownerKey || src.campaignId !== host0.campaignId || src.id === hostId)) return null
  const itemId = src ? src.itemId : 'itemId' in source ? source.itemId : null
  const linked = itemId ? await rulesGet(itemId) : undefined
  const kind: AttachKind = linked?.kind === 'relicGift' ? 'gift' : attachKindOf(linked?.kind === 'item' ? linked : null) ?? 'accessory'
  const name = src ? await attachedName(src) : linked?.name ?? ''
  const ts = nowIso()
  let host = host0
  const names = new Map<string, string>()
  for (const a of await attachmentsOf(host0)) names.set(a.id, await attachedName(a))
  const id = await getDb().transaction('rw', table(), async () => {
    if (host.quantity > 1) {
      // One of the stack gets the rune; the rest stays plain
      await put(host, { quantity: host.quantity - 1 })
      host = { ...host, id: newId(), quantity: 1, createdAt: ts, updatedAt: ts }
      await table().put(host)
    }
    const existing = (await attachmentsOf(host)).map(r => ({ id: r.id, name: names.get(r.id) ?? '', kind: (r.attachKind ?? 'accessory') as AttachKind }))
    for (const old of replacedBy(existing, { name, kind })) await table().delete(old)
    const fields = { attachedTo: host.id, attachKind: kind, owner: host.owner, ownerKey: host.ownerKey, containerId: null }
    if (src) {
      if (src.quantity > 1) {
        await put(src, { quantity: src.quantity - 1 })
        const copy = { ...src, ...fields, id: newId(), quantity: 1, createdAt: ts, updatedAt: ts }
        await table().put(copy)
        return copy.id
      }
      await put(src, fields)
      return src.id
    }
    const fresh = zInventoryEntry.parse({ id: newId(), campaignId: host.campaignId, itemId, quantity: 1, nameOverride: itemId ? null : 'Unnamed item', identified: host.identified, createdAt: ts, updatedAt: ts, ...fields })
    await table().put(fresh)
    return fresh.id
  })
  await syncHost(host.id)
  return id
}

/** Takes an attachment off: a rune or talisman becomes a loose entry of the same owner again; a relic gift is removed. */
export async function detach(id: string): Promise<void> {
  const row = await table().get(id)
  if (!row?.attachedTo) return
  const hostId = row.attachedTo
  await getDb().transaction('rw', table(), async () => {
    if (row.attachKind === 'gift') { await table().delete(id); return }
    const loose = { ...row, attachedTo: null, attachKind: null }
    const target = await findStack(row.campaignId, row.ownerKey, toStack(loose), id)
    if (target) { await put(target, { quantity: target.quantity + row.quantity }); await table().delete(id) }
    else await put(row, { attachedTo: null, attachKind: null })
  })
  await syncHost(hostId)
}

/** Implants an augmentation in the character that owns it (or takes it out). One item of a stack is implanted. */
export async function setImplanted(id: string, implanted: boolean): Promise<void> {
  const row = await table().get(id)
  if (!row || row.attachedTo || row.link || row.owner.kind !== 'character') return
  const ts = nowIso()
  await getDb().transaction('rw', table(), async () => {
    if (!implanted) {
      const merged = await findStack(row.campaignId, row.ownerKey, { ...toStack(row), implanted: false }, id)
      if (merged) { await put(merged, { quantity: merged.quantity + row.quantity }); await table().delete(id) }
      else await put(row, { implanted: false })
    } else if (row.quantity > 1) {
      await put(row, { quantity: row.quantity - 1 })
      await table().put({ ...row, id: newId(), quantity: 1, implanted: true, containerId: null, createdAt: ts, updatedAt: ts })
    } else await put(row, { implanted: true, containerId: null })
  })
}

/** Marks an entry as a relic (with its aspects) or back to a plain item (null). Its gifts stay attached. */
export async function setRelic(id: string, relic: { aspects: string[] } | null): Promise<void> {
  const row = await table().get(id)
  if (!row || row.attachedTo) return
  await put(row, { relic: relic ? { aspects: [...relic.aspects] } : null, quantity: relic ? 1 : row.quantity })
}

/** Stores an entry in a container of the same owner (or takes it out with null). Containers don't nest. */
export async function store(id: string, containerId: string | null): Promise<void> {
  const row = await table().get(id)
  if (!row || row.attachedTo || row.containerId === containerId || id === containerId) return
  if (containerId) {
    const c = await table().get(containerId)
    if (!c || c.ownerKey !== row.ownerKey || c.campaignId !== row.campaignId || c.containerId) return
    if ((await contentsOf(row)).length) return
  }
  await getDb().transaction('rw', table(), async () => {
    const target = await findStack(row.campaignId, row.ownerKey, { ...toStack(row), containerId }, row.id)
    if (target) { await put(target, { quantity: target.quantity + row.quantity }); await table().delete(row.id) }
    else await put(row, { containerId })
  })
}

// ── Moves ──────────────────────────────────────────────────────────────────

/**
 * Moves an entry (or `quantity` of it) to another owner. A partial move splits
 * the stack; the moved part merges into an identical stack at the target.
 * Attachments move only with their host; an implant stays in its body.
 */
export async function move(id: string, to: OwnerKey, quantity?: number): Promise<void> {
  const row = await table().get(id)
  if (!row || row.attachedTo || row.implanted) return
  const plan = planMove(toStack(row), to, quantity)
  if (plan.type === 'none') return
  const moved = plan.type === 'split' ? plan.quantity : row.quantity
  const hung = [...await contentsOf(row), ...await attachmentsOf(row)]
  const attached = hung.some(h => h.attachedTo === row.id)
  const target = { owner: ownerOf(to), ownerKey: to }
  const ts = nowIso()
  await getDb().transaction('rw', table(), async () => {
    // A container with contents (or an item with runes) goes whole and unmerged; a partial move leaves them with the part that stays
    if (hung.length && plan.type === 'reassign') {
      await put(row, { ...target, containerId: null })
      for (const h of hung) await put(h, target)
      return
    }
    const into = await findStack(row.campaignId, to, { ...toStack(row), containerId: null }, row.id)
    if (plan.type === 'reassign') {
      if (into) { await put(into, { quantity: into.quantity + moved }); await table().delete(row.id) }
      else await put(row, { ...target, containerId: null })
      return
    }
    await put(row, { quantity: plan.remaining })
    if (into) await put(into, { quantity: into.quantity + moved })
    else await table().put({ ...row, ...(attached ? { runes: null, relic: null } : {}), ...target, id: newId(), quantity: moved, containerId: null, createdAt: ts, updatedAt: ts })
  })
}

// ── Purses ─────────────────────────────────────────────────────────────────

const purseRow = (campaignId: string, owner: OwnerKey) => purseTable().where('[campaignId+ownerKey]').equals([campaignId, owner]).first()

async function writePurse(campaignId: string, owner: OwnerKey, cp: number): Promise<void> {
  const value = Math.max(0, Math.floor(cp))
  const row = await purseRow(campaignId, owner)
  if (row) await purseTable().put({ ...row, cp: value, updatedAt: nowIso() })
  else if (value > 0) await purseTable().put({ id: newId(), campaignId, owner: ownerOf(owner), ownerKey: owner, cp: value, updatedAt: nowIso() })
}

export async function purseOf(campaignId: string, owner: OwnerKey): Promise<number> {
  return (await purseRow(campaignId, owner))?.cp ?? 0
}

/** Adds (or with a negative amount, removes) coins; never below 0. */
export async function adjustPurse(campaignId: string, owner: OwnerKey, deltaCp: number): Promise<void> {
  await getDb().transaction('rw', purseTable(), async () => writePurse(campaignId, owner, (await purseOf(campaignId, owner)) + deltaCp))
}

/** Moves up to `cp` from one purse to another. Returns what was moved. */
export async function transferCoins(campaignId: string, from: OwnerKey, to: OwnerKey, cp: number): Promise<number> {
  if (from === to) return 0
  return getDb().transaction('rw', purseTable(), async () => {
    const have = await purseOf(campaignId, from)
    const moved = Math.max(0, Math.min(have, Math.floor(cp)))
    if (!moved) return 0
    await writePurse(campaignId, from, have - moved)
    await writePurse(campaignId, to, (await purseOf(campaignId, to)) + moved)
    return moved
  })
}

/** "Split evenly": each recipient gets floor(purse / n); the remainder stays with the source. */
export async function splitPurse(campaignId: string, from: OwnerKey, recipients: OwnerKey[]): Promise<{ each: number; remainder: number }> {
  const targets = recipients.filter(r => r !== from)
  if (!targets.length) return { each: 0, remainder: 0 }
  return getDb().transaction('rw', purseTable(), async () => {
    const result = splitCoins(await purseOf(campaignId, from), targets.length)
    if (!result.each) return result
    await writePurse(campaignId, from, result.remainder)
    for (const t of targets) await writePurse(campaignId, t, (await purseOf(campaignId, t)) + result.each)
    return result
  })
}

/** Hands an owner's items and coins to the stash, e.g. when a character leaves the party. */
export async function releaseOwner(campaignId: string, owner: OwnerKey): Promise<void> {
  if (owner === STASH) return
  // Containers and hosts first, so what is in or on them travels with them
  const rows = (await ownerRows(campaignId, owner).toArray()).sort((a, b) => Number(!!a.containerId || !!a.attachedTo) - Number(!!b.containerId || !!b.attachedTo))
  for (const r of rows) {
    const current = await table().get(r.id)
    if (current?.ownerKey !== owner) continue
    if (current.implanted) await put(current, { implanted: false })
    await move(r.id, STASH)
  }
  await getDb().transaction('rw', purseTable(), async () => {
    const purse = await purseRow(campaignId, owner)
    if (!purse) return
    if (purse.cp) await writePurse(campaignId, STASH, (await purseOf(campaignId, STASH)) + purse.cp)
    await purseTable().delete(purse.id)
  })
}
