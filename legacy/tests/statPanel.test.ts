import { describe, expect, it } from 'vitest'
import { statPanelKind } from '~/utils/statPanel'

const token = (linkedRulesId: string | null, linkedEntityId: number | null) => ({ linkedRulesId, linkedEntityId })

describe('stat block panel content', () => {
  it('shows the compendium stat block first', () => {
    expect(statPanelKind(token('fvtt:goblin', 3), { npc: true, playBuddy: true })).toBe('rules')
  })

  it("shows a Play Buddy character's numbers, then the campaign NPC", () => {
    expect(statPanelKind(token(null, 3), { npc: true, playBuddy: true })).toBe('playbuddy')
    expect(statPanelKind(token(null, 3), { npc: true, playBuddy: false })).toBe('npc')
  })

  it('asks for a stat block when nothing is linked or the NPC is gone', () => {
    expect(statPanelKind(token(null, null), { npc: false, playBuddy: false })).toBe('none')
    expect(statPanelKind(token(null, 3), { npc: false, playBuddy: false })).toBe('none')
  })
})
