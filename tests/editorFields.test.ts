import { describe, expect, it } from 'vitest'
import { newRulesEntity } from '@/domain/rules/factory'
import { getPath } from '@/domain/rules/edits'
import { RULES_KINDS } from '@/domain/rules/types'
import { COMMON_FIELDS, KIND_SECTIONS, read, show, type Field } from '@/features/compendium/editorFields'

const field = (codec: Field['codec']): Field => ({ path: 'x', label: 'X', codec })

describe('entry editor fields', () => {
  it('shows every field of a blank entry of every kind and reads it back unchanged', () => {
    for (const kind of RULES_KINDS) {
      const entry = newRulesEntity(kind, { name: 'Blank', game: 'pf2e' })
      const fields = [...COMMON_FIELDS, ...KIND_SECTIONS[kind].flatMap(s => s.fields)].filter(f => !f.when || f.when(entry as unknown as Record<string, unknown>))
      for (const f of fields) {
        const value = getPath(entry, f.path)
        const back = read(f, show(f, value, 'pf2e'), 'pf2e', value)
        // An empty optional field may come back as "not set" as false or as an empty list
        const same = JSON.stringify(back ?? null) === JSON.stringify(value ?? null) || (back === undefined || back === '' || back === false || (Array.isArray(back) && !back.length)) && (value === undefined || value === null || value === '')
        expect(same, `${kind}.${f.path}: ${JSON.stringify(value)} came back as ${JSON.stringify(back)}`).toBe(true)
      }
    }
  })

  it('reads prices in the game\'s money, damage, defenses and action costs', () => {
    expect(read(field('price'), '12', 'pf2e', null)).toEqual({ cp: 1200 })
    expect(read(field('price'), '12', 'sf2e', null)).toEqual({ cp: 120 })
    expect(show(field('price'), { cp: 120 }, 'sf2e')).toBe('12')
    expect(read(field('price'), '', 'pf2e', null)).toBeNull()
    expect(read(field('damage'), '1d8+4 slashing plus 1d6 fire', 'pf2e', [])).toEqual([{ formula: '1d8+4', type: 'slashing' }, { formula: '1d6', type: 'fire' }])
    expect(read(field('defense'), 'basic-ref', 'pf2e', null)).toEqual({ save: 'ref', basic: true })
    expect(show(field('defense'), { ac: true }, 'pf2e')).toBe('ac')
    expect(read(field('cost'), 'reaction', 'pf2e', null)).toBe('reaction')
    expect(read(field('optNumber'), '', 'pf2e', 3)).toBeUndefined()
  })

  it('refuses JSON that is not what the field holds', () => {
    expect(() => read(field('json'), '{ "a": 1 }', 'pf2e', [])).toThrow()
    expect(() => read(field('json'), '[1,', 'pf2e', [])).toThrow()
    expect(read(field('json'), '', 'pf2e', [])).toEqual([])
  })
})
