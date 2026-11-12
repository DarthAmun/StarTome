import { describe, expect, it } from 'vitest'
import { buildQuestBoard, markdownFiles, singleMarkdown, toWikiLinks } from '@/domain/loreExport'
import { zCampaign, zEntry, type Entry } from '@/domain/schema'

const T = '2026-11-12T00:00:00.000Z'
const campaign = zCampaign.parse({ id: 'c1', name: 'The Codex', description: 'Ink.', game: 'pf2e', rules: {}, createdAt: T, updatedAt: T })
const entry = (e: Record<string, unknown>): Entry => zEntry.parse({ campaignId: 'c1', createdAt: T, updatedAt: T, data: {}, ...e })
const entries = [
  entry({ id: 'e1', type: 'npc', name: 'Kib', tags: ['ally'], body: 'Lives in {{location: Keep | entry}}.\n\n> [!hidden] Secret\n> Is a spy.', data: { title: 'Scout', level: '7', class: 'Rogue' } }),
  entry({ id: 'e2', type: 'quest', name: 'Find: the Seal?', body: 'Ask {{npc: Kib}}.\n\n> [!hidden]\n> It is fake.', data: { status: 'active', giver: { name: 'Kib' }, reward: '20 gp and a {{item: Healing Potion}} or {{item: Unknown Thing}}' } }),
  entry({ id: 'e3', type: 'random-table', name: 'Weather', data: { die: 'd6', rows: [{ min: 1, max: 3, result: 'Rain' }, { min: 4, max: 4, result: 'A | B' }] } }),
  entry({ id: 'e4', type: 'npc', name: 'Kib' }),
]

describe('lore exports', () => {
  it('turns references into wiki links and rolls into code', () => {
    expect(toWikiLinks('{{npc: Kib}} rolls {{roll: 2d6}} at {{table: Weather | entry}}')).toBe('[[Kib]] rolls `2d6` at [[Weather]]')
  })

  it('writes one Markdown file per entry with frontmatter, safe unique paths, and GM text only on request', () => {
    const files = markdownFiles(entries, false)
    expect(files.map(f => f.path)).toEqual(['NPCs/Kib.md', 'Quests/Find_ the Seal_.md', 'Random Tables/Weather.md', 'NPCs/Kib 2.md'])
    expect(files[0]?.text).toBe('---\ntype: npc\ntitle: Scout\nlevel: 7\nclass: Rogue\nalive: yes\ntags: [ally]\n---\n\n# Kib\n\nLives in [[Keep]].\n')
    expect(files[2]?.text).toContain('| d6 | Result |\n|---|---|\n| 1–3 | Rain |\n| 4 | A \\| B |')
    expect(markdownFiles(entries, true)[0]?.text).toContain('Is a spy.')
  })

  it('writes the campaign as one file, grouped by type', () => {
    const text = singleMarkdown(campaign, entries, false)
    expect(text.startsWith('# The Codex\n\nGame: Pathfinder 2e\n\nInk.\n')).toBe(true)
    expect(text.indexOf('## NPCs')).toBeLessThan(text.indexOf('## Quests'))
    expect(text).toContain('### Find: the Seal?\n\n- status: active\n- giver: Kib\n- reward: 20 gp')
    expect(text).not.toContain('It is fake')
    expect(singleMarkdown(campaign, entries, true)).toContain('It is fake')
  })

  it('builds the quest board: player-safe text, string ids, items looked up', () => {
    const board = buildQuestBoard(campaign, entries, name => (name === 'Healing Potion' ? { id: 'fvtt:pf2e:equipment:hp', name: 'Healing Potion', level: 1, price: { cp: 400 }, rarity: 'common', traits: ['healing'] } : undefined), T)
    expect(board).toMatchObject({ version: 2, type: 'questboard', campaign: { id: 'c1', name: 'The Codex', game: 'pf2e' } })
    expect(board.quests).toHaveLength(1)
    expect(board.quests[0]).toMatchObject({ id: 'e2', status: 'active', giver: 'Kib', description: 'Ask {{npc: Kib}}.' })
    expect(board.quests[0]?.rewardItems).toEqual([
      { name: 'Healing Potion', compendiumId: 'fvtt:pf2e:equipment:hp', level: 1, price: { cp: 400 }, rarity: 'common', traits: ['healing'] },
      { name: 'Unknown Thing', compendiumId: null, level: null, price: null, rarity: null, traits: [] },
    ])
  })
})
