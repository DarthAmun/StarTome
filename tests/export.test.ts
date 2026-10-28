import { describe, expect, it } from 'vitest'
import { buildQuestBoard, imageIdsOf, itemRefNames, planRulesImport, rulesForExport } from '~/converters/export'
import { newRulesEntity } from '~/rules/factory'
import type { Item, RulesEntity } from '~/types/rules'

const synced = (over: Partial<RulesEntity> = {}) =>
  ({ ...newRulesEntity('creature', { name: 'Goblin Warrior', game: 'pf2e', origin: 'foundry' }), id: 'fvtt:pf2e:bestiary:abc', ...over }) as RulesEntity

describe('rules export', () => {
  it('exports user/legacy entries in full and only user-owned fields of synced ones', () => {
    const user = newRulesEntity('item', { name: 'Sturmperle', game: 'pf2e' })
    const legacy = newRulesEntity('creature', { name: 'Winter Wolf', game: 'pf2e', origin: 'legacy' })
    const plain = synced({ id: 'fvtt:pf2e:bestiary:plain' })
    const edited = synced({ img: 'img:p1', isFavorite: true, localEdits: { hp: 9 }, gmNotes: '', tags: [] })
    const { entries, overlays } = rulesForExport([user, legacy, plain, edited])
    expect(entries.map(e => e.name)).toEqual(['Sturmperle', 'Winter Wolf'])
    expect(overlays).toEqual([{ id: edited.id, img: 'img:p1', isFavorite: true, localEdits: { hp: 9 } }])
  })

  it('collects referenced image ids', () => {
    expect(imageIdsOf([{ img: 'img:a', tokenImg: 'img:b' }, { img: 'https://x/y.png' }, { img: 'img:a' }])).toEqual(['a', 'b'])
  })

  it('merges overlays onto synced rows and reports missing ones', () => {
    const row = synced({ hp: 6 } as Partial<RulesEntity>)
    const user = newRulesEntity('item', { name: 'Sturmperle', game: 'pf2e' })
    const plan = planRulesImport(new Map([[row.id, row]]), [user], [
      { id: row.id, img: 'img:p1', hp: 999 },
      { id: 'fvtt:pf2e:bestiary:gone', img: 'img:p2' },
    ], '2026-10-28T00:00:00Z')
    expect(plan.put).toHaveLength(2)
    expect(plan.put[1]).toMatchObject({ id: row.id, img: 'img:p1', hp: 6, origin: 'foundry' })
    expect(plan.missing).toEqual(['fvtt:pf2e:bestiary:gone'])
  })
})

describe('quest board export', () => {
  it('strips GM-only text and resolves reward items', () => {
    const potion = { ...(newRulesEntity('item', { name: 'Minor Healing Potion', game: 'pf2e' }) as Item), level: 1, price: { cp: 400 }, traits: ['consumable'] }
    const out = buildQuestBoard('startome', { name: 'The Codex', game: 'pf2e' }, [{
      id: 7,
      name: 'Rats in the Cellar',
      content: 'Clear the cellar.\n\n> [!hidden]\n> The rats are wererats.\n\nAsk for {{item: Rope}}.',
      attributes: { status: 'active', questGiver: 'Ameiko', reward: '2 × {{item: Minor Healing Potion}} and 10 gp' },
    }], (name) => (name.toLowerCase() === 'minor healing potion' ? potion : undefined), '2026-10-28T00:00:00Z')
    const q = out.quests[0]
    expect(out.type).toBe('questboard')
    expect(q.description).not.toContain('wererats')
    expect(q.rewardItems).toEqual([
      { name: 'Minor Healing Potion', compendiumId: potion.id, level: 1, price: { cp: 400 }, rarity: 'common', traits: ['consumable'] },
      { name: 'Rope', compendiumId: null, level: null, price: null, rarity: null, traits: [] },
    ])
    expect(q).toMatchObject({ status: 'active', giver: 'Ameiko' })
  })

  it('finds item refs only', () => {
    expect(itemRefNames('{{npc: Ameiko}} {{item: Rope|qty=2}} {{item:Torch}}')).toEqual(['Rope', 'Torch'])
  })
})
