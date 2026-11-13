import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { campaignStats, cloneCampaign, deleteCampaign, updateCampaign } from '@/data/campaigns'
import { StarTomeDb, getDb, useDbForTests } from '@/data/db'
import { addCombatant, createEncounter, encounters } from '@/data/encounters'
import { createEntry, saveEntry } from '@/data/entries'
import { addEntry, adjustPurse, inventory, purseOf } from '@/data/inventory'
import { addCharacter, awardXp, ledgerOf, partyOf } from '@/data/party'
import { campaigns, createCampaign, entries, workspace } from '@/data/repo'
import { addEdge, addLog, addPanel, copyToDrawer, createSession, deletePanel, moveToDrawer, nextSession, patchPanel, placeFromDrawer, sendToSession, sessions } from '@/data/sessions'
import { sounds } from '@/data/sounds'
import { characterOwner } from '@/domain/rules/inventory'
import { boardText, carryOverLayout, encounterOutcome, finishReviewRows, logsInOrder, rollOnTable } from '@/domain/rules/sessionBoard'
import type { SessionPanel } from '@/domain/schema'
import { defaultLayout, freeSpot, newWidget, readPresets, readWidgets, tidy } from '@/features/desk/desk'

const C = 'camp-1'
let n = 0
beforeEach(async () => {
  useDbForTests(new StarTomeDb(`ses-${++n}`))
  await createCampaign({ id: C, name: 'Test', description: '', game: 'pf2e' })
})
const body = async (id: string) => (await entries.get(id))?.body

describe('session boards', () => {
  it('numbers new sessions and finds or makes the next one', async () => {
    const one = await createSession(C)
    expect(one).toMatchObject({ name: 'Session 1', data: { number: '1', mode: 'planning' } })
    expect(await nextSession(one, false)).toBeNull()
    const two = await nextSession(one, true)
    expect(two).toMatchObject({ name: 'Session 2', data: { number: '2' } })
    expect((await nextSession(one, true))?.id).toBe(two?.id)
    expect((await sessions.ofCampaign(C)).map(s => s.name)).toEqual(['Session 1', 'Session 2'])
  })

  it('keeps the session\'s text and links in step with its panels', async () => {
    const npc = await createEntry(C, 'npc', 'Mara')
    const s = await createSession(C)
    const scene = await addPanel({ campaignId: C, sessionId: s.id, kind: 'scene', x: 0, y: 0, title: 'The inn', body: 'Meet {{npc: Mara}}.' })
    await addPanel({ campaignId: C, sessionId: s.id, kind: 'frame', x: 0, y: 300 })
    expect(scene).toMatchObject({ status: 'planned', originSessionId: s.id })
    expect(await body(s.id)).toBe('### The inn\nMeet {{npc: Mara}}.')
    expect((await entries.linksTo(npc.id)).map(l => l.sourceId)).toEqual([s.id])
    await patchPanel(scene.id, { body: 'Nobody home.' })
    expect(await body(s.id)).toBe('### The inn\nNobody home.')
    expect(await entries.linksTo(npc.id)).toEqual([])
    await deletePanel(scene.id)
    expect(await body(s.id)).toBe('')
  })

  it('moves panels to the drawer and back, dropping their connections', async () => {
    const s = await createSession(C)
    const a = await addPanel({ campaignId: C, sessionId: s.id, kind: 'scene', x: 0, y: 0, title: 'A' })
    const b = await addPanel({ campaignId: C, sessionId: s.id, kind: 'scene', x: 300, y: 0, title: 'B' })
    await addEdge(s.id, a.id, b.id, 'plan')
    await addEdge(s.id, a.id, b.id, 'plan')
    expect(await sessions.edges(s.id)).toHaveLength(1)
    await moveToDrawer(b.id)
    expect((await sessions.drawer(C)).map(p => p.title)).toEqual(['B'])
    expect(await sessions.edges(s.id)).toEqual([])
    expect(await body(s.id)).toBe('### A')
    await placeFromDrawer(b.id, s.id, { x: 10, y: 20 })
    expect((await sessions.panels(s.id)).find(p => p.id === b.id)).toMatchObject({ x: 10, y: 20, sessionId: s.id })
    expect(await sessions.drawer(C)).toEqual([])
  })

  it('logs onto a panel as attached, or onto the board as improvised', async () => {
    const s = await createSession(C)
    const scene = await addPanel({ campaignId: C, sessionId: s.id, kind: 'scene', x: 100, y: 0, title: 'The gate' })
    const on = await addLog(s, 'They bribed the guard.', { attachTo: scene, playersShouldKnow: true })
    const free = await addLog(s, 'A storm broke.')
    expect(on.attrs).toMatchObject({ logType: 'happened', playersShouldKnow: true })
    expect(free.attrs).toMatchObject({ logType: 'improvised' })
    const read = logsInOrder(await sessions.panels(s.id), await sessions.edges(s.id))
    expect(read.map(r => [r.log.id, r.attachedTo.map(p => p.title)])).toEqual(expect.arrayContaining([[on.id, ['The gate']], [free.id, []]]))
  })

  it('carries panels to another session: moved into a frame, or copied as planned when a scene continues', async () => {
    const s = await createSession(C), next = await createSession(C)
    const beat = await addPanel({ campaignId: C, sessionId: s.id, kind: 'beat', x: 0, y: 0, title: 'Open beat' })
    const scene = await addPanel({ campaignId: C, sessionId: s.id, kind: 'scene', x: 300, y: 0, title: 'Long scene', status: 'continued' })
    await addEdge(s.id, beat.id, scene.id, 'plan')
    await sendToSession(s.id, next, [{ id: beat.id, copy: false }, { id: scene.id, copy: true }], 'From Session 1')
    const there = await sessions.panels(next.id)
    const frame = there.find(p => p.kind === 'frame')
    expect(frame).toMatchObject({ title: 'From Session 1' })
    expect(there.filter(p => p.kind !== 'frame').map(p => [p.title, p.status, p.parentId === frame?.id]).sort()).toEqual([['Long scene', 'planned', true], ['Open beat', 'open', true]])
    expect((await sessions.panels(s.id)).map(p => [p.title, p.status])).toEqual([['Long scene', 'continued']])
    expect(await sessions.edges(s.id)).toEqual([])
    expect(await body(next.id)).toContain('### Open beat')
  })

  it('copies a scene of another campaign into this drawer, fresh', async () => {
    await createCampaign({ id: 'other', name: 'Other', description: '', game: 'pf2e' })
    const theirs = await addPanel({ campaignId: 'other', sessionId: (await createSession('other')).id, kind: 'scene', x: 0, y: 0, title: 'Chase', status: 'played', tags: ['city'] })
    expect((await sessions.scenesElsewhere(C)).map(x => [x.panel.title, x.campaign])).toEqual([['Chase', 'Other']])
    const copy = await copyToDrawer(theirs, C, ['borrowed'])
    expect(copy).toMatchObject({ campaignId: C, sessionId: null, status: 'planned', tags: ['city', 'borrowed'] })
    expect(copy.id).not.toBe(theirs.id)
  })
})

describe('session board rules', () => {
  const p = (over: Partial<SessionPanel>): SessionPanel => ({ id: 'p', campaignId: C, sessionId: 's', kind: 'scene', title: '', body: '', status: null, attrs: {}, tags: [], x: 0, y: 0, w: null, h: null, parentId: null, originSessionId: null, createdAt: '', updatedAt: '', ...over })

  it('reads a board as text, top to bottom, link-only panels as their link', () => {
    expect(boardText([
      p({ kind: 'entity', title: 'Mara', attrs: { entryId: 'e', entryType: 'npc' }, y: 200 }),
      p({ title: 'First', body: ' text ', y: 0 }),
      p({ kind: 'frame', title: 'Group', y: 50 }),
      p({ kind: 'encounter', title: 'Ambush', attrs: { encounterId: 'x' }, y: 100 }),
    ])).toBe('### First\ntext\n\n### Ambush\n{{encounter: Ambush}}\n\n### Mara\n{{npc: Mara}}')
  })

  it('lists what did not come up with where it should go', () => {
    const rows = finishReviewRows([
      p({ id: 'a', status: 'planned' }), p({ id: 'b', status: 'played' }), p({ id: 'c', status: 'continued' }),
      p({ id: 'd', kind: 'beat', status: 'open' }), p({ id: 'e', kind: 'reward', status: 'pending' }),
      p({ id: 'f', kind: 'encounter', attrs: { encounterId: 'done' } }), p({ id: 'g', kind: 'encounter', attrs: { encounterId: 'open' } }),
    ], id => id === 'done')
    expect(rows.map(r => [r.panel.id, r.choice, r.copy])).toEqual([['a', 'drawer', false], ['c', 'next', true], ['d', 'next', false], ['e', 'next', false], ['g', 'next', false]])
    expect(rows.find(r => r.panel.id === 'e')?.choices).toEqual(['next', 'leave'])
  })

  it('lays carried-over panels out in a frame below what is there', () => {
    const { frame, spots } = carryOverLayout([p({ x: 100, y: 0 }), p({ kind: 'frame', x: 50, y: 300, h: 400 })], 5)
    expect(frame).toMatchObject({ x: 50, y: 780, w: 30 + 4 * 290, h: 60 + 2 * 230 })
    expect(spots[4]).toEqual({ x: 30, y: 290 })
  })

  it('rolls on a table and words an encounter\'s outcome', () => {
    expect(rollOnTable({ die: 'd6', rows: [{ min: 1, max: 3, result: 'low' }, { min: 4, max: 6, result: 'high' }] }, () => 0.99)).toEqual({ roll: 6, result: 'high' })
    expect(rollOnTable({ rows: [] }, () => 0)).toEqual({ roll: 1, result: '—' })
    expect(encounterOutcome({ name: 'Ambush', rounds: 3, defeated: ['Goblin', 'Goblin', 'Boss'], fallen: ['Boss', 'Hero'], xpEach: 80, lootStacks: 2, lootText: '15 gp' }))
      .toBe('Resolved {{encounter: Ambush}} after 3 rounds.\n- Defeated: 2× Goblin, Boss\n- Went down: Hero\n- XP: 80 each\n- Loot to the stash: 2 items and 15 gp')
  })
})

describe('campaigns', () => {
  async function filled() {
    const npc = await createEntry(C, 'npc', 'Mara')
    await saveEntry((await createEntry(C, 'note', 'Note')).id, { body: 'See {{npc: Mara}}.' })
    const hero = await addCharacter({ campaignId: C, name: 'Hero', role: 'pc', entryId: npc.id })
    await addEntry({ campaignId: C, owner: characterOwner(hero.id), name: 'Sword' })
    await adjustPurse(C, characterOwner(hero.id), 300)
    await awardXp({ campaignId: C, amount: 50, characterIds: [hero.id], source: 'accomplishment' })
    const enc = await createEncounter(C, 'Ambush')
    await addCombatant(enc.id, { x: 1, y: 1, ref: { kind: 'character', characterId: hero.id } })
    const s = await createSession(C)
    await addPanel({ campaignId: C, sessionId: s.id, kind: 'encounter', x: 0, y: 0, title: 'Ambush', attrs: { encounterId: enc.id } })
    await workspace.set(C, 'desk.scratchpad', 'notes')
    return { npc, hero, enc, s }
  }

  it('copies a campaign with new ids throughout and no history', async () => {
    const { npc, hero, enc } = await filled()
    const copy = await cloneCampaign(C)
    expect(copy).toMatchObject({ name: 'Test (Copy)' })
    const id = copy!.id
    expect(await campaignStats(id)).toEqual(await campaignStats(C))
    const mara = (await entries.ofCampaign(id)).find(e => e.name === 'Mara')!
    expect(mara.id).not.toBe(npc.id)
    expect((await entries.linksTo(mara.id)).length).toBe(1)
    const [member] = await partyOf(id)
    expect(member).toMatchObject({ name: 'Mara', entryId: mara.id, xp: 50 })
    expect(member!.id).not.toBe(hero.id)
    expect(await purseOf(id, characterOwner(member!.id))).toBe(300)
    expect((await inventory.ofCampaign(id)).map(r => r.ownerKey)).toEqual([characterOwner(member!.id)])
    const [theirEnc] = await encounters.ofCampaign(id)
    expect(theirEnc!.id).not.toBe(enc.id)
    expect((await encounters.combatants(theirEnc!.id))[0]?.ref).toEqual({ kind: 'character', characterId: member!.id })
    const [session] = await sessions.ofCampaign(id)
    expect((await sessions.panels(session!.id))[0]?.attrs).toEqual({ encounterId: theirEnc!.id })
    expect(await workspace.get(id, 'desk.scratchpad', '')).toBe('notes')
    expect(await ledgerOf(id)).toEqual([])
    // The original is as it was
    expect((await ledgerOf(C)).length).toBe(1)
    expect((await encounters.combatants(enc.id))[0]?.ref).toEqual({ kind: 'character', characterId: hero.id })
  })

  it('deletes a campaign with everything in it and nothing else', async () => {
    await filled()
    const copy = await cloneCampaign(C)
    await sounds.saveTrack({ name: 'Rain', type: 'url', src: 'x' })
    await deleteCampaign(C)
    expect((await campaigns.list()).map(c => c.id)).toEqual([copy!.id])
    const db = getDb()
    for (const name of ['entries', 'encounters', 'combatants', 'characters', 'inventory', 'purses', 'sessionPanels', 'partyLedger', 'workspace'] as const) {
      expect((await db.rows(name).toArray()).filter(r => 'campaignId' in r && r.campaignId === C), name).toEqual([])
    }
    expect((await db.rows('combatants').toArray()).length).toBe(1)
    expect((await entries.ofCampaign(copy!.id)).length).toBe(3)
    expect(await sounds.tracks()).toHaveLength(1)
  })

  it('changes settings without losing the others', async () => {
    await updateCampaign(C, { name: '  Renamed ', rules: { advancement: 'milestone', automation: { tickDown: false, dying: true, persistent: true } } })
    const c = await campaigns.get(C)
    expect(c).toMatchObject({ name: 'Renamed', rules: { advancement: 'milestone', abp: false, automation: { tickDown: false, dying: true } } })
  })
})

describe('sounds', () => {
  it('takes a deleted track out of every playlist', async () => {
    const a = await sounds.saveTrack({ name: 'A', type: 'url', src: 'a', tags: ['x'] }), b = await sounds.saveTrack({ name: 'B', type: 'url', src: 'b' })
    const list = await sounds.savePlaylist({ name: 'Mix', trackIds: [a.id, b.id] })
    await sounds.removeTrack(a.id)
    expect((await sounds.playlist(list.id))?.trackIds).toEqual([b.id])
    expect((await sounds.tracks()).map(t => t.name)).toEqual(['B'])
  })
})

describe('the Desk\'s layout', () => {
  it('reads stored layouts, dropping what is not a widget', () => {
    const read = readWidgets([{ id: 'a', kind: 'timer', x: 0, y: 0, width: 300, height: 200 }, { kind: 'dice' }, null, { kind: 'npc', entryId: 'e', x: '48', y: 0 }])
    expect(read.map(w => [w.kind, w.x, w.width])).toEqual([['timer', 0, 300], ['npc', 48, 384]])
    expect(readPresets([{ name: 'Night', widgets: [{ kind: 'timer' }] }, { widgets: [] }])).toMatchObject([{ name: 'Night', widgets: [{ kind: 'timer' }] }])
  })
  it('places new widgets where nothing is, and tidies without overlap', () => {
    const layout = defaultLayout()
    const overlap = (ws: typeof layout) => ws.some((a, i) => ws.some((b, j) => i < j && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height))
    expect(layout.length).toBe(6)
    expect(overlap(layout)).toBe(false)
    expect(overlap([...layout, newWidget('weather', layout)])).toBe(false)
    expect(freeSpot([], 100, 100)).toEqual({ x: 0, y: 0 })
    expect(overlap(tidy(layout.map(w => ({ ...w, x: 0, y: 0 }))))).toBe(false)
  })
})
