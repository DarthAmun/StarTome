import { describe, expect, it } from 'vitest'
import { addFloor, MAIN_FLOOR } from '@/domain/rules/floors'
import { playersFloor, playersFloorId } from '@/domain/rules/playerFloor'
import { zEncounter, zEncounterMap } from '@/domain/schema'

/** A tower: cellar, ground floor (main), upper floor, each with its own image. */
function tower() {
  const enc = zEncounter.parse({ id: 'e', campaignId: 'c', name: 'Tower', map: { imageId: 'ground' }, grid: { size: 70, offsetX: 0, offsetY: 0 }, createdAt: '', updatedAt: '' })
  let map = zEncounterMap.parse({ id: 'e' })
  const up = addFloor(enc, map, { image: { imageId: 'upper' } })
  map = { ...map, ...up.map }
  const down = addFloor(enc, map, { below: true, image: { imageId: 'cellar' } })
  map = { ...map, ...down.map }
  return { enc, map, upper: up.floor.id, cellar: down.floor.id }
}

const tok = (id: string, floorId: string | null, playerToken = false) => ({ id, floorId, playerToken })

describe('the players\' floor', () => {
  it('shows the floor the party stands on, not the one the GM looks at, and nothing of the others', () => {
    const { enc, map, upper, cellar } = tower()
    const tokens = [tok('kip', null, true), tok('ana', null, true), tok('ogre', upper), tok('rat', cellar), tok('guard', null)]
    const seen = playersFloor(enc, map, tokens, { gmFloor: upper, locked: null, activeId: 'ogre' })
    expect(seen.floor.id).toBe(MAIN_FLOOR)
    expect(seen.floor.image).toEqual({ imageId: 'ground' })
    expect(seen.tokens.map(t => t.id)).toEqual(['kip', 'ana', 'guard'])
    // The floor below comes faded (D5), with only its own tokens; the floor above not at all
    expect(seen.below?.floor.image).toEqual({ imageId: 'cellar' })
    expect(seen.below?.tokens.map(t => t.id)).toEqual(['rat'])
    expect(JSON.stringify(seen)).not.toContain('upper')
    expect(JSON.stringify(seen)).not.toContain('ogre')
  })

  it('follows an acting party token, and the GM between the floors a split party stands on', () => {
    const { enc, map, upper, cellar } = tower()
    const tokens = [tok('kip', null, true), tok('ana', upper, true), tok('rat', cellar)]
    expect(playersFloorId(enc, map, tokens, { gmFloor: MAIN_FLOOR, locked: null, activeId: 'ana' })).toBe(upper)
    expect(playersFloorId(enc, map, tokens, { gmFloor: upper, locked: null, activeId: 'rat' })).toBe(upper)
    expect(playersFloorId(enc, map, tokens, { gmFloor: MAIN_FLOOR, locked: null, activeId: 'rat' })).toBe(MAIN_FLOOR)
    // The GM in the cellar where no party token is: the lower of the party's floors on a tie
    expect(playersFloorId(enc, map, tokens, { gmFloor: cellar, locked: null, activeId: null })).toBe(MAIN_FLOOR)
    expect(playersFloorId(enc, map, [...tokens, tok('bo', upper, true)], { gmFloor: cellar, locked: null, activeId: null })).toBe(upper)
  })

  it('keeps the players on a locked floor, and shows the GM\'s floor while there is no party token', () => {
    const { enc, map, upper, cellar } = tower()
    expect(playersFloorId(enc, map, [tok('kip', null, true)], { gmFloor: MAIN_FLOOR, locked: cellar, activeId: 'kip' })).toBe(cellar)
    expect(playersFloorId(enc, map, [tok('ogre', null)], { gmFloor: upper, locked: null, activeId: null })).toBe(upper)
    // A floor that is gone: its tokens stand on the main floor, a lock on it is no lock
    expect(playersFloorId(enc, map, [tok('kip', 'gone', true)], { gmFloor: upper, locked: 'gone', activeId: null })).toBe(MAIN_FLOOR)
  })
})
