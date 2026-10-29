import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { rulesGet, rulesQuery, rulesSaveUser } from '~/composables/useRules'
import { buildStats, newBuild } from '~/rules/creatureBuilding'
import { newRulesEntity } from '~/rules/factory'
import type { Creature } from '~/types/rules'

describe('built creatures', () => {
  beforeEach(async () => { await getDb().rules.clear() })

  it('are plain homebrew creatures the compendium finds at their level', async () => {
    const build = newBuild('brute')
    const base = newRulesEntity('creature', { name: 'Bog Brute', game: 'pf2e' }) as Creature
    await rulesSaveUser({ ...base, ...buildStats(build, 6), level: 6, build })
    const page = await rulesQuery({ kind: 'creature', levelMin: 6, levelMax: 6 })
    expect(page.items.map(e => e.name)).toEqual(['Bog Brute'])
    const saved = await rulesGet(base.id) as Creature
    expect(saved).toMatchObject({ origin: 'user', level: 6, sortName: 'bog brute', build: { roadmap: 'brute' } })
  })

  it('rebuild keeps the id and moves the numbers', async () => {
    const build = newBuild('soldier')
    const base = newRulesEntity('creature', { name: 'Guard', game: 'pf2e' }) as Creature
    const first = await rulesSaveUser({ ...base, ...buildStats(build, 2), level: 2, build }) as Creature
    await rulesSaveUser({ ...first, ...buildStats(build, 8), level: 8 })
    const again = await rulesGet(base.id) as Creature
    expect([again.level, again.ac]).toEqual([8, 27])
    expect((await rulesQuery({ kind: 'creature' })).total).toBe(1)
  })
})
