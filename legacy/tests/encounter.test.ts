import { describe, expect, it } from 'vitest'
import { adjustedLevel } from '~/rules/combat'
import { entryXp, rateEncounter, tokenSides, tooStrong, xpLevel, type MeterToken } from '~/rules/encounter'

describe('encounter XP', () => {
  it('counts weak/elite as one level for XP, even across level 0', () => {
    // The stat block jumps two steps here; XP must not
    expect(adjustedLevel(0, 'elite')).toBe(2)
    expect(adjustedLevel(1, 'weak')).toBe(-1)
    expect(xpLevel(0, 'elite')).toBe(1)
    expect(xpLevel(1, 'weak')).toBe(0)
    expect(xpLevel(-1, 'elite')).toBe(0)
    expect(xpLevel(5, null)).toBe(5)
    // Party level 1: a level 0 elite is worth a level 1 creature (40), not level 2 (60)
    expect(entryXp('pf2e', { level: 0, kind: 'creature', adjustment: 'elite' }, 1)).toBe(40)
    expect(entryXp('pf2e', { level: 1, kind: 'creature', adjustment: 'weak' }, 1)).toBe(30)
  })

  it('values simple hazards at a fifth and complex hazards like creatures', () => {
    expect(entryXp('pf2e', { level: 3, kind: 'hazard', complex: false }, 3)).toBe(8)
    expect(entryXp('pf2e', { level: 3, kind: 'hazard', complex: true }, 3)).toBe(40)
    expect(entryXp('pf2e', { level: 5, kind: 'hazard', complex: false, adjustment: 'elite' }, 3)).toBe(24)
  })

  it('gives nothing below −4 and warns above +4 over the lowest member', () => {
    expect(entryXp('pf2e', { level: 0, kind: 'creature' }, 5)).toBe(0)
    expect(tooStrong({ level: 9, kind: 'creature' }, 5)).toBe(false)
    expect(tooStrong({ level: 9, kind: 'creature', adjustment: 'elite' }, 5)).toBe(true)
    expect(tooStrong({ level: 20, kind: 'creature' }, null)).toBe(false)
  })

  it('rates the XP total against the party-size budgets', () => {
    expect(rateEncounter('pf2e', 30, 4).threat).toBe('trivial')
    expect(rateEncounter('pf2e', 80, 4).threat).toBe('moderate')
    expect(rateEncounter('pf2e', 110, 4).threat).toBe('moderate')
    expect(rateEncounter('pf2e', 160, 4).threat).toBe('extreme')
    expect(rateEncounter('pf2e', 170, 4).threat).toBe('beyond')
    // Five PCs: moderate budget 100, so 80 XP is only low
    expect(rateEncounter('pf2e', 80, 5).threat).toBe('low')
    expect(rateEncounter('pf2e', 80, 5).budgets.moderate).toBe(100)
    // An empty party falls back to four
    expect(rateEncounter('pf2e', 80, 0).budgets.moderate).toBe(80)
  })
})

describe('tokenSides', () => {
  const tok = (p: Partial<MeterToken>): MeterToken => ({
    linkedRulesId: null, linkedEntityId: null, adjustment: null, isPlayerToken: false, isAlly: false, ...p,
  })

  it('leaves party tokens and allies out and counts unlinked enemies apart', () => {
    const tokens = [
      tok({ linkedRulesId: 'goblin' }),
      tok({ linkedRulesId: 'guard', isAlly: true }),
      tok({ isPlayerToken: true }),
      tok({ linkedEntityId: 7 }),             // party member's NPC
      tok({ linkedEntityId: 8 }),             // some other NPC, no stat block
      tok({}),                                // homebrew token
      tok({ linkedRulesId: 'wolf', linkedEntityId: 7 }),
    ]
    const { enemies, unlinked } = tokenSides(tokens, new Set([7]))
    expect(enemies.map(t => t.linkedRulesId)).toEqual(['goblin'])
    expect(unlinked).toHaveLength(2)
  })
})

describe('starship encounter budgets (Tech Core GM\'s Arsenal)', () => {
  it('a crew of three or fewer gets 20 less for moderate+ and 10 less for trivial/low, unless the concierge upgrade is used', async () => {
    const { rateEncounter, starshipBudgets, threatBudgets } = await import('~/rules/encounter')
    const four = threatBudgets('sf2e', 4)
    expect(starshipBudgets(four, 4)).toEqual(four)
    const three = threatBudgets('sf2e', 3)
    const cut = starshipBudgets(three, 3)
    expect(cut.trivial).toBe(three.trivial - 10)
    expect(cut.low).toBe(three.low - 10)
    expect(cut.moderate).toBe(three.moderate - 20)
    expect(cut.extreme).toBe(three.extreme - 20)
    expect(starshipBudgets(three, 3, { concierge: true })).toEqual(three)
    // 60 XP: moderate for 3 PCs in a starship fight (budget 60 → 40), low on foot
    expect(rateEncounter('sf2e', three.moderate - 20, 3, {}).threat).toBe('moderate')
    expect(rateEncounter('sf2e', three.moderate - 20, 3).threat).toBe('low')
  })
})
