import { describe, expect, it } from 'vitest'
import { areaZones, burstInRange, clampZone, fromBehind, inRange, parseZoneArea, tokensInZones, zoneDistance } from '~/rules/sensorMap'

describe('sensor map zones', () => {
  it('distance and range', () => {
    expect(zoneDistance(2, 5)).toBe(3)
    expect(inRange(4, 4, 0)).toBe(true)
    expect(inRange(4, 6, 1)).toBe(false)
    expect(clampZone(14, 12)).toBe(11)
    expect(clampZone(-2, 12)).toBe(0)
  })

  it('off-guard from behind; the same zone counts as in front', () => {
    const facingRight = { id: 1, zone: 5, heading: 1 as const }
    expect(fromBehind(facingRight, 3)).toBe(true)
    expect(fromBehind(facingRight, 8)).toBe(false)
    expect(fromBehind(facingRight, 5)).toBe(false)
    expect(fromBehind({ ...facingRight, heading: -1 }, 3)).toBe(false)
  })

  it('areas as in the book\'s diagrams', () => {
    // cone 0: own zone only; cone 3: own zone and 3 ahead
    expect(areaZones({ kind: 'cone', origin: 2, direction: 1, size: 0 }, 12)).toEqual([2])
    expect(areaZones({ kind: 'cone', origin: 2, direction: 1, size: 3 }, 12)).toEqual([2, 3, 4, 5])
    expect(areaZones({ kind: 'cone', origin: 2, direction: -1, size: 3 }, 12)).toEqual([0, 1, 2])
    // emanation 1: own zone and one to either side; emanation 0: own zone
    expect(areaZones({ kind: 'emanation', origin: 4, size: 1 }, 12)).toEqual([3, 4, 5])
    expect(areaZones({ kind: 'emanation', origin: 4, size: 0 }, 12)).toEqual([4])
    // line 2
    expect(areaZones({ kind: 'line', origin: 1, direction: 1, size: 2 }, 12)).toEqual([1, 2, 3])
    // burst 1 from the border between zones 3 and 4; burst 2 from the border 5|6
    expect(areaZones({ kind: 'burst', origin: 3, size: 1, border: 4 }, 12)).toEqual([3, 4])
    expect(areaZones({ kind: 'burst', origin: 2, size: 2, border: 6 }, 12)).toEqual([4, 5, 6, 7])
    // a 0-zone burst is one zone
    expect(areaZones({ kind: 'burst', origin: 2, size: 0, zone: 7 }, 12)).toEqual([7])
  })

  it('burst range: the border is within range of the origin', () => {
    expect(burstInRange({ kind: 'burst', origin: 3, size: 1, border: 4 }, 0)).toBe(true)
    expect(burstInRange({ kind: 'burst', origin: 2, size: 2, border: 6 }, 2)).toBe(false)
    expect(burstInRange({ kind: 'burst', origin: 2, size: 2, border: 5 }, 2)).toBe(true)
    expect(burstInRange({ kind: 'burst', origin: 2, size: 0, zone: 7 }, 4)).toBe(false)
  })

  it('targets: a cone never hits its own starship', () => {
    const tokens = [{ id: 1, zone: 2, heading: 1 as const }, { id: 2, zone: 2, heading: -1 as const }, { id: 3, zone: 4, heading: 1 as const }, { id: 4, zone: 9, heading: 1 as const }]
    const cone = { kind: 'cone' as const, origin: 2, direction: 1 as const, size: 3 }
    expect(tokensInZones(cone, areaZones(cone, 12), tokens, 1).map(t => t.id)).toEqual([2, 3])
    const em = { kind: 'emanation' as const, origin: 2, size: 0 }
    expect(tokensInZones(em, areaZones(em, 12), tokens, 1).map(t => t.id)).toEqual([1, 2])
  })

  it('reads zone areas from ability text', () => {
    expect(parseZoneArea('magnetar rail (3-zone cone, analog, ordnance)')).toEqual({ kind: 'cone', size: 3 })
    expect(parseZoneArea('a shimmering beam in a 6-zone line')).toEqual({ kind: 'line', size: 6 })
    expect(parseZoneArea('farseeker missiles (1-zone burst, range 6 zones)')).toEqual({ kind: 'burst', size: 1 })
    expect(parseZoneArea('a 20-foot cone')).toBeNull()
  })
})
