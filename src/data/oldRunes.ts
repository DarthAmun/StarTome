/**
 * Runes kept the old way: a "+1 striking" field on the item, from before runes
 * were entries attached to their host. They show as a label and count in the
 * gear check; this turns them into attached rune entries.
 */
import type { Runes } from '@/domain/rules/types'
import type { InventoryEntry as Row } from '@/domain/schema'
import { getDb } from './db'
import { attach } from './inventory'
import { rulesFindByName, rulesGet } from './rules'

const table = () => getDb().rows('inventory')
const runesOf = (r: Row) => r.runes as Runes | null

const TIER_WORDS = ['', 'Greater', 'Major']

/** Compendium names a rune of the old `runes` field may go by. */
function oldRuneNames(runes: Runes, armor: boolean): string[][] {
  const out: string[][] = []
  const what = armor ? 'Armor' : 'Weapon'
  if (runes.potency) out.push([`${what} Potency (+${runes.potency})`, `+${runes.potency} ${what} Potency`])
  const fundamental = (word: string, tier: number) => { const t = TIER_WORDS[tier - 1]; out.push(t ? [`${word} (${t})`, `${t} ${word}`] : [word]) }
  if (runes.striking) fundamental('Striking', runes.striking)
  if (runes.resilient) fundamental('Resilient', runes.resilient)
  for (const p of runes.property ?? []) out.push([p])
  return out
}

async function oldRuneRows(campaignId: string): Promise<Row[]> {
  const rows = await table().where('campaignId').equals(campaignId).toArray()
  const hosts = new Set(rows.map(r => r.attachedTo).filter(Boolean))
  return rows.filter((r) => {
    const runes = runesOf(r)
    return !!runes && !r.attachedTo && !r.link && !r.grade && !hosts.has(r.id) && !!(runes.potency || runes.striking || runes.resilient || runes.property?.length)
  })
}

/** How many items still carry runes as a label only (from before runes were attached entries). */
export async function oldRuneCount(campaignId: string): Promise<number> {
  return (await oldRuneRows(campaignId)).length
}

/**
 * Turns runes kept as a label ("+1 striking") into attached rune entries from the compendium.
 * An item is converted only when every one of its runes is found; the others keep their label.
 */
export async function convertOldRunes(campaignId: string): Promise<{ converted: number; left: { item: string; missing: string[] }[] }> {
  let converted = 0
  const left: { item: string; missing: string[] }[] = []
  for (const row of await oldRuneRows(campaignId)) {
    const item = row.itemId ? await rulesGet(row.itemId) : undefined
    const label = row.nameOverride || item?.name || 'Unnamed item'
    if (row.quantity > 1) { left.push({ item: label, missing: ['a stack of several: split one off first'] }); continue }
    const category = item?.kind === 'item' ? item.category : null
    const armor = category === 'armor' || category === 'shield' || (!category && !!runesOf(row)?.resilient)
    const found: string[] = [], missing: string[] = []
    for (const names of oldRuneNames(runesOf(row) ?? { potency: 0, property: [] }, armor)) {
      let hit: string | null = null
      for (const n of names) { hit = (await rulesFindByName('item', n, 'pf2e'))?.id ?? null; if (hit) break }
      if (hit) found.push(hit)
      else missing.push(names[0] ?? '')
    }
    if (missing.length || !found.length) { left.push({ item: label, missing }); continue }
    for (const itemId of found) await attach(row.id, { itemId })
    converted++
  }
  return { converted, left }
}
