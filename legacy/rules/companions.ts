/**
 * Animal and robot companions, and the Mechanic's drone (STARFINDER_PLAN.md
 * P2.2): a companion type's base statistics plus its advancement stage give
 * its stat block at the owner's level. Pure; useParty writes the result as a
 * homebrew creature entry so the VTT, the stat panel and token links use it
 * like any other creature.
 *
 * Rules: Starfinder Tech Core "Companions" pp. 73–79 (same math as PF2e
 * Player Core animal companions). Entered from the book 2026-11-07,
 * `COMPANIONS_VERIFIED = false` until checked on Archives of Nethys.
 * - Level = yours. Proficiency bonus = level + 2 per rank (trained 2 …).
 * - Young (commercial robot): trained in unarmed, unarmored defense, saves,
 *   Perception, Acrobatics, Athletics and the type's skill.
 *   HP = type HP + (6 + Con) per level.
 * - Mature (tactical): +1 Str/Dex/Con/Wis; Perception and saves expert;
 *   Intimidation, Stealth, Survival trained (the type's skill one rank up);
 *   two damage dice; animals Medium or smaller grow one size.
 * - Burly / deft (advanced): +2 Str or Dex and +1 to the other three;
 *   Athletics or Acrobatics expert; +3 or +2 damage; magical attacks; the
 *   type's advanced maneuver; burly animals Medium or smaller grow again.
 * - Specialized (superior): unarmed expert; saves and Perception master;
 *   +1 Dex, +2 Int; three damage dice; damage bonus 2→4 or 3→6; plus the
 *   specialization.
 * - Robots: construct, robot, tech; immune to bleed, death effects, …;
 *   weakness electricity half level (rounded up) unless grounded; size
 *   increases are optional (not applied here). Companion DC = your class DC.
 * - Drones: robot companions with two more commercial customizations.
 */
import type { AbilityKey, Creature, Resistance, Sense, Size, StatAction, Strike, Weakness } from '~/types/rules'
import { SIZES } from '~/types/rules'

export const COMPANIONS_VERIFIED = false

export type CompanionKind = 'animal' | 'robot' | 'drone'
export type CompanionStage = 'young' | 'mature' | 'burly' | 'deft' | 'specialized'
export type Specialization = 'ambusher' | 'bully' | 'daredevil' | 'racer' | 'tracker' | 'wrecker'

export const COMPANION_STAGES: CompanionStage[] = ['young', 'mature', 'burly', 'deft', 'specialized']
export const SPECIALIZATIONS: Specialization[] = ['ambusher', 'bully', 'daredevil', 'racer', 'tracker', 'wrecker']

/** Robot stage names (Tech Core p. 74). */
const ROBOT_STAGE: Record<CompanionStage, string> = {
  young: 'commercial', mature: 'tactical', burly: 'advanced', deft: 'advanced', specialized: 'superior',
}

export function stageLabel(kind: CompanionKind, stage: CompanionStage, path?: 'burly' | 'deft' | null): string {
  if (kind === 'animal') return stage === 'specialized' ? `specialized (${path ?? 'burly'})` : stage
  const robot = ROBOT_STAGE[stage]
  return stage === 'burly' || stage === 'deft' ? `${robot} (${stage})` : stage === 'specialized' ? `${robot} (${path ?? 'burly'})` : robot
}

export interface CompanionAttack {
  name: string
  range: 'melee' | 'ranged'
  /** One die, e.g. "d8"; advancement adds more. */
  die: string
  type: string
  traits: string[]
  rangeIncrement?: number
}

/** A companion type's statistics (the book's type or chassis entry). */
export interface CompanionBase {
  /** "Arabuk", "Powerful chassis" */
  typeName: string
  size: Size
  attacks: CompanionAttack[]
  abilities: Record<AbilityKey, number>
  /** The type's ancestry HP. */
  hp: number
  /** Extra trained skill, lower case. */
  skill: string
  senses: string[]
  speeds: Record<string, number>
  resistances?: Resistance[]
  supportBenefit: string
  advancedManeuver?: { name: string; cost: StatAction['cost']; traits?: string[]; text: string } | null
}

export interface CompanionBuild {
  kind: CompanionKind
  base: CompanionBase
  stage: CompanionStage
  /** A specialized companion's earlier path. */
  path?: 'burly' | 'deft' | null
  specialization?: Specialization | null
  /** Robot customizations by name (Tech Core p. 76–79); known ones change the stats. */
  customizations: string[]
}

/** Customizations a robot or drone gets at its stage (feats add more). */
export function customizationAllowance(kind: CompanionKind, stage: CompanionStage): number {
  if (kind === 'animal') return 0
  const byStage = { young: 1, mature: 2, burly: 3, deft: 3, specialized: 4 }[stage]
  return byStage + (kind === 'drone' ? 2 : 0)
}

type Rank = 1 | 2 | 3 | 4   // trained … legendary

const ROBOT_IMMUNITIES = ['bleed', 'death effects', 'disease', 'doomed', 'drained', 'fatigued', 'healing', 'mental', 'nonlethal attacks', 'paralyzed', 'poison', 'sickened', 'spirit', 'unconscious', 'vitality', 'void']

function grow(size: Size): Size {
  const i = SIZES.indexOf(size)
  return SIZES[Math.min(SIZES.length - 1, i + 1)]
}

const has = (b: CompanionBuild, name: string) => b.customizations.some(c => c.trim().toLowerCase() === name)

const isSpecialized = (s: CompanionStage) => s === 'specialized'
const atLeastMature = (s: CompanionStage) => s !== 'young'
/** Burly/deft, or specialized past that path. */
function pathOf(b: CompanionBuild): 'burly' | 'deft' | null {
  if (b.stage === 'burly' || b.stage === 'deft') return b.stage
  if (b.stage === 'specialized') return b.path ?? 'burly'
  return null
}

export interface CompanionStats extends Pick<Creature,
  'size' | 'perception' | 'senses' | 'languages' | 'skills' | 'abilities' | 'ac' | 'saves' | 'hp' | 'immunities' | 'weaknesses' | 'resistances' | 'speeds' | 'strikes' | 'actions'> {
  traits: string[]
}

/** The companion's statistics at `level` (the owner's level). */
export function companionStats(build: CompanionBuild, level: number): CompanionStats {
  const lv = Math.max(1, Math.min(20, Math.round(level)))
  const robot = build.kind !== 'animal'
  const path = pathOf(build)
  const spec = isSpecialized(build.stage) ? build.specialization ?? null : null
  const ab = { ...build.base.abilities }
  const add = (k: AbilityKey, n: number) => { ab[k] += n }

  if (atLeastMature(build.stage)) for (const k of ['str', 'dex', 'con', 'wis'] as const) add(k, 1)
  if (path === 'burly') { add('str', 2); for (const k of ['dex', 'con', 'wis'] as const) add(k, 1) }
  if (path === 'deft') { add('dex', 2); for (const k of ['str', 'con', 'wis'] as const) add(k, 1) }
  if (isSpecialized(build.stage)) { add('dex', 1); add('int', 2) }
  if (spec === 'ambusher' || spec === 'daredevil') add('dex', 1)
  if (spec === 'bully') { add('str', 1); add('cha', 3) }
  if (spec === 'racer') add('con', 1)
  if (spec === 'tracker') add('wis', 1)
  if (spec === 'wrecker') add('str', 1)

  // Proficiency ranks
  const saveRank: Rank = isSpecialized(build.stage) ? 3 : atLeastMature(build.stage) ? 2 : 1
  const fortRank: Rank = spec === 'racer' ? 4 : saveRank
  const attackRank: Rank = isSpecialized(build.stage) ? 2 : 1
  const unarmoredRank: Rank = spec === 'ambusher' || spec === 'daredevil' ? 2 : 1
  const skillRanks: Record<string, Rank> = { acrobatics: 1, athletics: 1 }
  const raise = (skill: string, to?: Rank) => {
    const k = skill.toLowerCase()
    skillRanks[k] = to ?? (Math.min(4, (skillRanks[k] ?? 0) + 1) as Rank)
  }
  if (build.base.skill) skillRanks[build.base.skill.toLowerCase()] = 1
  if (atLeastMature(build.stage)) {
    for (const s of ['intimidation', 'stealth', 'survival']) {
      if (s === build.base.skill.toLowerCase()) raise(s, 2)
      else skillRanks[s] = Math.max(skillRanks[s] ?? 0, 1) as Rank
    }
  }
  if (path === 'burly') raise('athletics', 2)
  if (path === 'deft') raise('acrobatics', 2)
  if (spec === 'ambusher') raise('stealth')
  if (spec === 'bully') { raise('athletics'); raise('intimidation') }
  if (spec === 'daredevil') raise('acrobatics', 3)
  if (spec === 'tracker') raise('survival')
  if (spec === 'wrecker') raise('athletics', 3)

  const prof = (rank: number) => (rank > 0 ? lv + 2 * rank : 0)

  // Size: animals Medium or smaller grow at mature and burly; robots don't (optional)
  let size = build.base.size
  if (!robot) {
    if (atLeastMature(build.stage) && SIZES.indexOf(size) <= SIZES.indexOf('med')) size = grow(size)
    if (path === 'burly' && SIZES.indexOf(size) <= SIZES.indexOf('med')) size = grow(size)
  }

  const plates = robot && has(build, 'armored plates') ? (isSpecialized(build.stage) ? 2 : 1) : 0
  const hpPerLevel = 6 + ab.con + (robot && has(build, 'hardened chassis') ? 2 : 0)

  const speeds = { ...build.base.speeds }
  if (spec === 'racer') speeds.land = (speeds.land ?? 0) + 10
  if (robot) {
    if (has(build, 'flier')) speeds.fly = Math.max(speeds.fly ?? 0, 20)
    if (has(build, 'climber')) speeds.climb = Math.max(speeds.climb ?? 0, 20)
    if (has(build, 'aquatic adaptation')) speeds.swim = Math.max(speeds.swim ?? 0, 20)
    if (has(build, 'burrower')) speeds.burrow = Math.max(speeds.burrow ?? 0, 20)
  }

  const senses: Sense[] = build.base.senses.map(type => ({ type }))
  if (robot && has(build, 'nightvision sensors') && !senses.some(s => s.type === 'darkvision')) senses.push({ type: 'darkvision' })
  if (robot && has(build, 'olfactory receptors')) senses.push({ type: 'scent', acuity: 'imprecise', range: 30 })

  const dice = isSpecialized(build.stage) ? 3 : atLeastMature(build.stage) ? 2 : 1
  const bonusDamage = path === 'burly' ? (isSpecialized(build.stage) ? 6 : 3) : path === 'deft' ? (isSpecialized(build.stage) ? 4 : 2) : 0
  const strikes: Strike[] = build.base.attacks.map(a => {
    const finesse = a.traits.includes('finesse') || a.range === 'ranged'
    const attr = a.range === 'ranged' ? ab.dex : finesse ? Math.max(ab.str, ab.dex) : ab.str
    const dmgMod = (a.range === 'melee' ? ab.str : 0) + bonusDamage
    return {
      name: a.name, range: a.range, bonus: attr + prof(attackRank),
      traits: [...a.traits, ...(path ? ['magical'] : [])],
      damage: [{ formula: `${dice}${a.die}${dmgMod ? (dmgMod > 0 ? `+${dmgMod}` : `${dmgMod}`) : ''}`, type: a.type }],
      ...(a.rangeIncrement ? { rangeIncrement: a.rangeIncrement } : {}),
    }
  })

  const skills: Record<string, number> = {}
  const SKILL_ATTR: Record<string, AbilityKey> = {
    acrobatics: 'dex', athletics: 'str', stealth: 'dex', survival: 'wis', intimidation: 'cha', deception: 'cha',
    diplomacy: 'cha', perception: 'wis', medicine: 'wis', nature: 'wis', computers: 'int', crafting: 'int', engineering: 'int',
    piloting: 'dex', thievery: 'dex',
  }
  for (const [s, r] of Object.entries(skillRanks)) skills[s] = ab[SKILL_ATTR[s] ?? 'wis'] + prof(r)

  const immunities = robot ? [...ROBOT_IMMUNITIES.filter(i => !(i === 'healing' && has(build, 'biotech healing circuit')))] : []
  const weaknesses: Weakness[] = robot && !has(build, 'grounded') ? [{ type: 'electricity', value: Math.ceil(lv / 2) }] : []
  const resistances: Resistance[] = (build.base.resistances ?? []).map(r => ({ ...r }))

  const actions: StatAction[] = []
  if (build.base.supportBenefit) {
    actions.push({ name: 'Support Benefit', cost: 1, section: 'offensive', traits: [], text: build.base.supportBenefit })
  }
  const m = build.base.advancedManeuver
  if (m && path) actions.push({ name: m.name, cost: m.cost, section: 'offensive', traits: m.traits ?? [], text: m.text })
  if (spec) actions.push({ name: `Specialization: ${spec}`, cost: 'passive', section: 'interaction', traits: [], text: SPECIALIZATION_TEXT[spec] })
  if (robot) {
    actions.push({
      name: 'Construct companion', cost: 'passive', section: 'defensive', traits: [],
      text: 'Can be Repaired, not healed. At 0 HP it becomes broken and uses the dying rules (Administer First Aid with Crafting stabilizes it); broken more than twice in 10 minutes, it is destroyed. Its companion DC is your class DC.',
    })
    const other = build.customizations.filter(c => !KNOWN_CUSTOMIZATIONS.has(c.trim().toLowerCase()))
    const listed = build.customizations.filter(c => c.trim())
    if (listed.length) actions.push({ name: 'Customizations', cost: 'passive', section: 'interaction', traits: [], text: listed.join(', ') + (other.length ? ` (apply ${other.join(', ')} by hand)` : '') })
  }

  return {
    size, perception: ab.wis + prof(saveRank), senses, languages: robot && has(build, 'artificial personality') ? ['Common'] : [],
    skills, abilities: ab,
    ac: 10 + ab.dex + prof(unarmoredRank) + plates,
    saves: { fort: ab.con + prof(fortRank), ref: ab.dex + prof(saveRank), will: ab.wis + prof(saveRank) },
    hp: build.base.hp + hpPerLevel * lv,
    immunities, weaknesses, resistances, speeds, strikes, actions,
    traits: robot ? ['construct', 'robot', 'tech', 'minion'] : ['animal', 'minion'],
  }
}

const KNOWN_CUSTOMIZATIONS = new Set([
  'armored plates', 'hardened chassis', 'flier', 'climber', 'aquatic adaptation', 'burrower', 'nightvision sensors',
  'olfactory receptors', 'grounded', 'biotech healing circuit', 'artificial personality',
])

const SPECIALIZATION_TEXT: Record<Specialization, string> = {
  ambusher: 'In its natural environment it can Sneak even while observed.',
  bully: 'Terrorizes foes and pushes them around the battlefield.',
  daredevil: "Deny advantage: it isn't off-guard to hidden, undetected or flanking creatures of your level or lower.",
  racer: '+10-foot status bonus to its land Speed (applied) or another Speed.',
  tracker: 'Moves at full Speed while following tracks.',
  wrecker: "Its unarmed attacks ignore half an object's Hardness.",
}

/** A blank type for the companion form. */
export function blankCompanionBase(kind: CompanionKind): CompanionBase {
  return {
    typeName: kind === 'animal' ? 'Animal' : 'Chassis',
    size: kind === 'animal' ? 'sm' : 'med',
    attacks: [{ name: kind === 'animal' ? 'jaws' : 'hydraulic fist', range: 'melee', die: 'd6', type: kind === 'animal' ? 'piercing' : 'bludgeoning', traits: [] }],
    abilities: { str: 2, dex: 2, con: 2, int: -4, wis: 1, cha: 0 },
    hp: 6,
    skill: kind === 'animal' ? 'survival' : 'stealth',
    senses: [kind === 'animal' ? 'low-light vision' : 'low-light vision'],
    speeds: { land: 25 },
    supportBenefit: '',
    advancedManeuver: null,
  }
}
