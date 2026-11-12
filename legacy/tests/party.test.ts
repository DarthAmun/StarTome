import { describe, expect, it } from 'vitest'
import { defaultLevelUpSelection, parseLevel, partyLevel, partyMembers, planLevelUp, type PartyCharacter } from '~/rules/party'

const pc = (id: number, level: number): PartyCharacter => ({ id, name: `PC${id}`, role: 'pc', level, treatAsPc: true })
const companion = (id: number, level: number, treatAsPc = false): PartyCharacter => ({ id, name: `NPC${id}`, role: 'companion', level, treatAsPc })

describe('party', () => {
  it('parses free-text NPC levels', () => {
    expect(parseLevel('5')).toBe(5)
    expect(parseLevel('Level 7')).toBe(7)
    expect(parseLevel('3rd')).toBe(3)
    expect(parseLevel('25')).toBe(20)
    expect(parseLevel('')).toBeNull()
    expect(parseLevel(undefined)).toBeNull()
    expect(parseLevel(4)).toBe(4)
  })

  it('counts PCs and companions treated as PCs, nobody else', () => {
    const chars = [pc(1, 5), pc(2, 5), companion(3, 9), companion(4, 3, true)]
    expect(partyMembers(chars).map(c => c.id)).toEqual([1, 2, 4])
  })

  it('averages the members rounded down and flags mixed levels', () => {
    expect(partyLevel([pc(1, 5), pc(2, 5), pc(3, 5)])).toEqual({ level: 5, min: 5, max: 5, mixed: false, size: 3 })
    expect(partyLevel([pc(1, 4), pc(2, 5), pc(3, 6), pc(4, 6)])).toEqual({ level: 5, min: 4, max: 6, mixed: true, size: 4 })
    // A companion who doesn't count doesn't change size or level
    expect(partyLevel([pc(1, 5), companion(2, 12)])).toMatchObject({ level: 5, size: 1, mixed: false })
    expect(partyLevel([pc(1, 5), companion(2, 1, true)])).toMatchObject({ level: 3, size: 2, mixed: true })
    expect(partyLevel([])).toEqual({ level: null, min: null, max: null, mixed: false, size: 0 })
  })

  it('plans level-ups for the selected characters, never past 20', () => {
    const chars = [pc(1, 5), pc(2, 20), companion(3, 4)]
    expect(defaultLevelUpSelection(chars)).toEqual([1, 2])
    expect(planLevelUp(chars, [1, 2, 3])).toEqual([{ characterId: 1, from: 5, to: 6 }, { characterId: 3, from: 4, to: 5 }])
  })
})
