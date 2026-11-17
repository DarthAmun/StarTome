import { describe, expect, it } from 'vitest'
import { guessFloorOrder, guessOne } from '@/domain/rules/floorNames'

/** The file names bottom to top, and the ground floor's name. */
function guess(files: string[]) {
  const g = guessFloorOrder(files)
  return { order: g.order.map(i => files[i]), ground: files[g.ground], names: g.order.map(i => g.names[i]) }
}

describe('guessing the floor order from file names', () => {
  it('reads words and codes for levels', () => {
    expect(['Tavern_Basement.png', 'cellar.jpg', 'Keller.webp', 'B2.png', 'tower-UG1.png', 'map -1.png'].map(f => guessOne(f))).toEqual([
      { kind: 'level', level: -1 }, { kind: 'level', level: -1 }, { kind: 'level', level: -1 }, { kind: 'level', level: -2 }, { kind: 'level', level: -1 }, { kind: 'level', level: -1 },
    ])
    expect(['Ground floor.png', 'Haus EG.png', 'Haus OG2.png', 'inn 2F.png', 'inn 3rd floor.png', 'Attic.png'].map(f => guessOne(f))).toEqual([
      { kind: 'level', level: 0 }, { kind: 'level', level: 0 }, { kind: 'level', level: 2 }, { kind: 'level', level: 2 }, { kind: 'level', level: 3 }, { kind: 'top', name: 'Attic' },
    ])
    // Sizes and versions are not floors
    expect(guessOne('Inn_30x20_140ppi_v2.png')).toBeNull()
    expect(guessOne('Inn level 2 [30x20].png')).toEqual({ kind: 'number', n: 2 })
  })

  it('counts plain numbers from the lowest, in natural order (10 after 9)', () => {
    expect(guess(['Floor 10.png', 'Floor 2.png', 'Floor 1.png', 'Floor 9.png'])).toEqual({
      order: ['Floor 1.png', 'Floor 2.png', 'Floor 9.png', 'Floor 10.png'], ground: 'Floor 1.png', names: ['Ground floor', 'Floor 2', 'Floor 3', 'Floor 4'],
    })
  })

  it('puts basements under the ground floor and attics on top', () => {
    expect(guess(['Tavern Attic.png', 'Tavern 2.png', 'Tavern Cellar.png', 'Tavern 1.png'])).toEqual({
      order: ['Tavern Cellar.png', 'Tavern 1.png', 'Tavern 2.png', 'Tavern Attic.png'], ground: 'Tavern 1.png', names: ['Basement', 'Ground floor', 'Floor 2', 'Attic'],
    })
  })

  it('counts numbers from an explicit ground floor, and German names', () => {
    expect(guess(['Haus 1.OG.png', 'Haus Keller.png', 'Haus EG.png']).order).toEqual(['Haus Keller.png', 'Haus EG.png', 'Haus 1.OG.png'])
    expect(guess(['ground.png', 'floor 1.png']).order).toEqual(['ground.png', 'floor 1.png'])
  })

  it('without hints keeps the natural order with the first as the ground floor', () => {
    expect(guess(['b-side.png', 'alpha.png'])).toEqual({ order: ['alpha.png', 'b-side.png'], ground: 'alpha.png', names: ['Ground floor', 'Floor 2'] })
    expect(guess(['only basement.png']).ground).toBe('only basement.png')
  })
})
