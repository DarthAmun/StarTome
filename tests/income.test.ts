import { describe, expect, it } from 'vitest'
import { checkDegree } from '~/rules/dcs'
import { incomePerDay, incomeTotal, taskDc } from '~/rules/income'

describe('earn income', () => {
  it('matches Player Core at the table edges', () => {
    expect(incomePerDay('pf2e', 0, 'trained', 'success')).toBe(5)
    expect(incomePerDay('pf2e', 0, 'trained', 'failure')).toBe(1)
    expect(incomePerDay('pf2e', 20, 'legendary', 'success')).toBe(20000)
    expect(incomePerDay('pf2e', 20, 'legendary', 'failure')).toBe(800)
    expect(incomePerDay('pf2e', 7, 'expert', 'success')).toBe(250)
  })

  it('pays the next task level on a critical success, and the critical row at 20', () => {
    expect(incomePerDay('pf2e', 4, 'trained', 'critical-success')).toBe(90)
    expect(incomePerDay('pf2e', 20, 'master', 'critical-success')).toBe(17500)
    expect(incomePerDay('pf2e', 9, 'trained', 'critical-failure')).toBe(0)
  })

  it('pays whole credits in SF2e', () => {
    expect(incomePerDay('sf2e', 0, 'trained', 'success')).toBe(10)        // 1 credit
    expect(incomePerDay('sf2e', 3, 'trained', 'failure')).toBe(10)
    expect(incomePerDay('sf2e', 10, 'master', 'success')).toBe(600)       // 60 credits
    expect(incomePerDay('sf2e', 20, 'legendary', 'critical-success')).toBe(30000)
  })

  it('multiplies days by the rate, also for mixed results', () => {
    expect(incomeTotal('pf2e', 5, 'expert', [{ degree: 'success', days: 7 }])).toBe(700)
    expect(incomeTotal('pf2e', 5, 'expert', [{ degree: 'success', days: 2 }, { degree: 'failure', days: 3 }])).toBe(260)
  })

  it('uses the level DC and reads checks with natural 20 and 1', () => {
    expect(taskDc(5)).toBe(20)
    expect(checkDegree(10, 10, 20)).toBe('success')
    expect(checkDegree(20, 0, 25)).toBe('success')
    expect(checkDegree(1, 30, 20)).toBe('success')
    expect(checkDegree(5, 0, 20)).toBe('critical-failure')
  })
})
