/**
 * Lore entries: one collection, ten types, each with typed `data`
 * (v0.42 kept a free-form `attributes` bag per entity).
 */
import { z } from 'zod'
import { zId, zImageRef, zIso, zOpaque, zPoint } from './common'

export const ENTRY_TYPES = ['session', 'note', 'npc', 'location', 'faction', 'quest', 'event', 'random-table', 'rumor', 'region'] as const
export const zEntryType = z.enum(ENTRY_TYPES)
export type EntryType = z.infer<typeof zEntryType>

/** Fields v0.42 stored that no type knows; kept so nothing typed by hand is lost. */
const extra = { extra: zOpaque.default({}) }

export const zNpcData = z.object({
  portrait: zImageRef.nullable().default(null),
  title: z.string().default(''),
  level: z.string().default(''),
  ancestry: z.string().default(''),
  class: z.string().default(''),
  class2: z.string().default(''),
  status: z.string().default(''),
  alive: z.boolean().default(true),
  ...extra,
})

export const zLocationData = z.object({
  map: zImageRef.nullable().default(null),
  banner: zImageRef.nullable().default(null),
  kind: z.enum(['city', 'dungeon', 'wilderness', 'building', 'region', 'other']).nullable().default(null),
  status: z.enum(['discovered', 'undiscovered', 'destroyed']).nullable().default(null),
  ...extra,
})

export const zFactionData = z.object({
  image: zImageRef.nullable().default(null),
  kind: z.enum(['criminal', 'religious', 'political', 'mercenary', 'arcane', 'other']).nullable().default(null),
  size: z.enum(['small', 'medium', 'large', 'massive']).nullable().default(null),
  secret: z.boolean().default(false),
  headquarters: z.string().default(''),
  ...extra,
})

export const zQuestData = z.object({
  status: z.enum(['active', 'completed', 'failed', 'dormant']).default('active'),
  giver: z.object({
    entryId: zId.nullable().default(null),
    kind: z.enum(['npc', 'faction']).nullable().default(null),
    name: z.string().default(''),
  }).default({ entryId: null, kind: null, name: '' }),
  reward: z.string().default(''),
  milestone: z.boolean().default(false),
  ...extra,
})

export const zEventData = z.object({
  date: z.string().default(''),
  location: z.string().default(''),
  significance: z.enum(['minor', 'major', 'critical']).nullable().default(null),
  ...extra,
})

export const zSessionData = z.object({
  mode: z.enum(['planning', 'running', 'finished']).default('planning'),
  number: z.string().default(''),
  date: z.string().default(''),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).default({ x: 40, y: 40, zoom: 0.9 }),
  ...extra,
})

export const zNoteData = z.object({ icon: z.string().default(''), ...extra })

export const zRandomTableData = z.object({
  die: z.enum(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']).default('d20'),
  rows: z.array(z.object({ min: z.number(), max: z.number(), result: z.string() })).default([]),
  ...extra,
})

export const zRumorData = z.object({
  statuses: z.array(z.enum(['unheard', 'heard', 'revealed', 'false'])).default([]),
  source: z.string().default(''),
  ...extra,
})

export const zRegionData = z.object({
  /** The location whose map carries the region; null = not placed on a map yet. */
  mapEntryId: zId.nullable().default(null),
  polygon: z.array(zPoint).default([]),
  color: z.string().default('#5fc98a'),
  ...extra,
})

const base = {
  id: zId,
  campaignId: zId,
  name: z.string(),
  /** Markdown. */
  body: z.string().default(''),
  tags: z.array(z.string()).default([]),
  favorite: z.boolean().default(false),
  createdAt: zIso,
  updatedAt: zIso,
}

export const zEntry = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('npc'), data: zNpcData }),
  z.object({ ...base, type: z.literal('location'), data: zLocationData }),
  z.object({ ...base, type: z.literal('faction'), data: zFactionData }),
  z.object({ ...base, type: z.literal('quest'), data: zQuestData }),
  z.object({ ...base, type: z.literal('event'), data: zEventData }),
  z.object({ ...base, type: z.literal('session'), data: zSessionData }),
  z.object({ ...base, type: z.literal('note'), data: zNoteData }),
  z.object({ ...base, type: z.literal('random-table'), data: zRandomTableData }),
  z.object({ ...base, type: z.literal('rumor'), data: zRumorData }),
  z.object({ ...base, type: z.literal('region'), data: zRegionData }),
])
export type Entry = z.infer<typeof zEntry>
export type EntryOf<T extends EntryType> = Extract<Entry, { type: T }>

export const ENTRY_DATA = {
  npc: zNpcData, location: zLocationData, faction: zFactionData, quest: zQuestData, event: zEventData,
  session: zSessionData, note: zNoteData, 'random-table': zRandomTableData, rumor: zRumorData, region: zRegionData,
} as const

/** A reference from an entry's text: `{{npc: Name}}`, `{{creature: Name}}` … */
export const zLink = z.object({
  id: zId,
  sourceId: zId,
  /** The word before the colon: an entry type, a compendium kind, `encounter`, `graph` … */
  targetType: z.string(),
  targetName: z.string(),
  /** The entry it resolved to; null for compendium targets and names that match nothing (yet). */
  targetEntryId: zId.nullable().default(null),
  meta: z.record(z.string(), z.string()).default({}),
})
export type Link = z.infer<typeof zLink>

/** A recorded historical state of an entry. */
export const zEntryVersion = z.object({
  id: zId,
  entryId: zId,
  label: z.string(),
  note: z.string().default(''),
  name: z.string(),
  body: z.string().default(''),
  data: zOpaque.default({}),
  eventId: zId.nullable().default(null),
  createdAt: zIso,
})
export type EntryVersion = z.infer<typeof zEntryVersion>

export const zMapPin = z.object({
  id: zId,
  campaignId: zId,
  /** The location whose map the pin is on. */
  mapEntryId: zId,
  entryId: zId,
  /** 0–1 fractions of the image. */
  x: z.number(),
  y: z.number(),
  hidden: z.boolean().default(false),
})
export type MapPin = z.infer<typeof zMapPin>

export const zGraph = z.object({
  id: zId,
  campaignId: zId,
  name: z.string(),
  nodes: z.array(z.object({
    entryId: zId, x: z.number(), y: z.number(),
    playerHidden: z.boolean().default(false),
    hiddenAttrs: z.array(z.string()).default([]),
  })).default([]),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).default({ x: 0, y: 0, zoom: 1 }),
})
export type Graph = z.infer<typeof zGraph>

export const zGraphEdge = z.object({
  id: zId,
  campaignId: zId,
  sourceEntryId: zId,
  targetEntryId: zId,
  label: z.string().default(''),
  direction: z.enum(['one-way', 'two-way', 'none']).default('none'),
  color: z.string().nullable().default(null),
  style: z.enum(['default', 'straight', 'step', 'smoothstep']).default('default'),
})
export type GraphEdge = z.infer<typeof zGraphEdge>

export const PANEL_KINDS = ['scene', 'beat', 'clue', 'encounter', 'log', 'note', 'entity', 'random-table', 'reward', 'frame'] as const

export const zSessionPanel = z.object({
  id: zId,
  campaignId: zId,
  /** null = in the campaign's drawer. */
  sessionId: zId.nullable(),
  kind: z.enum(PANEL_KINDS),
  title: z.string().default(''),
  body: z.string().default(''),
  status: z.string().nullable().default(null),
  /** Per kind: log {logType, at, playersShouldKnow}, encounter {encounterId}, entity {entryId, entryType}, random-table {entryId, lastResult}, reward {xp}, frame {color}. */
  attrs: zOpaque.default({}),
  tags: z.array(z.string()).default([]),
  x: z.number(),
  y: z.number(),
  w: z.number().nullable().default(null),
  h: z.number().nullable().default(null),
  /** The frame it sits in; x/y are then relative to it. */
  parentId: zId.nullable().default(null),
  originSessionId: zId.nullable().default(null),
  createdAt: zIso,
  updatedAt: zIso,
})
export type SessionPanel = z.infer<typeof zSessionPanel>

export const zSessionEdge = z.object({
  id: zId,
  sessionId: zId,
  sourceId: zId,
  targetId: zId,
  kind: z.enum(['plan', 'sequence', 'attach']).default('plan'),
  label: z.string().default(''),
})
export type SessionEdge = z.infer<typeof zSessionEdge>
