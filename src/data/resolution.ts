/**
 * Resolving an encounter: its loot and coins go to the party stash, the XP is
 * recorded and, in XP campaigns, awarded to who took part. One ledger entry
 * carries what re-opening needs to take it back.
 */
import type { GameId } from '@/domain/game'
import { newId, nowIso } from '@/domain/ids'
import { parseDefeated, type DefeatedEnemy } from '@/domain/rules/advancement'
import { encounterOwner } from '@/domain/rules/inventory'
import type { Item, RulesEntity } from '@/domain/rules/types'
import { lootValue } from '@/domain/rules/wealth'
import { zLedgerEntry, type Character, type Combatant, type Encounter, type InventoryEntry } from '@/domain/schema'
import { getDb } from './db'
import { encounters, statLinkOf } from './encounters'
import { lootOf, releaseOwner, restoreLoot, toStack } from './inventory'
import { awardXp, campaignSettings, partyOf, undoXpAward, type ResolvedEntry } from './party'
import { rulesGetMany } from './rules'

export interface ResolveContext {
  encounter: Encounter
  game: GameId
  xpCampaign: boolean
  combatants: Combatant[]
  defeated: DefeatedEnemy[]
  /** Compendium entries of the tokens' stat blocks. */
  entries: Map<string, RulesEntity>
  party: Character[]
  loot: { count: number; cp: number }
}

/** Everything the meter and the resolve dialog need, read from the database so they work from the list too. */
export async function loadResolveContext(encounterId: string): Promise<ResolveContext | null> {
  const encounter = await encounters.get(encounterId)
  if (!encounter) return null
  const combatants = await encounters.combatants(encounterId)
  const ids = [...new Set(combatants.map(c => statLinkOf(c)?.rulesId).filter((id): id is string => !!id))]
  const [found, party, settings, loot] = await Promise.all([rulesGetMany(ids), partyOf(encounter.campaignId), campaignSettings(encounter.campaignId), lootOf(encounter.campaignId, encounterOwner(encounterId))])
  return {
    encounter, game: settings.game, xpCampaign: settings.rules.advancement === 'xp', combatants, defeated: parseDefeated(encounter.defeated),
    entries: new Map(found.map(e => [e.id, e])), party, loot: { count: loot.rows.filter(r => !r.attachedTo).length, cp: loot.cp },
  }
}

export interface ResolveInput {
  encounterId: string
  participants: string[]
  /** XP of the enemies counted, against `partyLevel`. */
  xpTotal: number
  partyLevel: number
  /** Accomplishment XP per participant, on top of the encounter's award. */
  accomplishment: number
  /** Per participant: the four-PC award plus the accomplishment. */
  xpAwarded: number
}

/** Returns the characters who can now level up (XP campaigns). */
export async function resolveEncounter(input: ResolveInput): Promise<Character[]> {
  const db = getDb()
  const enc = await encounters.get(input.encounterId)
  if (!enc || enc.status === 'resolved') return []
  const owner = encounterOwner(enc.id)
  const loot = await lootOf(enc.campaignId, owner)
  const itemIds = [...new Set(loot.rows.map(r => r.itemId).filter((id): id is string => !!id))]
  const items = new Map((await rulesGetMany(itemIds)).filter((e): e is Item => e.kind === 'item').map(e => [e.id, e]))
  const treasure = lootValue(loot.rows.map(toStack), items, loot.cp)
  // Claimed first, so a second click cannot award the XP twice
  const ts = nowIso()
  const claimed = await db.transaction('rw', db.rows('encounters'), async () => {
    const now = await db.rows('encounters').get(enc.id)
    if (!now || now.status === 'resolved') return false
    await db.rows('encounters').put({ ...now, status: 'resolved', resolvedAt: ts, xpTotal: input.xpTotal, xpAwarded: input.xpAwarded, partyLevelAtResolve: input.partyLevel, updatedAt: ts })
    return true
  })
  if (!claimed) return []
  await releaseOwner(enc.campaignId, owner)
  const xpCampaign = (await campaignSettings(enc.campaignId)).rules.advancement === 'xp'
  const award = xpCampaign && input.xpAwarded > 0
    ? await awardXp({ campaignId: enc.campaignId, amount: input.xpAwarded, characterIds: input.participants, source: 'encounter', refType: 'encounter', refId: enc.id, reason: enc.name })
    : null
  await db.rows('partyLedger').put(zLedgerEntry.parse({
    id: newId(), campaignId: enc.campaignId, kind: 'encounterResolved', at: ts, encounterId: enc.id, participants: input.participants,
    xpAwardId: award?.entry.id ?? null, accomplishment: input.accomplishment, loot: JSON.parse(JSON.stringify(loot)) as Record<string, unknown>, treasure,
  }))
  return award?.ready ?? []
}

/**
 * Sets a resolved encounter back to prepared: the XP award is undone and its
 * loot comes back from the stash as far as it is still there. Level-ups that
 * followed stay. Returns what could not be taken back.
 */
export async function reopenEncounter(encounterId: string): Promise<{ names: string[]; cp: number }> {
  const db = getDb()
  const enc = await encounters.get(encounterId)
  if (!enc || enc.status !== 'resolved') return { names: [], cp: 0 }
  const record = (await db.rows('partyLedger').where('campaignId').equals(enc.campaignId).toArray())
    .filter((l): l is ResolvedEntry => l.kind === 'encounterResolved' && l.encounterId === encounterId && !l.undoneAt).sort((a, b) => b.at.localeCompare(a.at))[0]
  const ts = nowIso()
  await db.rows('encounters').put({ ...enc, status: 'prepared', resolvedAt: null, xpTotal: null, xpAwarded: null, partyLevelAtResolve: null, updatedAt: ts })
  if (!record) return { names: [], cp: 0 }
  if (record.xpAwardId) await undoXpAward(record.xpAwardId)
  await db.rows('partyLedger').put({ ...record, undoneAt: ts })
  const loot = record.loot as unknown as { rows?: InventoryEntry[]; cp?: number }
  return restoreLoot(enc.campaignId, { rows: loot.rows ?? [], cp: loot.cp ?? 0 }, encounterOwner(encounterId))
}
