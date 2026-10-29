/**
 * Party rules (FEATURES_PLAN.md §1, §9.4, §5): who counts as a party member,
 * the party level, and level-up planning. Pure; useParty.ts does the IO.
 */

export type CharacterRole = 'pc' | 'companion'

export interface PartyCharacter {
  id: number
  name: string
  role: CharacterRole
  level: number
  /** Companions only: count for party size and level like a PC. PCs always count. */
  treatAsPc: boolean
}

export const MIN_LEVEL = 1
export const MAX_LEVEL = 20

export function clampLevel(level: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level)))
}

/** NPC entries store level as free text ("5", "Level 5", "5th"); the first number wins. */
export function parseLevel(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return clampLevel(raw)
  if (typeof raw !== 'string') return null
  const m = raw.match(/-?\d+/)
  return m ? clampLevel(Number(m[0])) : null
}

export function isPartyMember(c: Pick<PartyCharacter, 'role' | 'treatAsPc'>): boolean {
  return c.role === 'pc' || c.treatAsPc
}

export function partyMembers<T extends Pick<PartyCharacter, 'role' | 'treatAsPc'>>(characters: T[]): T[] {
  return characters.filter(isPartyMember)
}

export interface PartyLevel {
  /** Average of the members' levels, rounded down; null for an empty party. */
  level: number | null
  min: number | null
  max: number | null
  mixed: boolean
  size: number
}

export function partyLevel(characters: Pick<PartyCharacter, 'role' | 'treatAsPc' | 'level'>[]): PartyLevel {
  const levels = partyMembers(characters).map(c => c.level)
  if (!levels.length) return { level: null, min: null, max: null, mixed: false, size: 0 }
  const min = Math.min(...levels)
  const max = Math.max(...levels)
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length
  return { level: Math.floor(avg), min, max, mixed: min !== max, size: levels.length }
}

export interface LevelChange {
  characterId: number
  from: number
  to: number
  /** XP campaigns: a level costs 1,000 XP; kept for the undo. */
  xpFrom?: number
  xpTo?: number
}

/**
 * One level up for each selected character; characters already at 20 are left
 * out. With `xpCost` (XP campaigns) each pays that much XP, never below 0.
 */
export function planLevelUp(characters: (Pick<PartyCharacter, 'id' | 'level'> & { xp?: number })[], selected: Iterable<number>, xpCost?: number): LevelChange[] {
  const ids = new Set(selected)
  return characters
    .filter(c => ids.has(c.id) && c.level < MAX_LEVEL)
    .map(c => {
      const change: LevelChange = { characterId: c.id, from: c.level, to: c.level + 1 }
      if (xpCost) {
        change.xpFrom = c.xp ?? 0
        change.xpTo = Math.max(0, change.xpFrom - xpCost)
      }
      return change
    })
}

/** Default selection for "Level up party": every party member. */
export function defaultLevelUpSelection(characters: Pick<PartyCharacter, 'id' | 'role' | 'treatAsPc'>[]): number[] {
  return partyMembers(characters).map(c => c.id)
}
