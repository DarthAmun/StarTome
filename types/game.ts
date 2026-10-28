/** The two games StarTome supports. Every campaign belongs to exactly one. */
export type GameId = 'pf2e' | 'sf2e'

export const GAME_IDS: GameId[] = ['pf2e', 'sf2e']

export const GAME_CONFIG: Record<GameId, { label: string; short: string; color: string; icon: string }> = {
  pf2e: { label: 'Pathfinder 2e', short: 'PF2e', color: '#c9973a', icon: 'gi-crossed-swords' },
  sf2e: { label: 'Starfinder 2e', short: 'SF2e', color: '#4ab8e8', icon: 'gi-ringed-planet' },
}

export type AdvancementMode = 'xp' | 'milestone'

/** Per-campaign rules options. Grows with later phases (currency display, variant rules). */
export interface CampaignRules {
  advancement: AdvancementMode
}

export const DEFAULT_CAMPAIGN_RULES: CampaignRules = { advancement: 'xp' }

/** Campaigns imported from DM's Tome carry no game; they were PF2e campaigns. */
export const DEFAULT_GAME: GameId = 'pf2e'

export function isGameId(v: unknown): v is GameId {
  return v === 'pf2e' || v === 'sf2e'
}

export function campaignGame(c: { game?: unknown } | null | undefined): GameId {
  return isGameId(c?.game) ? c.game : DEFAULT_GAME
}

export function campaignRules(c: { rules?: Partial<CampaignRules> | null } | null | undefined): CampaignRules {
  return { ...DEFAULT_CAMPAIGN_RULES, ...(c?.rules ?? {}) }
}
