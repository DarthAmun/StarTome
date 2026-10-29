/**
 * Encounter resolution (FEATURES_PLAN.md §5, P4): "Resolve encounter" moves
 * the encounter's loot and coins to the party stash, records the XP and, in XP
 * campaigns, awards it to the participants, all in one transaction. Re-opening
 * undoes that as far as the loot is still in the stash.
 *
 * The only module that writes the encounter's resolution fields; `defeated`
 * is written by the encounter store during play.
 */
import { getDb, now, type DbEncounter, type DbEncounterToken } from '~/composables/useDb'
import { toEntry, useInventory, type OwnerSnapshot, type RestoreShortfall } from '~/composables/useInventory'
import { useParty } from '~/composables/useParty'
import { rulesGetMany } from '~/composables/useRules'
import { pacing, parseDefeated, type DefeatedEnemy, type Pacing } from '~/rules/advancement'
import { encounterOwner, STASH } from '~/rules/inventory'
import { lootValue, type TreasureValue } from '~/rules/wealth'
import type { Item, RulesEntity } from '~/types/rules'
import { parseJson } from '~/utils/json'

export interface ResolutionRecord {
  loot: OwnerSnapshot
  participants: number[]
  /** XP log entry of the award; null in milestone campaigns. */
  xpAwardId: number | null
  accomplishment: number
  /** GM value of the loot and coins at resolve time (P5); missing on records from before. */
  treasure?: TreasureValue
}

export function parseResolution(raw: string | null | undefined): ResolutionRecord | null {
  return parseJson<ResolutionRecord | null>(raw, null)
}

export interface ResolveInput {
  encounterId: number
  participants: number[]
  /** XP of the enemies counted, against `partyLevel`. */
  xpTotal: number
  partyLevel: number
  /** Accomplishment XP per participant, on top of the encounter's award. */
  accomplishment: number
  /** Per participant: the four-PC award plus `accomplishment`. */
  xpAwarded: number
  /** XP campaigns add `xpAwarded` to each participant; milestone ones only record it. */
  awardXp: boolean
}

async function itemsOf(ids: (string | null)[]): Promise<Map<string, Item>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]
  const found = unique.length ? await rulesGetMany(unique) : []
  return new Map(found.filter((e): e is Item => e.kind === 'item').map(e => [e.id, e]))
}

/** GM value of what an encounter's resolve moved to the stash. */
export function snapshotValue(loot: OwnerSnapshot, items: Map<string, Item>): TreasureValue {
  return lootValue(loot.entries.map((r, i) => toEntry({ ...r, id: -1 - i })), items, loot.cp)
}

/** A record's treasure value; records from before P5 are valued with today's prices. */
async function resolvedTreasure(record: ResolutionRecord | null): Promise<TreasureValue> {
  if (!record) return { value: 0, consumables: 0 }
  if (record.treasure) return record.treasure
  return snapshotValue(record.loot, await itemsOf(record.loot.entries.map(e => e.item_id)))
}

async function resolveEncounter(input: ResolveInput) {
  const db = getDb()
  const inv = useInventory()
  const party = useParty()
  const enc = await db.encounters.get(input.encounterId)
  if (!enc || enc.status === 'resolved') return
  const campaignId = enc.campaign_id
  const lootItems = await itemsOf((await db.inventory.where('owner').equals(encounterOwner(input.encounterId)).toArray()).map(r => r.item_id))
  let awardId: number | null = null
  let resolved = false
  await db.transaction('rw', [db.encounters, db.inventory, db.purses, db.characters, db.xpAwards], async () => {
    // Checked again inside the transaction: a second trigger mustn't award the XP twice (BUG-13)
    if ((await db.encounters.get(input.encounterId))?.status === 'resolved') return
    resolved = true
    const loot = await inv.transferAll(campaignId, encounterOwner(input.encounterId), STASH)
    if (input.awardXp) {
      awardId = await party.writeXpAward({
        campaignId, amount: input.xpAwarded, characterIds: input.participants,
        source: 'encounter', refType: 'encounter', refId: input.encounterId, reason: enc.name,
      })
    }
    const record: ResolutionRecord = {
      loot, participants: input.participants, xpAwardId: awardId, accomplishment: input.accomplishment,
      treasure: snapshotValue(loot, lootItems),
    }
    const ts = now()
    await db.encounters.update(input.encounterId, {
      status: 'resolved', resolved_at: ts, xp_total: input.xpTotal, xp_awarded: input.xpAwarded,
      party_level_at_resolve: input.partyLevel, resolution: JSON.stringify(record), updated_at: ts,
    })
  })
  if (!resolved) return
  await Promise.all([inv.reload(campaignId), party.reload(campaignId)])
  if (awardId != null) await party.promptReadyToLevel(campaignId, 'encounter', input.encounterId)
}

/**
 * Sets a resolved encounter back to `prepared`: its loot and coins come back
 * from the stash (as far as they're still there) and the XP award is undone.
 * Level-ups that followed stay. Returns what couldn't be taken back.
 */
async function reopenEncounter(encounterId: number): Promise<RestoreShortfall> {
  const db = getDb()
  const inv = useInventory()
  const party = useParty()
  const enc = await db.encounters.get(encounterId)
  const short: RestoreShortfall = { names: [], cp: 0 }
  if (!enc || enc.status !== 'resolved') return short
  const record = parseResolution(enc.resolution)
  await db.transaction('rw', [db.encounters, db.inventory, db.purses, db.characters, db.xpAwards], async () => {
    if ((await db.encounters.get(encounterId))?.status !== 'resolved') return
    if (record) {
      Object.assign(short, await inv.restoreSnapshot(enc.campaign_id, record.loot, encounterOwner(encounterId), STASH))
      if (record.xpAwardId != null) await party.writeXpUndo(record.xpAwardId)
    }
    await db.encounters.update(encounterId, {
      status: 'prepared', resolved_at: null, xp_total: null, xp_awarded: null,
      party_level_at_resolve: null, resolution: null, updated_at: now(),
    })
  })
  await Promise.all([inv.reload(enc.campaign_id), party.reload(enc.campaign_id)])
  return short
}

/** Resolved encounters of a campaign, via the [campaign_id+status] index. */
export function resolvedEncounters(campaignId: number): Promise<DbEncounter[]> {
  return getDb().encounters.where('[campaign_id+status]').equals([campaignId, 'resolved']).filter(e => !!e.resolved_at).toArray()
}

/** When the party last levelled up (ignoring undone level-ups), or null. */
export async function lastLevelUpAt(campaignId: number): Promise<string | null> {
  const ups = await getDb().levelUps.where('campaign_id').equals(campaignId).filter(l => !l.undone_at).toArray()
  return ups.reduce<string | null>((max, l) => (!max || l.at > max ? l.at : max), null)
}

/** Milestone pacing: XP of the encounters resolved since the last level-up that wasn't undone. */
async function loadPacing(campaignId: number): Promise<Pacing> {
  const [encounters, since] = await Promise.all([resolvedEncounters(campaignId), lastLevelUpAt(campaignId)])
  return pacing(encounters.map(e => ({ resolvedAt: e.resolved_at!, xpAwarded: e.xp_awarded ?? 0 })), since)
}

export interface ResolveContext {
  encounter: DbEncounter
  tokens: DbEncounterToken[]
  defeated: DefeatedEnemy[]
  /** Compendium entries of the linked tokens and defeated enemies. */
  entries: Map<string, RulesEntity>
}

/** Everything the resolve dialog needs, read from the database so it works outside the encounter page. */
async function loadResolveContext(encounterId: number): Promise<ResolveContext | null> {
  const db = getDb()
  const encounter = await db.encounters.get(encounterId)
  if (!encounter) return null
  const tokens = await db.encounterTokens.where('encounter_id').equals(encounterId).toArray()
  const defeated = parseDefeated(encounter.defeated)
  const ids = [...new Set([...tokens.map(t => t.linked_rules_id), ...defeated.map(d => d.rulesId)].filter((id): id is string => !!id))]
  const found = ids.length ? await rulesGetMany(ids) : []
  return { encounter, tokens, defeated, entries: new Map(found.map(e => [e.id, e])) }
}

export function useResolution() {
  return { resolveEncounter, reopenEncounter, loadPacing, loadResolveContext, resolvedTreasure }
}
