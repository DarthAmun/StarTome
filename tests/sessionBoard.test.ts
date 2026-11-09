import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { DB_NAME } from '~/utils/appNamespace'
import { boardText, legacySessionToBoard } from '~/utils/sessionBoard'
import { collectCampaignRows, importPayload, CAMPAIGN_TABLES } from '~/sync/backup'

describe('legacySessionToBoard', () => {
  it('splits prep at headings into scenes, keeps the preamble as a note and the notes as a log', () => {
    const { panels, edges } = legacySessionToBoard({
      mode: 'finished',
      scriptContent: 'Bring dice.\n\n## Opening\nThe tavern burns.\n\n---\n\n## The Docks\nSmugglers at pier 4.\n### Aftermath\nQuiet.',
      notesContent: 'They bribed the dockmaster.',
    }, 1, 7)
    expect(panels.map(p => [p.kind, p.title, p.content, p.status])).toEqual([
      ['note', 'Prep', 'Bring dice.', undefined],
      ['scene', 'Opening', 'The tavern burns.', 'played'],
      ['scene', 'The Docks', 'Smugglers at pier 4.', 'played'],
      ['scene', 'Aftermath', 'Quiet.', 'played'],
      ['log', 'Notes (from the old editor)', 'They bribed the dockmaster.', undefined],
    ])
    expect(panels.every(p => p.session_id === 7 && p.campaign_id === 1)).toBe(true)
    // Scenes are chained in their old order
    const scenes = panels.filter(p => p.kind === 'scene')
    expect(edges.map(e => [e.source, e.target, e.kind])).toEqual([
      [scenes[0].uid, scenes[1].uid, 'plan'], [scenes[1].uid, scenes[2].uid, 'plan'],
    ])
  })

  it('leaves scenes planned while planning, ignores headings in code blocks, falls back to content for notes', () => {
    const { panels } = legacySessionToBoard({ mode: 'planning', scriptContent: '## A\n```\n# not a heading\n```', content: 'old notes' }, 1, 2)
    expect(panels.map(p => [p.kind, p.title, p.status])).toEqual([['scene', 'A', 'planned'], ['log', 'Notes (from the old editor)', undefined]])
    expect(panels[0].content).toContain('# not a heading')
  })

  it('turns an empty session into an empty board', () => {
    expect(legacySessionToBoard({}, 1, 2)).toEqual({ panels: [], edges: [] })
  })
})

describe('boardText', () => {
  it('reads panels top to bottom and keeps the links of link-only panels', () => {
    const text = boardText([
      { kind: 'scene', title: 'Later', content: 'Meet {{npc: Vex}}', attrs: {}, x: 0, y: 100 },
      { kind: 'encounter', title: 'Ambush', content: '', attrs: { encounterId: 3 }, x: 0, y: 0 },
      { kind: 'frame', title: 'Act 1', content: '', attrs: {}, x: 0, y: -50 },
    ])
    expect(text).toBe('### Ambush\n{{encounter: Ambush}}\n\n### Later\nMeet {{npc: Vex}}')
  })
})

describe('v19 upgrade and imports', () => {
  it('converts stored sessions into boards and rebuilds their links', async () => {
    const old = new Dexie(DB_NAME)
    // The v18 store list, enough of it for the entities
    old.version(18).stores({
      campaigns: '++id, updated_at, system_id', entities: '++id, campaign_id, type, name, [campaign_id+type], [campaign_id+updated_at]',
      entityLinks: '++id, source_id, target_type, target_name',
    })
    await old.open()
    await old.table('campaigns').add({ name: 'C', description: '', created_at: '', updated_at: '' })
    await old.table('entities').add({ campaign_id: 1, type: 'session', name: 'S1', content: 'notes about {{npc: Kib}}', attributes: { mode: 'finished', scriptContent: '## Road\nMeet {{npc: Vex}}', notesContent: 'notes about {{npc: Kib}}' } })
    await old.table('entities').add({ campaign_id: 1, type: 'npc', name: 'Vex', content: '', attributes: {} })
    await old.table('entityLinks').add({ source_id: 1, target_type: 'npc', target_name: 'Kib', metadata: {} })
    old.close()

    const db = getDb()
    await db.open()
    const panels = await db.sessionPanels.where('session_id').equals(1).toArray()
    expect(panels.map(p => [p.kind, p.title, p.status])).toEqual([['scene', 'Road', 'played'], ['log', 'Notes (from the old editor)', undefined]])
    const session = (await db.entities.get(1))!
    expect((session.attributes as any).board.migrated).toBe(true)
    // The old fields stay for one release
    expect((session.attributes as any).scriptContent).toContain('Road')
    expect(session.content).toContain('Meet {{npc: Vex}}')
    const links = await db.entityLinks.where('source_id').equals(1).toArray()
    expect(links.map(l => l.target_name).sort()).toEqual(['Kib', 'Vex'])
  })

  it('copies a board into another campaign with its entries remapped', async () => {
    const db = getDb()
    await db.open()
    const rows = await collectCampaignRows([1])
    expect(rows.sessionPanels.length).toBe(2)
    expect(CAMPAIGN_TABLES).toContain('sessionPanels')
    rows.sessionPanels.push({ ...rows.sessionPanels[0], id: 99, uid: 'x', kind: 'entity', title: 'Vex', attrs: { entityId: 2, entityType: 'npc' }, session_id: null })
    await importPayload({ version: 2, app: 'startome', type: 'campaigns', exportedAt: '', ...rows } as any, { mode: 'merge', sections: new Set(CAMPAIGN_TABLES) })
    const copy = (await db.campaigns.toArray()).find(c => c.id !== 1)!
    const newSession = (await db.entities.where('campaign_id').equals(copy.id!).filter(e => e.type === 'session').first())!
    const newVex = (await db.entities.where('campaign_id').equals(copy.id!).filter(e => e.name === 'Vex').first())!
    const copied = await db.sessionPanels.where('campaign_id').equals(copy.id!).toArray()
    expect(copied.filter(p => p.session_id === newSession.id)).toHaveLength(2)
    const card = copied.find(p => p.kind === 'entity')!
    expect(card.session_id).toBeNull()
    expect(card.attrs.entityId).toBe(newVex.id)
    // Already a board: not converted a second time
    expect(copied).toHaveLength(3)
  })
})

describe('logsInOrder', () => {
  it('orders logs by time and finds what they are attached to', async () => {
    const { logsInOrder } = await import('~/utils/sessionBoard')
    const scene = { uid: 's', kind: 'scene' as const, attrs: {}, x: 0, y: 0 }
    const late = { uid: 'l2', kind: 'log' as const, attrs: { at: '2026-01-01T20:00:00Z' }, x: 0, y: 0 }
    const early = { uid: 'l1', kind: 'log' as const, attrs: { at: '2026-01-01T19:00:00Z' }, x: 0, y: 0 }
    const out = logsInOrder([scene, late, early], [{ id: 'e', source: 's', target: 'l2', kind: 'attach' }])
    expect(out.map(o => [o.log.uid, o.attachedTo.map(p => p.uid)])).toEqual([['l1', []], ['l2', ['s']]])
  })
})

describe('play helpers', () => {
  it('rolls on a table with its die and finds the row', async () => {
    const { rollOnTable } = await import('~/utils/sessionBoard')
    const table = { die: 'd6', rows: [{ min: 1, max: 3, result: 'Rain' }, { min: 4, max: 6, result: 'Sun' }] }
    expect(rollOnTable(table, () => 0)).toEqual({ roll: 1, result: 'Rain' })
    expect(rollOnTable(table, () => 0.99)).toEqual({ roll: 6, result: 'Sun' })
    expect(rollOnTable({ rows: [] }, () => 0.5)).toEqual({ roll: 11, result: '—' })
  })

  it('sums up a resolved encounter', async () => {
    const { encounterOutcome } = await import('~/utils/sessionBoard')
    expect(encounterOutcome({
      name: 'Ambush',
      combat_log: [{ round: 1, type: 'damage' }, { round: 3, type: 'death', tokenName: 'Zix' }, { round: 3, type: 'death', tokenName: 'Goblin' }],
      defeated: [{ name: 'Goblin' }, { name: 'Goblin' }, { name: 'Hobgoblin' }],
      xp_awarded: 80,
      resolution: { loot: { entries: [{}, {}], cp: 1200 } },
    })).toBe('Resolved {{encounter: Ambush}} after 3 rounds.\n- Defeated: 2× Goblin, Hobgoblin\n- Went down: Zix\n- XP: 80 each\n- Loot to the stash: 2 items and 12 gp')
  })
})

describe('finishing a session', () => {
  it('lists unused prep with its defaults', async () => {
    const { finishReviewRows } = await import('~/utils/sessionBoard')
    const panels = [
      { kind: 'scene' as const, status: 'planned', attrs: {} },
      { kind: 'scene' as const, status: 'played', attrs: {} },
      { kind: 'scene' as const, status: 'continued', attrs: {} },
      { kind: 'beat' as const, status: 'open', attrs: {} },
      { kind: 'clue' as const, status: 'revealed', attrs: {} },
      { kind: 'reward' as const, status: 'pending', attrs: {} },
      { kind: 'encounter' as const, attrs: { encounterId: 1 } },
      { kind: 'encounter' as const, attrs: { encounterId: 2 } },
      { kind: 'note' as const, attrs: {} },
    ]
    const rows = finishReviewRows(panels, id => id === 2)
    expect(rows.map(r => [r.panel.kind, r.reason, r.choice, r.copy])).toEqual([
      ['scene', 'not played', 'drawer', false],
      ['scene', 'continued', 'next', true],
      ['beat', 'not done', 'next', false],
      ['reward', 'not awarded', 'next', false],
      ['encounter', 'not run', 'next', false],
    ])
  })

  it('lays carried-over panels out in a frame below the board', async () => {
    const { carryOverLayout } = await import('~/utils/sessionBoard')
    const { frame, spots } = carryOverLayout([{ kind: 'scene', x: 100, y: 0 }, { kind: 'frame', x: -50, y: 300, h: 400 }], 5)
    expect(frame).toEqual({ x: -50, y: 780, w: 1190, h: 520 })
    expect(spots[4]).toEqual({ x: 30, y: 290 })
    expect(carryOverLayout([], 1).frame.y).toBe(0)
  })
})
