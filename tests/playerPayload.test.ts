import { describe, expect, it } from 'vitest'
import { ImageCache, ImageChannel, imageKey, toPlayerToken, type PlayerTokenSource } from '~/utils/playerPayload'

const big = 'data:image/jpeg;base64,' + 'A'.repeat(50_000)

function token(over: Partial<PlayerTokenSource> & Record<string, unknown> = {}): PlayerTokenSource {
  return {
    id: 1, name: 'Goblin', label: 'Goblin 1', imageSource: big, gridX: 2, gridY: 3, size: 1,
    isVisible: true, isDead: false, isPlayerToken: false, visionRange: null, elevation: null,
    hpCurrent: 3, hpMax: 6,
    conditions: [{ name: 'Frightened', value: 1 }, { name: 'Secret curse', value: null, hidden: true }],
    timers: [{ id: 't1', name: 'Breath', remaining: 2, duration: 3 }, { id: 't2', name: 'Shown', remaining: 1, duration: 1, visibleToPlayers: true }],
    ...over,
  } as PlayerTokenSource
}

describe('player payload', () => {
  it('sends only player-safe token fields', () => {
    const gm = { ...token(), notes: 'Has the key', ac: 18, initiative: 14, linkedRulesId: 'fvtt:x', linkedEntityId: 4, adjustment: 'elite' }
    const p = toPlayerToken(gm as PlayerTokenSource, new ImageChannel()) as unknown as Record<string, unknown>
    for (const key of ['notes', 'ac', 'initiative', 'linkedRulesId', 'linkedEntityId', 'adjustment']) expect(p).not.toHaveProperty(key)
    expect(p.hpCurrent).toBeNull()
    expect(p.hpMax).toBeNull()
    expect(p.playerHealthState).toBe('bloodied')
    expect((p.conditions as { name: string }[]).map(c => c.name)).toEqual(['Frightened'])
    expect((p.timers as { id: string }[]).map(t => t.id)).toEqual(['t2'])
  })

  it('keeps exact HP for player characters', () => {
    const p = toPlayerToken(token({ isPlayerToken: true }), new ImageChannel())
    expect([p.hpCurrent, p.hpMax, p.playerHealthState]).toEqual([3, 6, undefined])
  })

  it('sends a large image once per connection and a key afterwards', () => {
    const ch = new ImageChannel()
    const cache = new ImageCache()
    const first = toPlayerToken(token(), ch)
    const images = ch.take()
    expect(first.imageSource).toBe(imageKey(big))
    expect(images).toEqual({ [imageKey(big)]: big })
    toPlayerToken(token({ id: 2 }), ch)
    expect(ch.take()).toBeUndefined()
    cache.add(images)
    expect(cache.resolve(first.imageSource)).toBe(big)
    ch.reset()
    toPlayerToken(token(), ch)
    expect(ch.take()).toEqual({ [imageKey(big)]: big })
  })

  it('passes short sources (http URLs) through unchanged', () => {
    const ch = new ImageChannel()
    expect(toPlayerToken(token({ imageSource: 'https://x/y.png' }), ch).imageSource).toBe('https://x/y.png')
    expect(ch.take()).toBeUndefined()
    expect(new ImageCache().resolve('https://x/y.png')).toBe('https://x/y.png')
  })

  it('gives different images different keys', () => {
    expect(imageKey(big)).not.toBe(imageKey(big.slice(0, -1) + 'B'))
  })
})
