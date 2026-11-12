import { z } from 'zod'
import { DEFAULT_AUTOMATION, DEFAULT_CAMPAIGN_RULES } from '@/domain/game'
import { zId, zImageRef, zIso } from './common'

export const zGameId = z.enum(['pf2e', 'sf2e'])

export const zCampaignRules = z.object({
  advancement: z.enum(['xp', 'milestone']).default(DEFAULT_CAMPAIGN_RULES.advancement),
  abp: z.boolean().default(false),
  startingLevel: z.number().default(1),
  startingTreasure: z.number().default(0),
  startingConsumables: z.number().default(0),
  baselineAt: zIso.nullable().default(null),
  countConsumables: z.boolean().default(true),
  automation: z.object({
    tickDown: z.boolean().default(DEFAULT_AUTOMATION.tickDown),
    dying: z.boolean().default(DEFAULT_AUTOMATION.dying),
    persistent: z.boolean().default(DEFAULT_AUTOMATION.persistent),
  }).default(DEFAULT_AUTOMATION),
})

/** The character app a campaign follows (Play Buddy today; `provider` leaves room for others). */
export const zCampaignLink = z.object({
  provider: z.literal('playbuddy'),
  gameId: z.string(),
  gameName: z.string(),
  lastSeq: z.number(),
})

export const zCampaign = z.object({
  id: zId,
  name: z.string(),
  description: z.string().default(''),
  game: zGameId,
  banner: zImageRef.nullable().default(null),
  rules: zCampaignRules,
  characterLink: zCampaignLink.nullable().default(null),
  createdAt: zIso,
  updatedAt: zIso,
})
export type Campaign = z.infer<typeof zCampaign>
