import { describe, expect, it } from 'vitest'
import {
  attackValue, buildStats, damageFormula, newBuild, roadmapColumns, skillValue, spellDc, statValue,
} from '~/rules/creatureBuilding'

describe('GM Core tables', () => {
  it('matches the book at the edges (levels −1 and 24)', () => {
    expect(statValue('perception', 'extreme', -1)).toBe(9)
    expect(statValue('fort', 'terrible', 24)).toBe(32)
    expect(statValue('ac', 'low', -1)).toBe(12)
    expect(statValue('ac', 'extreme', 24)).toBe(54)
    expect(statValue('str', 'extreme', 24)).toBe(13)
    expect(attackValue('high', -1)).toBe(8)
    expect(attackValue('low', 24)).toBe(36)
    expect(damageFormula('extreme', 24)).toBe('4d12+42')
    expect(spellDc('high', 24)).toEqual({ dc: 48, attack: 40 })
  })

  it('spot-checks the middle of each table', () => {
    expect(statValue('str', 'high', 10)).toBe(7)
    expect(statValue('will', 'moderate', 10)).toBe(19)
    expect(statValue('ac', 'moderate', 10)).toBe(29)
    expect(skillValue('high', 10)).toBe(22)
    expect(attackValue('moderate', 10)).toBe(21)
    expect(damageFormula('high', 10)).toBe('2d12+13')
    expect(spellDc('moderate', 10)).toEqual({ dc: 26, attack: 18 })
  })

  it('uses the HP range midpoint', () => {
    expect(statValue('hp', 'moderate', 1)).toBe(20)    // 21–19
    expect(statValue('hp', 'high', 10)).toBe(219)      // 223–215
    expect(statValue('hp', 'low', -1)).toBe(6)         // 6–5 → 5.5
  })

  it('falls back to the nearest column a table has', () => {
    // No extreme attribute below level 1
    expect(statValue('str', 'extreme', 0)).toBe(3)
    // Terrible attributes are −5 at every level
    expect(statValue('int', 'terrible', 12)).toBe(-5)
    // AC has no terrible column; HP has no extreme
    expect(statValue('ac', 'terrible', 5)).toBe(19)
    expect(statValue('hp', 'extreme', 1)).toBe(25)
  })
})

describe('builds', () => {
  it('turns a road map into a stat block', () => {
    const b = newBuild('brute')
    b.skills = [{ name: 'Athletics', column: 'high' }]
    const s = buildStats(b, 5)
    expect(s.perception).toBe(9)          // low
    expect(s.abilities.str).toBe(5)        // high
    expect(s.ac).toBe(19)                  // low
    expect(s.saves).toEqual({ fort: 15, ref: 9, will: 9 })
    expect(s.hp).toBe(94)                  // high 97–91
    expect(s.skills).toEqual({ athletics: 13 })
    expect(s.strikes[0]).toMatchObject({ bonus: 13, damage: [{ formula: '2d12+7' }] })
  })

  it('rebuilds at another level, keeping the columns and the typed-over values', () => {
    const b = newBuild('soldier')
    b.custom.ac = 30
    b.custom['strike:0:damage'] = '1d10+20'
    const s3 = buildStats(b, 3)
    const s12 = buildStats(b, 12)
    expect(s3.ac).toBe(30)
    expect(s12.ac).toBe(30)
    expect(s12.strikes[0].damage[0].formula).toBe('1d10+20')
    expect(s3.saves.fort).toBe(12)
    expect(s12.saves.fort).toBe(25)
    expect(s12.strikes[0].bonus).toBe(26)
  })

  it('starts custom from all moderate', () => {
    expect(new Set(Object.values(roadmapColumns('custom')))).toEqual(new Set(['moderate']))
    expect(buildStats(newBuild(), 1).spellcasting).toEqual([])
    expect(buildStats(newBuild('spellcaster'), 1).spellcasting[0]).toMatchObject({ dc: 17, attack: 9 })
  })
})
