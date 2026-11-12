import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMockServer } from '../scripts/playbuddy-mock.mjs'
import { createPlayBuddyLink } from '~/partylink/playbuddy'
import { gameFromWire, itemRefOf, rulesIdOfRef } from '~/partylink/convert'
import { crewSkill } from '~/rules/playerStarship'

describe('Play Buddy Starfinder support (STARFINDER_PLAN.md P10)', () => {
  let mock: { url: string; close: () => Promise<void> }
  beforeAll(async () => { mock = await createMockServer({ port: 0, manual: true, system: 'sf2e' }) })
  afterAll(() => mock.close())

  it('item refs carry their system both ways; refs without one are PF2e', () => {
    expect(itemRefOf('fvtt:sf2e:equipment:qIgcUV22LaDCzmb2', 'Laser Pistol')).toEqual({ slug: 'laser-pistol', foundryId: 'qIgcUV22LaDCzmb2', pack: 'equipment', system: 'sf2e' })
    expect(itemRefOf('fvtt:pf2e:equipment-srd:X9', 'Longsword')).toEqual({ slug: 'longsword', foundryId: 'X9', pack: 'equipment-srd' })
    expect(rulesIdOfRef({ slug: 'laser-pistol', foundryId: 'qIgcUV22LaDCzmb2', pack: 'equipment', system: 'sf2e' })).toBe('fvtt:sf2e:equipment:qIgcUV22LaDCzmb2')
    expect(rulesIdOfRef({ slug: 'longsword', foundryId: 'X9', pack: 'equipment-srd' })).toBe('fvtt:pf2e:equipment-srd:X9')
    expect(gameFromWire({ gameId: 'g', name: 'G', players: [], eventSeq: 0 }).system).toBe('pf2e')
  })

  it('a Starfinder game: system, SF2e skills, attacks, grades and refs in the mirror', async () => {
    const pair = await fetch(`${mock.url}/v1/pair`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' }, body: JSON.stringify({ code: '123456', client: 'test', clientVersion: '1' }) }).then(r => r.json())
    const link = createPlayBuddyLink({ baseUrl: mock.url, token: pair.token, clientId: pair.clientId }, rulesIdOfRef)
    const game = await link.game()
    expect(game.system).toBe('sf2e')
    const [carl] = await link.status(['p_carl'], ['basic', 'defenses', 'skills', 'inventory'])
    expect(carl.skills).toMatchObject({ skills: { piloting: 6, crafting: 5 }, classDc: 20, rangedAttack: 10, meleeAttack: 12 })
    expect(carl.inventory?.items[0]).toMatchObject({ rulesId: 'fvtt:sf2e:equipment:qIgcUV22LaDCzmb2', grade: 'tactical' })
    // Crew cards: Play Buddy's value wins over the hand-entered one; Perception comes from the defenses
    expect(crewSkill({ sfSkills: { piloting: 2 }, pbStatus: carl }, 'Piloting')).toBe(6)
    expect(crewSkill({ sfSkills: { piloting: 2 }, pbStatus: null }, 'Piloting')).toBe(2)
    expect(crewSkill({ sfSkills: {}, pbStatus: carl }, 'Perception')).toBe(8)
    expect(crewSkill({ sfSkills: {}, pbStatus: carl }, 'Computers')).toBeNull()
  })
})
