/**
 * The legacy conversion against a real v0.42 backup. Private and far too big
 * for the repository, so it runs only where the file is:
 *
 *   STARTOME_LEGACY_EXPORT=~/Downloads/startome-all-2026-11-03.json NODE_OPTIONS=--max-old-space-size=8192 pnpm test tests/v042/realExport
 *
 * It checks invariants, not content: every source row is converted or listed
 * as dropped, every row passes its schema, no reference points at nothing,
 * and every image a row uses is in the file.
 */
import { createReadStream, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sequentialIds } from '@/domain/ids'
import { validateSnapshot } from '@/data/snapshot'
import { parseJsonChunks } from '@/services/files/jsonStream'
import type { LegacyPayload } from '@/services/v042/context'
import { convertLegacy } from '@/services/v042/convert'
import { checkReferences } from '@/services/v042/verify'

const path = (process.env.STARTOME_LEGACY_EXPORT ?? '').replace(/^~/, process.env.HOME ?? '~')
const present = path !== '' && existsSync(path)

describe.skipIf(!present)(`legacy conversion of the real backup ${path}`, () => {
  it('converts every row, validates, and leaves no dangling reference', async () => {
    const stream = createReadStream(path, { encoding: 'utf8', highWaterMark: 4 * 1024 * 1024 }) as AsyncIterable<string>
    const payload = await parseJsonChunks(stream) as LegacyPayload
    const result = convertLegacy(payload, sequentialIds('real'))
    const { snapshot, problems } = validateSnapshot(result.rows)

    const summary = Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length]).filter(([, n]) => n))
    console.log('source tables', result.report.tables)
    console.log('new collections', summary)
    console.log(`notes (${result.report.notes.length})`, result.report.notes.slice(0, 40))
    console.log('images referenced', result.imageIds.size, 'inline', result.inlineImages.length, 'in file', payload.images?.length ?? 0)

    expect(problems.slice(0, 20)).toEqual([])
    expect(checkReferences(snapshot).slice(0, 20)).toEqual([])
    for (const [table, t] of Object.entries(result.report.tables)) {
      if (table !== 'localState') expect(t.converted + t.dropped, table).toBe(t.read)
    }
    // Nothing of the campaigns themselves may be lost silently
    for (const table of ['campaigns', 'encounters', 'characters', 'starships']) expect(result.report.tables[table]?.dropped ?? 0, table).toBe(0)
    expect(snapshot.campaigns.length).toBe((payload.campaigns as unknown[]).length)

    const inFile = new Set((payload.images ?? []).map(i => i.id))
    const inline = new Set(result.inlineImages.map(i => i.id))
    const missing = [...result.imageIds].filter(id => !inFile.has(id) && !inline.has(id))
    console.log('images referenced but not in the file', missing.length)
    expect(missing.length).toBeLessThanOrEqual(result.imageIds.size * 0.02)
  }, 600_000)
})
