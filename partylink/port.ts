/**
 * The PartyLink port (FORK_PLAN.md §9.2, FEATURES_PLAN.md §6): how StarTome
 * talks to a player-side character app. Players own their characters, so the
 * GM side only reads shared status and sends offers.
 *
 * STUB: the Play Buddy GM API is still a draft and hasn't been checked
 * against its repo. These shapes are placeholders in our own vocabulary;
 * a `PlayBuddyLink` will map its wire format onto them in `wire/` + `convert/`
 * once the API exists. Until then only `NoneLink` is used.
 */
import type { Runes } from '~/types/rules'

export type LinkId = 'none' | 'playbuddy'

export interface LinkCapabilities {
  status: boolean
  offers: boolean
  catalog: boolean
  rolls: boolean
  live: boolean
}

export type LinkHealth =
  | { ok: true; version: string | null }
  | { ok: false; reason: 'disabled' | 'unreachable' | 'unauthorized' | 'incompatible'; message?: string }

export interface LinkedPlayer {
  playerId: string
  name: string
  characterName: string | null
  level: number | null
}

/** How much of a character a player shares; the app may refuse any level. */
export type StatusLevel = 'basic' | 'stats' | 'inventory' | 'spells'

export interface StatusResult {
  playerId: string
  /** Levels the player didn't share. */
  notShared: StatusLevel[]
  level?: number
  xp?: number
  hp?: { value: number; max: number }
  strMod?: number
  inventory?: { name: string; quantity: number; foundryId?: string | null }[]
  coinsCp?: number
  at: string
}

/** What the GM offers: a compendium item, a custom one, or coins. */
export type OfferPayload =
  | { kind: 'item'; foundryId: string | null; name: string; quantity: number; identified: boolean; playerName?: string | null; runes?: Runes | null; grade?: string | null }
  | { kind: 'coins'; cp: number }

export type OfferState = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'

export interface CatalogHit { catalogId: string; name: string; level: number | null; foundryId: string | null }

export interface RollEntry { playerId: string; label: string; total: number; at: string; hidden: boolean }

export class LinkUnavailableError extends Error {
  constructor(public readonly link: LinkId, action: string) {
    super(`${action} needs a linked character app (${link === 'none' ? 'none is linked' : link})`)
    this.name = 'LinkUnavailableError'
  }
}

export interface PartyLink {
  readonly id: LinkId
  readonly capabilities: LinkCapabilities
  probe(): Promise<LinkHealth>
  listPlayers(): Promise<LinkedPlayer[]>
  getStatus(playerId: string, levels: StatusLevel[]): Promise<StatusResult>
  sendOffer(to: string[] | 'all', payload: OfferPayload, note?: string): Promise<{ offerId: string }>
  getOffer(offerId: string): Promise<{ state: OfferState; reason?: string }>
  withdrawOffer(offerId: string): Promise<void>
  searchCatalog(q: string): Promise<CatalogHit[]>
  rollsSince(since: string): Promise<RollEntry[]>
}
