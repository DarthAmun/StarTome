/**
 * The wealth readout: what the party was awarded against what the treasure
 * table expects by now, the pace within the current level, and the milestone
 * pacing. Reads the ledger, resolved encounters and the campaign's rules.
 */
import type { CampaignRules, GameId } from '@/domain/game'
import { pacing, type Pacing } from '@/domain/rules/advancement'
import { treasurePace, wealthReadout, xpProgress, type ConsumablePrices, type TreasurePace, type TreasureValue, type WealthReadout } from '@/domain/rules/wealth'
import type { Item } from '@/domain/rules/types'
import { getDb } from './db'
import { campaignSettings, lastLevelUpAt, ledgerOf } from './party'
import { onRulesChanged, rulesTable } from './rules'

export interface PartyShape { level: number | null; size: number; /** XP of the members, for the progress through the level. */ xps: number[] }

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

interface DatedValue extends TreasureValue { at: string; source: 'encounter' | 'manual' }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Every award still in effect: resolved encounters and treasure awards that were not undone. */
async function awardHistory(campaignId: string): Promise<DatedValue[]> {
  const out: DatedValue[] = []
  for (const e of await ledgerOf(campaignId)) {
    if (e.undoneAt) continue
    if (e.kind === 'treasureAward') out.push({ at: e.at, source: 'manual', value: e.value, consumables: e.consumables })
    else if (e.kind === 'encounterResolved') out.push({ at: e.at, source: 'encounter', value: num(e.treasure?.value), consumables: num(e.treasure?.consumables) })
  }
  return out
}

const sum = (list: TreasureValue[]) => list.reduce((n, a) => n + a.value, 0)

/** Encounter XP (as for four PCs) resolved since the last level-up: about 1,000 per level. */
export async function loadPacing(campaignId: string): Promise<Pacing> {
  const [encounters, since] = await Promise.all([
    getDb().rows('encounters').where('[campaignId+status]').equals([campaignId, 'resolved']).toArray(),
    lastLevelUpAt(campaignId),
  ])
  return pacing(encounters.filter(e => e.resolvedAt).map(e => ({ resolvedAt: e.resolvedAt ?? '', xpAwarded: e.xpAwarded ?? 0 })), since)
}

// Median consumable price per item level, for the estimate with "count consumables" off; recomputed after a compendium change
const priceCache = new Map<GameId, ConsumablePrices>()
onRulesChanged(() => priceCache.clear())

async function consumablePrices(game: GameId): Promise<ConsumablePrices> {
  const hit = priceCache.get(game)
  if (hit) return hit
  const byLevel: Record<number, number[]> = {}
  await rulesTable().where('kind').equals('item').each((raw) => {
    const e = raw as Item
    if ((e.game !== game && e.game !== 'both') || e.supersededBy || e.upstream?.removed || e.category !== 'consumable' || !e.price?.cp) return
    ;(byLevel[e.level] ??= []).push(Math.round(e.price.cp / Math.max(1, e.priceFor ?? 1)))
  })
  const medians = Object.fromEntries(Object.entries(byLevel).map(([l, prices]) => {
    const s = prices.sort((a, b) => a - b), mid = s.length >> 1
    return [Number(l), s.length % 2 ? s[mid] ?? 0 : Math.round(((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2)]
  }))
  priceCache.set(game, medians)
  return medians
}

export async function loadWealth(campaignId: string, party: PartyShape): Promise<WealthState> {
  const { game, rules } = await campaignSettings(campaignId)
  const [history, since] = await Promise.all([awardHistory(campaignId), lastLevelUpAt(campaignId)])
  const afterBaseline = history.filter(a => !rules.baselineAt || a.at > rules.baselineAt)
  const sinceBaseline = { encounters: sum(afterBaseline.filter(a => a.source === 'encounter')), manual: sum(afterBaseline.filter(a => a.source === 'manual')), count: afterBaseline.length }
  if (party.level === null) return { game, rules, readout: null, sinceBaseline, pace: null, lastLevelUpAt: since }
  const progress = rules.advancement === 'xp' ? xpProgress(party.xps) : Math.min(0.99, (await loadPacing(campaignId)).fraction)
  const readout = wealthReadout({
    game, partyLevel: party.level, progress, partySize: party.size, starting: { value: rules.startingTreasure, consumables: rules.startingConsumables },
    awards: afterBaseline, countConsumables: rules.countConsumables, prices: rules.countConsumables ? undefined : await consumablePrices(game),
  })
  return { game, rules, readout, sinceBaseline, pace: treasurePace(game, party.level, party.size, sum(history.filter(a => !since || a.at > since))), lastLevelUpAt: since }
}
