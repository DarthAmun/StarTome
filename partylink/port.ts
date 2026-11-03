/**
 * The PartyLink port (PLAYBUDDY_API.md, FEATURES_PLAN.md §6): how StarTome
 * talks to a player-side character app. Players own their characters, so the
 * GM side reads what they share and sends offers and requests; it never
 * writes a character.
 *
 * Everything here is in StarTome's vocabulary (cp, Bulk in tenths, our rune
 * shape, compendium ids). `PlayBuddyLink` maps Play Buddy's wire format
 * (wire/v1.ts) onto it through the pure converters in convert/.
 */
import type { AttachKind } from '~/rules/attachments'
import type { GiftTier } from '~/types/rules'

export type LinkId = 'none' | 'playbuddy'

export interface LinkCapabilities {
  status: boolean
  offers: boolean
  requests: boolean
  catalog: boolean
  live: boolean
}

export type LinkHealth =
  | { ok: true; appVersion: string; apiVersion: string; rulesVersion: string; gameOpen: boolean; apiEnabled: boolean }
  | { ok: false; reason: 'disabled' | 'unreachable' | 'unauthorized' | 'incompatible'; message?: string }

/** How much of a character a player shares; each level is the player's choice. */
export type ShareLevel = 'basic' | 'defenses' | 'skills' | 'inventory'

export interface LinkedPlayer {
  playerId: string
  name: string
  online: boolean
  characterId: string | null
  characterName: string | null
  level: number | null
  className: string | null
  shares: ShareLevel[]
  autoAccept: { items: boolean; coins: boolean; levelUp: boolean; heroPoints: boolean; requests: boolean }
}

export interface LinkedGame { gameId: string; name: string; players: LinkedPlayer[]; eventSeq: number }

/** An item a player holds, as Play Buddy reports it. `rulesId` is our compendium match, if any. */
export interface MirrorItem {
  entryId: string
  rulesId: string | null
  /** Play Buddy's catalog slug (also what matching falls back to). */
  slug: string
  foundryId: string | null
  custom: boolean
  name: string
  quantity: number
  level: number
  /** cp for `priceFor` units. */
  price: number
  priceFor: number
  /** Tenths: L = 1, 1 Bulk = 10. */
  bulk: number
  identified: boolean
  invested: boolean
  attachments: MirrorAttachment[]
  relic: { aspects: string[] } | null
  containerEntryId: string | null
}

/** A rune, talisman, upgrade, accessory or relic gift on a player's item. */
export interface MirrorAttachment {
  entryId: string
  rulesId: string | null
  kind: AttachKind
  name: string
  level: number
  /** cp; 0 when Play Buddy doesn't say. */
  price: number
  identified: boolean
}

/** One player's shared character, merged from the levels they share. */
export interface CharacterMirror {
  playerId: string
  characterId: string
  /** When Play Buddy last heard from the player. */
  at: string
  notShared: ShareLevel[]
  basic?: {
    name: string
    level: number
    ancestry: string
    className: string
    hp: { value: number; max: number; temp: number }
    conditions: { slug: string; name: string; value: number | null }[]
    /** null: the player's app doesn't report them. */
    heroPoints: number | null
  }
  defenses?: {
    ac: number
    fort: number
    ref: number
    will: number
    perception: number
    speed: number
  }
  skills?: {
    strMod: number
    skills: Record<string, number>
    classDc: number | null
    spellDc: number | null
  }
  inventory?: { coinsCp: number; items: MirrorItem[]; bulkTenths: number; investedCount: number }
}

/** What an item offer carries per stack, in our terms. */
export interface OfferStack {
  /** Our compendium item (id `fvtt:pf2e:<pack>:<_id>` or a homebrew id); null = free text. */
  rulesId: string | null
  name: string
  quantity: number
  identified: boolean
  playerName: string | null
  playerDescription: string | null
  /** What's attached to the item: runes, talismans, upgrades, relic gifts. */
  attachments: OfferAttachment[]
  relic: { aspects: string[] } | null
  /** For items Play Buddy's catalog doesn't know (homebrew, free text). */
  custom: {
    level: number
    priceCp: number
    priceFor: number
    bulkTenths: number
    rarity: string
    traits: string[]
    category: string
    weapon: boolean
    armor: boolean
    summary: string
  }
}

/** One attachment of an offered item. */
export interface OfferAttachment {
  rulesId: string | null
  kind: AttachKind
  name: string
  /** false: an unidentified rune, or a relic gift that hasn't awakened. */
  identified: boolean
  tier?: GiftTier
  custom: OfferStack['custom']
}

export type LinkOffer =
  | { kind: 'items'; stacks: OfferStack[] }
  | { kind: 'coins'; cp: number }
  | { kind: 'levelUp'; toLevel: number }
  | { kind: 'heroPoint'; amount: number; reason?: string }
  | { kind: 'identify'; playerId: string; entryId: string }

export type DeliveryState = 'queued' | 'delivered' | 'accepted' | 'declined' | 'withdrawn' | 'expired' | 'failed'

export interface DeliveryResult { playerId: string; state: DeliveryState; reason?: string }

export interface SentOffer { offerId: string; deliveries: DeliveryResult[] }

export type LinkRequest =
  | { kind: 'roll'; check: string; dc?: number; secret?: boolean; initiative?: boolean; label?: string }
  | { kind: 'damage'; damage: { amount: number; type: string; persistent?: boolean }[]; conditions: { slug: string; value?: number }[]; label?: string }

export interface SentRequest { requestId: string; deliveries: DeliveryResult[] }

export type Degree = 'criticalSuccess' | 'success' | 'failure' | 'criticalFailure'

export interface RollEntry {
  rollId: string
  playerId: string
  requestId: string | null
  at: string
  kind: string
  label: string
  formula: string
  total: number
  dc: number | null
  degree: Degree | null
  secret: boolean
}

export type LinkEvent = { seq: number; at: string } & (
  | { type: 'roll'; roll: RollEntry }
  | { type: 'status'; playerId: string; levels: ShareLevel[] }
  | { type: 'shares'; playerId: string; shares: ShareLevel[] }
  | { type: 'offer'; offerId: string; playerId: string; state: DeliveryState; reason?: string }
  | { type: 'request'; requestId: string; playerId: string; state: DeliveryState; reason?: string }
  | { type: 'itemReturned'; playerId: string; item: MirrorItem; note?: string }
  | { type: 'presence'; playerId: string; change: 'joined' | 'left' | 'online' | 'offline' }
  | { type: 'character'; playerId: string; characterId: string }
  | { type: 'gameClosed' }
)

export interface EventBatch { events: LinkEvent[]; lastSeq: number; resetRequired: boolean }

export interface CatalogHit { slug: string; foundryId: string | null; name: string; level: number; priceCp: number }

/** A failure the UI can explain: a code from the API, or the link being off. */
export class LinkError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'LinkError'
  }
}

export class LinkUnavailableError extends LinkError {
  constructor(public readonly link: LinkId, action: string) {
    super('unavailable', `${action} needs a linked character app (${link === 'none' ? 'none is linked' : link})`)
    this.name = 'LinkUnavailableError'
  }
}

export interface PartyLink {
  readonly id: LinkId
  readonly capabilities: LinkCapabilities
  probe(): Promise<LinkHealth>
  game(): Promise<LinkedGame>
  status(playerIds: string[] | 'all', levels: ShareLevel[]): Promise<CharacterMirror[]>
  /** `key` is the idempotency key: sending the same key twice creates one offer. */
  sendOffer(key: string, to: string[], offer: LinkOffer, note?: string): Promise<SentOffer>
  getOffer(offerId: string): Promise<SentOffer>
  withdrawOffer(offerId: string): Promise<SentOffer>
  sendRequest(key: string, to: string[], request: LinkRequest): Promise<SentRequest>
  withdrawRequest(requestId: string): Promise<void>
  searchCatalog(q: string): Promise<CatalogHit[]>
  /** Long poll: waits up to `waitS` seconds for events after `after`. */
  events(after: number, waitS: number, signal?: AbortSignal): Promise<EventBatch>
}
