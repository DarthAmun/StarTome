/**
 * The inventory side of the character link: a linked character's items as
 * their app reports them (read-only rows marked with the app's entry id), and
 * stash stacks that wait for a player's answer to a gift.
 */
import { newId, nowIso } from '@/domain/ids'
import { runesSummary } from '@/domain/rules/attachments'
import { characterOwner } from '@/domain/rules/inventory'
import { zInventoryEntry, type InventoryEntry as Row, type MirrorItem } from '@/domain/schema'
import { getDb } from './db'
import { adjustPurse, ownerOf, purseOf } from './inventory'

const table = () => getDb().rows('inventory')

/**
 * Replaces what the character holds with what their app reports. With
 * `mirrored` false (a share file for a character without a live link) the
 * rows are ordinary, editable stacks.
 */
export async function replaceMirror(campaignId: string, characterId: string, items: MirrorItem[] | null, coinsCp: number | null, mirrored = true): Promise<void> {
  const owner = characterOwner(characterId)
  const ts = nowIso()
  const base = { campaignId, owner: ownerOf(owner), ownerKey: owner, createdAt: ts, updatedAt: ts }
  const still = await getDb().rows('characters').get(characterId)
  if (!still || (mirrored && !still.link)) return
  if (items) {
    await getDb().transaction('rw', table(), getDb().rows('characters'), async () => {
      // A read that finishes after the character was removed or unlinked writes nothing
      const c = await getDb().rows('characters').get(characterId)
      if (!c || (mirrored && !c.link)) return
      await table().where('[campaignId+ownerKey]').equals([campaignId, owner]).delete()
      const ids = new Map<string, string>()
      const rows: Row[] = []
      for (const i of items) {
        const id = newId()
        ids.set(i.entryId, id)
        // Without a compendium match the row carries the app's own name, price and Bulk
        rows.push(zInventoryEntry.parse({
          ...base, id, itemId: i.rulesId, quantity: i.quantity, nameOverride: i.rulesId ? null : i.name,
          priceOverride: i.rulesId ? null : Math.round(i.price / (i.priceFor || 1)), bulkOverride: i.rulesId ? null : i.bulkTenths,
          identified: i.identified, playerName: i.identified ? null : i.name, runes: runesSummary(i.attachments), grade: i.grade, implanted: i.implanted, relic: i.relic,
          link: mirrored ? { remoteEntryId: i.entryId } : null,
        }))
        for (const a of i.attachments) {
          rows.push(zInventoryEntry.parse({
            ...base, id: newId(), itemId: a.rulesId, quantity: 1, nameOverride: a.rulesId ? null : a.name, priceOverride: a.rulesId || a.kind === 'gift' ? null : a.price,
            identified: a.identified, playerName: a.identified ? null : a.name, attachedTo: id, attachKind: a.kind, link: mirrored ? { remoteEntryId: a.entryId } : null,
          }))
        }
      }
      for (const r of rows) {
        const src = items.find(i => ids.get(i.entryId) === r.id)
        if (src?.containerEntryId) r.containerId = ids.get(src.containerEntryId) ?? null
      }
      await table().bulkPut(rows)
    })
  }
  if (coinsCp !== null) await adjustPurse(campaignId, owner, coinsCp - await purseOf(campaignId, owner))
}

/** Back to a plain party character: the last mirrored items stay as ordinary, editable stacks. */
export async function releaseMirror(campaignId: string, characterId: string): Promise<void> {
  const rows = await table().where('[campaignId+ownerKey]').equals([campaignId, characterOwner(characterId)]).toArray()
  await table().bulkPut(rows.filter(r => r.link).map(r => ({ ...r, link: null })))
}

/** Marks stacks as waiting for a player's answer (or frees them with null). Marked stacks do not merge or move. */
export async function markOffered(ids: string[], outboxId: string | null): Promise<void> {
  const rows = (await table().bulkGet(ids)).filter((r): r is Row => !!r)
  await table().bulkPut(rows.map(r => ({ ...r, link: outboxId ? { remoteEntryId: null, offerId: outboxId } : null, updatedAt: nowIso() })))
}

/** A gift was answered: accepted takes the given quantities out of the stash; anything else frees the stacks. */
export async function settleOffered(stacks: { inventoryId: string; quantity: number }[], accepted: boolean): Promise<void> {
  await getDb().transaction('rw', table(), async () => {
    for (const s of stacks) {
      const row = await table().get(s.inventoryId)
      if (!row) continue
      const left = accepted ? row.quantity - s.quantity : row.quantity
      if (left > 0) { await table().put({ ...row, quantity: left, link: null, updatedAt: nowIso() }); continue }
      const hung = (await table().where('[campaignId+ownerKey]').equals([row.campaignId, row.ownerKey]).toArray()).filter(r => r.attachedTo === row.id)
      await table().bulkDelete([row.id, ...hung.map(h => h.id)])
    }
  })
}
