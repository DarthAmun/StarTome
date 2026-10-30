import { describe, expect, it } from 'vitest'
import { newRulesEntity } from '~/rules/factory'
import { checkHomebrewEntry, issuesReport, planHomebrewImport, readHomebrewText, type CheckOptions } from '~/rules/homebrew'
import type { Creature, Item, RulesEntity, Spell } from '~/types/rules'

let n = 0
const opts: CheckOptions = { now: '2026-10-30T12:00:00.000Z', game: 'sf2e', newId: () => `new-${++n}` }
const check = (raw: unknown) => checkHomebrewEntry(raw, 0, opts)
const errors = (raw: unknown) => check(raw).issues.filter(i => i.level === 'error').map(i => i.path)
const warnings = (raw: unknown) => check(raw).issues.filter(i => i.level === 'warning').map(i => `${i.path}: ${i.message}`)

const rifle = {
  id: 'rifle-1', origin: 'user', kind: 'item', game: 'sf2e', name: 'Arc Rifle', sortName: 'arc rifle',
  level: 5, rarity: 'uncommon', traits: ['tech', 'two-hand-d10'], description: 'Crackles.', sourceRefs: [],
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  category: 'weapon', price: { cp: 3500 }, bulk: 10,
  weapon: { category: 'martial', group: 'shock', damage: { dice: 1, die: 'd8', type: 'electricity' }, range: 60 },
}

const mercenary = {
  id: 'merc-1', kind: 'creature', name: 'Vesk Mercenary', level: 4, rarity: 'common', traits: ['humanoid', 'vesk'],
  description: '', size: 'med', perception: 11, senses: [{ type: 'low-light vision' }], languages: ['Common', 'Vesk'],
  skills: { athletics: 12 }, abilities: { str: 4, dex: 1, con: 3, int: 0, wis: 1, cha: 0 }, ac: 21,
  saves: { fort: 13, ref: 9, will: 10 }, hp: 60, immunities: [], weaknesses: [], resistances: [],
  speeds: { land: 25 }, strikes: [{ name: 'claw', range: 'melee', bonus: 14, traits: ['agile'], damage: [{ formula: '2d6+6', type: 'slashing' }] }],
  actions: [], spellcasting: [], inventory: [],
}

describe('homebrew file', () => {
  it('reads an export, a bare array, one entry, and pasted ```json fences', () => {
    expect(readHomebrewText(JSON.stringify({ version: 2, rules: [rifle] }))).toEqual({ entries: [rifle] })
    expect(readHomebrewText(JSON.stringify([rifle, mercenary]))).toEqual({ entries: [rifle, mercenary] })
    expect(readHomebrewText(JSON.stringify(rifle))).toEqual({ entries: [rifle] })
    expect(readHomebrewText('Here you go:\n```json\n' + JSON.stringify([rifle]) + '\n```\nEnjoy')).toEqual({ entries: [rifle] })
  })

  it('reports bad JSON and files without entries', () => {
    expect(readHomebrewText('{ nope')).toHaveProperty('error')
    expect(readHomebrewText('{"version": 2}')).toHaveProperty('error')
  })
})

describe('homebrew entry', () => {
  it('passes a well-formed entry through untouched', () => {
    const c = check(rifle)
    expect(c.issues).toEqual([])
    expect(c.entry).toMatchObject({ ...rifle, updatedAt: opts.now, createdAt: rifle.createdAt })
  })

  it('accepts a complete creature', () => {
    expect(check(mercenary).issues).toEqual([])
    expect((check(mercenary).entry as Creature).strikes[0].damage).toEqual([{ formula: '2d6+6', type: 'slashing' }])
  })

  it('fills missing fields from the blank entry with a warning', () => {
    const { traits: _t, description: _d, rarity: _r, game: _g, ...bare } = rifle
    const c = check(bare)
    expect(c.entry).toMatchObject({ traits: [], description: '', rarity: 'common', game: 'sf2e' })
    expect(c.issues.map(i => i.path).sort()).toEqual(['description', 'rarity', 'traits'])
    expect(c.issues.every(i => i.level === 'warning')).toBe(true)
  })

  it('rejects entries without a kind, a name or a required number', () => {
    expect(errors({ ...rifle, kind: 'spaceship' })).toEqual(['kind'])
    expect(errors({ ...rifle, name: undefined })).toEqual(['name'])
    expect(errors({ ...mercenary, hp: 'lots' })).toEqual(['hp'])
    expect(errors({ ...mercenary, saves: { fort: 1, ref: 2 } })).toEqual(['saves.will'])
    expect(check('nope').entry).toBeNull()
  })

  it('converts written units', () => {
    const c = check({ ...rifle, price: '350 credits', bulk: 'L', level: '5', traits: 'Tech, Two Hand d10' })
    expect(c.entry).toMatchObject({ price: { cp: 3500 }, bulk: 1, level: 5, traits: ['tech', 'two-hand-d10'] })
    expect(c.issues.every(i => i.level === 'warning')).toBe(true)
    expect(check({ ...rifle, price: { credits: 350 } }).entry).toMatchObject({ price: { cp: 3500 } })
    expect(check({ ...rifle, price: { gp: 12, sp: 5 } }).entry).toMatchObject({ price: { cp: 1250 } })
  })

  it('reads creature shorthands', () => {
    const c = check({
      ...mercenary, size: 'Large', speeds: 30, senses: ['darkvision'], skills: { Athletics: 12 },
      strikes: [{ ...mercenary.strikes[0], damage: ['2d6+6 slashing'] }],
    })
    const e = c.entry as Creature
    expect(e.size).toBe('lg')
    expect(e.speeds).toEqual({ land: 30 })
    expect(e.senses).toEqual([{ type: 'darkvision' }])
    expect(e.skills).toEqual({ athletics: 12 })
    expect(e.strikes[0].damage).toEqual([{ formula: '2d6+6', type: 'slashing' }])
  })

  it('drops a broken list element but keeps the entry', () => {
    const c = check({ ...mercenary, strikes: [mercenary.strikes[0], { name: 'tail' }] })
    expect((c.entry as Creature).strikes).toHaveLength(1)
    expect(c.issues.some(i => i.path === 'strikes[1]' && i.message === 'dropped')).toBe(true)
    expect(c.issues.every(i => i.level === 'warning')).toBe(true)
  })

  it('leaves out bad optional fields, unknown fields and app-owned ones', () => {
    const c = check({ ...rifle, usage: { hands: 2 }, img: 'img:x', localEdits: { hp: 1 }, flavor: 'x' })
    expect(c.entry).not.toHaveProperty('usage')
    expect(c.entry).not.toHaveProperty('img')
    expect(c.entry).not.toHaveProperty('flavor')
    expect(warnings({ ...rifle, flavor: 'x' })).toEqual(['flavor: unknown field; left out'])
  })

  it('reads spell defenses and costs', () => {
    const e = check({
      kind: 'spell', name: 'Static Lance', level: 3, rarity: 'common', traits: ['electricity'], description: '',
      spellType: 'spell', traditions: ['arcane'], cast: '◆◆', defense: { save: 'Reflex', basic: true },
      damage: [{ formula: '6d6', type: 'electricity' }],
    }).entry as Spell
    expect(e.cast).toBe(2)
    expect(e.defense).toEqual({ save: 'ref', basic: true })
    expect(check({ ...e, defense: { ac: true } }).entry).toMatchObject({ defense: { ac: true } })
    expect(check({ ...e, defense: null }).entry).toMatchObject({ defense: null })
  })

  it('accepts plural kinds and forces origin and sortName', () => {
    const c = check({ ...rifle, kind: 'items', origin: 'foundry', sortName: 'wrong' })
    expect(c.entry).toMatchObject({ kind: 'item', origin: 'user', sortName: 'arc rifle', sourceRefs: [] })
  })

  it('gives entries without an id a new one', () => {
    const { id: _id, ...noId } = rifle
    expect(check(noId).entry!.id).toMatch(/^new-/)
  })
})

describe('homebrew plan', () => {
  const checked = (raw: unknown, index = 0) => checkHomebrewEntry(raw, index, opts)

  it('marks new entries and updates, keeping the portrait of the replaced row', () => {
    const prev = { ...newRulesEntity('item', { name: 'Arc Rifle', game: 'sf2e' }), id: 'rifle-1', img: 'img:p', isFavorite: true, createdAt: '2026-01-01T00:00:00.000Z' } as RulesEntity
    const rows = planHomebrewImport([checked(rifle), checked(mercenary, 1)], new Map([[prev.id, prev]]), new Map(), () => 'fresh')
    expect(rows.map(r => r.status)).toEqual(['update', 'new'])
    expect(rows[0].entry).toMatchObject({ img: 'img:p', isFavorite: true, createdAt: '2026-01-01T00:00:00.000Z', price: { cp: 3500 } })
  })

  it('gives a fresh id to ids of synced entries and repeats in the file', () => {
    const synced = { ...newRulesEntity('item', { name: 'X', game: 'sf2e', origin: 'foundry' }), id: 'rifle-1' } as RulesEntity
    let i = 0
    const rows = planHomebrewImport([checked(rifle), checked(mercenary), checked(mercenary, 2)], new Map([[synced.id, synced]]), new Map(), () => `fresh-${++i}`)
    expect(rows.map(r => r.entry!.id)).toEqual(['fresh-1', 'merc-1', 'fresh-2'])
    expect(rows.map(r => r.status)).toEqual(['new', 'new', 'new'])
  })

  it('points out same-named entries and keeps errors out', () => {
    const twin = { ...newRulesEntity('item', { name: 'Arc Rifle', game: 'sf2e', origin: 'foundry' }), id: 'fvtt:x' } as Item
    const rows = planHomebrewImport([checked(rifle), checked({ kind: 'nope' }, 1)], new Map(), new Map([['item:arc rifle', [twin]]]), () => 'fresh')
    expect(rows[0].issues.map(i => i.message)).toEqual(['a Foundry item with this name already exists'])
    expect(rows[1]).toMatchObject({ status: 'error', entry: null })
    expect(issuesReport(rows)).toContain('#2) — NOT IMPORTED')
  })
})
