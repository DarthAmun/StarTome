import { describe, expect, it } from 'vitest'
import { bestMatch, normalizeName, scoreNames } from '@/domain/imageMatch'

describe('matching image files to entries', () => {
  const entries = ['Goblin Warrior', 'Goblin War Chanter', 'Ancient Red Dragon'].map((n, i) => ({ id: String(i), norm: normalizeName(n) }))

  it('reads a file name as words', () => {
    expect(normalizeName('Goblin_Warrior-Token (2).PNG')).toBe('goblin warrior token 2')
  })

  it('scores the same name highest, then one inside the other', () => {
    expect(scoreNames('goblin warrior', 'goblin warrior')).toBe(1)
    expect(scoreNames('red dragon', 'ancient red dragon')).toBe(0.85)
    expect(scoreNames('owlbear', 'goblin warrior')).toBeLessThan(0.6)
  })

  it('picks the best entry and leaves unlikely files unmatched', () => {
    expect(bestMatch('goblin-warrior.webp', entries)).toEqual({ id: '0', score: 1 })
    expect(bestMatch('ancient_red_dragn.png', entries).id).toBe('2')
    expect(bestMatch('IMG_2041.jpg', entries).id).toBeNull()
  })
})
