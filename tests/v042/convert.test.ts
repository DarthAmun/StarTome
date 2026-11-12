import { describe, expect, it } from 'vitest'
import { sequentialIds } from '@/domain/ids'
import { COLLECTION_NAMES, type Snapshot } from '@/domain/schema'
import { validateSnapshot } from '@/data/snapshot'
import { convertLegacy } from '@/services/v042/convert'
import { checkReferences } from '@/services/v042/verify'
import { legacyFixture } from './fixture'

const NOW = '2026-11-12T00:00:00.000Z'

function run() {
  const result = convertLegacy(legacyFixture(), sequentialIds('n'), NOW)
  const { snapshot, problems } = validateSnapshot(result.rows)
  return { result, snapshot, problems }
}

const byName = <T extends { name: string }>(rows: T[], name: string): T => {
  const row = rows.find(r => r.name === name)
  if (!row) throw new Error(`no row named ${name}`)
  return row
}

describe('legacy conversion of the synthetic v0.42 backup', () => {
  const { result, snapshot, problems } = run()
  const s: Snapshot = snapshot

  it('produces only rows the schemas accept', () => {
    expect(problems).toEqual([])
  })

  it('is repeatable: the same input gives the same output', () => {
    expect(run().result.rows).toEqual(result.rows)
  })

  it('matches the recorded result', () => {
    expect({ rows: result.rows, report: result.report, imageIds: [...result.imageIds].sort(), inline: result.inlineImages.map(i => i.id) }).toMatchSnapshot()
  })

  it('leaves no reference pointing at nothing', () => {
    expect(checkReferences(s)).toEqual([])
  })

  it('accounts for every source row: converted or dropped with a reason', () => {
    for (const [table, t] of Object.entries(result.report.tables)) {
      if (table === 'localState') continue
      expect(t.converted + t.dropped, table).toBe(t.read)
    }
    const fixture = legacyFixture() as Record<string, unknown>
    for (const table of ['campaigns', 'entities', 'tokens', 'encounters', 'encounterTokens', 'encounterWalls', 'characters', 'inventory', 'purses', 'starships', 'sessionPanels']) {
      expect(result.report.tables[table]?.read, table).toBe((fixture[table] as unknown[]).length)
    }
  })

  it('campaigns: game defaults, rules filled in, banner out of the row, character link', () => {
    const codex = byName(s.campaigns, 'The Codex'), anvil = byName(s.campaigns, 'Anvil')
    expect(codex.rules).toMatchObject({ advancement: 'milestone', startingLevel: 7, abp: false, countConsumables: true, automation: { tickDown: true, dying: false, persistent: true } })
    expect(codex.characterLink).toEqual({ provider: 'playbuddy', gameId: 'g_1', gameName: 'Codex', lastSeq: 12 })
    expect(codex.banner).toHaveProperty('imageId')
    expect(anvil.game).toBe('pf2e')
    expect(anvil.rules.advancement).toBe('xp')
  })

  it('entries: typed data per type, tags lifted, unknown fields kept in extra', () => {
    const kib = s.entries.find(e => e.name === 'Kib' && e.type === 'npc' && e.favorite)
    expect(kib).toMatchObject({ type: 'npc', favorite: true, data: { portrait: { imageId: 'img-portrait' }, ancestry: 'Goblin', class: 'Rogue', class2: 'Bard', level: '7', alive: true, extra: { alignment: 'CG' } } })
    const keep = byName(s.entries, 'Keep')
    expect(keep).toMatchObject({ type: 'location', data: { banner: { url: 'https://example.test/logo.png' }, kind: 'city', status: 'discovered' } })
    expect(keep.type === 'location' && keep.data.map).toHaveProperty('imageId')
    expect(byName(s.entries, 'Find the Seal')).toMatchObject({ tags: ['act-1'], data: { status: 'completed', milestone: true, giver: { kind: 'npc', name: 'Kib', entryId: kib?.id } } })
    expect(byName(s.entries, 'The Fire')).toMatchObject({ data: { significance: 'major', extra: { icon: 'gi-fire' } } })
    expect(byName(s.entries, 'Weather')).toMatchObject({ tags: ['travel'], data: { die: 'd6', rows: [{ min: 1, max: 3, result: 'Rain' }, { min: 4, max: 6, result: 'Sun' }] } })
    expect(byName(s.entries, 'A Whisper')).toMatchObject({ data: { statuses: ['heard', 'false'], source: 'docks' } })
    expect(byName(s.entries, 'Old Town')).toMatchObject({ data: { mapEntryId: keep.id, color: '#e05555' } })
    expect(s.entries.some(e => e.name === 'Unknown type' || e.name === 'Orphan')).toBe(false)
  })

  it('map pins leave the location; a pin on a deleted entry is dropped and reported', () => {
    expect(s.mapPins).toHaveLength(1)
    expect(s.mapPins[0]).toMatchObject({ x: 0.25, y: 0.75, hidden: true, mapEntryId: byName(s.entries, 'Keep').id })
    expect(result.report.notes.some(n => n.includes('pin pointed at an entry'))).toBe(true)
  })

  it('links resolve by name within the campaign, case-insensitively; compendium and missing targets stay unresolved', () => {
    const keep = byName(s.entries, 'Keep')
    expect(s.links.find(l => l.targetType === 'location')).toMatchObject({ targetEntryId: keep.id })
    expect(s.links.find(l => l.targetType === 'creature')).toMatchObject({ targetEntryId: null, targetName: 'Goblin Warrior' })
    expect(s.links.find(l => l.targetType === 'random-table')).toMatchObject({ targetEntryId: byName(s.entries, 'Weather').id })
    expect(s.links.find(l => l.meta.entry === '1')).toBeTruthy()
    expect(s.links).toHaveLength(4)
  })

  it('a session from before the board becomes scenes, a prep note and a log, chained by plan edges', () => {
    const one = byName(s.entries, 'Session 1')
    const panels = s.sessionPanels.filter(p => p.sessionId === one.id)
    expect(panels.map(p => [p.kind, p.title, p.status])).toEqual([
      ['note', 'Prep', null], ['scene', 'The Road', 'played'], ['scene', 'The Ambush', 'played'], ['log', 'Notes (from the old editor)', null],
    ])
    expect(s.sessionEdges.filter(e => e.sessionId === one.id)).toHaveLength(1)
    expect(one.body).toContain('## The Ambush')
    expect(one.type === 'session' && one.data).toMatchObject({ mode: 'finished', number: '1' })
  })

  it('a session with a board keeps its panels, frame, viewport and the edges whose ends exist', () => {
    const two = byName(s.entries, 'Session 2')
    expect(two.type === 'session' && two.data.viewport).toEqual({ x: 5, y: 6, zoom: 1.5 })
    const edges = s.sessionEdges.filter(e => e.sessionId === two.id)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ kind: 'sequence', label: 'then' })
    const frame = s.sessionPanels.find(p => p.title === 'Act 1'), enc = s.sessionPanels.find(p => p.kind === 'encounter')
    expect(enc).toMatchObject({ parentId: frame?.id, w: 280, attrs: { encounterId: byName(s.encounters, 'Ambush').id } })
    expect(s.sessionPanels.find(p => p.kind === 'entity')).toMatchObject({ sessionId: null, attrs: { entryType: 'npc' } })
    const award = s.partyLedger.find(l => l.kind === 'xpAward')
    expect(s.sessionPanels.find(p => p.title === 'Bounty')?.attrs.awardIds).toEqual([award?.id])
  })

  it('history, graphs and connections follow their entries', () => {
    expect(s.entryVersions).toHaveLength(1)
    expect(s.entryVersions[0]).toMatchObject({ label: 'Before the fire', eventId: byName(s.entries, 'The Fire').id, data: { title: 'Urchin' } })
    expect(s.graphEdges).toHaveLength(1)
    expect(s.graphEdges[0]).toMatchObject({ label: 'owes', direction: 'one-way', style: 'step' })
    expect(s.graphs[0]?.nodes).toHaveLength(2)
    expect(s.graphs[0]?.nodes.find(n => n.playerHidden)).toBeTruthy()
    expect(s.graphs[0]?.viewport).toEqual({ x: 10, y: 20, zoom: 0.8 })
  })

  it('tokens: one reference says what each stands for', () => {
    const kibChar = byName(s.characters, 'Kib')
    expect(byName(s.actors, 'Kib token')).toMatchObject({ ref: { kind: 'character', characterId: s.characters.find(c => c.link)?.id }, syncImage: true, pinned: false })
    expect(byName(s.actors, 'Goblin')).toMatchObject({ ref: { kind: 'rules', rulesId: 'fvtt:pf2e:bestiary:gob', adjustment: 'elite' }, statBlock: null })
    expect(byName(s.actors, 'Guard')).toMatchObject({ ref: { kind: 'entry' }, statBlock: { rulesId: 'fvtt:pf2e:npc:guard' }, image: { url: 'https://example.test/g.png' } })
    expect(byName(s.actors, 'Marker')).toMatchObject({ ref: { kind: 'none' }, pinned: true })
    expect(kibChar).toBeTruthy()
  })

  it('encounters are split: preparation, map state, placed tokens, log lines', () => {
    const ambush = byName(s.encounters, 'Ambush')
    expect(ambush).toMatchObject({ status: 'resolved', map: { imageId: 'img-map' }, grid: { size: 50, offsetX: 3, offsetY: 4 }, fovEnabled: true, turn: { index: 1, round: 2 }, partyLevel: 7, xpTotal: 80, playlistId: s.soundPlaylists[0]?.id })
    const map = s.encounterMaps.find(m => m.id === ambush.id)
    expect(map).toMatchObject({ fog: { '1,2': 'hidden' }, viewport: { x: 10, y: 20, scale: 2 } })
    expect(map?.walls.map(w => [w.kind, w.open, w.generated])).toEqual([['standard', false, false], ['secret', true, true]])
    const goblin = s.combatants.find(c => c.label === 'Goblin 1')
    expect(map?.areas[0]).toMatchObject({ attachedTokenId: goblin?.id })
    expect(goblin).toMatchObject({ dead: true, visible: true, hp: { current: 0, max: 12, temp: 3 }, ref: { kind: 'rules', adjustment: 'weak' }, actsWhileHidden: true, usesDying: true, elevation: 10, conditions: [{ name: 'frightened', value: 2 }] })
    expect(s.combatants.find(c => c.playerToken)).toMatchObject({ ref: { kind: 'character' }, visionRange: 12 })
    expect(s.combatants.find(c => c.sensor)).toMatchObject({ visible: false, sensor: { zone: 3, heading: -1, role: 'ship', shields: 5, shieldsMax: 10 } })
    const log = s.combatLog.filter(l => l.encounterId === ambush.id)
    expect(log.map(l => [l.seq, l.type, l.combatantId === goblin?.id])).toEqual([[0, 'damage', true], [1, 'note', false]])
    expect(log[0]?.detail).toEqual({ value: 7, absorbed: 2 })
    expect(byName(s.encounters, 'Deck').starship).toMatchObject({ role: 'interior', shipId: s.starships[0]?.id })
    expect(s.encounters.some(e => e.name === 'Orphan fight')).toBe(false)
  })

  it('party: characters, and a flagged NPC nobody added gets a party member', () => {
    const kib = s.characters.find(c => c.link)
    expect(kib).toMatchObject({ level: 7, xp: 400, treatAsPc: true, strMod: 2, skills: { piloting: 12 }, link: { provider: 'playbuddy', playerId: 'p_1', characterId: 'c_1' } })
    expect(byName(s.characters, 'Rex')).toMatchObject({ role: 'companion', companion: { kind: 'animal' }, companionRulesId: 'user-rex' })
    const adopted = s.characters.filter(c => c.name === 'Kib' && !c.link)
    expect(adopted).toHaveLength(1)
    expect(adopted[0]).toMatchObject({ level: 3, campaignId: byName(s.campaigns, 'Anvil').id })
  })

  it('the ledger holds level-ups, XP, treasure and the resolution, with ids remapped inside', () => {
    const kib = s.characters.find(c => c.link), rex = byName(s.characters, 'Rex')
    const levelUp = s.partyLedger.find(l => l.kind === 'levelUp')
    expect(levelUp).toMatchObject({ trigger: 'quest', refId: byName(s.entries, 'Find the Seal').id, changes: [{ characterId: kib?.id, from: 6, to: 7, xpFrom: 1000, xpTo: 0 }] })
    const xp = s.partyLedger.find(l => l.kind === 'xpAward')
    expect(xp).toMatchObject({ amount: 80, characterIds: [kib?.id, rex.id], refId: byName(s.encounters, 'Ambush').id })
    expect(s.partyLedger.find(l => l.kind === 'treasureAward')).toMatchObject({ value: 2500, consumables: 500, undoneAt: '2026-10-30T12:00:00.000Z' })
    const resolved = s.partyLedger.find(l => l.kind === 'encounterResolved')
    expect(resolved).toMatchObject({ participants: [kib?.id], xpAwardId: xp?.id, accomplishment: 10, treasure: { value: 1500 } })
  })

  it('inventory: typed owners, containers and attachments by new id, link fields, dropped orphans', () => {
    const kib = s.characters.find(c => c.link)
    const potion = s.inventory.find(i => i.nameOverride === 'Odd potion'), pack = s.inventory.find(i => i.itemId)
    expect(potion).toMatchObject({ owner: { kind: 'character', id: kib?.id }, ownerKey: `character:${kib?.id}`, identified: false, implanted: true, containerId: pack?.id, relic: { aspects: ['fire'] }, link: { remoteEntryId: 'pb-9', offerId: null }, upgradeSlots: 2, grade: 'tactical' })
    expect(s.inventory.find(i => i.nameOverride === 'Ring')).toMatchObject({ owner: { kind: 'stash' }, attachedTo: potion?.id, attachKind: 'rune' })
    expect(s.inventory.find(i => i.nameOverride === 'Crate')).toMatchObject({ owner: { kind: 'encounter', id: byName(s.encounters, 'Deck').id } })
    expect(s.inventory).toHaveLength(4)
    expect(s.purses.map(p => [p.ownerKey.split(':')[0], p.cp])).toEqual([['stash', 12345], ['character', 50]])
  })

  it('starships keep the crew that still exists', () => {
    const kib = s.characters.find(c => c.link), rex = byName(s.characters, 'Rex')
    expect(s.starships[0]).toMatchObject({ active: true, frameId: 'frame-explorer', crew: [{ characterId: kib?.id, slot: 1, activity: 'fly-the-ship' }], presets: [{ name: 'Dogfight', crew: [{ characterId: rex.id, slot: null }] }], interiorEncounterId: byName(s.encounters, 'Deck').id, conditions: [{ name: 'wrecked', value: 1 }] })
    expect(s.starships[0]?.image).toHaveProperty('imageId')
  })

  it('library: sounds, assets, compendium rows', () => {
    expect(s.soundTracks.map(t => [t.name, t.type, t.fileName, t.tags])).toEqual([['Tavern', 'file', 'tavern.mp3', ['ambient']], ['Stream', 'url', null, ['combat']]])
    expect(s.soundPlaylists[0]).toMatchObject({ loop: true, shuffle: false, trackIds: s.soundTracks.map(t => t.id) })
    expect(s.mapAssets).toHaveLength(1)
    expect(s.mapAssets[0]).toMatchObject({ imageId: 'img-asset', folder: 'Pack / Props' })
    expect(s.rules.map(r => [r.id, r.level, r.sortName])).toEqual([['user-rex', 7, 'rex'], ['user-old', 3, 'arc rifle']])
    expect(s.rulesOverlays).toHaveLength(1)
    expect(s.syncState).toHaveLength(1)
  })

  it('images: every stored image a row points at is listed; inline ones get ids; unused ones are not asked for', () => {
    expect([...result.imageIds].filter(i => i.startsWith('img-')).sort()).toEqual(['img-asset', 'img-gob', 'img-map', 'img-portrait', 'img-rex'])
    // banner, location map, deck map, raider token, ship image
    expect(result.inlineImages).toHaveLength(5)
    for (const img of result.inlineImages) expect(result.imageIds.has(img.id)).toBe(true)
  })

  it('local state: layouts and drafts become workspace rows with ids remapped; settings map over', () => {
    const codex = byName(s.campaigns, 'The Codex')
    const ws = (key: string) => s.workspace.find(w => w.campaignId === codex.id && w.key === key)?.value
    const kib = s.entries.find(e => e.name === 'Kib' && e.campaignId === codex.id)
    expect(ws('desk.layout')).toMatchObject([{ kind: 'npc', entryId: kib?.id }, { kind: 'encounter-link', encounterId: byName(s.encounters, 'Ambush').id }, { kind: 'rules-entry', rulesId: 'user-rex' }])
    expect(ws('desk.presets')).toMatchObject([{ name: 'Combat', widgets: [{ entryId: byName(s.entries, 'Find the Seal').id }] }])
    expect(ws('desk.scratchpad')).toBe('remember the seal')
    expect(ws('builder.draft')).toMatchObject({ name: 'Next fight' })
    expect(s.workspace.find(w => w.key === 'legacy.localState')?.value).toHaveProperty('bookmarks')
    expect(s.workspace.some(w => w.campaignId !== '' && w.campaignId !== codex.id)).toBe(false)
    expect(s.settings[0]).toMatchObject({ mode: 'light', accent: '#2563eb', size: 'large', reduceMotion: true })
  })

  it('a file without local state says so instead of failing', () => {
    const { localState: _drop, ...rest } = legacyFixture()
    const r = convertLegacy(rest, sequentialIds('n'), NOW)
    expect(r.report.notes.some(n => n.includes('no saved layouts'))).toBe(true)
    expect(validateSnapshot(r.rows).problems).toEqual([])
  })

  it('touches every collection the fixture has data for', () => {
    const empty = COLLECTION_NAMES.filter(c => !s[c].length)
    expect(empty).toEqual(['linkOutbox', 'meta'])
  })
})
