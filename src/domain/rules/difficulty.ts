/**
 * What an encounter is worth: the XP of its enemies against the party's level,
 * for the meter while preparing and for the award when it is resolved. Tokens
 * of the party, allies and tokens without a creature or hazard stat block
 * (bare tokens, vehicles) add nothing.
 */
import type { GameId } from '@/domain/game'
import { adjustedName, type Adjustment } from './combat'
import type { DefeatedEnemy } from './advancement'
import { entryXp, tooStrong, type XpEntry } from './encounter'
import type { Hazard, RulesEntity } from './types'

export interface DifficultyToken {
  name: string
  /** The compendium stat block it uses, if any. */
  stat: { rulesId: string; adjustment: Adjustment | null } | null
  /** A party member's token, or one that shares the players' vision. */
  party: boolean
  ally: boolean
}

export interface DifficultyRow { name: string; level: number; xp: number; tooStrong: boolean; defeated: boolean }

export interface Difficulty {
  rows: DifficultyRow[]
  xp: number
  /** Tokens against the party that have no stat block, so no XP. */
  unlinked: number
}

export function xpEntryOf(e: RulesEntity, adjustment: Adjustment | null): XpEntry | null {
  // A starship counts like a creature of its level
  if (e.kind !== 'creature' && e.kind !== 'hazard' && e.kind !== 'starship') return null
  return { level: e.level, kind: e.kind === 'hazard' ? 'hazard' : 'creature', complex: e.kind === 'hazard' ? (e as Hazard).complex : undefined, adjustment }
}

export function rateTokens(game: GameId, tokens: DifficultyToken[], defeated: DefeatedEnemy[], entries: Map<string, RulesEntity>, partyLevel: number, lowestLevel: number | null): Difficulty {
  const rows: DifficultyRow[] = []
  let unlinked = 0
  for (const t of tokens) {
    if (t.party || t.ally) continue
    const entry = t.stat ? entries.get(t.stat.rulesId) : undefined
    const xe = entry ? xpEntryOf(entry, t.stat?.adjustment ?? null) : null
    if (!entry || !xe) { if (!entry) unlinked++; continue }
    rows.push({ name: t.name || adjustedName(entry.name, xe.adjustment), level: xe.level, xp: entryXp(game, xe, partyLevel), tooStrong: tooStrong(xe, lowestLevel), defeated: false })
  }
  for (const d of defeated) {
    const xe: XpEntry = { level: d.level, kind: d.kind, complex: d.complex, adjustment: d.adjustment }
    rows.push({ name: d.name, level: d.level, xp: entryXp(game, xe, partyLevel), tooStrong: false, defeated: true })
  }
  return { rows, xp: rows.reduce((n, r) => n + r.xp, 0), unlinked }
}
