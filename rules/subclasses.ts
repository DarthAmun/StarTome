/**
 * Subclasses the way Foundry models them: no subclass type. A class feature
 * with `choices` (Mystic's "Connection") lets the character pick one class
 * feature whose `optionOf` carries that tag (Elemental, Healing … tagged
 * 'mystic-connection'). Options carry the class's trait, which ties them to it.
 * Pure: callers load the class's feats (useRules: rulesClassFeats).
 */
import { titleCase } from '~/rules/format'
import type { Feat, ReferenceEntry } from '~/types/rules'

/** The trait a class's features carry: 'Mystic' → 'mystic'. */
export function classTrait(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

export interface OptionGroup {
  tag: string
  /** The choosing feature's name ("Connection"), else the tag without the class ("Domain"). */
  label: string
  level: number
  parent?: Feat
  options: Feat[]
}

/**
 * A class's subclass groups from the feats carrying its trait. A tag counts when
 * a feature chooses from it, or (homebrew without a choosing feature) when it
 * starts with the class's trait: 'conduit-domain'.
 */
export function classOptionGroups(cls: Pick<ReferenceEntry, 'name'>, feats: Feat[]): OptionGroup[] {
  const trait = classTrait(cls.name)
  const parents = new Map<string, Feat>()
  for (const f of feats) for (const t of f.choices ?? []) if (!parents.has(t)) parents.set(t, f)
  const groups = new Map<string, OptionGroup>()
  for (const f of feats) {
    for (const tag of f.optionOf ?? []) {
      const parent = parents.get(tag)
      if (!parent && !tag.startsWith(`${trait}-`)) continue
      let g = groups.get(tag)
      if (!g) {
        g = { tag, label: parent?.name ?? tagLabel(tag, trait), level: parent?.level ?? f.level, parent, options: [] }
        groups.set(tag, g)
      }
      g.options.push(f)
    }
  }
  for (const g of groups.values()) g.options.sort((a, b) => a.name.localeCompare(b.name))
  return [...groups.values()].sort((a, b) => a.level - b.level || a.label.localeCompare(b.label))
}

/** 'conduit-domain' → 'Domain' for the class 'conduit'. */
export function tagLabel(tag: string, trait: string): string {
  return titleCase((tag.startsWith(`${trait}-`) ? tag.slice(trait.length + 1) : tag).replace(/-/g, ' '))
}

/** Class features grouped by level, in level order. */
export function featuresByLevel(cls: Pick<ReferenceEntry, 'features'>): { level: number; names: string[] }[] {
  const out = new Map<number, string[]>()
  for (const f of cls.features ?? []) out.set(f.level, [...(out.get(f.level) ?? []), f.name])
  return [...out.entries()].sort(([a], [b]) => a - b).map(([level, names]) => ({ level, names }))
}
