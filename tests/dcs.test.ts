import { describe, expect, it } from 'vitest'
import { adjustDc, levelDc, parseDcQuery, rarityStep, recallKnowledge, simpleDc } from '~/rules/dcs'

describe('DCs by level', () => {
  it('matches GM Core at the edges and in between', () => {
    expect(levelDc(-1)).toBe(13)
    expect(levelDc(0)).toBe(14)
    expect(levelDc(1)).toBe(15)
    expect(levelDc(3)).toBe(18)
    expect(levelDc(10)).toBe(27)
    expect(levelDc(20)).toBe(40)
    expect(levelDc(25)).toBe(50)
  })

  it('clamps levels outside the table', () => {
    expect(levelDc(-5)).toBe(13)
    expect(levelDc(30)).toBe(50)
  })

  it('is the same table in SF2e', () => {
    for (let l = -1; l <= 25; l++) expect(levelDc(l, 'sf2e')).toBe(levelDc(l, 'pf2e'))
  })

  it('has simple DCs and adjustments', () => {
    expect(simpleDc('untrained')).toBe(10)
    expect(simpleDc('master')).toBe(30)
    expect(adjustDc(20, 'incredibly-easy')).toBe(10)
    expect(adjustDc(20, 'very-easy')).toBe(15)
    expect(adjustDc(20, 'easy')).toBe(18)
    expect(adjustDc(20, 'hard')).toBe(22)
    expect(adjustDc(20, 'very-hard')).toBe(25)
    expect(adjustDc(20, 'incredibly-hard')).toBe(30)
  })

  it('steps up by rarity', () => {
    expect(rarityStep('common')).toBe('normal')
    expect(rarityStep('uncommon')).toBe('hard')
    expect(rarityStep('rare')).toBe('very-hard')
    expect(rarityStep('unique')).toBe('incredibly-hard')
  })
})

describe('Recall Knowledge', () => {
  const base = { level: 5, rarity: 'common' as const, traits: [] as string[], game: 'pf2e' as const }

  it('uses the level DC adjusted for rarity, and Lore easy/very easy after that', () => {
    const rk = recallKnowledge({ ...base, rarity: 'rare', traits: ['undead'] })
    expect(rk.baseDc).toBe(20)
    expect(rk.dc).toBe(25)
    expect(rk.loreDcs).toEqual({ specific: 23, verySpecific: 20 })
  })

  it('lists each skill once across several traits', () => {
    const rk = recallKnowledge({ ...base, traits: ['beast', 'elemental', 'fire', 'undead'] })
    expect(rk.skills).toEqual(['arcana', 'nature', 'religion'])
  })

  it('leaves unmapped traits to the GM', () => {
    expect(recallKnowledge({ ...base, traits: ['trap', 'mechanical'] }).skills).toEqual([])
  })

  it('maps robots in SF2e only', () => {
    expect(recallKnowledge({ ...base, game: 'sf2e', traits: ['robot'] }).skills).toEqual(['computers', 'crafting'])
    expect(recallKnowledge({ ...base, traits: ['robot'] }).skills).toEqual([])
    expect(recallKnowledge({ ...base, game: 'both', traits: ['robot'] }, 'sf2e').skills).toEqual(['computers', 'crafting'])
  })
})

describe('palette DC query', () => {
  it('reads level questions', () => {
    expect(parseDcQuery('7')).toEqual({ kind: 'level', level: 7, step: null, dc: 23 })
    expect(parseDcQuery('level 7 hard')).toEqual({ kind: 'level', level: 7, step: 'hard', dc: 25 })
    expect(parseDcQuery('L7 very hard')?.dc).toBe(28)
    expect(parseDcQuery('7 unique')?.dc).toBe(33)
    expect(parseDcQuery('-1')?.dc).toBe(13)
  })

  it('reads simple DCs', () => {
    expect(parseDcQuery('trained')).toEqual({ kind: 'simple', rank: 'trained', step: null, dc: 15 })
    expect(parseDcQuery('exp easy')?.dc).toBe(18)
  })

  it('rejects anything else', () => {
    expect(parseDcQuery('')).toBeNull()
    expect(parseDcQuery('7 banana')).toBeNull()
    expect(parseDcQuery('goblin')).toBeNull()
  })
})
