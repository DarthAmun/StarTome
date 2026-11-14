/** The party: characters, the advancement ledger, inventory and purses, starships. */
import { z } from 'zod'
import { zId, zImageRef, zIso, zOpaque } from './common'
import { zMirror } from './link'

export const zCharacter = z.object({
  id: zId,
  campaignId: zId,
  name: z.string(),
  role: z.enum(['pc', 'companion']).default('pc'),
  level: z.number().default(1),
  xp: z.number().default(0),
  /** Companions only: counts for party size and level. */
  treatAsPc: z.boolean().default(false),
  strMod: z.number().nullable().default(null),
  /** The NPC entry that is this character's lore page. */
  entryId: zId.nullable().default(null),
  /** The library token placed for them. */
  actorId: zId.nullable().default(null),
  /** The player-side character app this character is linked to; their app owns the sheet. */
  link: z.object({
    provider: z.literal('playbuddy'),
    playerId: z.string(),
    characterId: z.string().nullable().default(null),
    /** What the player last shared. */
    mirror: zMirror.nullable().default(null),
  }).nullable().default(null),
  companion: zOpaque.nullable().default(null),
  companionRulesId: z.string().nullable().default(null),
  /** Skill modifiers entered by hand (lower-case skill → modifier). */
  skills: z.record(z.string(), z.number()).nullable().default(null),
  createdAt: zIso,
  updatedAt: zIso,
})
export type Character = z.infer<typeof zCharacter>

const ledgerBase = { id: zId, campaignId: zId, at: zIso, undoneAt: zIso.nullable().default(null) }

/** Everything that advanced the party, in one list; each entry carries what its undo needs. */
export const zLedgerEntry = z.discriminatedUnion('kind', [
  z.object({
    ...ledgerBase, kind: z.literal('levelUp'),
    trigger: z.enum(['manual', 'quest', 'encounter']).default('manual'),
    /** The quest entry or encounter that caused it. */
    refId: zId.nullable().default(null),
    changes: z.array(z.object({ characterId: zId, from: z.number(), to: z.number(), xpFrom: z.number().optional(), xpTo: z.number().optional(),
      /** A linked character levels up in the player's app: the level moves once this is accepted. */
      offer: z.object({ outboxId: zId.nullable().default(null), state: z.enum(['pending', 'accepted', 'declined', 'withdrawn', 'expired', 'failed']) }).optional(),
    })).default([]),
  }),
  z.object({
    ...ledgerBase, kind: z.literal('xpAward'),
    source: z.enum(['encounter', 'accomplishment']),
    refType: z.enum(['encounter', 'quest']).nullable().default(null),
    refId: zId.nullable().default(null),
    /** Per character. */
    amount: z.number(),
    characterIds: z.array(zId).default([]),
    reason: z.string().default(''),
  }),
  z.object({
    ...ledgerBase, kind: z.literal('treasureAward'),
    /** cp, GM value when awarded. */
    value: z.number(),
    consumables: z.number().default(0),
    label: z.string().default(''),
  }),
  z.object({
    ...ledgerBase, kind: z.literal('encounterResolved'),
    encounterId: zId,
    participants: z.array(zId).default([]),
    /** The xpAward entry made with it; null in milestone campaigns. */
    xpAwardId: zId.nullable().default(null),
    accomplishment: z.number().default(0),
    /** The loot as it left the encounter, for re-opening. */
    loot: zOpaque.default({}),
    treasure: zOpaque.nullable().default(null),
  }),
])
export type LedgerEntry = z.infer<typeof zLedgerEntry>

export const zOwner = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stash') }),
  z.object({ kind: z.literal('character'), id: zId }),
  z.object({ kind: z.literal('encounter'), id: zId }),
])
export type Owner = z.infer<typeof zOwner>

/** The owner as one string, for the index: 'stash', 'character:<id>', 'encounter:<id>'. */
export function ownerKey(o: Owner): string {
  return o.kind === 'stash' ? 'stash' : `${o.kind}:${o.id}`
}

export const zInventoryEntry = z.object({
  id: zId,
  campaignId: zId,
  owner: zOwner,
  ownerKey: z.string(),
  /** Compendium item; null = free text. */
  itemId: z.string().nullable().default(null),
  quantity: z.number().default(1),
  nameOverride: z.string().nullable().default(null),
  /** cp per item. */
  priceOverride: z.number().nullable().default(null),
  /** Tenths of Bulk. */
  bulkOverride: z.number().nullable().default(null),
  notes: z.string().default(''),
  identified: z.boolean().default(true),
  playerName: z.string().nullable().default(null),
  playerDescription: z.string().nullable().default(null),
  runes: zOpaque.nullable().default(null),
  grade: z.string().nullable().default(null),
  containerId: zId.nullable().default(null),
  attachedTo: zId.nullable().default(null),
  attachKind: z.string().nullable().default(null),
  relic: z.object({ aspects: z.array(z.string()) }).nullable().default(null),
  implanted: z.boolean().default(false),
  upgradeSlots: z.number().nullable().default(null),
  /** Mirror of an entry in the linked character app (read-only here), or a stack offered to a player. */
  link: z.object({ remoteEntryId: z.string().nullable().default(null), offerId: zId.nullable().default(null) }).nullable().default(null),
  createdAt: zIso,
  updatedAt: zIso,
})
export type InventoryEntry = z.infer<typeof zInventoryEntry>

export const zPurse = z.object({
  id: zId,
  campaignId: zId,
  owner: zOwner,
  ownerKey: z.string(),
  /** Coins in cp for both games (1 credit = 10 cp). */
  cp: z.number().default(0),
  updatedAt: zIso,
})
export type Purse = z.infer<typeof zPurse>

const zCrew = z.object({ characterId: zId, slot: z.number().nullable(), activity: z.string().nullable().optional() })

export const zStarship = z.object({
  id: zId,
  campaignId: zId,
  name: z.string(),
  active: z.boolean().default(false),
  frameId: z.string().nullable().default(null),
  /** null = follows the party level. */
  levelPinned: z.number().nullable().default(null),
  stations: z.array(zOpaque).default([]),
  bays: z.array(zOpaque).default([]),
  hpCurrent: z.number().nullable().default(null),
  spCurrent: z.number().nullable().default(null),
  conditions: z.array(z.object({ name: z.string(), value: z.number().nullable() })).default([]),
  crew: z.array(zCrew).default([]),
  presets: z.array(z.object({ name: z.string(), crew: z.array(zCrew) })).default([]),
  interiorEncounterId: zId.nullable().default(null),
  notes: z.string().default(''),
  image: zImageRef.nullable().default(null),
  createdAt: zIso,
  updatedAt: zIso,
})
export type Starship = z.infer<typeof zStarship>
