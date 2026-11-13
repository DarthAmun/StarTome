import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { StarTomeDb, getDb, useDbForTests } from '@/data/db'
import { createEncounterFromBuild, readBuild, columnPlacer } from '@/data/encounterBuild'
import { actors, addCombatant, cloneEncounter, combatLog, createEncounter, deleteEncounter, encounters, makeLogEntry, patchCombatant, patchEncounter, patchMap } from '@/data/encounters'
import { createEntry } from '@/data/entries'
import { addEntry, adjustPurse, inventory, purseOf } from '@/data/inventory'
import { addCharacter, addCharacterFor, ledgerOf, partyOf, updateCampaignRules } from '@/data/party'
import { createCampaign } from '@/data/repo'
import { loadResolveContext, reopenEncounter, resolveEncounter } from '@/data/resolution'
import { rulesTable } from '@/data/rules'
import { loadWealth } from '@/data/wealth'
import { rateTokens } from '@/domain/rules/difficulty'
import { newRulesEntity } from '@/domain/rules/factory'
import { encounterOwner, STASH } from '@/domain/rules/inventory'
import { DEFAULT_PLAYER_PREFS, toPlayerScene, type PlayerSource } from '@/domain/rules/playerView'
import type { Creature, Item, RulesEntity } from '@/domain/rules/types'
import { visibilityPolygon, wallAt, wallsToSegments, type Wall } from '@/domain/rules/walls'

const C = 'camp-1'
let n = 0
beforeEach(async () => {
  useDbForTests(new StarTomeDb(`enc-${++n}`))
  await createCampaign({ id: C, name: 'Test', description: '', game: 'pf2e' })
})

const creature = (name: string, level: number, extra: Partial<Creature> = {}) => ({ ...newRulesEntity('creature', { name, game: 'pf2e' }), level, hp: 20, ac: 16, perception: 5, ...extra }) as RulesEntity
async function withGoblin(): Promise<RulesEntity> {
  const g = creature('Goblin', 1)
  await rulesTable().put(g)
  return g
}

describe('encounters', () => {
  it('creates an encounter with its map row, names its tokens, and deletes everything with it', async () => {
    const g = await withGoblin()
    const enc = await createEncounter(C, '  Ambush ')
    expect(enc).toMatchObject({ name: 'Ambush', status: 'prepared', turn: { index: 0, round: 1 } })
    expect((await encounters.map(enc.id)).fog).toEqual({})

    const npc = await createEntry(C, 'npc', 'Old Mara')
    const lib = await actors.save({ name: 'Bandit chief', ref: { kind: 'none' } })
    await addCombatant(enc.id, { x: 1, y: 1, ref: { kind: 'rules', rulesId: g.id, adjustment: 'elite' } })
    await addCombatant(enc.id, { x: 2, y: 1, ref: { kind: 'rules', rulesId: g.id, adjustment: null }, label: 'Goblin 2' })
    await addCombatant(enc.id, { x: 3, y: 1, ref: { kind: 'entry', entryId: npc.id } })
    await addCombatant(enc.id, { x: 4, y: 1, actorId: lib.id })
    await addCombatant(enc.id, { x: 5, y: 1, ref: { kind: 'rules', rulesId: 'gone', adjustment: null } })
    expect((await encounters.tokens(enc.id)).map(t => t.name).sort()).toEqual(['Bandit chief', 'Elite Goblin', 'Goblin 2', 'Old Mara', 'Token'])

    await addEntry({ campaignId: C, owner: encounterOwner(enc.id), name: 'Gem' })
    await combatLog.put(makeLogEntry(enc.id, 0, { round: 1, combatantId: null, combatantName: 'Goblin', type: 'note', detail: { note: 'hi' } }))
    expect(await encounters.log(enc.id)).toHaveLength(1)
    await deleteEncounter(enc.id)
    expect(await encounters.get(enc.id)).toBeUndefined()
    expect(await encounters.combatants(enc.id)).toEqual([])
    expect(await encounters.log(enc.id)).toEqual([])
    expect(await inventory.ofCampaign(C)).toEqual([])
    expect(await getDb().rows('encounterMaps').get(enc.id)).toBeUndefined()
  })

  it('copies an encounter with its map and tokens, prepared again, an emanation following the copied token', async () => {
    const enc = await createEncounter(C, 'Hall')
    const t = await addCombatant(enc.id, { x: 1, y: 1, label: 'Guard', hp: { current: 3, max: 10, temp: 0 } })
    await patchEncounter(enc.id, { status: 'active', turn: { index: 0, round: 4 }, fovEnabled: true })
    await patchMap(enc.id, { fog: { '1,1': 'hidden' }, walls: [{ id: 'w', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], kind: 'door', open: true, generated: false }], areas: [{ id: 'a', kind: 'emanation', attachedTokenId: t.id }] })
    const copy = await cloneEncounter(enc.id)
    expect(copy).toMatchObject({ name: 'Hall (Copy)', status: 'prepared', fovEnabled: true, turn: { round: 1 } })
    const [token] = await encounters.combatants(copy!.id)
    expect(token).toMatchObject({ label: 'Guard', hp: { current: 3 } })
    expect(token!.id).not.toBe(t.id)
    const map = await encounters.map(copy!.id)
    expect(map.fog).toEqual({ '1,1': 'hidden' })
    expect(map.walls[0]).toMatchObject({ kind: 'door', open: true })
    expect(map.areas[0]).toMatchObject({ attachedTokenId: token!.id })
  })

  it('patches a combatant through its schema', async () => {
    const enc = await createEncounter(C)
    const t = await addCombatant(enc.id, { x: 0, y: 0 })
    await patchCombatant(t.id, { conditions: [{ name: 'Prone', value: null }], hp: { current: 5, max: 9, temp: 2 }, dead: true })
    expect((await encounters.combatants(enc.id))[0]).toMatchObject({ conditions: [{ name: 'Prone', value: null }], hp: { temp: 2 }, dead: true, visible: true })
  })
})

describe('the encounter builder', () => {
  it('reads a draft back, dropping what is malformed', () => {
    expect(readBuild({ name: 'x', slots: [{ rulesId: 'a', count: 2.7, adjustment: 'elite' }, { count: 1 }, null], partyLevel: '3' }))
      .toEqual({ name: 'x', slots: [{ rulesId: 'a', count: 2, adjustment: 'elite' }], partyLevel: null })
    expect(readBuild(null)).toEqual({ name: '', slots: [], partyLevel: null })
  })

  it('hands out squares column by column', () => {
    const place = columnPlacer(2, 2, 4)
    expect([place(1), place(1), place(2), place(1)]).toEqual([{ x: 2, y: 2 }, { x: 2, y: 4 }, { x: 4, y: 2 }, { x: 4, y: 5 }])
  })

  it('creates a prepared encounter with the party and the enemies, numbered and without overlap', async () => {
    const g = await withGoblin()
    const kib = await addCharacterFor(await createEntry(C, 'npc', 'Kib'))
    await addCharacter({ campaignId: C, name: 'Zed', role: 'pc' })
    await addCharacter({ campaignId: C, name: 'Pet', role: 'companion' })
    const res = await createEncounterFromBuild(C, { name: 'Raid', partyLevel: 3, slots: [{ rulesId: g.id, count: 2, adjustment: 'weak' }, { rulesId: 'gone', count: 1, adjustment: null }] })
    expect(res.missing).toBe(1)
    expect(await encounters.get(res.encounterId)).toMatchObject({ name: 'Raid', status: 'prepared', partyLevel: 3 })
    const tokens = await encounters.tokens(res.encounterId)
    expect(tokens.map(t => t.name).sort()).toEqual(['Kib', 'Weak Goblin 1', 'Weak Goblin 2', 'Zed'])
    expect(tokens.filter(t => t.playerToken).map(t => t.ref.kind)).toEqual(['character', 'character'])
    expect(new Set(tokens.map(t => `${t.x},${t.y}`)).size).toBe(4)
    expect(tokens.find(t => t.name === 'Weak Goblin 1')?.hp).toMatchObject({ current: 10, max: 10 })
    // The party member remembers its library token; a second encounter reuses it
    const actorId = (await partyOf(C)).find(c => c.id === kib.id)?.actorId
    expect(actorId).toBeTruthy()
    await createEncounterFromBuild(C, { name: '', partyLevel: null, slots: [] })
    expect(await actors.list()).toHaveLength(2)
  })
})

describe('resolving an encounter', () => {
  async function fight() {
    const g = await withGoblin()
    const sword: Item = { ...newRulesEntity('item', { name: 'Sword', game: 'pf2e' }), price: { cp: 1000 } } as Item
    await rulesTable().put(sword)
    const ana = await addCharacter({ campaignId: C, name: 'Ana', role: 'pc' })
    const zed = await addCharacter({ campaignId: C, name: 'Zed', role: 'pc' })
    const enc = await createEncounter(C, 'Ambush')
    await addCombatant(enc.id, { x: 1, y: 1, ref: { kind: 'rules', rulesId: g.id, adjustment: null } })
    await addCombatant(enc.id, { x: 2, y: 1, ref: { kind: 'character', characterId: ana.id }, playerToken: true })
    await addEntry({ campaignId: C, owner: encounterOwner(enc.id), itemId: sword.id, quantity: 2 })
    await adjustPurse(C, encounterOwner(enc.id), 500)
    return { enc, ana, zed, g }
  }

  it('moves the loot to the stash, awards the XP once, and records the treasure', async () => {
    const { enc, ana, zed } = await fight()
    const ctx = await loadResolveContext(enc.id)
    expect(ctx).toMatchObject({ xpCampaign: true, loot: { count: 1, cp: 500 } })
    const input = { encounterId: enc.id, participants: [ana.id], xpTotal: 40, partyLevel: 1, accomplishment: 10, xpAwarded: 50 }
    expect(await resolveEncounter(input)).toEqual([])
    expect(await resolveEncounter(input)).toEqual([])   // a second click does nothing
    expect(await encounters.get(enc.id)).toMatchObject({ status: 'resolved', xpTotal: 40, xpAwarded: 50, partyLevelAtResolve: 1 })
    const party = await partyOf(C)
    expect(party.find(c => c.id === ana.id)?.xp).toBe(50)
    expect(party.find(c => c.id === zed.id)?.xp).toBe(0)
    expect((await inventory.ofCampaign(C)).map(r => [r.ownerKey, r.quantity])).toEqual([[STASH, 2]])
    expect(await purseOf(C, STASH)).toBe(500)
    const resolved = (await ledgerOf(C)).filter(l => l.kind === 'encounterResolved')
    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({ participants: [ana.id], treasure: { value: 2500 } })
    // … which the wealth readout counts as awarded treasure
    expect((await loadWealth(C, { level: 1, size: 2, xps: [50, 0] })).sinceBaseline.encounters).toBe(2500)
  })

  it('re-opens: the XP is taken back and the loot returns as far as it is still in the stash', async () => {
    const { enc, ana } = await fight()
    await resolveEncounter({ encounterId: enc.id, participants: [ana.id], xpTotal: 40, partyLevel: 1, accomplishment: 0, xpAwarded: 40 })
    // One sword was handed out and some coins spent since
    const stack = (await inventory.ofCampaign(C))[0]!
    await getDb().rows('inventory').put({ ...stack, quantity: 1 })
    await adjustPurse(C, STASH, -200)
    const short = await reopenEncounter(enc.id)
    expect(short).toEqual({ names: ['Sword'], cp: 200 })
    expect(await encounters.get(enc.id)).toMatchObject({ status: 'prepared', resolvedAt: null, xpAwarded: null })
    expect((await partyOf(C)).find(c => c.id === ana.id)?.xp).toBe(0)
    expect((await inventory.ofCampaign(C)).map(r => [r.ownerKey, r.quantity])).toEqual([[encounterOwner(enc.id), 1]])
    expect(await purseOf(C, encounterOwner(enc.id))).toBe(300)
    expect((await loadWealth(C, { level: 1, size: 2, xps: [0, 0] })).sinceBaseline.encounters).toBe(0)
  })

  it('in a milestone campaign records the XP for pacing and changes nobody', async () => {
    const { enc, ana } = await fight()
    await updateCampaignRules(C, { advancement: 'milestone' })
    await resolveEncounter({ encounterId: enc.id, participants: [ana.id], xpTotal: 40, partyLevel: 1, accomplishment: 0, xpAwarded: 40 })
    expect((await partyOf(C)).find(c => c.id === ana.id)?.xp).toBe(0)
    expect(await encounters.get(enc.id)).toMatchObject({ status: 'resolved', xpAwarded: 40 })
    expect((await ledgerOf(C)).filter(l => l.kind === 'xpAward')).toEqual([])
  })
})

describe('difficulty', () => {
  it('counts enemies with a creature or hazard stat block, removed ones included, and nobody else', () => {
    const goblin = creature('Goblin', 1), boss = creature('Boss', 6)
    const cart = { ...newRulesEntity('vehicle', { name: 'Cart', game: 'pf2e' }), level: 1 } as RulesEntity
    const entries = new Map([goblin, boss, cart].map(e => [e.id, e]))
    const stat = (e: RulesEntity) => ({ rulesId: e.id, adjustment: null })
    const d = rateTokens('pf2e', [
      { name: 'G1', stat: stat(goblin), party: false, ally: false },
      { name: 'Boss', stat: stat(boss), party: false, ally: false },
      { name: 'Summon', stat: stat(goblin), party: false, ally: true },
      { name: 'Hero', stat: stat(goblin), party: true, ally: false },
      { name: 'Cart', stat: stat(cart), party: false, ally: false },
      { name: 'Bare', stat: null, party: false, ally: false },
      { name: 'Gone', stat: { rulesId: 'gone', adjustment: null }, party: false, ally: false },
    ], [{ name: 'Fled', rulesId: goblin.id, level: 1, kind: 'creature', adjustment: null }], entries, 2, 1)
    expect(d.rows.map(r => [r.name, r.xp, r.tooStrong, r.defeated])).toEqual([['G1', 30, false, false], ['Boss', 160, true, false], ['Fled', 30, false, true]])
    expect(d).toMatchObject({ xp: 220, unlinked: 2 })
  })
})

describe('the players\' view of an encounter', () => {
  const src = (over: Partial<PlayerSource>): PlayerSource => ({
    id: 'a', name: 'A', shown: null, x: 0, y: 0, size: 1, visible: true, dead: false, playerToken: false, ally: false, actsWhileHidden: false,
    hp: { current: 5, max: 20, temp: 3 }, elevation: null, conditions: [], timers: [], sensor: null, ...over,
  })
  const hero = src({ id: 'h', name: 'Hero', playerToken: true })
  const foe = src({ id: 'f', name: 'Foe', conditions: [{ name: 'Prone', value: null }, { name: 'Doomed', value: 1, hidden: true, formula: '1d6' }], timers: [{ id: 't1', name: 'Breath', remaining: 2, duration: 3 }, { id: 't2', name: 'Seen', remaining: 1, duration: 3, visibleToPlayers: true }] })
  const lurker = src({ id: 'l', name: 'Lurker', visible: false, actsWhileHidden: true })
  const input = (prefs = DEFAULT_PLAYER_PREFS) => ({
    encounterId: 'e', map: null, grid: { size: 50, offsetX: 0, offsetY: 0 }, fog: { '1,1': 'hidden' }, tokens: [hero, foe, lurker], order: [lurker, hero, foe],
    areas: [{ id: 'a1', color: '#f00', cells: ['0,0'] }, { id: 'a2', color: '#0f0', hidden: true, cells: ['1,1'] }], lit: [], running: true, round: 2, activeId: 'l', prefs,
  })

  it('leaves out hidden tokens, areas, conditions and timers, and turns an enemy\'s HP into a word', () => {
    const scene = toPlayerScene(input())
    expect(scene.tokens.map(t => t.id)).toEqual(['h', 'f'])
    expect(scene.tokens[0]).toMatchObject({ party: true, hp: { current: 5, max: 20, temp: 3 }, health: null })
    expect(scene.tokens[1]).toMatchObject({ hp: null, health: 'critical', conditions: [{ name: 'Prone', value: null }], timers: [{ name: 'Seen', remaining: 1 }] })
    expect(scene.areas.map(a => a.id)).toEqual(['a1'])
    expect(scene.turns.map(t => t.name)).toEqual(['Hero', 'Foe'])
    expect(scene.activeId).toBeNull()
    // Nothing of the GM's rides along
    expect(JSON.stringify(scene)).not.toMatch(/Lurker|Doomed|Breath|1d6|initiative|notes|"ac"/)
  })

  it('shows a hidden combatant\'s turn as "?" when asked to', () => {
    const scene = toPlayerScene(input({ ...DEFAULT_PLAYER_PREFS, hiddenTurns: 'mystery' }))
    expect(scene.turns[0]).toEqual({ id: 'l', name: '?', image: null, dead: false, party: false, mystery: true })
    expect(scene.activeId).toBe('l')
    expect(scene.tokens.map(t => t.id)).toEqual(['h', 'f'])
  })
})

describe('walls and sight', () => {
  const wall = (over: Partial<Wall>): Wall => ({ id: 'w', points: [{ x: 5, y: 0 }, { x: 5, y: 10 }], kind: 'full', open: false, generated: false, ...over })
  const sees = (walls: Wall[], x: number) => {
    const poly = visibilityPolygon({ x: 2, y: 5 }, wallsToSegments(walls), Infinity, { w: 10, h: 10 })
    return Math.max(...poly.map(p => p.x)) >= x - 0.01
  }
  it('stops sight at a wall and a closed door, not at a window or an open door', () => {
    expect(sees([], 10)).toBe(true)
    expect(sees([wall({})], 6)).toBe(false)
    expect(sees([wall({ kind: 'door' })], 6)).toBe(false)
    expect(sees([wall({ kind: 'door', open: true })], 10)).toBe(true)
    expect(sees([wall({ kind: 'window' })], 10)).toBe(true)
  })
  it('limits sight to a vision range', () => {
    const poly = visibilityPolygon({ x: 5, y: 5 }, [], 2)
    expect(Math.max(...poly.map(p => p.x))).toBeCloseTo(7)
  })
  it('finds the wall under a point', () => {
    expect(wallAt([wall({})], 5.1, 3, 0.2)?.id).toBe('w')
    expect(wallAt([wall({})], 6, 3, 0.2)).toBeNull()
  })
})
