/** Blank entries for the "New …" buttons. Every required field of each kind gets a value. */
import type { GameId } from '~/types/game'
import type { RulesEntity, RulesKind, RulesOrigin } from '~/types/rules'

export function newRulesId(): string {
  return crypto.randomUUID()
}

export function newRulesEntity(kind: RulesKind, init: { name: string; game: GameId | 'both'; origin?: RulesOrigin }): RulesEntity {
  const ts = new Date().toISOString()
  const base = {
    id: newRulesId(),
    origin: init.origin ?? 'user',
    game: init.game,
    name: init.name,
    sortName: init.name.toLowerCase(),
    level: kind === 'spell' || kind === 'feat' ? 1 : 0,
    rarity: 'common' as const,
    traits: [],
    description: '',
    sourceRefs: [],
    createdAt: ts,
    updatedAt: ts,
  }
  switch (kind) {
    case 'item':
      return { ...base, kind, category: 'equipment', price: null, bulk: 0 }
    case 'creature':
      return {
        ...base, kind, size: 'med', perception: 0, senses: [], languages: [], skills: {},
        abilities: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        ac: 10, saves: { fort: 0, ref: 0, will: 0 }, hp: 1,
        immunities: [], weaknesses: [], resistances: [], speeds: { land: 25 },
        strikes: [], actions: [], spellcasting: [], inventory: [],
      }
    case 'hazard':
      return { ...base, kind, complex: false, stealth: { bonus: null }, disable: '', actions: [] }
    case 'spell':
      return { ...base, kind, spellType: 'spell', traditions: [], cast: 2 }
    case 'feat':
      return { ...base, kind, category: 'general', cost: null, prerequisites: [] }
    case 'action':
      return { ...base, kind, cost: 1 }
    case 'condition':
      return { ...base, kind, valued: false, overrides: [] }
    case 'ancestry': case 'heritage': case 'background': case 'class': case 'deity':
      return { ...base, kind, facts: {} }
    case 'relicGift':
      return { ...base, kind, game: 'pf2e', tier: 'minor', aspects: [] }
    case 'vehicle':
      return {
        ...base, kind, size: 'lg', price: null, ac: 10, fort: 0, hardness: 0, hp: 1,
        immunities: [], weaknesses: [], resistances: [], collision: { dc: null, damage: '' },
        crew: '', passengers: '', pilotingCheck: '', space: null, speed: '', actions: [],
      }
    case 'starship':
      return {
        ...base, kind, game: 'sf2e', level: 1, traits: ['tech'], size: 'med', perception: 0, sensorRange: 3, skills: {},
        abilities: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, ac: 10, saves: { fort: 0, ref: 0, will: 0 }, hp: 1,
        shields: null, immunities: ['starship immunities'], weaknesses: [], resistances: [], speed: 2,
        battleStations: [], strikes: [], actions: [],
      }
    case 'starshipFrame':
      return { ...base, kind, game: 'sf2e', traits: ['tech'], size: 'med', sensorRange: 3, expansionBays: 4, customSlots: 4, defaultStations: [], stats: [] }
    case 'battleStation':
      return { ...base, kind, game: 'sf2e', advancement: [], actions: [] }
    case 'stationUpgrade':
      return { ...base, kind, game: 'sf2e', traits: ['starship', 'tech'], station: '', actions: [] }
    case 'expansionBay':
      return { ...base, kind, game: 'sf2e', takesSlot: true }
  }
}
