/** Party members. (Phase 2 needs only the "player character" switch on an NPC; the party phase builds the rest here.) */
import { newId, nowIso } from '@/domain/ids'
import { zCharacter, type Character, type Entry } from '@/domain/schema'
import { getDb } from './db'

export async function characterOfEntry(entryId: string): Promise<Character | undefined> {
  return getDb().rows('characters').where('entryId').equals(entryId).first()
}

/** Adds the NPC to the party as a player character, at the level its entry states. */
export async function addCharacterFor(entry: Entry): Promise<Character> {
  const existing = await characterOfEntry(entry.id)
  if (existing) return existing
  const level = entry.type === 'npc' ? Number.parseInt(entry.data.level, 10) : Number.NaN
  const ts = nowIso()
  const row = zCharacter.parse({ id: newId(), campaignId: entry.campaignId, name: entry.name, role: 'pc', level: Number.isFinite(level) && level > 0 ? level : 1, entryId: entry.id, createdAt: ts, updatedAt: ts })
  await getDb().rows('characters').put(row)
  return row
}

/** Takes a character out of the party; what they carried goes to the party stash. The NPC entry stays. */
export async function removeCharacter(characterId: string): Promise<void> {
  const db = getDb()
  await db.transaction('rw', [db.rows('characters'), db.rows('inventory'), db.rows('purses')], async () => {
    const c = await db.rows('characters').get(characterId)
    if (!c) return
    const key = `character:${characterId}`
    await db.rows('inventory').where('[campaignId+ownerKey]').equals([c.campaignId, key]).modify({ owner: { kind: 'stash' }, ownerKey: 'stash' })
    const purse = await db.rows('purses').where('[campaignId+ownerKey]').equals([c.campaignId, key]).first()
    if (purse) {
      const stash = await db.rows('purses').where('[campaignId+ownerKey]').equals([c.campaignId, 'stash']).first()
      if (stash) await db.rows('purses').update(stash.id, { cp: stash.cp + purse.cp, updatedAt: nowIso() })
      else await db.rows('purses').put({ id: newId(), campaignId: c.campaignId, owner: { kind: 'stash' }, ownerKey: 'stash', cp: purse.cp, updatedAt: nowIso() })
      await db.rows('purses').delete(purse.id)
    }
    await db.rows('characters').delete(characterId)
  })
}
