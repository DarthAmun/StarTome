/** An encounter's difficulty from its tokens and the party: used by the meter, the list and the resolve dialog. */
import type { GameId } from '@/domain/game'
import { fourPcAward, type DefeatedEnemy } from '@/domain/rules/advancement'
import { rateTokens, type Difficulty } from '@/domain/rules/difficulty'
import { rateEncounter, type EncounterRating } from '@/domain/rules/encounter'
import { partyLevel, type PartyLevel } from '@/domain/rules/party'
import type { RulesEntity } from '@/domain/rules/types'
import type { Character, Combatant } from '@/domain/schema'
import { statLinkOf } from '@/data/encounters'

export interface Rated {
  party: PartyLevel
  /** The level the XP is counted against: the override, or the party's. */
  level: number
  difficulty: Difficulty
  rating: EncounterRating
  /** What each participant gets: as for a party of four. */
  award: number
}

type Rateable = Pick<Combatant, 'ref' | 'statBlock' | 'playerToken' | 'ally' | 'label'> & { name?: string }

/** On the party's side: a player token, a party member, or the NPC entry of one. */
export function isPartyToken(t: Pick<Combatant, 'ref' | 'playerToken'>, party: Character[]): boolean {
  if (t.playerToken || t.ref.kind === 'character') return true
  const ref = t.ref
  return ref.kind === 'entry' && party.some(c => c.entryId === ref.entryId)
}

export function rate(game: GameId, tokens: Rateable[], defeated: DefeatedEnemy[], entries: Map<string, RulesEntity>, characters: Character[], override: number | null): Rated {
  const party = partyLevel(characters)
  const level = override ?? party.level ?? 1
  const difficulty = rateTokens(game, tokens.map(t => ({ name: t.name ?? t.label ?? '', stat: statLinkOf(t), party: isPartyToken(t, characters), ally: t.ally })), defeated, entries, level, override === null ? party.min : null)
  return { party, level, difficulty, rating: rateEncounter(game, difficulty.xp, party.size), award: fourPcAward(game, difficulty.xp, party.size) }
}
