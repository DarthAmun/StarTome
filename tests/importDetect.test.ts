import { describe, expect, it } from 'vitest'
import { detectImport, isZip } from '~/sync/importDetect'

const kind = (v: unknown) => detectImport(typeof v === 'string' ? v : JSON.stringify(v)).kind

describe('import detection', () => {
  it('tells zips apart by their header, else by name', () => {
    expect(isZip('x.json', new Uint8Array([0x50, 0x4b, 3, 4]))).toBe(true)
    expect(isZip('json-assets.zip', new Uint8Array([0x7b, 0x22]))).toBe(false)
    expect(isZip('json-assets.zip')).toBe(true)
  })

  it('routes StarTome backups, campaign files and token files to the import dialog', () => {
    expect(kind({ version: 2, app: 'startome', type: 'all', campaigns: [{ id: 1 }], rules: [] })).toBe('backup')
    expect(kind({ version: 2, app: 'startome', type: 'campaigns', campaigns: [{ id: 1 }], entities: [] })).toBe('backup')
    expect(kind({ version: 2, app: 'startome', type: 'tokens', tokens: [{ id: 1 }] })).toBe('backup')
    expect(kind('Here it is:\n```json\n{"version":2,"campaigns":[{"id":1}]}\n```')).toBe('backup')
  })

  it('routes DM\'s Tome exports to the DM\'s Tome import', () => {
    expect(kind({ version: 1, campaigns: [] })).toBe('legacy')
  })

  it('routes compendium entries to the homebrew import', () => {
    expect(kind({ version: 2, app: 'startome', type: 'campaigns', rules: [{ kind: 'item' }] })).toBe('homebrew')
    expect(kind([{ kind: 'feat', name: 'X' }])).toBe('homebrew')
    expect(kind({ kind: 'spell', name: 'X' })).toBe('homebrew')
    expect(kind('```json\n[{"kind":"item"}]\n```')).toBe('homebrew')
  })

  it('explains what it does not recognise', () => {
    expect(kind('hello')).toBe('unknown')
    expect(kind({ foo: 1 })).toBe('unknown')
  })
})
