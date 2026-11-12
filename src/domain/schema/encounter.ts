/** Encounters and what stands in them. The old encounter row is split by how often each part is written. */
import { z } from 'zod'
import { zId, zImageRef, zIso, zOpaque, zPoint } from './common'

/** What a token stands for: the one link that replaces v0.42's three link fields and three PC flags. */
export const zActorRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rules'), rulesId: z.string(), adjustment: z.enum(['weak', 'elite']).nullable().default(null) }),
  z.object({ kind: z.literal('entry'), entryId: zId }),
  z.object({ kind: z.literal('character'), characterId: zId }),
  z.object({ kind: z.literal('none') }),
])
export type ActorRef = z.infer<typeof zActorRef>

/** A token in the library, shared by all campaigns. */
export const zActor = z.object({
  id: zId,
  name: z.string(),
  image: zImageRef.nullable().default(null),
  ref: zActorRef.default({ kind: 'none' }),
  /** A compendium stat block besides `ref` (an NPC or character that also uses one). */
  statBlock: z.object({ rulesId: z.string(), adjustment: z.enum(['weak', 'elite']).nullable().default(null) }).nullable().default(null),
  /** The image follows the linked entry's portrait or token art. */
  syncImage: z.boolean().default(false),
  /** Pinned first in the library (v0.42's "Player Character" tick on a token nobody is linked to). */
  pinned: z.boolean().default(false),
  createdAt: zIso,
})
export type Actor = z.infer<typeof zActor>

export const ENCOUNTER_STATUS = ['prepared', 'active', 'resolved'] as const

export const zEncounter = z.object({
  id: zId,
  campaignId: zId,
  name: z.string(),
  status: z.enum(ENCOUNTER_STATUS).default('prepared'),
  map: zImageRef.nullable().default(null),
  grid: z.object({ size: z.number(), offsetX: z.number(), offsetY: z.number() }).default({ size: 40, offsetX: 0, offsetY: 0 }),
  fovEnabled: z.boolean().default(false),
  playlistId: zId.nullable().default(null),
  initiativeFormula: z.string().nullable().default(null),
  /** Overrides the party's level for this encounter's difficulty. */
  partyLevel: z.number().nullable().default(null),
  turn: z.object({ index: z.number(), round: z.number() }).default({ index: 0, round: 1 }),
  /** Enemies removed during play whose XP still counts. */
  defeated: z.array(zOpaque).default([]),
  resolvedAt: zIso.nullable().default(null),
  xpTotal: z.number().nullable().default(null),
  xpAwarded: z.number().nullable().default(null),
  partyLevelAtResolve: z.number().nullable().default(null),
  /** A starship's interior or a starship battle: { shipId, role, markers, malfunctioning?, concierge? }. */
  starship: zOpaque.nullable().default(null),
  createdAt: zIso,
  updatedAt: zIso,
})
export type Encounter = z.infer<typeof zEncounter>

export const WALL_KINDS = ['full', 'greater', 'standard', 'lesser', 'window', 'door', 'secret'] as const

/** The parts of an encounter that change with every stroke and click; one row per encounter, same id. */
export const zEncounterMap = z.object({
  id: zId,
  fog: z.record(z.string(), z.string()).default({}),
  viewport: z.object({ x: z.number(), y: z.number(), scale: z.number() }).default({ x: 0, y: 0, scale: 1 }),
  walls: z.array(z.object({
    id: zId,
    points: z.array(zPoint),
    kind: z.enum(WALL_KINDS).default('full'),
    open: z.boolean().default(false),
    /** Made by the map maker from the tiles; replaced when the map is saved again. */
    generated: z.boolean().default(false),
  })).default([]),
  areas: z.array(zOpaque).default([]),
  /** The map maker's tiles and placed assets. */
  battlemap: zOpaque.nullable().default(null),
  sensorMap: zOpaque.nullable().default(null),
})
export type EncounterMap = z.infer<typeof zEncounterMap>

/** A token placed in an encounter. */
export const zCombatant = z.object({
  id: zId,
  encounterId: zId,
  /** The library token it was placed from, if any. */
  actorId: zId.nullable().default(null),
  ref: zActorRef.default({ kind: 'none' }),
  statBlock: z.object({ rulesId: z.string(), adjustment: z.enum(['weak', 'elite']).nullable().default(null) }).nullable().default(null),
  label: z.string().nullable().default(null),
  image: zImageRef.nullable().default(null),
  x: z.number(),
  y: z.number(),
  size: z.number().default(1),
  visible: z.boolean().default(true),
  dead: z.boolean().default(false),
  hp: z.object({ current: z.number().nullable(), max: z.number().nullable(), temp: z.number() }).default({ current: null, max: null, temp: 0 }),
  ac: z.number().nullable().default(null),
  initiative: z.number().nullable().default(null),
  notes: z.string().default(''),
  /** Tiles; null = unlimited. */
  visionRange: z.number().nullable().default(null),
  /** Shares vision with the players and shows exact HP in the player view. */
  playerToken: z.boolean().default(false),
  elevation: z.number().nullable().default(null),
  conditions: z.array(zOpaque).default([]),
  timers: z.array(zOpaque).default([]),
  actsWhileHidden: z.boolean().default(false),
  ally: z.boolean().default(false),
  /** null = party tokens use the dying rules, others are defeated at 0 HP. */
  usesDying: z.boolean().nullable().default(null),
  /** On the sensor map of a starship battle instead of the battle map. */
  sensor: z.object({
    zone: z.number(),
    heading: z.number().nullable().default(null),
    role: z.enum(['player-ship', 'ship', 'hazard']).nullable().default(null),
    shields: z.number().nullable().default(null),
    shieldsMax: z.number().nullable().default(null),
  }).nullable().default(null),
})
export type Combatant = z.infer<typeof zCombatant>

/** One line of an encounter's log; appended, never rewritten. */
export const zCombatLogEntry = z.object({
  id: zId,
  encounterId: zId,
  /** Order within the encounter. */
  seq: z.number(),
  round: z.number().default(0),
  at: zIso,
  combatantId: zId.nullable().default(null),
  combatantName: z.string().default(''),
  type: z.string(),
  /** value, absorbed, degree, targetName, attack, conditionName, note, auto … */
  detail: zOpaque.default({}),
})
export type CombatLogEntry = z.infer<typeof zCombatLogEntry>
