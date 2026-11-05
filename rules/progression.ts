/**
 * Level overview for a character (stage 1 of the character builder): what a
 * class and ancestry give at each level, with the feat slots and skill
 * increases left open. Dual-class (GM Core variant): both classes' features,
 * a class feat slot from each class, and the other slots once at the levels
 * either class has them. Pure; NpcProgression.vue loads the entries.
 */
import { classTrait } from '~/rules/subclasses'
import type { ClassProgression, Feat, ReferenceEntry } from '~/types/rules'

const range = (from: number, step: number) => Array.from({ length: Math.floor((20 - from) / step) + 1 }, (_, i) => from + i * step)

/** Player Core's usual table; a class's own `progression` replaces a list. */
export const DEFAULT_PROGRESSION: ClassProgression = {
  classFeats: [1, ...range(2, 2)],
  skillFeats: range(2, 2),
  generalFeats: range(3, 4),
  ancestryFeats: range(1, 4),
  skillIncreases: range(3, 2),
}

/** Every character, whatever the class. */
export const ATTRIBUTE_BOOST_LEVELS = [5, 10, 15, 20]

export function classProgression(cls: Pick<ReferenceEntry, 'progression'>): ClassProgression {
  return { ...DEFAULT_PROGRESSION, ...Object.fromEntries(Object.entries(cls.progression ?? {}).filter(([, v]) => Array.isArray(v))) }
}

export type SlotKind = 'classFeat' | 'ancestryFeat' | 'skillFeat' | 'generalFeat' | 'skillIncrease' | 'attributeBoosts'

export const SLOT_LABEL: Record<SlotKind, string> = {
  classFeat: 'Class feat',
  ancestryFeat: 'Ancestry feat',
  skillFeat: 'Skill feat',
  generalFeat: 'General feat',
  skillIncrease: 'Skill increase',
  attributeBoosts: 'Attribute boosts',
}

/** Kinds a feat fills; skill increases and boosts are just noted. */
export const FEAT_SLOTS: SlotKind[] = ['classFeat', 'ancestryFeat', 'skillFeat', 'generalFeat']

export interface Slot {
  kind: SlotKind
  /** Class feats: the class it comes from (dual-class has one per class). */
  className?: string
}

export interface PlanFeature { className: string; name: string }

export interface PlanLevel {
  level: number
  features: PlanFeature[]
  slots: Slot[]
}

type PlanClass = Pick<ReferenceEntry, 'name' | 'features' | 'progression'>

/** Levels 1–20 for one class, or two with dual-class. */
export function levelPlan(classes: PlanClass[]): PlanLevel[] {
  const progs = classes.map(c => ({ cls: c, prog: classProgression(c) }))
  // Without a class the generic slots still show; class feats need one
  const shared = progs.length ? progs.map(p => p.prog) : [DEFAULT_PROGRESSION]
  const anyHas = (key: keyof ClassProgression, level: number) => shared.some(p => p[key].includes(level))
  return range(1, 1).map(level => {
    const features = progs.flatMap(({ cls }) => (cls.features ?? []).filter(f => f.level === level).map(f => ({ className: cls.name, name: f.name })))
    const slots: Slot[] = []
    for (const { cls, prog } of progs) if (prog.classFeats.includes(level)) slots.push({ kind: 'classFeat', className: cls.name })
    if (anyHas('ancestryFeats', level)) slots.push({ kind: 'ancestryFeat' })
    if (anyHas('skillFeats', level)) slots.push({ kind: 'skillFeat' })
    if (anyHas('generalFeats', level)) slots.push({ kind: 'generalFeat' })
    if (anyHas('skillIncreases', level)) slots.push({ kind: 'skillIncrease' })
    if (ATTRIBUTE_BOOST_LEVELS.includes(level)) slots.push({ kind: 'attributeBoosts' })
    return { level, features, slots }
  })
}

/** How many of each slot a character of `level` has had, in SLOT_LABEL order. */
export function slotTotals(plan: PlanLevel[], level: number): { slot: Slot; count: number }[] {
  const out = new Map<string, { slot: Slot; count: number }>()
  for (const row of plan) {
    if (row.level > level) break
    for (const s of row.slots) {
      const key = `${s.kind}:${s.className ?? ''}`
      const hit = out.get(key)
      if (hit) hit.count++
      else out.set(key, { slot: s, count: 1 })
    }
  }
  const order = Object.keys(SLOT_LABEL)
  return [...out.values()].sort((a, b) => order.indexOf(a.slot.kind) - order.indexOf(b.slot.kind))
}

/**
 * Feats that can fill a slot at `level`: class feats carry the class's trait,
 * ancestry feats the ancestry's. Skill feats count as general feats too.
 */
export function slotOptions(feats: Feat[], slot: Slot, level: number, ancestryName?: string): Feat[] {
  const cat = (f: Feat) => f.category.toLowerCase()
  const keep: (f: Feat) => boolean =
    slot.kind === 'classFeat' ? (f => cat(f) === 'class' && !!slot.className && f.traits.includes(classTrait(slot.className)))
    : slot.kind === 'ancestryFeat' ? (f => cat(f) === 'ancestry' && !!ancestryName && f.traits.includes(classTrait(ancestryName)))
    : slot.kind === 'skillFeat' ? (f => cat(f) === 'skill')
    : slot.kind === 'generalFeat' ? (f => cat(f) === 'general' || cat(f) === 'skill')
    : () => false
  return feats.filter(f => f.level <= level && keep(f)).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
}
