/**
 * Guards the side-by-side guarantee with DM's Tome: no browser-storage name may
 * be hard-coded outside utils/appNamespace.ts. Also catches regressions brought
 * in by cherry-picks from upstream.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const SOURCE_DIRS = ['components', 'composables', 'pages', 'stores', 'plugins', 'utils', 'app.vue']

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) readdirSync(p).forEach(n => walk(join(p, n)))
    else if (/\.(ts|vue)$/.test(p) && !p.endsWith('appNamespace.ts')) out.push(p)
  }
  SOURCE_DIRS.forEach(d => walk(join(root, d)))
  return out
}

const RULES: { name: string; re: RegExp }[] = [
  { name: 'literal localStorage key', re: /localStorage\.(?:get|set|remove)Item\(\s*['"`]/ },
  { name: 'literal BroadcastChannel name', re: /new BroadcastChannel\(\s*['"`]/ },
  // '_blank' & co. are browser keywords, not named windows
  { name: 'literal window.open target', re: /window\.open\([^,()]+,\s*['"`](?!_)/ },
  { name: 'literal Dexie database name', re: /(?:new Dexie|super)\(\s*['"`]/ },
  { name: 'DM\'s Tome storage name', re: /(?<!lsKey\()['"`](?:dmstome[.-]|dmforge|dmscreen-|sb-collapsed)/ },
]

describe('storage isolation', () => {
  const files = sourceFiles()

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  for (const rule of RULES) {
    it(`has no ${rule.name}`, () => {
      const hits: string[] = []
      for (const f of files) {
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line)) return   // comments may mention old names
          if (rule.re.test(line)) hits.push(`${relative(root, f)}:${i + 1}: ${line.trim()}`)
        })
      }
      expect(hits).toEqual([])
    })
  }
})
