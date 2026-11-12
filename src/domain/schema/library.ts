/** Things that belong to no campaign: compendium rows, images, map assets, sounds, settings. */
import { z } from 'zod'
import { zId, zIso, zOpaque } from './common'

/**
 * A compendium row. Its full shape is `RulesEntity` (domain/rules/types.ts); the
 * homebrew importer checks every field per kind. Here only what every row has.
 */
export const zRulesRow = z.looseObject({
  id: z.string().min(1),
  origin: z.enum(['foundry', 'user', 'legacy']),
  kind: z.string(),
  game: z.enum(['pf2e', 'sf2e', 'both']),
  name: z.string(),
  sortName: z.string(),
  level: z.number(),
})
export type RulesRow = z.infer<typeof zRulesRow>

/** User-owned fields of a synced entry, waiting for that entry to be synced here. */
export const zRulesOverlay = z.looseObject({ id: z.string().min(1) })
export type RulesOverlay = z.infer<typeof zRulesOverlay>

export const zSyncState = z.looseObject({ game: z.enum(['pf2e', 'sf2e']) })

/** An image as a backup lists it; the blob itself lives beside the row in the database. */
export const zImageMeta = z.object({ id: zId, mime: z.string(), createdAt: zIso })
export type ImageMeta = z.infer<typeof zImageMeta>
export interface ImageRow extends ImageMeta { blob: Blob; thumb?: Blob; keepOriginal?: boolean }

export const zMapAsset = z.object({
  id: zId,
  name: z.string(),
  imageId: zId,
  pxWidth: z.number(),
  pxHeight: z.number(),
  folder: z.string().nullable().default(null),
  createdAt: zIso,
})
export type MapAsset = z.infer<typeof zMapAsset>

export const zSoundTrack = z.object({
  id: zId,
  name: z.string(),
  type: z.enum(['file', 'url', 'spotify']),
  src: z.string().default(''),
  /** A local file's name; the handle to it stays on this device and is not part of a backup. */
  fileName: z.string().nullable().default(null),
  duration: z.number().nullable().default(null),
  tags: z.array(z.string()).default([]),
  createdAt: zIso,
  updatedAt: zIso,
})
export type SoundTrack = z.infer<typeof zSoundTrack>

export const zSoundPlaylist = z.object({
  id: zId,
  name: z.string(),
  description: z.string().default(''),
  color: z.string().nullable().default(null),
  trackIds: z.array(zId).default([]),
  loop: z.boolean().default(false),
  shuffle: z.boolean().default(false),
  createdAt: zIso,
  updatedAt: zIso,
})
export type SoundPlaylist = z.infer<typeof zSoundPlaylist>

/**
 * What you arranged, per campaign (or app-wide with campaignId ''): Desk layout and
 * saved layouts, scratchpad, tray pins, the encounter builder's draft, view preferences.
 * In v0.42 this was localStorage and no backup had it.
 */
export const zWorkspaceItem = z.object({
  /** `${campaignId}|${key}` */
  id: z.string().min(1),
  campaignId: z.string(),
  key: z.string().min(1),
  value: z.unknown(),
  updatedAt: zIso,
})
export type WorkspaceItem = z.infer<typeof zWorkspaceItem>

export function workspaceId(campaignId: string, key: string): string {
  return `${campaignId}|${key}`
}

export const zSettings = z.object({
  id: z.literal('app'),
  mode: z.enum(['dark', 'light']).default('dark'),
  /** A CSS colour, or null for the skin's own accent. */
  accent: z.string().nullable().default(null),
  size: z.enum(['compact', 'normal', 'large']).default('normal'),
  reduceMotion: z.boolean().default(false),
  /** The campaign that opens on start. */
  lastCampaignId: z.string().nullable().default(null),
})
export type Settings = z.infer<typeof zSettings>
export const DEFAULT_SETTINGS: Settings = zSettings.parse({ id: 'app' })

export const zMeta = z.object({ key: z.string().min(1), value: z.unknown() })

/** Offers and requests to the character app, from outbox to answer (Phase 8 types the payload). */
export const zLinkOutboxItem = z.looseObject({ id: zId, campaignId: zId })

export { zOpaque }
