import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AUTOMATION, conditionValue, endOfTurn, flatCheckDegree, hasCondition, hpChangeEffects,
  parsePersistent, persistentCheck, recoveryCheck, revertChanges, startOfTurn,
} from '~/rules/turnEffects'
import type { TokenCondition } from '~/stores/encounter'

const on = DEFAULT_AUTOMATION
const c = (name: string, value: number | null = null, extra: Partial<TokenCondition> = {}): TokenCondition => ({ name, value, ...extra })
const val = (conds: TokenCondition[], name: string) => (hasCondition(conds, name) ? conditionValue(conds, name) : 0)

describe('end of turn', () => {
  it('lowers frightened by 1 and removes it at 0', () => {
    expect(val(endOfTurn([c('Frightened', 2)], on).conditions, 'Frightened')).toBe(1)
    expect(hasCondition(endOfTurn([c('Frightened', 1)], on).conditions, 'Frightened')).toBe(false)
  })

  it('leaves sickened alone', () => {
    expect(endOfTurn([c('Sickened', 2)], on).changes).toEqual([])
  })

  it('asks for every persistent damage', () => {
    const r = endOfTurn([c('Persistent fire', null, { formula: '2d6' }), c('Persistent bleed', null, { formula: '1d4' })], on)
    expect(r.prompts).toEqual([
      { kind: 'persistent', condition: 'Persistent fire', formula: '2d6' },
      { kind: 'persistent', condition: 'Persistent bleed', formula: '1d4' },
    ])
  })

  it('does nothing when switched off', () => {
    const r = endOfTurn([c('Frightened', 2), c('Persistent fire')], { tickDown: false, dying: true, persistent: false })
    expect(r.changes).toEqual([])
    expect(r.prompts).toEqual([])
  })
})

describe('start of turn', () => {
  it('asks for a recovery check at DC 10 + dying', () => {
    expect(startOfTurn([c('Dying', 2)], on, true).prompts).toEqual([{ kind: 'recovery', dying: 2, dc: 12 }])
    expect(startOfTurn([c('Dying', 2)], on, false).prompts).toEqual([])
  })

  it('uses up stunned by the actions it takes', () => {
    const r = startOfTurn([c('Stunned', 5)], on, false)
    expect(val(r.conditions, 'Stunned')).toBe(2)
    expect(hasCondition(startOfTurn([c('Stunned', 2)], on, false).conditions, 'Stunned')).toBe(false)
    expect(r.notes[0]).toMatch(/loses 3 actions/)
  })

  it('reminds of slowed and quickened', () => {
    expect(startOfTurn([c('Slowed', 1), c('Quickened')], on, false).notes).toHaveLength(2)
  })
})

describe('dying', () => {
  it('drops to dying 1 + wounded, or 2 + wounded on a critical, and falls unconscious', () => {
    const r = hpChangeEffects([c('Wounded', 1)], { from: 5, to: 0 }, true, on)
    expect(val(r.conditions, 'Dying')).toBe(2)
    expect(hasCondition(r.conditions, 'Unconscious')).toBe(true)
    expect(val(hpChangeEffects([], { from: 5, to: 0, critical: true }, true, on).conditions, 'Dying')).toBe(2)
  })

  it('defeats tokens without dying rules at 0 HP', () => {
    const r = hpChangeEffects([], { from: 5, to: 0 }, false, on)
    expect(r.dead).toBe(true)
    expect(r.changes).toEqual([])
  })

  it('walks the recovery ladder', () => {
    let conds = [c('Dying', 2), c('Unconscious')]
    conds = recoveryCheck(conds, 'success').conditions
    expect(val(conds, 'Dying')).toBe(1)
    conds = recoveryCheck(conds, 'success').conditions
    expect(hasCondition(conds, 'Dying')).toBe(false)
    expect(val(conds, 'Wounded')).toBe(1)
    expect(hasCondition(conds, 'Unconscious')).toBe(true)
    expect(recoveryCheck([c('Dying', 2)], 'critical-failure').dead).toBe(true)
    expect(recoveryCheck([c('Dying', 1)], 'failure').dead).toBe(false)
  })

  it('dies earlier when doomed', () => {
    expect(recoveryCheck([c('Dying', 2), c('Doomed', 1)], 'failure').dead).toBe(true)
    expect(hpChangeEffects([c('Doomed', 2), c('Wounded', 1)], { from: 3, to: 0 }, true, on).dead).toBe(true)
  })

  it('raises dying for hits at 0 HP', () => {
    expect(val(hpChangeEffects([c('Dying', 1)], { from: 0, to: 0, hitsAtZero: 1 }, true, on).conditions, 'Dying')).toBe(2)
    expect(hpChangeEffects([c('Dying', 2)], { from: 0, to: 0, hitsAtZero: 1, critical: true }, true, on).dead).toBe(true)
  })

  it('ends dying and unconscious when healed above 0, adding wounded', () => {
    const r = hpChangeEffects([c('Dying', 1), c('Unconscious'), c('Wounded', 1)], { from: 0, to: 4 }, true, on)
    expect(hasCondition(r.conditions, 'Dying')).toBe(false)
    expect(hasCondition(r.conditions, 'Unconscious')).toBe(false)
    expect(val(r.conditions, 'Wounded')).toBe(2)
  })

  it('reads flat checks with natural 20 and 1', () => {
    expect(flatCheckDegree(11, 11)).toBe('success')
    expect(flatCheckDegree(20, 11)).toBe('critical-success')
    expect(flatCheckDegree(10, 11)).toBe('failure')
    expect(flatCheckDegree(1, 11)).toBe('critical-failure')
    expect(flatCheckDegree(1, 2)).toBe('critical-failure')
  })
})

describe('persistent damage', () => {
  it('ends on a successful flat check', () => {
    expect(persistentCheck([c('Persistent fire')], 'Persistent fire', true).conditions).toEqual([])
    expect(persistentCheck([c('Persistent fire')], 'Persistent fire', false).conditions).toHaveLength(1)
  })

  it('parses typed persistent damage', () => {
    expect(parsePersistent('Persistent fire 2d6')).toEqual({ name: 'Persistent fire', formula: '2d6' })
    expect(parsePersistent('persistent Bleed 1d6 + 2')).toEqual({ name: 'Persistent bleed', formula: '1d6+2' })
    expect(parsePersistent('Persistent Damage')).toBeNull()
  })
})

describe('undo', () => {
  it('reverts exactly the changes made, restoring the look', () => {
    const start = [c('Frightened', 1, { hidden: true, color: '#123456' }), c('Prone')]
    const r = endOfTurn(start, on)
    const edited = [...r.conditions, c('Blinded')]   // the GM adds something afterwards
    expect(revertChanges(edited, r.changes)).toEqual([c('Frightened', 1, { hidden: true, color: '#123456' }), c('Prone'), c('Blinded')])

    const drop = hpChangeEffects([], { from: 5, to: 0 }, true, on)
    expect(revertChanges(drop.conditions, drop.changes)).toEqual([])
  })
})
