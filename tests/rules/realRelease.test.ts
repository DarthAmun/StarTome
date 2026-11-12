/**
 * The Foundry sync against a real release, where one is at hand (about 35 MB,
 * not in the repository):
 *
 *   STARTOME_FOUNDRY_ZIP=~/Downloads/json-assets.zip pnpm test tests/rules/realRelease
 *
 * It checks that every default pack converts without a failed entry, that a
 * second run changes nothing, and that the compendium can be browsed after.
 */
import 'fake-indexeddb/auto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { StarTomeDb, useDbForTests } from '@/data/db'
import { notifyRulesChanged, rulesCounts, rulesQuery, rulesSearch } from '@/data/rules'
import { openReleaseZip, runFoundrySync } from '@/services/foundry/sync'

const path = (process.env.STARTOME_FOUNDRY_ZIP ?? '').replace(/^~/, process.env.HOME ?? '~')

describe.skipIf(!path || !existsSync(path))('a real Foundry release', () => {
  it('syncs its default packs, is unchanged on a second run, and can be browsed', async () => {
    useDbForTests(new StarTomeDb(`real-release-${Date.now()}`))
    const source = await openReleaseZip(readFileSync(path))
    const packs = source.packs.filter(p => p.defaultSelected).map(p => p.name)
    const first = await runFoundrySync(source, { packs })
    console.log(`${source.game} ${source.version}: ${first.created} entries from ${packs.length} packs in ${first.durationMs} ms; issues: ${Object.entries(first.issues).map(([k, v]) => `${k} ${v.count}`).join(', ') || 'none'}`)
    expect(first.created).toBeGreaterThan(1000)
    expect(first.issues['convert-failed']).toBeUndefined()

    const second = await runFoundrySync(source, { packs, force: true })
    expect(second.created).toBe(0)
    expect(second.updated).toBe(0)
    expect(second.unchanged).toBe(first.created)

    notifyRulesChanged()
    const counts = await rulesCounts()
    console.log(Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', '))
    const creatures = await rulesQuery({ kind: 'creature', levelMin: 5, levelMax: 5, limit: 5 })
    expect(creatures.total).toBeGreaterThan(0)
    expect(creatures.items.every(c => c.level === 5)).toBe(true)
    expect((await rulesSearch('fire', 5)).length).toBeGreaterThan(0)
  }, 600_000)
})
