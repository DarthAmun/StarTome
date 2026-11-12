/**
 * A v0.42 backup written by hand to contain every table and every awkward
 * shape the converter must handle: JSON text in structured columns, 0|1
 * booleans, inline data-URL images, `img:` refs, a session from before the
 * board and one with a board, ids buried in attributes, layouts and records,
 * and rows that point at things that no longer exist.
 */
import type { LegacyPayload } from '@/services/v042/context'

const T = '2026-10-30T12:00:00.000Z'
export const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

export function legacyFixture(): LegacyPayload {
  return {
    version: 2, app: 'startome', type: 'all', exportedAt: T,
    campaigns: [
      { id: 1, name: 'The Codex', description: 'Ink and brass', game: 'pf2e', banner_source: PNG, banner_type: 'file',
        rules: { advancement: 'milestone', startingLevel: 7, startingTreasure: 349028, automation: { tickDown: true, dying: false, persistent: true } },
        playbuddy: { gameId: 'g_1', gameName: 'Codex', lastSeq: 12 }, created_at: T, updated_at: T },
      // From DM's Tome: no game, no rules
      { id: 2, name: 'Anvil', description: '', created_at: T, updated_at: T },
    ],
    entities: [
      { id: 10, campaign_id: 1, type: 'npc', name: 'Kib', content: 'Lives in {{location: Keep}}.', is_favorite: 1,
        attributes: { portraitSource: 'img:img-portrait', portraitType: 'file', title: 'Scout', level: '7', race: 'Goblin', role: 'Rogue', role2: 'Bard', status: 'Friendly', isAlive: true, isPlayerCharacter: true, alignment: 'CG' }, created_at: T, updated_at: T },
      { id: 11, campaign_id: 1, type: 'location', name: 'Keep', content: '',
        // JSON text, as older rows held it
        attributes: JSON.stringify({ imageSource: PNG, imageType: 'file', logoSource: 'https://example.test/logo.png', locationType: 'city', status: 'discovered', mapPins: [{ entityId: 10, x: 0.25, y: 0.75, hidden: true }, { entityId: 999, x: 0, y: 0 }] }), created_at: T, updated_at: T },
      { id: 12, campaign_id: 1, type: 'faction', name: 'The Ledger', content: '', attributes: { factionType: 'criminal', size: 'large', isSecret: true, headquartersName: 'Keep' }, created_at: T, updated_at: T },
      { id: 13, campaign_id: 1, type: 'quest', name: 'Find the Seal', content: '- [x] ask\n- [ ] dig', attributes: { status: 'completed', questGiver: 'Kib', questGiverId: 10, questGiverType: 'npc', reward: '20 gp', milestone: true, tags: ['act-1'] }, created_at: T, updated_at: T },
      { id: 14, campaign_id: 1, type: 'event', name: 'The Fire', content: '', attributes: { date: '4724-03-01', location: 'Keep', significance: 'major', icon: 'gi-fire' }, created_at: T, updated_at: T },
      // A session from before the board
      { id: 15, campaign_id: 1, type: 'session', name: 'Session 1', content: 'old notes',
        attributes: { mode: 'finished', sessionNumber: '1', date: '2026-10-01', scriptContent: 'Read this first.\n\n## The Road\nRain.\n\n## The Ambush\n{{npc: Kib}} waits.', notesContent: 'They won.' }, created_at: T, updated_at: T },
      // A session with a board
      { id: 16, campaign_id: 1, type: 'session', name: 'Session 2', content: '## Docks',
        attributes: { mode: 'planning', sessionNumber: '2', board: { migrated: true, viewport: { x: 5, y: 6, zoom: 1.5 }, edges: [{ id: 'e1', source: 'uid-a', target: 'uid-b', kind: 'sequence', label: 'then' }, { id: 'e2', source: 'uid-a', target: 'gone', kind: 'plan' }] } }, created_at: T, updated_at: T },
      { id: 17, campaign_id: 1, type: 'note', name: 'Lore', content: '', attributes: { icon: 'gi-book-aura', tags: ['lore', 'gods'] }, created_at: T, updated_at: T },
      { id: 18, campaign_id: 1, type: 'random-table', name: 'Weather', content: '', attributes: { die: 'd6', rows: [{ min: 1, max: 3, result: 'Rain' }, { min: '4', max: '6', result: 'Sun' }], tags: ['travel'] }, created_at: T, updated_at: T },
      { id: 19, campaign_id: 1, type: 'rumor', name: 'A Whisper', content: '', attributes: { statuses: ['heard', 'false', 'bogus'], source: 'docks' }, created_at: T, updated_at: T },
      { id: 20, campaign_id: 1, type: 'region', name: 'Old Town', content: '', attributes: { locationEntityId: 11, polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], color: '#e05555' }, created_at: T, updated_at: T },
      { id: 21, campaign_id: 2, type: 'npc', name: 'Kib', content: '', attributes: { isPlayerCharacter: true, level: '3' }, created_at: T, updated_at: T },
      { id: 22, campaign_id: 1, type: 'gizmo', name: 'Unknown type', content: '', attributes: {}, created_at: T, updated_at: T },
      { id: 23, campaign_id: 77, type: 'note', name: 'Orphan', content: '', attributes: {}, created_at: T, updated_at: T },
    ],
    entityLinks: [
      { id: 1, source_id: 10, target_type: 'location', target_name: 'keep', metadata: {} },
      { id: 2, source_id: 15, target_type: 'npc', target_name: 'Kib', metadata: '{"entry":"1"}' },
      { id: 3, source_id: 10, target_type: 'creature', target_name: 'Goblin Warrior', metadata: {} },
      { id: 4, source_id: 18, target_type: 'table', target_name: 'Weather', metadata: {} },
      { id: 5, source_id: 999, target_type: 'npc', target_name: 'Nobody', metadata: {} },
    ],
    entitySnapshots: [
      { id: 1, entity_id: 10, label: 'Before the fire', note: '', name: 'Kib the Younger', content: 'young', attributes: { title: 'Urchin', isAlive: true }, event_id: 14, event_name: 'The Fire', created_at: T },
      { id: 2, entity_id: 999, label: 'Lost', note: '', name: 'x', content: '', attributes: {}, event_id: null, event_name: null, created_at: T },
    ],
    entityConnections: [
      { id: 1, campaign_id: 1, source_entity_id: 10, target_entity_id: 12, label: 'owes', direction: 'one-way', color: '#e05555', edgeType: 'step' },
      { id: 2, campaign_id: 1, source_entity_id: 10, target_entity_id: 999, label: '', direction: 'none', color: null },
    ],
    graphLayouts: [
      { id: 1, campaign_id: 1, name: 'Intrigue', positions: '{"10":{"x":1,"y":2},"12":{"x":3,"y":4},"999":{"x":0,"y":0}}', hidden_nodes: '[]', player_hidden_nodes: [12], zoom: 0.8, pan_x: 10, pan_y: 20 },
    ],
    tokens: [
      { id: 1, name: 'Kib token', image_source: 'img:img-portrait', image_type: 'file', is_template: 1, is_player_character: 1, linked_entity_id: 10, sync_image: 1, created_at: T },
      { id: 2, name: 'Goblin', image_source: null, image_type: 'file', is_template: 1, is_player_character: 0, linked_rules_id: 'fvtt:pf2e:bestiary:gob', rules_adjustment: 'elite', created_at: T },
      { id: 3, name: 'Guard', image_source: 'https://example.test/g.png', image_type: 'url', is_template: 1, is_player_character: 0, linked_entity_id: 12, linked_rules_id: 'fvtt:pf2e:npc:guard', created_at: T },
      { id: 4, name: 'Marker', image_source: null, image_type: 'file', is_template: 1, is_player_character: 1, created_at: T },
    ],
    mapAssets: [
      { id: 1, name: 'Barrel', image: 'img:img-asset', px_width: 64, px_height: 64, folder: 'Pack / Props', created_at: T },
      { id: 2, name: 'Broken', image: '', px_width: 1, px_height: 1, created_at: T },
    ],
    encounters: [
      { id: 5, campaign_id: 1, name: 'Ambush', map_source: 'img:img-map', map_type: 'file', grid_size: 50, grid_offset_x: 3, grid_offset_y: 4,
        fog_data: '{"1,2":"hidden"}', viewport: '{"x":10,"y":20,"scale":2}',
        combat_log: [{ id: 1, round: 1, timestamp: 1761825600000, tokenId: 30, tokenName: 'Goblin', type: 'damage', value: 7, absorbed: 2 }, { id: 2, round: 2, timestamp: 1761825660000, tokenId: 999, tokenName: 'Gone', type: 'note', note: 'fled' }],
        status: 'resolved', current_turn_index: 1, round_number: 2, fov_enabled: true, sound_playlist_id: 1, initiative_formula: 'd20 + perception', party_level: 7,
        defeated: [{ name: 'Goblin', rulesId: 'fvtt:pf2e:bestiary:gob', level: 1, kind: 'creature', adjustment: null }],
        resolved_at: T, xp_total: 80, xp_awarded: 80, party_level_at_resolve: 7,
        resolution: JSON.stringify({ loot: { entries: [{ id: 42, campaign_id: 1, owner: 'encounter:5', item_id: null, quantity: 1, name_override: 'Ring', notes: '', identified: 1 }], cp: 500 }, participants: [1, 999], xpAwardId: 1, accomplishment: 10, treasure: { value: 1500 } }),
        areas: [{ id: 'a1', kind: 'emanation', originX: 1, originY: 1, sizeFt: 10, label: 'Aura', color: '#ff0000', attachedTokenId: 30 }, { id: 'a2', kind: 'burst', originX: 2, originY: 2, sizeFt: 20, label: 'Fireball', color: '#ff8800' }],
        battlemap: { cols: 2, rows: 2, cells: 'FF..', props: [{ id: 'p1', image: 'img:img-asset', x: 0, y: 0 }] },
        created_at: T, updated_at: T },
      { id: 6, campaign_id: 1, name: 'Deck', map_source: PNG, map_type: 'file', grid_size: 40, grid_offset_x: 0, grid_offset_y: 0, fog_data: {}, viewport: { x: 0, y: 0, scale: 1 }, combat_log: [],
        starship: { shipId: 1, role: 'interior', markers: [{ slot: 1, x: 2, y: 2, name: 'Pilot' }] }, sensor_map: { zones: 12 }, created_at: T, updated_at: T },
      { id: 7, campaign_id: 88, name: 'Orphan fight', map_source: null, map_type: 'file', grid_size: 40, grid_offset_x: 0, grid_offset_y: 0, fog_data: {}, viewport: {}, combat_log: [], created_at: T, updated_at: T },
    ],
    encounterTokens: [
      { id: 30, encounter_id: 5, token_id: 2, grid_x: 4, grid_y: 5, size: 1, is_visible: 1, is_dead: 1, label: 'Goblin 1', conditions: '[{"name":"frightened","value":2}]', hp_current: 0, hp_max: 12, temp_hp: 3, ac: 16, initiative: 21, notes: 'boss', linked_rules_id: 'fvtt:pf2e:bestiary:gob', rules_adjustment: 'weak', vision_range: null, is_player_token: 0, image_source: null, image_type: 'file', elevation: 10, timers: [{ id: 't1', name: 'Breath', remaining: 2, duration: 4 }], acts_while_hidden: 1, is_ally: 0, uses_dying: true },
      { id: 31, encounter_id: 5, token_id: 1, grid_x: 1, grid_y: 1, size: 1, is_visible: 1, is_dead: 0, label: null, conditions: [], hp_current: 50, hp_max: 60, ac: 24, initiative: 18, notes: null, linked_entity_id: 10, vision_range: 12, is_player_token: 1, image_source: null, image_type: 'file', elevation: null },
      { id: 32, encounter_id: 6, token_id: null, grid_x: 0, grid_y: 0, size: 2, is_visible: 0, is_dead: 0, label: 'Raider', conditions: [], hp_current: 30, hp_max: 30, ac: 20, initiative: null, notes: null, linked_rules_id: 'ship:raider', vision_range: null, is_player_token: 0, image_source: PNG, image_type: 'file', elevation: null, sensor_zone: 3, sensor_heading: -1, sensor_role: 'ship', shield_points: 5, shield_max: 10 },
      { id: 33, encounter_id: 999, token_id: null, grid_x: 0, grid_y: 0, size: 1, is_visible: 1, is_dead: 0, label: 'Lost', conditions: [], hp_current: null, hp_max: null, ac: null, initiative: null, notes: null, vision_range: null, is_player_token: 0, image_source: null, image_type: 'file', elevation: null },
    ],
    encounterWalls: [
      { id: 1, encounter_id: 5, points: '[{"x":0,"y":0},{"x":4,"y":0}]', coverType: 'half', isOpen: false },
      { id: 2, encounter_id: 5, points: [{ x: 1, y: 1 }, { x: 1, y: 3 }], coverType: 'secret', isOpen: true, generated: true },
      { id: 3, encounter_id: 999, points: [], coverType: 'full', isOpen: false },
    ],
    characters: [
      { id: 1, campaign_id: 1, name: 'Kib', role: 'pc', level: 7, xp: 400, treat_as_pc: 1, str_mod: 2, npc_entity_id: 10, token_id: 1, pb_player_id: 'p_1', pb_character_id: 'c_1', pb_status: { playerId: 'p_1', characterId: 'c_1', at: T, notShared: [] }, sf_skills: { piloting: 12 }, created_at: T, updated_at: T },
      { id: 2, campaign_id: 1, name: 'Rex', role: 'companion', level: 7, xp: 0, treat_as_pc: 0, str_mod: null, npc_entity_id: null, companion: { kind: 'animal', stage: 'young' }, companion_rules_id: 'user-rex', created_at: T, updated_at: T },
    ],
    levelUps: [{ id: 1, campaign_id: 1, at: T, trigger: 'quest', ref_id: 13, changes: '[{"characterId":1,"from":6,"to":7,"xpFrom":1000,"xpTo":0},{"characterId":999,"from":1,"to":2}]', undone_at: null }],
    xpAwards: [{ id: 1, campaign_id: 1, at: T, source: 'encounter', ref_type: 'encounter', ref_id: 5, amount: 80, character_ids: [1, 2, 999], reason: 'Ambush' }],
    treasureAwards: [{ id: 1, campaign_id: 1, at: T, value: 2500, consumables: 500, label: 'Guild reward', undone_at: T }],
    inventory: [
      { id: 40, campaign_id: 1, owner: 'character:1', item_id: 'fvtt:pf2e:equipment:backpack', quantity: 1, name_override: null, price_override: null, bulk_override: null, notes: '', identified: 1, player_name: null, player_description: null, runes: null, grade: null, created_at: T, updated_at: T },
      { id: 41, campaign_id: 1, owner: 'character:1', item_id: null, quantity: 3, name_override: 'Odd potion', price_override: 400, bulk_override: 1, notes: 'cursed', identified: 0, player_name: 'Murky potion', player_description: 'smells', runes: { potency: 1, property: ['Flaming'] }, grade: 'tactical', container_id: 40, attached_to: null, relic: { aspects: ['fire'] }, implanted: 1, upgrade_slots: 2, pb_entry_id: 'pb-9', pb_offer_id: 3, created_at: T, updated_at: T },
      { id: 42, campaign_id: 1, owner: 'stash', item_id: null, quantity: 1, name_override: 'Ring', price_override: null, bulk_override: null, notes: '', identified: 1, attached_to: 41, attach_kind: 'rune', created_at: T, updated_at: T },
      { id: 43, campaign_id: 1, owner: 'encounter:6', item_id: null, quantity: 1, name_override: 'Crate', notes: '', identified: 1, created_at: T, updated_at: T },
      { id: 44, campaign_id: 1, owner: 'character:999', item_id: null, quantity: 1, name_override: 'Lost', notes: '', identified: 1, created_at: T, updated_at: T },
    ],
    purses: [
      { id: 1, campaign_id: 1, owner: 'stash', cp: 12345, updated_at: T },
      { id: 2, campaign_id: 1, owner: 'character:1', cp: 50, updated_at: T },
      { id: 3, campaign_id: 1, owner: 'encounter:999', cp: 1, updated_at: T },
    ],
    starships: [
      { id: 1, campaign_id: 1, name: 'Dawnrunner', active: 1, frame_id: 'frame-explorer', level_pinned: null, stations: [{ slot: 1, stationId: 'st-pilot', isDefault: true, upgradeIds: [] }], bays: [{ bayId: 'bay-crew', option: 'Bunks' }],
        hp_current: 20, sp_current: null, conditions: [{ name: 'wrecked', value: 1 }], crew: [{ characterId: 1, slot: 1, activity: 'fly-the-ship' }, { characterId: 999, slot: 2 }],
        presets: [{ name: 'Dogfight', crew: [{ characterId: 2, slot: null }] }], interior_encounter_id: 6, notes: 'fast', img: PNG, created_at: T, updated_at: T },
    ],
    sessionPanels: [
      { id: 1, uid: 'uid-a', campaign_id: 1, session_id: 16, kind: 'scene', title: 'Docks', content: 'Fog.', status: 'planned', attrs: {}, tags: ['act-1'], x: 0, y: 0, origin_session_id: 16, created_at: T, updated_at: T },
      { id: 2, uid: 'uid-b', campaign_id: 1, session_id: 16, kind: 'encounter', title: 'Ambush', content: '', attrs: { encounterId: 5 }, tags: [], x: 300, y: 0, w: 280, h: 160, parent_uid: 'uid-f', created_at: T, updated_at: T },
      { id: 3, uid: 'uid-c', campaign_id: 1, session_id: null, kind: 'entity', title: 'Kib', content: '', attrs: '{"entityId":10,"entityType":"npc"}', tags: '[]', x: 0, y: 0, created_at: T, updated_at: T },
      { id: 4, uid: 'uid-d', campaign_id: 1, session_id: 16, kind: 'reward', title: 'Bounty', content: '', status: 'awarded', attrs: { xp: 40, awardIds: [1, 999] }, tags: [], x: 0, y: 300, created_at: T, updated_at: T },
      { id: 5, uid: 'uid-f', campaign_id: 1, session_id: 16, kind: 'frame', title: 'Act 1', content: '', attrs: { color: '#333' }, tags: [], x: 250, y: -50, w: 600, h: 400, created_at: T, updated_at: T },
    ],
    soundTracks: [
      { id: 1, name: 'Tavern', type: 'file', src: '', fileName: 'tavern.mp3', tags: ['ambient'], duration: 61, createdAt: T, updatedAt: T },
      { id: 2, name: 'Stream', type: 'url', src: 'https://example.test/a.mp3', tags: '["combat"]', createdAt: T, updatedAt: T },
    ],
    soundPlaylists: [{ id: 1, name: 'Night', description: 'calm', color: '#112233', trackIds: '[1,2,999]', loop: 1, shuffle: 0, createdAt: T, updatedAt: T }],
    rules: [
      { id: 'user-rex', origin: 'user', kind: 'creature', game: 'pf2e', name: 'Rex', sortName: 'rex', level: 7, rarity: 'common', traits: ['animal'], description: '', sourceRefs: [], img: 'img:img-rex', createdAt: T, updatedAt: T },
      { id: 'user-old', origin: 'user', kind: 'item', game: 'sf2e', name: 'Arc Rifle', level: '3', rarity: 'common', traits: [], description: '', sourceRefs: [], createdAt: T, updatedAt: T },
      { kind: 'item', name: 'No id' },
    ],
    rulesOverlays: [{ id: 'fvtt:pf2e:bestiary:gob', tokenImg: 'img:img-gob', gmNotes: 'the boss', isFavorite: true }],
    syncState: [{ game: 'pf2e', channel: 'release', version: '7.6.0', packs: {}, syncedAt: T }],
    images: [
      { id: 'img-portrait', mime: 'image/png', data: PNG }, { id: 'img-map', mime: 'image/png', data: PNG }, { id: 'img-asset', mime: 'image/png', data: PNG },
      { id: 'img-rex', mime: 'image/png', data: PNG }, { id: 'img-gob', mime: 'image/png', data: PNG }, { id: 'img-unused', mime: 'image/png', data: PNG },
    ],
    localState: {
      'startome.settings': JSON.stringify({ theme: 'parchment', accentPreset: 'ocean', accentCustom: '#123456', fontSize: 'large', pageAnimations: false, sparkEffects: true }),
      'startome.dmscreen-v4-1': JSON.stringify([{ id: 'w1', kind: 'npc', entityId: 10, x: 0, y: 0, width: 576, height: 120 }, { id: 'w2', kind: 'encounter-link', encounterId: 5, x: 0, y: 200, width: 576, height: 240 }, { id: 'w3', kind: 'rules-entry', rulesId: 'user-rex', x: 600, y: 0, width: 576, height: 360 }]),
      'startome.dmscreen-presets-1': JSON.stringify([{ name: 'Combat', widgets: [{ id: 'w1', kind: 'quest', entityId: 13, x: 0, y: 0, width: 576, height: 120 }] }]),
      'startome.dmscreen-scratch-v2-1': 'remember the seal',
      'startome.dmscreen-npcgen-v1-1': JSON.stringify({ raceSource: 'text' }),
      'startome.encounterBuilder.1': JSON.stringify({ name: 'Next fight', slots: [{ rulesId: 'fvtt:pf2e:bestiary:gob', count: 3, adjustment: null }], partyLevel: null }),
      'startome.bookmarks': JSON.stringify([{ id: 'b1', label: 'Kib', route: '/campaign/1/npcs/10', icon: 'gi-person', color: '#7cc44e', type: 'entity' }]),
      'startome.overview.npc': JSON.stringify({ density: 'table' }),
      'startome.seeded': '1',
      'startome.dmscreen-v4-999': '[]',
    },
  }
}
