import { describe, expect, it } from 'vitest'
import { defaultParticipants, fourPcAward, pacing, parseDefeated, readyToLevel, xpAfterLevelUp } from '~/rules/advancement'
import { planLevelUp } from '~/rules/party'

describe('XP award as for four PCs', () => {
  it('awards the XP unchanged to a group of four', () => {
    expect(fourPcAward('pf2e', 80, 4)).toBe(80)
    expect(fourPcAward('pf2e', 0, 5)).toBe(0)
  })

  it('awards a larger group the four-PC value of the threat it reached', () => {
    // Five PCs: severe is 150 XP; each gets the four-PC severe award, 120
    expect(fourPcAward('pf2e', 150, 5)).toBe(120)
    // Five PCs, moderate (100) → 80
    expect(fourPcAward('pf2e', 100, 5)).toBe(80)
    // Six PCs, extreme (240) → 160
    expect(fourPcAward('pf2e', 240, 6)).toBe(160)
  })

  it('awards a smaller group more, without dividing by a zero budget', () => {
    // Three PCs, moderate (60) → 80
    expect(fourPcAward('pf2e', 60, 3)).toBe(80)
    // One PC: the low budget is 0, so the moderate ratio is used
    expect(fourPcAward('pf2e', 20, 1)).toBe(80)
  })
})

describe('participants', () => {
  const chars = [
    { id: 1, role: 'pc' as const, treatAsPc: true, npcEntityId: 10, tokenId: null },
    { id: 2, role: 'pc' as const, treatAsPc: true, npcEntityId: null, tokenId: 20 },
    { id: 3, role: 'companion' as const, treatAsPc: false, npcEntityId: 30, tokenId: null },
    { id: 4, role: 'pc' as const, treatAsPc: true, npcEntityId: 40, tokenId: null },
  ]

  it('takes the characters whose NPC entry or library token is on the map, companions included', () => {
    const tokens = [{ linkedEntityId: 10, tokenId: 5 }, { linkedEntityId: null, tokenId: 20 }, { linkedEntityId: 30, tokenId: null }]
    expect(defaultParticipants(chars, tokens)).toEqual([1, 2, 3])
  })

  it('falls back to the party members when none is on the map', () => {
    expect(defaultParticipants(chars, [{ linkedEntityId: 99, tokenId: null }])).toEqual([1, 2, 4])
  })
})

describe('levelling by XP', () => {
  it('finds characters at 1,000 XP below level 20', () => {
    expect(readyToLevel([{ id: 1, level: 3, xp: 1000 }, { id: 2, level: 3, xp: 999 }, { id: 3, level: 20, xp: 1500 }])).toEqual([1])
    expect(xpAfterLevelUp(1240)).toBe(240)
    expect(xpAfterLevelUp(300)).toBe(0)
  })

  it('records the XP a level costs only in XP campaigns', () => {
    const chars = [{ id: 1, level: 3, xp: 1120 }]
    expect(planLevelUp(chars, [1])).toEqual([{ characterId: 1, from: 3, to: 4 }])
    expect(planLevelUp(chars, [1], 1000)).toEqual([{ characterId: 1, from: 3, to: 4, xpFrom: 1120, xpTo: 120 }])
  })
})

describe('pacing and defeated enemies', () => {
  it('sums the XP resolved after the last level-up', () => {
    const resolved = [
      { resolvedAt: '2026-10-01', xpAwarded: 120 },
      { resolvedAt: '2026-10-10', xpAwarded: 80 },
      { resolvedAt: '2026-10-12', xpAwarded: 160 },
    ]
    expect(pacing(resolved, '2026-10-05')).toEqual({ xp: 240, encounters: 2, fraction: 0.24 })
    expect(pacing(resolved, null).xp).toBe(360)
  })

  it('reads the defeated list defensively', () => {
    expect(parseDefeated(null)).toEqual([])
    expect(parseDefeated('nope')).toEqual([])
    expect(parseDefeated('[{"name":"Goblin","rulesId":"g","level":1,"kind":"creature","adjustment":null},{"name":"bad"}]')).toHaveLength(1)
  })
})
