/**
 * Opt-in smoke test over a full Foundry release (not part of the normal run):
 *   FOUNDRY_DIR=/path/with/pf2e-and-sf2e-extracted pnpm vitest run tests/foundryFull.smoke.test.ts
 * Expects <FOUNDRY_DIR>/pf2e/{packs,lang} and/or <FOUNDRY_DIR>/sf2e/{packs,lang}.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { convertFoundryDoc, kindOfFoundryType, sourceOf, type FoundryDoc } from '~/converters/foundry'
import { packGroup } from '~/converters/foundry/packs'
import { buildLocalizer } from '~/sync/foundryLang'

const dir = process.env.FOUNDRY_DIR

describe.skipIf(!dir)('full Foundry release', () => {
  for (const game of ['pf2e', 'sf2e'] as const) {
    const root = dir ? join(dir, game) : ''
    it.skipIf(!dir || !existsSync(root))(`converts every ${game} document without crashing`, () => {
      const lang = readdirSync(join(root, 'lang')).map(f => JSON.parse(readFileSync(join(root, 'lang', f), 'utf8')))
      const localize = buildLocalizer(lang)
      const packs = readdirSync(join(root, 'packs')).filter(f => !f.endsWith('_folders.json')).map(f => f.slice(0, -5))
      const index = new Map<string, { kind: string; name: string }>()
      const docsByPack = new Map<string, FoundryDoc[]>()
      for (const pack of packs) {
        if (packGroup(pack) === 'skip') continue
        const docs: FoundryDoc[] = JSON.parse(readFileSync(join(root, 'packs', `${pack}.json`), 'utf8'))
        docsByPack.set(pack, docs)
        for (const d of docs) {
          const kind = kindOfFoundryType(d.type)
          if (kind) index.set(sourceOf(d, { game, pack }), { kind, name: d.name })
        }
      }
      const issues = new Map<string, number>()
      const examples = new Map<string, string>()
      let converted = 0, failed = 0
      const t0 = Date.now()
      for (const [pack, docs] of docsByPack) {
        for (const d of docs) {
          const { entity, issues: iss } = convertFoundryDoc(d, { game, version: 'smoke', pack, resolveUuid: u => index.get(u) ?? null, localize })
          if (entity) converted++
          for (const i of iss) {
            issues.set(i.code, (issues.get(i.code) ?? 0) + 1)
            if (!examples.has(i.code)) examples.set(i.code, i.detail.slice(0, 160))
            if (i.code === 'convert-failed') failed++
          }
        }
      }
      console.log(`${game}: ${converted} converted in ${Date.now() - t0} ms, ${failed} failed`)
      for (const [code, n] of [...issues].sort((a, b) => b[1] - a[1])) console.log(`  ${code}: ${n}  e.g. ${examples.get(code)}`)
      expect(failed).toBe(0)
      expect(converted).toBeGreaterThan(1000)
    }, 300_000)
  }
})
