import { describe, expect, it } from 'vitest'
import { builtinConditions, conditionInfo, getConditionColor, CONDITION_CATALOG } from '~/composables/useConditions'
import { campaignGame, campaignRules } from '~/types/game'

describe('condition catalog', () => {
  it('covers the 43 PF2e remaster conditions and adds 3 SF2e ones', () => {
    expect(builtinConditions('pf2e')).toHaveLength(43)
    expect(builtinConditions('sf2e')).toHaveLength(46)
    expect(builtinConditions('pf2e').map(c => c.name)).not.toContain('Glitching')
    expect(builtinConditions('sf2e').map(c => c.name)).toContain('Untethered')
  })

  it('has no 5e or pre-remaster entries', () => {
    for (const name of ['Poisoned', 'Exhaustion', 'Charmed', 'Concentrating', 'Flat-Footed', 'Grappled']) {
      expect(CONDITION_CATALOG[name]).toBeUndefined()
    }
  })

  it('resolves pre-remaster names and any casing', () => {
    expect(conditionInfo('Flat-Footed')).toBe(CONDITION_CATALOG['Off-Guard'])
    expect(conditionInfo('frightened')).toBe(CONDITION_CATALOG['Frightened'])
    expect(conditionInfo('Not A Condition')).toBeUndefined()
  })

  it('marks valued conditions', () => {
    const valued = builtinConditions('pf2e').filter(c => c.valued).map(c => c.name)
    expect(valued.sort()).toEqual([
      'Clumsy', 'Cursebound', 'Doomed', 'Drained', 'Dying', 'Enfeebled', 'Frightened',
      'Sickened', 'Slowed', 'Stunned', 'Stupefied', 'Wounded',
    ])
  })

  it('gives custom conditions a stable fallback color', () => {
    expect(getConditionColor('Marked by the Hunt')).toBe(getConditionColor('Marked by the Hunt'))
    expect(getConditionColor('Off-Guard')).toBe(CONDITION_CATALOG['Off-Guard'].color)
  })
})

describe('campaign game', () => {
  it('defaults imported campaigns to PF2e with XP advancement', () => {
    expect(campaignGame({})).toBe('pf2e')
    expect(campaignGame({ game: 'sf2e' })).toBe('sf2e')
    expect(campaignGame({ game: 'dnd5e' })).toBe('pf2e')
    expect(campaignRules({})).toEqual({ advancement: 'xp' })
    expect(campaignRules({ rules: { advancement: 'milestone' } }).advancement).toBe('milestone')
  })
})
