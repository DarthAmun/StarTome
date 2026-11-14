/**
 * The character link (Play Buddy, PLAYBUDDY_API.md): what a linked player
 * shares of their character, as StarTome keeps it, and the outbox of what the
 * GM sent them. Players own their characters: the mirror is read-only here.
 */
import { z } from 'zod'
import { zId, zIso, zOpaque } from './common'

export const SHARE_LEVELS = ['basic', 'defenses', 'skills', 'inventory'] as const
export type ShareLevel = (typeof SHARE_LEVELS)[number]

/** A linked character's shared numbers, in our vocabulary. A block is there while the player shares it. */
export const zMirror = z.object({
  characterId: z.string().default(''),
  /** When the player's app last reported. */
  at: zIso.default(''),
  basic: z.object({
    name: z.string().default(''),
    level: z.number().default(1),
    ancestry: z.string().default(''),
    className: z.string().default(''),
    hp: z.object({ value: z.number().default(0), max: z.number().default(0), temp: z.number().default(0) }),
    conditions: z.array(z.object({ slug: z.string(), name: z.string(), value: z.number().nullable().default(null) })).default([]),
    heroPoints: z.number().nullable().default(null),
  }).optional(),
  defenses: z.object({
    ac: z.number(), fort: z.number(), ref: z.number(), will: z.number(), perception: z.number(), speed: z.number().default(0),
  }).optional(),
  skills: z.object({
    strMod: z.number().default(0),
    /** Lower-case slug → modifier ("athletics", "piloting", "warfare-lore"). */
    skills: z.record(z.string(), z.number()).default({}),
    classDc: z.number().nullable().default(null),
    spellDc: z.number().nullable().default(null),
    rangedAttack: z.number().nullable().default(null),
    meleeAttack: z.number().nullable().default(null),
  }).optional(),
  /** The items themselves are rows of the inventory, marked as mirrored. */
  inventory: z.object({ coinsCp: z.number().default(0), bulkTenths: z.number().default(0), investedCount: z.number().default(0) }).optional(),
})
export type Mirror = z.infer<typeof zMirror>
export type MirrorBlocks = Pick<Mirror, ShareLevel>

/** A rune, talisman, upgrade, installed weapon, accessory or relic gift on a player's item. */
export interface MirrorAttachment {
  entryId: string
  rulesId: string | null
  kind: 'rune' | 'talisman' | 'upgrade' | 'installed' | 'accessory' | 'gift'
  name: string
  level: number
  /** cp. */
  price: number
  identified: boolean
}

/** An item a player holds, as their app reports it. `rulesId` is our compendium entry, if one matches. */
export interface MirrorItem {
  entryId: string
  rulesId: string | null
  name: string
  quantity: number
  level: number
  /** cp for `priceFor` units. */
  price: number
  priceFor: number
  bulkTenths: number
  identified: boolean
  attachments: MirrorAttachment[]
  relic: { aspects: string[] } | null
  containerEntryId: string | null
  grade: string | null
  implanted: boolean
}

export const MESSAGE_STATES = ['queued', 'delivered', 'accepted', 'declined', 'withdrawn', 'expired', 'failed'] as const
export type MessageState = (typeof MESSAGE_STATES)[number]
export const FINAL_STATES: readonly MessageState[] = ['accepted', 'declined', 'withdrawn', 'expired', 'failed']
export const OUTBOX_KINDS = ['items', 'coins', 'levelUp', 'heroPoints', 'identify', 'roll', 'damage'] as const

/** Something sent to a linked player, from before it leaves (`outbox`) to its answer. */
export const zLinkOutboxItem = z.object({
  id: zId,
  campaignId: zId,
  /** Idempotency key: sending it twice makes one message. */
  key: z.string(),
  kind: z.enum(OUTBOX_KINDS),
  characterId: zId,
  playerId: z.string(),
  /** The character app's id for it, once it has arrived there. */
  remoteId: z.string().nullable().default(null),
  state: z.enum(['outbox', ...MESSAGE_STATES]).default('outbox'),
  reason: z.string().nullable().default(null),
  /** One line for the list: "2× Ruby → Groknar". */
  summary: z.string().default(''),
  /** The message as it goes over the wire. */
  body: zOpaque,
  /** Item gifts: the stash stacks they came from, taken out when accepted. */
  stacks: z.array(z.object({ inventoryId: zId, quantity: z.number() })).default([]),
  /** Initiative rolls: the encounter whose turn order the result fills. */
  encounterId: zId.nullable().default(null),
  /** Coins: the purse they left, which gets them back on a decline. */
  fromOwner: z.string().nullable().default(null),
  /** Level-ups: the ledger entry that waits for the answer. */
  ledgerId: zId.nullable().default(null),
  /** Rolls: the result. */
  roll: z.object({ label: z.string(), formula: z.string().default(''), total: z.number(), dc: z.number().nullable().default(null), degree: z.string().nullable().default(null), secret: z.boolean().default(false) }).nullable().default(null),
  createdAt: zIso,
  updatedAt: zIso,
})
export type LinkOutboxItem = z.infer<typeof zLinkOutboxItem>
