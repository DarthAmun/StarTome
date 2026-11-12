import { describe, expect, it } from 'vitest'
import { parseCommand } from '@/domain/commands'

describe('command bar commands', () => {
  it('reads new entries with type words and names', () => {
    expect(parseCommand('new npc Captain Ilsa Varn')).toEqual({ kind: 'new', type: 'npc', name: 'Captain Ilsa Varn' })
    expect(parseCommand('add table')).toEqual({ kind: 'new', type: 'random-table', name: '' })
    expect(parseCommand('> new region Old Town')).toEqual({ kind: 'new', type: 'region', name: 'Old Town' })
    expect(parseCommand('new gizmo x')).toBeNull()
  })

  it('reads rolls, with or without the word', () => {
    expect(parseCommand('roll 2d6+3')).toEqual({ kind: 'roll', expr: '2d6+3' })
    expect(parseCommand('d20 + 7')).toEqual({ kind: 'roll', expr: 'd20 + 7' })
    expect(parseCommand('dark elf')).toBeNull()
    expect(parseCommand('d20 goblins')).toBeNull()
  })

  it('reads commands on the open entry and the mode', () => {
    expect(parseCommand('rename Kib the Bold')).toEqual({ kind: 'rename', name: 'Kib the Bold' })
    expect(parseCommand('append They met at dawn.')).toEqual({ kind: 'append', text: 'They met at dawn.' })
    expect(parseCommand('delete')).toEqual({ kind: 'delete' })
    expect(parseCommand('favourite')).toEqual({ kind: 'favorite' })
    expect(parseCommand('light')).toEqual({ kind: 'mode', mode: 'light' })
    expect(parseCommand('delete everything')).toBeNull()
    expect(parseCommand('tibbin')).toBeNull()
  })

  it('answers DC questions for the campaign\'s game', () => {
    expect(parseCommand('dc 5')).toMatchObject({ kind: 'dc', dc: { kind: 'level', level: 5, dc: 20 } })
    expect(parseCommand('dc level 5 hard')).toMatchObject({ kind: 'dc', dc: { dc: 22 } })
    expect(parseCommand('dc expert')).toMatchObject({ kind: 'dc', dc: { kind: 'simple', rank: 'expert', dc: 20 } })
    expect(parseCommand('dc of doom')).toBeNull()
  })
})
