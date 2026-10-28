/**
 * Opt-in smoke test of the DM's Tome library matching against real data (not part of the normal run):
 *   FOUNDRY_DIR=/path/with/pf2e-and-sf2e-extracted LEGACY_EXPORT=/path/dmstome-all.json \
 *     pnpm vitest run tests/legacyFull.smoke.test.ts
 * Converts every syncable pack in memory (a sync into fake-indexeddb takes far too long) and
 * analyses the export against it. Writing is covered by tests/legacyImport.test.ts.
 */
import 'fake-indexeddb/auto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { convertFoundryDoc, type FoundryDoc } from '~/converters/foundry'
import { packGroup } from '~/converters/foundry/packs'
import type { MatchTarget } from '~/converters/legacy/match'
import { analyseLegacy, readLegacyFile } from '~/sync/legacyImport'

const dir = process.env.FOUNDRY_DIR
const exportPath = process.env.LEGACY_EXPORT

function targetsOf(root: string, game: 'pf2e' | 'sf2e'): MatchTarget[] {
  const out: MatchTarget[] = []
  for (const f of readdirSync(join(root, 'packs'))) {
    const pack = f.slice(0, -5)
    if (f.endsWith('_folders.json') || packGroup(pack) === 'skip') continue
    for (const doc of JSON.parse(readFileSync(join(root, 'packs', f), 'utf8')) as FoundryDoc[]) {
      const e = convertFoundryDoc(doc, { game, version: 'smoke', pack, resolveUuid: () => null, localize: k => k }).entity
      if (e) out.push({ id: e.id, kind: e.kind, name: e.name, level: e.level, game, remaster: !!e.publication?.remaster, pubTitle: e.publication?.title, superseded: false })
    }
  }
  // Same pairing as pairLegacyWithRemaster, enough for ranking
  const remastered = new Set(out.filter(t => t.remaster).map(t => `${t.kind}:${t.name.toLowerCase()}`))
  for (const t of out) t.superseded = !t.remaster && remastered.has(`${t.kind}:${t.name.toLowerCase()}`)
  return out
}

describe.skipIf(!dir || !exportPath)('DM\'s Tome import against real data', () => {
  it('reconciles the library', async () => {
    const targets = (['pf2e', 'sf2e'] as const).flatMap(g => existsSync(join(dir!, g)) ? targetsOf(join(dir!, g), g) : [])
    const bundle = await readLegacyFile(new Blob([readFileSync(exportPath!)]))
    const { analysis: a } = await analyseLegacy(bundle, undefined, targets)
    console.log('targets', targets.length, 'kinds', a.kinds, 'images', a.images, 'placements', a.placements)
    const by = (pred: (r: typeof a.review[number]) => boolean) => a.review.filter(pred).map(r => `${r.kind}:${r.name}`)
    console.log('keep', by(r => r.decision.action === 'keep').join(' | '))
    for (const r of a.review.filter(r => r.status === 'fuzzy')) console.log('fuzzy', r.kind, r.name, `(${r.level})`, '→', r.candidates[0]?.name, `(${r.candidates[0]?.level})`, r.via)
    const unlinked = bundle.encounterTokens.filter(t => t.linked_record_id && a.review.some(r => r.recordId === t.linked_record_id && r.status === 'unmatched'))
    console.log('placements without match', unlinked.map(t => bundle.records.find(r => r.id === t.linked_record_id)?.name))

    expect(a.images.exact).toBeGreaterThanOrEqual(973)
    expect(a.placements.linked).toBe(62)
  }, 600_000)
})
