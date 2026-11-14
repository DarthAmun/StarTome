/**
 * Play Buddy GM API v1, draft 2, exactly as PLAYBUDDY_API.md writes it. Only
 * services/characterLink reads these types; the rest of the app sees the
 * mirror and the outbox of domain/schema/link.ts.
 */
import type { MessageState, ShareLevel } from '@/domain/schema'

export type Iso = string
export type System = 'pf2e' | 'sf2e'
export type { MessageState, ShareLevel }

export interface ItemRef { slug: string; foundryId?: string; pack?: string; system?: System }
export interface ItemFacts { name: string; type: string; level: number; price: number; priceFor: number; bulk: number; rarity: string; traits: string[]; summary?: string }

export interface ApiError { error: { code: string; message: string } }
export interface Health { app: string; appVersion: string; apiVersion: string; rulesVersion?: string; game: { open: boolean; apiEnabled: boolean } }
export interface PairResponse { token: string; clientId: string }

export type AttachKind = 'rune' | 'talisman' | 'upgrade' | 'installed' | 'accessory' | 'gift'
export type GiftTier = 'minor' | 'major' | 'grand'
export interface HeldAttachment { entryId: string; kind: AttachKind; ref?: ItemRef; facts: ItemFacts; identified: boolean; tier?: GiftTier }
export interface HeldItem {
  entryId: string; ref?: ItemRef; facts: ItemFacts; quantity: number; identified: boolean; invested?: boolean; container?: string
  attachments?: HeldAttachment[]; relic?: { aspects: string[] }; grade?: string; implanted?: boolean
}

export interface SheetBasic {
  name: string; level: number; ancestry: string; heritage?: string; class: string; class2?: string
  hp: { current: number; max: number; temp: number }
  conditions: { id: string; name: string; value?: number }[]
  heroPoints: number
}
export interface SheetDefenses { ac: number; saves: { fortitude: number; reflex: number; will: number }; perception: number; speeds: { land: number; [kind: string]: number } }
export interface SheetSkills {
  attributes: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
  skills: Record<string, number>; classDc?: number; spellDc?: number; attacks?: { melee?: number; ranged?: number }
}
export interface SheetInventory { coins: number; bulk: number; invested: number; items: HeldItem[] }
export interface SheetBlocks { basic?: SheetBasic; defenses?: SheetDefenses; skills?: SheetSkills; inventory?: SheetInventory }
export interface Sheet extends SheetBlocks { characterId: string; at: Iso }

export interface PlayerInfo {
  playerId: string; displayName: string; online: boolean; shares: ShareLevel[]
  autoAccept?: { items?: boolean; coins?: boolean; levelUp?: boolean; heroPoints?: boolean; rolls?: boolean; damage?: boolean }
}
export interface Player extends PlayerInfo { sheet: Sheet | null }
export interface Game { gameId: string; name: string; system?: System; eventSeq: number; players: Player[] }

export interface GivenItem {
  ref?: ItemRef; facts: ItemFacts; quantity: number; identified?: boolean; unidentifiedName?: string; unidentifiedDescription?: string
  attachments?: { kind: AttachKind; ref?: ItemRef; facts: ItemFacts; identified?: boolean; tier?: GiftTier }[]
  relic?: { aspects: string[] }; grade?: string
}

export type MessageBody =
  | { kind: 'items'; items: GivenItem[] }
  | { kind: 'coins'; cp: number }
  | { kind: 'levelUp'; toLevel: number }
  | { kind: 'heroPoints'; amount: number; reason?: string }
  | { kind: 'identify'; entryId: string }
  | { kind: 'roll'; check: string; dc?: number; secret?: boolean; initiative?: boolean; label?: string }
  | { kind: 'damage'; damage?: { amount: number; type: string; persistent?: boolean }[]; conditions?: { id: string; value?: number }[]; label?: string }

export interface MessageRequest { to: string; note?: string; body: MessageBody }

export type Degree = 'criticalSuccess' | 'success' | 'failure' | 'criticalFailure'
export interface Roll { rollId: string; playerId: string; at: Iso; messageId?: string; kind: string; label: string; formula: string; total: number; dc?: number; degree?: Degree; secret: boolean }

export interface Message { messageId: string; to: string; createdAt: Iso; note?: string; body: MessageBody; state: MessageState; at: Iso; reason?: string; roll?: Roll }

export type GameEvent = { seq: number; at: Iso } & (
  | { type: 'sheet'; playerId: string; characterId: string; sheetAt: Iso; blocks: SheetBlocks; unshared?: ShareLevel[] }
  | { type: 'player'; player: PlayerInfo }
  | { type: 'playerLeft'; playerId: string }
  | { type: 'message'; message: Message }
  | { type: 'roll'; roll: Roll }
  | { type: 'itemReturned'; playerId: string; item: HeldItem; note?: string }
  | { type: 'gameClosed' }
)
export interface EventsResponse { events: GameEvent[]; lastSeq: number; resetRequired?: boolean }

export interface ShareFile { format: 'playbuddy-share'; formatVersion: 2; exportedAt: Iso; system?: System; displayName?: string; sheet: Sheet }
