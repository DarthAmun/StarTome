/**
 * What the encounter's stat-block panel shows for a token (COMBAT_PLAN.md §3):
 * its compendium stat block, the campaign NPC it stands for, a Play Buddy
 * character's shared numbers, or a prompt to link a stat block.
 */
export type StatPanelKind = 'rules' | 'npc' | 'playbuddy' | 'none'

export function statPanelKind(
  token: { linkedRulesId: string | null; linkedEntityId: number | null },
  has: { npc: boolean; playBuddy: boolean },
): StatPanelKind {
  if (token.linkedRulesId) return 'rules'
  if (has.playBuddy) return 'playbuddy'
  if (token.linkedEntityId && has.npc) return 'npc'
  return 'none'
}
