import { describe, expect, it } from 'vitest'
import { damageWithTemp, grantTemp } from '@/domain/rules/hp'

describe('temporary HP', () => {
  it('soak damage before HP', () => {
    expect(damageWithTemp({ hp: 20, temp: 5 }, 3)).toEqual({ hp: 20, temp: 2, absorbed: 3 })
    expect(damageWithTemp({ hp: 20, temp: 5 }, 5)).toEqual({ hp: 20, temp: 0, absorbed: 5 })
    expect(damageWithTemp({ hp: 20, temp: 5 }, 12)).toEqual({ hp: 13, temp: 0, absorbed: 5 })
  })

  it('leave HP at 0 at the lowest and pass damage straight through without temp HP', () => {
    expect(damageWithTemp({ hp: 4, temp: 0 }, 10)).toEqual({ hp: 0, temp: 0, absorbed: 0 })
    expect(damageWithTemp({ hp: 4, temp: 2 }, 0)).toEqual({ hp: 4, temp: 2, absorbed: 0 })
  })

  it("don't stack: a new grant keeps the higher value", () => {
    expect(grantTemp(5, 3)).toBe(5)
    expect(grantTemp(5, 8)).toBe(8)
    expect(grantTemp(0, 4)).toBe(4)
    expect(grantTemp(0, -2)).toBe(0)
  })
})
