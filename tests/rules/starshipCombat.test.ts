import { describe, expect, it } from 'vitest'
import {
  generateShieldsDice, hullIntegrityCheck, hullIntegrityDc, playerShipHpChange, shipDamage, shipStateOf, withShipState,
} from '@/domain/rules/starshipCombat'
import { parseZoneAreaEffect } from '@/domain/rules/sensorMap'

const fresh = { compromised: null, wrecked: 0, inoperable: false }

describe('starship damage', () => {
  it('Shield Points first, bypassing goes to the hull', () => {
    expect(shipDamage({ sp: 10, hp: 30 }, 14)).toEqual({ sp: 0, hp: 26, absorbed: 10 })
    expect(shipDamage({ sp: 10, hp: 30 }, 6)).toEqual({ sp: 4, hp: 30, absorbed: 6 })
    expect(shipDamage({ sp: 10, hp: 30 }, 6, true)).toEqual({ sp: 10, hp: 24, absorbed: 0 })
    expect(shipDamage({ sp: 0, hp: 5 }, 9)).toEqual({ sp: 0, hp: 0, absorbed: 0 })
  })
})

describe('player starship at 0 HP', () => {
  it('becomes compromised 1 (2 on a crit, plus wrecked), stations malfunction, it enters initiative', () => {
    expect(playerShipHpChange(fresh, 10, 0)).toMatchObject({ compromised: 1, inoperable: true, malfunctionAll: true, initiative: true, destroyed: false })
    expect(playerShipHpChange(fresh, 10, 0, { critical: true }).compromised).toBe(2)
    expect(playerShipHpChange({ ...fresh, wrecked: 2 }, 10, 0).compromised).toBe(3)
  })
  it('nonlethal: only inoperable', () => {
    const r = playerShipHpChange(fresh, 10, 0, { nonlethal: true })
    expect(r).toMatchObject({ compromised: null, inoperable: true })
    expect(r.initiative).toBeUndefined()
  })
  it('hull damage while compromised raises it (even at 0 HP); 10 destroys it', () => {
    const c = { compromised: 3, wrecked: 0, inoperable: true }
    expect(playerShipHpChange(c, 0, 0, { hullDamage: 5 })).toMatchObject({ compromised: 4, malfunctionAll: true })
    expect(playerShipHpChange(c, 0, 0, { hullDamage: 5, critical: true }).compromised).toBe(5)
    expect(playerShipHpChange(c, 0, 0, { hullDamage: 0 }).compromised).toBe(3)
    expect(playerShipHpChange({ ...c, compromised: 9 }, 0, 0, { hullDamage: 1 })).toMatchObject({ compromised: 10, destroyed: true })
  })
  it('repairs to 1+ HP end compromised: wrecked +1, leaves initiative', () => {
    expect(playerShipHpChange({ compromised: 4, wrecked: 1, inoperable: true }, 0, 6)).toMatchObject({ compromised: null, wrecked: 2, inoperable: false, initiative: false })
    expect(playerShipHpChange({ compromised: null, wrecked: 0, inoperable: true }, 0, 6)).toMatchObject({ inoperable: false, wrecked: 0 })
  })
})

describe('hull integrity check', () => {
  const c = { compromised: 3, wrecked: 0, inoperable: true }
  it('DC 10 + compromised; degrees move it', () => {
    expect(hullIntegrityDc(3)).toBe(13)
    expect(hullIntegrityCheck(c, 'failure').compromised).toBe(4)
    expect(hullIntegrityCheck(c, 'critical-failure').compromised).toBe(5)
    expect(hullIntegrityCheck(c, 'success').compromised).toBe(2)
    expect(hullIntegrityCheck({ ...c, compromised: 2 }, 'critical-success')).toMatchObject({ compromised: null, wrecked: 1, initiative: false })
    expect(hullIntegrityCheck({ ...c, compromised: 9 }, 'failure')).toMatchObject({ destroyed: true })
  })
})

describe('ship state in conditions', () => {
  it('reads and writes compromised, wrecked and inoperable', () => {
    const conds = [{ name: 'Compromised', value: 2 }, { name: 'Wrecked', value: 1 }, { name: 'Off-Kilter', value: null }]
    expect(shipStateOf(conds)).toEqual({ compromised: 2, wrecked: 1, inoperable: false })
    expect(withShipState(conds, { compromised: null, wrecked: 2, inoperable: false }, (name, value) => ({ name, value })))
      .toEqual([{ name: 'Off-Kilter', value: null }, { name: 'Wrecked', value: 2 }])
  })
  it('generate shields dice by level', () => {
    expect([1, 2, 3, 5, 20].map(generateShieldsDice)).toEqual([1, 1, 2, 3, 10])
  })
  it('zone area effects from stat block text', () => {
    expect(parseZoneAreaEffect('magnetar rail (3-zone cone, analog, ordnance), Damage 1d12+3 piercing (DC 16 basic Reflex save)'))
      .toEqual({ kind: 'cone', size: 3, dc: 16, basic: true, save: 'ref', damage: '1d12+3 piercing' })
  })
})

describe('emergency repairs', () => {
  it('DCs by rank and place; outcomes by degree; a full day doubles', async () => {
    const { emergencyRepairs, emergencyRepairsDc } = await import('@/domain/rules/starshipCombat')
    expect([emergencyRepairsDc('trained', false), emergencyRepairsDc('trained', true), emergencyRepairsDc('master', true)]).toEqual([15, 20, 35])
    expect(emergencyRepairs('success', 'trained', false)).toEqual({ dice: '2d8', bonus: 0, multiplier: 1, clearsWrecked: true, damage: false })
    expect(emergencyRepairs('critical-success', 'expert', true)).toEqual({ dice: '4d8', bonus: 20, multiplier: 2, clearsWrecked: true, damage: false })
    expect(emergencyRepairs('failure', 'master', false).dice).toBeNull()
    expect(emergencyRepairs('critical-failure', 'legendary', true)).toMatchObject({ dice: '1d8', damage: true, bonus: 0 })
  })
})
