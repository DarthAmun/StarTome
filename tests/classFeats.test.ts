import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { rulesClassFeats } from '~/composables/useRules'
import { newRulesEntity } from '~/rules/factory'
import { classOptionGroups } from '~/rules/subclasses'
import type { Feat } from '~/types/rules'

const feat = (name: string, traits: string[], extra: Partial<Feat>): Feat =>
  ({ ...(newRulesEntity('feat', { name, game: 'pf2e', origin: 'foundry' }) as Feat), id: name, traits, category: 'classfeature', ...extra })

describe('class features of a class', () => {
  beforeEach(() => getDb().rules.clear())

  it('finds subclass options without the class trait by the tag the class chooses from', async () => {
    // As in Foundry: Kinetic Gate carries 'kineticist'; the gates carry no trait at all
    await getDb().rules.bulkAdd([
      feat('Kinetic Gate', ['kineticist'], { choices: ['kineticist-kinetic-gate'] }),
      feat('Fire Gate', [], { optionOf: ['kineticist-kinetic-gate'] }),
      feat('Water Gate', [], { optionOf: ['kineticist-kinetic-gate'] }),
      feat('Muses', ['bard'], { choices: ['bard-muse'] }),
      feat('Maestro', ['bard'], { optionOf: ['bard-muse'] }),
    ])
    const feats = await rulesClassFeats('kineticist', 'pf2e')
    expect(feats.map(f => f.name).sort()).toEqual(['Fire Gate', 'Kinetic Gate', 'Water Gate'])
    expect(classOptionGroups({ name: 'Kineticist' }, feats)).toMatchObject([{ tag: 'kineticist-kinetic-gate', label: 'Kinetic Gate', options: [{ name: 'Fire Gate' }, { name: 'Water Gate' }] }])
  })
})
