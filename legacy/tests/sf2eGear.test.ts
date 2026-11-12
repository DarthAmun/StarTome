import { describe, expect, it } from 'vitest'
import { attachKindOf, canAttach, hostsOf } from '~/rules/attachments'
import {
  areaFireDc, areaFireDcFromStrike, augmentationWarnings, baseUpgradeSlots, countsTowardImplantLimit,
  installedHostText, isAugmentation, trackingOf, upgradeSlots, upgradeWarnings, weaponAreas,
} from '~/rules/sf2eGear'
import type { Item } from '~/types/rules'

const armor = (name: string, traits: string[] = []) => ({ name, category: 'armor' as const, traits })
const weapon = (name: string, traits: string[] = [], description = '') => ({ name, category: 'weapon' as const, traits, description })

describe('upgrade slots', () => {
  it('reads base slots from the armor table and defaults weapons to 1', () => {
    expect(baseUpgradeSlots(armor('Defrex Hide'))).toBe(1)
    expect(baseUpgradeSlots(armor('Abadarcorp Travel Suit'))).toBe(2)
    expect(baseUpgradeSlots(armor('Second Skin (Tactical)'))).toBe(0)
    expect(baseUpgradeSlots(weapon('Laser Pistol'))).toBe(1)
    expect(baseUpgradeSlots(weapon('Longsword', ['archaic']))).toBe(0)
  })

  it('adds slots by grade per the improvement tables', () => {
    expect(upgradeSlots({ item: armor('Defrex Hide'), grade: 'commercial' })).toBe(1)
    expect(upgradeSlots({ item: armor('Defrex Hide'), grade: 'tactical' })).toBe(2)
    expect(upgradeSlots({ item: armor('Defrex Hide'), grade: 'paragon' })).toBe(4)
    expect(upgradeSlots({ item: weapon('Laser Pistol'), grade: 'tactical' })).toBe(1)
    expect(upgradeSlots({ item: weapon('Laser Pistol'), grade: 'advanced' })).toBe(2)
    expect(upgradeSlots({ item: weapon('Laser Pistol'), grade: 'paragon' })).toBe(4)
  })

  it('takes the GM base and "one fewer upgrade slot" fusions into account', () => {
    expect(upgradeSlots({ item: weapon('Laser Pistol'), grade: 'commercial', baseOverride: 3 })).toBe(3)
    expect(upgradeSlots({ item: weapon('Laser Pistol'), grade: 'advanced', attachedTexts: ['The weapon has one fewer upgrade slot than usual.'] })).toBe(1)
    expect(upgradeSlots({ item: weapon('Laser Pistol'), grade: 'commercial', attachedTexts: ['one fewer upgrade slot', 'one fewer upgrade slot'] })).toBe(0)
    expect(upgradeSlots({ item: { name: 'Belt', category: 'equipment', traits: [] } as never, grade: 'paragon' })).toBe(0)
  })

  it('warns about full hosts, two installed weapons and installed weapons above the host grade', () => {
    const host = { item: weapon('Laser Pistol'), grade: 'commercial' }
    expect(upgradeWarnings([{ kind: 'upgrade', name: 'Sight' }], host)).toEqual([])
    expect(upgradeWarnings([{ kind: 'upgrade', name: 'A' }, { kind: 'upgrade', name: 'B' }], host)[0]).toMatch(/2 upgrades installed but 1 slot/)
    const w = upgradeWarnings([
      { kind: 'installed', name: 'Disc Thrower', grade: 'tactical' },
      { kind: 'installed', name: 'Honor Enforcer', grade: 'commercial' },
    ], { item: weapon('Doshko'), grade: 'commercial', baseOverride: 2 })
    expect(w).toContain('2 installed weapons: an item normally takes one.')
    expect(w).toContain("Disc Thrower is a higher grade than the item it's installed in.")
  })

  it('tracking by grade', () => {
    expect(trackingOf('commercial')).toBe(0)
    expect(trackingOf('tactical')).toBe(1)
    expect(trackingOf('superior')).toBe(2)
    expect(trackingOf('paragon')).toBe(3)
    expect(trackingOf(null)).toBe(0)
  })
})

describe('installed weapons', () => {
  const disc = { name: 'Disc Thrower', category: 'weapon', traits: ['installed-two-handed-melee-weapon', 'tech'], usage: 'worngloves' } as Pick<Item, 'name' | 'category' | 'traits' | 'usage'>
  it('attach to the host their trait names', () => {
    expect(installedHostText(disc as never)).toBe('two handed melee weapon')
    expect(attachKindOf(disc)).toBe('installed')
    expect(hostsOf(disc)).toEqual(['weapon'])
    expect(canAttach(disc, { category: 'weapon' })).toBe(true)
    expect(canAttach(disc, { category: 'armor' })).toBe(false)
  })
})

describe('augmentations', () => {
  const aug = (traits: string[] = [], description = '') => ({ traits, description })
  it('are items whose usage is implanted', () => {
    expect(isAugmentation({ usage: 'implanted' })).toBe(true)
    expect(isAugmentation({ usage: 'worn' })).toBe(false)
  })
  it('allow four, apex and exempt ones free', () => {
    expect(countsTowardImplantLimit(aug(['apex']))).toBe(false)
    expect(countsTowardImplantLimit(aug([], "This augmentation doesn't count against your implant limit."))).toBe(false)
    expect(augmentationWarnings([aug(), aug(), aug(), aug()])).toEqual([])
    expect(augmentationWarnings([aug(), aug(), aug(), aug(), aug(['apex'])])).toEqual([])
    expect(augmentationWarnings([aug(), aug(), aug(), aug(), aug()])[0]).toMatch(/5 augmentations implanted: the limit is 4/)
  })
})

describe('Area Fire and Auto-Fire', () => {
  it('reads shapes from the weapon traits', () => {
    expect(weaponAreas(['area-cone', 'tech'], 15)).toEqual([{ action: 'Area Fire', kind: 'cone', sizeFt: 15 }])
    expect(weaponAreas(['area-line'], 60)).toEqual([{ action: 'Area Fire', kind: 'line', sizeFt: 60 }])
    expect(weaponAreas(['area-burst-10'], 30)).toEqual([{ action: 'Area Fire', kind: 'burst', sizeFt: 10 }])
    expect(weaponAreas(['automatic'], 40)).toEqual([{ action: 'Auto-Fire', kind: 'cone', sizeFt: 20 }])
    expect(weaponAreas(['automatic'], 30)).toEqual([{ action: 'Auto-Fire', kind: 'cone', sizeFt: 15 }])
    expect(weaponAreas(['area-cone'], undefined)).toEqual([])
    expect(weaponAreas(['agile'], 30)).toEqual([])
  })
  it('DCs: class DC + tracking, or 10 + a Strike bonus', () => {
    expect(areaFireDc(18, 'advanced')).toBe(19)
    expect(areaFireDcFromStrike(10)).toBe(20)
  })
})
