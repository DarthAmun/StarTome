/**
 * Wealth tracking (FEATURES_PLAN.md P5, §3, §9.1, §9.6): treasure awards
 * outside encounters, the wealth readout and the treasure pace. The only
 * module that writes `treasureAwards`.
 *
 * Treasure awarded = the baseline + resolved encounter loot (valued in each
 * resolution record) + manual awards, all after the baseline. Items added by
 * hand without "award" are corrections and never count.
 */
import { ref } from 'vue'
import { getDb, now, type DbTreasureAward } from '~/composables/useDb'
import { onTablesChanged } from '~/db/changes'
import { consumablePriceMedians, useRulesRevision } from '~/composables/useRules'
import { lastLevelUpAt, parseResolution, resolvedEncounters, useResolution } from '~/composables/useResolution'
import { pacing } from '~/rules/advancement'
import { treasurePace, wealthReadout, xpProgress, type ConsumablePrices, type TreasurePace, type TreasureValue, type WealthReadout } from '~/rules/wealth'
import { campaignGame, campaignRules, type CampaignRules, type GameId } from '~/types/game'

export interface TreasureAwardEntry {
  id: number
  at: string
  value: number
  consumables: number
  label: string
  undoneAt: string | null
}

function toAward(r: DbTreasureAward): TreasureAwardEntry {
  return { id: r.id!, at: r.at, value: r.value, consumables: r.consumables, label: r.label, undoneAt: r.undone_at ?? null }
}

const awards = ref<TreasureAwardEntry[]>([])
const loadedCampaign = ref<number | null>(null)
/** Bumped on every award change so readouts can reload. */
const revision = ref(0)

async function loadAwards(campaignId: number) {
  const rows = await getDb().treasureAwards.where('campaign_id').equals(campaignId).toArray()
  awards.value = rows.map(toAward).sort((a, b) => b.at.localeCompare(a.at))
  loadedCampaign.value = campaignId
}

// Awards, resolves and level-ups from another window move the readout too
onTablesChanged(['treasureAwards', 'encounters', 'levelUps', 'campaigns'], () => {
  revision.value++
  if (loadedCampaign.value != null) void loadAwards(loadedCampaign.value)
})

async function reloadIfLoaded(campaignId: number) {
  revision.value++
  if (loadedCampaign.value === campaignId) await loadAwards(campaignId)
}

/** Records items or coins given as treasure (not a correction). */
async function awardTreasure(input: { campaignId: number; value: TreasureValue; label: string }) {
  if (input.value.value <= 0) return
  await getDb().treasureAwards.add({
    campaign_id: input.campaignId, at: now(), value: input.value.value,
    consumables: Math.min(input.value.value, input.value.consumables), label: input.label,
  })
  await reloadIfLoaded(input.campaignId)
}

async function undoTreasureAward(id: number) {
  const db = getDb()
  const row = await db.treasureAwards.get(id)
  if (!row || row.undone_at) return
  await db.treasureAwards.update(id, { undone_at: now() })
  await reloadIfLoaded(row.campaign_id)
}

// ── Awards over time ──────────────────────────────────────────────────────

interface DatedValue extends TreasureValue { at: string; source: 'encounter' | 'manual' }

/** Every award still in effect: resolved encounters and manual awards that weren't undone. */
async function awardHistory(campaignId: number): Promise<DatedValue[]> {
  const db = getDb()
  const { resolvedTreasure } = useResolution()
  const [encounters, manual] = await Promise.all([
    resolvedEncounters(campaignId),
    db.treasureAwards.where('campaign_id').equals(campaignId).filter(a => !a.undone_at).toArray(),
  ])
  const fromEncounters = await Promise.all(encounters.map(async e => ({
    at: e.resolved_at!, source: 'encounter' as const, ...(await resolvedTreasure(parseResolution(e.resolution))),
  })))
  return [...fromEncounters, ...manual.map(a => ({ at: a.at, source: 'manual' as const, value: a.value, consumables: a.consumables }))]
}

const sumValue = (list: TreasureValue[]) => list.reduce((n, a) => n + a.value, 0)

// ── Readouts ──────────────────────────────────────────────────────────────

// Recomputed after any compendium change (a sync can change prices, BUG-19)
const priceCache = new Map<GameId, ConsumablePrices>()
let priceRevision = -1
async function prices(game: GameId): Promise<ConsumablePrices> {
  const rev = useRulesRevision().value
  if (rev !== priceRevision) { priceCache.clear(); priceRevision = rev }
  if (!priceCache.has(game)) priceCache.set(game, await consumablePriceMedians(game))
  return priceCache.get(game)!
}

export interface PartyShape {
  level: number | null
  size: number
  /** XP of the party members, for the progress through the level. */
  xps: number[]
}

export interface WealthState {
  game: GameId
  rules: CampaignRules
  /** Null without a party level. */
  readout: WealthReadout | null
  /** Awards since the baseline, for the breakdown. */
  sinceBaseline: { encounters: number; manual: number; count: number }
  pace: TreasurePace | null
  lastLevelUpAt: string | null
}

/** Treasure since the last level-up against the current level's row. */
async function loadTreasurePace(campaignId: number, level: number | null, size: number): Promise<TreasurePace | null> {
  if (level == null) return null
  const since = await lastLevelUpAt(campaignId)
  const counted = (await awardHistory(campaignId)).filter(a => !since || a.at > since)
  const campaign = await getDb().campaigns.get(campaignId)
  return treasurePace(campaignGame(campaign), level, size, sumValue(counted))
}

async function loadWealth(campaignId: number, party: PartyShape): Promise<WealthState> {
  const db = getDb()
  const campaign = await db.campaigns.get(campaignId)
  const game = campaignGame(campaign)
  const rules = campaignRules(campaign)
  const [history, since] = await Promise.all([awardHistory(campaignId), lastLevelUpAt(campaignId)])
  const afterBaseline = history.filter(a => !rules.baselineAt || a.at > rules.baselineAt)
  const sinceBaseline = {
    encounters: sumValue(afterBaseline.filter(a => a.source === 'encounter')),
    manual: sumValue(afterBaseline.filter(a => a.source === 'manual')),
    count: afterBaseline.length,
  }
  if (party.level == null) return { game, rules, readout: null, sinceBaseline, pace: null, lastLevelUpAt: since }

  let progress: number
  if (rules.advancement === 'xp') progress = xpProgress(party.xps)
  else {
    const resolved = await resolvedEncounters(campaignId)
    progress = Math.min(0.99, pacing(resolved.map(e => ({ resolvedAt: e.resolved_at!, xpAwarded: e.xp_awarded ?? 0 })), since).fraction)
  }
  const readout = wealthReadout({
    game, partyLevel: party.level, progress, partySize: party.size,
    starting: { value: rules.startingTreasure, consumables: rules.startingConsumables },
    awards: afterBaseline, countConsumables: rules.countConsumables,
    prices: rules.countConsumables ? undefined : await prices(game),
  })
  const pace = treasurePace(game, party.level, party.size, sumValue(history.filter(a => !since || a.at > since)))
  return { game, rules, readout, sinceBaseline, pace, lastLevelUpAt: since }
}

async function updateRules(campaignId: number, patch: Partial<CampaignRules>): Promise<CampaignRules> {
  const db = getDb()
  const next = { ...campaignRules(await db.campaigns.get(campaignId)), ...patch }
  await db.campaigns.update(campaignId, { rules: next, updated_at: now() })
  revision.value++
  return next
}

export function useWealth() {
  return { awards, revision, loadAwards, awardTreasure, undoTreasureAward, loadWealth, loadTreasurePace, updateRules }
}
