/** "Level up the party?" and "Award XP": asked for from anywhere (the Party page, a completed quest), answered in one dialog each. */
import { ref } from 'vue'

export interface LevelUpPrompt { campaignId: string; trigger: 'manual' | 'quest' | 'encounter'; refId: string | null; reason: string; /** Pre-ticked characters; default every party member. */ selected?: string[] }
export interface XpPrompt { campaignId: string; refType: 'encounter' | 'quest' | null; refId: string | null; reason: string; amount?: number }

export const levelUpPrompt = ref<LevelUpPrompt | null>(null)
export const xpPrompt = ref<XpPrompt | null>(null)
