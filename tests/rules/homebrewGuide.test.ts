/**
 * HOMEBREW_FORMAT.md is what Claude writes homebrew from. Every JSON example in it, filled with
 * the common fields, must import as written: no errors and no fixes.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkHomebrewEntry, readHomebrewText } from '@/domain/rules/homebrew'

const guide = readFileSync(fileURLToPath(new URL('../../HOMEBREW_FORMAT.md', import.meta.url)), 'utf8')

/** The entries of every ```json block that is JSON (one entry, a list, or entries one after another). */
function examples(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const [, block] of guide.matchAll(/```json\n([\s\S]*?)```/g)) {
    const text = block!.trim()
    let data: unknown
    try { data = JSON.parse(text) } catch {
      try { data = JSON.parse(`[${text.replace(/\}\n\{/g, '},\n{')}]`) } catch { continue }
    }
    for (const e of Array.isArray(data) ? data : [data]) if (e && typeof e === 'object' && 'kind' in e) out.push(e as Record<string, unknown>)
  }
  return out
}

const common = (e: Record<string, unknown>, i: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, origin: 'user', name: `Example ${i}`, level: 0, rarity: 'common',
  traits: [], description: '', sourceRefs: [], game: 'sf2e', createdAt: '2026-11-15T12:00:00.000Z', updatedAt: '2026-11-15T12:00:00.000Z',
  ...e,
})

describe('the homebrew format guide', () => {
  const all = examples()

  it('has an example for every kind it describes', () => {
    expect(new Set(all.map(e => e.kind))).toEqual(new Set(['item', 'creature', 'hazard', 'spell', 'feat', 'action', 'condition', 'relicGift', 'vehicle',
      'starship', 'starshipFrame', 'battleStation', 'stationUpgrade', 'expansionBay', 'ancestry', 'class']))
  })

  it('every example imports as written, without a fix', () => {
    const problems = all.flatMap((e, i) => {
      const r = checkHomebrewEntry(common(e, i), i, { now: '2026-11-15T12:00:00.000Z', game: 'sf2e', newId: () => 'new' })
      return r.issues.map(x => `${String(e.kind)} ${x.level} ${x.path}: ${x.message}`)
    })
    expect(problems).toEqual([])
  })

  it('the file wrapper it shows is read as homebrew', () => {
    const r = readHomebrewText('{ "version": 2, "app": "startome", "type": "homebrew", "exportedAt": "2026-11-15T12:00:00.000Z", "rules": [{ "kind": "action", "name": "Dash", "cost": 1 }] }')
    expect('entries' in r && r.entries).toHaveLength(1)
  })
})
