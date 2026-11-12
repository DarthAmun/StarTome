import { describe, expect, it } from 'vitest'
import { cellsInArea, edgeOrigin, gridSteps, parseAreaEffect, parseAreaText, snapAngle45, tokensInArea } from '@/domain/rules/areas'

const sorted = (s: Set<string>) => [...s].sort()

describe('grid distance', () => {
  it('counts diagonals 5/10/5', () => {
    expect([gridSteps(1, 1), gridSteps(2, 2), gridSteps(3, 1), gridSteps(3, 3)]).toEqual([1, 3, 3, 4])
  })
})

describe('bursts', () => {
  it('cover the squares around their intersection', () => {
    expect(sorted(cellsInArea({ kind: 'burst', originX: 5, originY: 5, sizeFt: 5 }))).toEqual(['4,4', '4,5', '5,4', '5,5'])
    // 10 feet: 4×4 without its corners
    const ten = cellsInArea({ kind: 'burst', originX: 5, originY: 5, sizeFt: 10 })
    expect(ten.size).toBe(12)
    for (const corner of ['3,3', '6,3', '3,6', '6,6']) expect(ten.has(corner)).toBe(false)
    expect(cellsInArea({ kind: 'burst', originX: 0, originY: 0, sizeFt: 20 }).size).toBe(44)
  })

  it('are symmetric', () => {
    const cells = cellsInArea({ kind: 'burst', originX: 0, originY: 0, sizeFt: 15 })
    for (const k of cells) {
      const [c, r] = k.split(',').map(Number)
      expect(cells.has(`${-c - 1},${r}`) && cells.has(`${c},${-r - 1}`)).toBe(true)
    }
  })
})

describe('emanations', () => {
  it('reach out from every side of the creature and include its space', () => {
    const medium = cellsInArea({ kind: 'emanation', originX: 0, originY: 0, sizeFt: 5, attachedTokenId: 1 }, [{ id: 1, gridX: 4, gridY: 4, size: 1 }])
    expect(medium.size).toBe(9)
    const large = cellsInArea({ kind: 'emanation', originX: 0, originY: 0, sizeFt: 10, attachedTokenId: 1 }, [{ id: 1, gridX: 4, gridY: 4, size: 2 }])
    // 6×6 around a 2×2 space, without the 4 far corners
    expect(large.size).toBe(32)
    expect(large.has('2,2')).toBe(false)
    expect(large.has('3,3')).toBe(true)
  })

  it('follow their token', () => {
    const area = { kind: 'emanation' as const, originX: 0, originY: 0, sizeFt: 5, attachedTokenId: 1 }
    expect(cellsInArea(area, [{ id: 1, gridX: 10, gridY: 10, size: 1 }]).has('11,11')).toBe(true)
  })
})

describe('cones', () => {
  it('aimed diagonally from a corner fill a quarter of a burst', () => {
    const cone = cellsInArea({ kind: 'cone', originX: 5, originY: 5, sizeFt: 15, angle: 45 })
    const burst = cellsInArea({ kind: 'burst', originX: 5, originY: 5, sizeFt: 15 })
    expect(cone.size * 4).toBe(burst.size)
    for (const k of cone) expect(k.split(',').map(Number).every(v => v >= 5)).toBe(true)
  })

  it('aimed orthogonally from an edge fan out within 45° of the direction', () => {
    const cone = cellsInArea({ kind: 'cone', originX: 5.5, originY: 5, sizeFt: 15, angle: 90 })
    expect(sorted(cone)).toEqual(['4,6', '4,7', '5,5', '5,6', '5,7', '6,6', '6,7'])
  })

  it('point the same way in all 8 directions', () => {
    const sizes = [0, 45, 90, 135, 180, 225, 270, 315].map(a => cellsInArea({ kind: 'cone', originX: 5, originY: 5, sizeFt: 30, angle: a }).size)
    expect(new Set([sizes[1], sizes[3], sizes[5], sizes[7]]).size).toBe(1)
    expect(new Set([sizes[0], sizes[2], sizes[4], sizes[6]]).size).toBe(1)
  })
})

describe('lines', () => {
  it('run straight along a row or diagonal for their length', () => {
    expect(sorted(cellsInArea({ kind: 'line', originX: 5, originY: 5.5, sizeFt: 30, angle: 0 }))).toEqual(['10,5', '5,5', '6,5', '7,5', '8,5', '9,5'])
    expect(cellsInArea({ kind: 'line', originX: 5, originY: 5.5, sizeFt: 30, angle: 180 }).has('4,5')).toBe(true)
    const diag = cellsInArea({ kind: 'line', originX: 0.5, originY: 0.5, sizeFt: 15, angle: 45 })
    expect(diag.has('0,0') && diag.has('1,1') && diag.has('2,2')).toBe(true)
  })
})

describe('tokens in an area', () => {
  it('count a large token with any square inside', () => {
    const cells = cellsInArea({ kind: 'burst', originX: 5, originY: 5, sizeFt: 5 })
    const tokens = [{ id: 1, gridX: 5, gridY: 5, size: 1 }, { id: 2, gridX: 2, gridY: 2, size: 3 }, { id: 3, gridX: 3, gridY: 5, size: 1 }]
    expect(tokensInArea(cells, tokens).map(t => t.id)).toEqual([1, 2])
  })
})

describe('helpers', () => {
  it('read area text from spells', () => {
    expect(parseAreaText('20-foot burst')).toEqual({ kind: 'burst', sizeFt: 20 })
    expect(parseAreaText('30-foot cone')).toEqual({ kind: 'cone', sizeFt: 30 })
    expect(parseAreaText('10-foot emanation')).toEqual({ kind: 'emanation', sizeFt: 10 })
    expect(parseAreaText('one creature')).toBeNull()
  })

  it('snap aim to 45° and start at the token edge or corner', () => {
    expect([snapAngle45(30), snapAngle45(-20), snapAngle45(350)]).toEqual([45, 0, 0])
    const t = { id: 1, gridX: 4, gridY: 4, size: 1 }
    expect(edgeOrigin(t, 0)).toEqual({ x: 5, y: 4.5 })
    expect(edgeOrigin(t, 45)).toEqual({ x: 5, y: 5 })
    expect(edgeOrigin(t, 180)).toEqual({ x: 4, y: 4.5 })
  })
})

describe('ability text', () => {
  it('gives the area, save and damage of an ability', () => {
    expect(parseAreaEffect('The dragon breathes a blast of flame in a 30-foot cone that deals ::dice[8d6 fire] damage (DC 25 basic Reflex save).')).toEqual({
      kind: 'cone', sizeFt: 30, effect: { save: 'ref', dc: 25, basic: true, damage: { formula: '8d6', type: 'fire' } },
    })
    expect(parseAreaEffect('Each creature in a 10-foot emanation must succeed at a DC 20 Will save or become frightened 1.')).toEqual({
      kind: 'emanation', sizeFt: 10, effect: { save: 'will', dc: 20, basic: false, damage: null },
    })
  })

  it('needs both an area and a save', () => {
    expect(parseAreaEffect('Strike twice. DC 20 Reflex.')).toBeNull()
    expect(parseAreaEffect('A 20-foot burst of light.')).toBeNull()
  })
})

