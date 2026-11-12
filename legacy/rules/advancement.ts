/**
 * Advancement after play (FEATURES_PLAN.md §5, P4): the XP award per character,
 * who took part in an encounter, enemies removed during play, the 1,000 XP
 * level-up and the milestone pacing hint. Pure; useResolution.ts and
 * useParty.ts do the IO.
 */
import { rateEncounter, threatBudgets, DEFAULT_PARTY_SIZE } from '~/rules/encounter'
import { isPartyMember, MAX_LEVEL, type PartyCharacter } from '~/rules/party'
import type { Adjustment } from '~/rules/combat'
import type { GameId } from '~/types/game'
import { parseJson } from '~/utils/json'

export const XP_PER_LEVEL = 1000

/** GM Core accomplishment XP. */
export const ACCOMPLISHMENT_XP = { minor: 10, moderate: 30, major: 80 } as const
export type AccomplishmentSize = keyof typeof ACCOMPLISHMENT_XP

/**
 * XP each participant gets for an encounter worth `xp` against a group of
 * `groupSize`. GM Core keeps the award equal to what four PCs would get: a
 * larger group raises the budget, not the award. The XP is scaled by the
 * four-PC budget of the threat it reached over the group's budget.
 */
export function fourPcAward(game: GameId, xp: number, groupSize: number): number {
  if (xp <= 0) return 0
  const size = groupSize > 0 ? groupSize : DEFAULT_PARTY_SIZE
  if (size === 4) return xp
  const { threat } = rateEncounter(game, xp, size)
  const t = threat === 'beyond' ? 'extreme' : threat
  const four = threatBudgets(game, 4)
  const group = threatBudgets(game, size)
  // Tiny groups can have a zero budget for a threat; moderate is always positive
  const key = group[t] > 0 ? t : 'moderate'
  return Math.round((xp * four[key]) / group[key])
}

// ── Enemies removed during play ───────────────────────────────────────────

/** An enemy token deleted in Run mode; its XP stays on the encounter. */
export interface DefeatedEnemy {
  name: string
  rulesId: string
  level: number
  kind: 'creature' | 'hazard'
  complex?: boolean
  adjustment: Adjustment | null
}

export function parseDefeated(raw: unknown): DefeatedEnemy[] {
  const list = parseJson<unknown>(raw, [])
  return Array.isArray(list) ? list.filter(d => d && typeof d.rulesId === 'string' && typeof d.level === 'number') : []
}

// ── Participants ──────────────────────────────────────────────────────────

type ParticipantCharacter = Pick<PartyCharacter, 'id' | 'role' | 'treatAsPc'> & { npcEntityId: number | null; tokenId: number | null }
interface ParticipantToken { linkedEntityId: number | null; tokenId: number | null }

/**
 * Who took part (§9.4): characters whose NPC entry or library token is on the
 * map, companions included. Without any, every party member.
 */
export function defaultParticipants(characters: ParticipantCharacter[], tokens: ParticipantToken[]): number[] {
  const npcs = new Set(tokens.map(t => t.linkedEntityId).filter((id): id is number => id != null))
  const libs = new Set(tokens.map(t => t.tokenId).filter((id): id is number => id != null))
  const onMap = characters.filter(c => (c.npcEntityId != null && npcs.has(c.npcEntityId)) || (c.tokenId != null && libs.has(c.tokenId)))
  return (onMap.length ? onMap : characters.filter(isPartyMember)).map(c => c.id)
}

// ── Levelling by XP ───────────────────────────────────────────────────────

/** Characters with enough XP for their next level. */
export function readyToLevel(characters: (Pick<PartyCharacter, 'id' | 'level'> & { xp: number })[]): number[] {
  return characters.filter(c => c.xp >= XP_PER_LEVEL && c.level < MAX_LEVEL).map(c => c.id)
}

/** XP left after a level-up in an XP campaign. */
export function xpAfterLevelUp(xp: number): number {
  return Math.max(0, xp - XP_PER_LEVEL)
}

// ── Pacing (milestone campaigns) ──────────────────────────────────────────

export interface ResolvedXp { resolvedAt: string; xpAwarded: number }

export interface Pacing {
  /** Award per character (as for four PCs) of the encounters resolved since `since`. */
  xp: number
  encounters: number
  /** xp / 1,000; above 1 the party has earned more than a level. */
  fraction: number
}

/** Σ XP of encounters resolved after the last level-up, against 1,000 (§5). */
export function pacing(resolved: ResolvedXp[], since: string | null): Pacing {
  const counted = resolved.filter(r => !since || r.resolvedAt > since)
  const xp = counted.reduce((n, r) => n + (r.xpAwarded || 0), 0)
  return { xp, encounters: counted.length, fraction: xp / XP_PER_LEVEL }
}
