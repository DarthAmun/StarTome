/**
 * Play Buddy GM API v1 wire format, exactly as PLAYBUDDY_API.md specifies it.
 * Only `partylink/` reads these types; the rest of StarTome sees the port's
 * own vocabulary (partylink/port.ts) through the converters in convert/.
 */

export type Iso = string
export type Cp = number
export interface Coins { pp: number; gp: number; sp: number; cp: number }

export interface ItemRef { slug: string; foundryId?: string; pack?: string }

export type ErrorCode =
  | 'unauthorized' | 'pairCodeInvalid' | 'rateLimited'
  | 'noGame' | 'apiDisabled'
  | 'playerNotFound' | 'offerNotFound' | 'notShared'
  | 'invalidPayload' | 'unknownItem' | 'conflict' | 'internal'

export interface ApiError { error: { code: ErrorCode; message: string; details?: unknown } }

export type ShareLevel = 'basic' | 'defenses' | 'skills' | 'inventory'
export const SHARE_LEVELS: ShareLevel[] = ['basic', 'defenses', 'skills', 'inventory']

// ── Health, pairing, game ──────────────────────────────────────────────────

export interface Health {
  app: string
  appVersion: string
  apiVersion: string
  rulesVersion: string
  game: { open: boolean; apiEnabled: boolean }
}

export interface PairRequest { code: string; client: string; clientVersion: string }
export interface PairResponse { token: string; clientId: string }

export interface GamePlayer {
  playerId: string
  displayName: string
  online: boolean
  lastSeenAt?: Iso
  character: { characterId: string; name: string; level: number; ancestry?: string; class?: string; class2?: string } | null
  shares: ShareLevel[]
  autoAccept?: { items?: boolean; coins?: boolean; levelUp?: boolean; heroPoints?: boolean; requests?: boolean }
}

export interface Game {
  gameId: string
  name: string
  startedAt?: Iso
  players: GamePlayer[]
  eventSeq: number
}

// ── Status ─────────────────────────────────────────────────────────────────

export type Size = 'tiny' | 'sm' | 'med' | 'lg' | 'huge' | 'grg'

export interface StatusBasic {
  name: string
  level: number
  ancestry: string
  heritage?: string
  background?: string
  class: string
  class2?: string
  hp: { current: number; max: number; temp: number }
  conditions: { id: string; name: string; value?: number }[]
  heroPoints?: number
  size?: Size
}

export interface StatusDefenses {
  ac: number
  saves: { fortitude: number; reflex: number; will: number }
  perception: number
  speeds: { land: number; [kind: string]: number }
  resistances?: { type: string; value: number }[]
  weaknesses?: { type: string; value: number }[]
  immunities?: string[]
}

export interface StatusSkills {
  attributes: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
  skills: Record<string, number>
  classDc?: number
  spellcasting?: { source: string; tradition: string; dc: number; attack: number }[]
}

export interface WireRune { runeId: string; choice?: string }

export interface InventoryItem {
  entryId: string
  ref: ItemRef
  custom: boolean
  name: string
  quantity: number
  level: number
  rarity: 'common' | 'uncommon' | 'rare' | 'unique'
  type: string
  price: Cp
  priceFor: number
  bulk: number
  location: 'held' | 'worn' | 'stowed'
  container?: string
  invested?: boolean
  runes?: WireRune[]
  identified: boolean
}

export interface StatusInventory {
  coins: Coins
  bulk: { carried: number; encumberedAt: number; limit: number }
  invested: { count: number; limit: number }
  items: InventoryItem[]
}

export interface StatusResponse {
  playerId: string
  characterId: string
  at: Iso
  notShared: ShareLevel[]
  basic?: StatusBasic
  defenses?: StatusDefenses
  skills?: StatusSkills
  inventory?: StatusInventory
}

// ── Offers and requests ────────────────────────────────────────────────────

/** Play Buddy's custom-item shape (its `ItemEntry`), the parts StarTome fills. */
export interface CustomItemDefinition {
  id: string
  name: string
  type: string
  level: number
  price: Cp
  priceFor: number
  bulk: number
  rarity: string
  traits: string[]
  usage?: string | null
  source: string
  summary: string
  category?: string | null
}

export interface OfferItem {
  ref?: ItemRef
  definition?: CustomItemDefinition
  quantity: number
  runes?: WireRune[]
  identified?: boolean
  unidentifiedName?: string
  unidentifiedDescription?: string
}

export type OfferPayload =
  | { kind: 'item'; items: OfferItem[] }
  | { kind: 'coins'; coins: Coins }
  | { kind: 'levelUp'; toLevel: number }
  | { kind: 'heroPoint'; amount: number; reason?: string }
  | { kind: 'identify'; entryId: string; playerId: string }

export interface OfferRequest { to: string[]; note?: string; expiresAt?: Iso; payload: OfferPayload }

export type OfferState = 'queued' | 'delivered' | 'accepted' | 'declined' | 'withdrawn' | 'expired' | 'failed'
export const OPEN_STATES: OfferState[] = ['queued', 'delivered']

export interface Delivery { playerId: string; state: OfferState; at: Iso; reason?: string }

export interface Offer {
  offerId: string
  idempotencyKey: string
  createdAt: Iso
  to: string[]
  payload: OfferPayload
  note?: string
  deliveries: Delivery[]
}

export interface RollRequest {
  to: string[]
  kind: 'roll'
  check: string
  dc?: number
  secret?: boolean
  purpose?: 'initiative' | 'check'
  label?: string
}

export interface DamageRequest {
  to: string[]
  kind: 'damage'
  damage?: { amount: number; type: string; persistent?: boolean }[]
  conditions?: { id: string; value?: number }[]
  label?: string
}

export type GmRequest = RollRequest | DamageRequest
export interface RequestCreated { requestId: string; deliveries: Delivery[] }

export interface CatalogItem { ref: ItemRef; name: string; level: number; price: Cp; priceFor: number; rarity: string; type: string }

// ── Rolls and events ───────────────────────────────────────────────────────

export type Degree = 'criticalSuccess' | 'success' | 'failure' | 'criticalFailure'

export interface Roll {
  rollId: string
  playerId: string
  characterId: string
  at: Iso
  requestId?: string
  kind: 'check' | 'save' | 'perception' | 'initiative' | 'skill' | 'attack' | 'damage' | 'flat' | 'spell' | 'custom'
  label: string
  formula: string
  dice: { die: number; result: number }[]
  modifier: number
  total: number
  dc?: number
  degree?: Degree
  damageTypes?: { type: string; amount: number }[]
  secret: boolean
}

export type GameEvent = { seq: number; at: Iso } & (
  | { type: 'roll'; roll: Roll }
  | { type: 'statusChanged'; playerId: string; levels: ShareLevel[] }
  | { type: 'sharesChanged'; playerId: string; shares: ShareLevel[] }
  | { type: 'offerChanged'; offerId: string; playerId: string; state: OfferState; reason?: string }
  | { type: 'requestChanged'; requestId: string; playerId: string; state: OfferState; reason?: string }
  | { type: 'itemReturned'; playerId: string; item: InventoryItem; note?: string }
  | { type: 'playerJoined' | 'playerLeft' | 'playerOnline' | 'playerOffline'; playerId: string }
  | { type: 'characterChanged'; playerId: string; characterId: string }
  | { type: 'gameClosed' }
)

export interface EventsResponse { events: GameEvent[]; lastSeq: number; resetRequired?: boolean }

// ── Share file (manual fallback) ───────────────────────────────────────────

export interface ShareFile {
  format: 'playbuddy-share'
  formatVersion: 1
  exportedAt: Iso
  rulesVersion?: string
  status: StatusResponse
}
