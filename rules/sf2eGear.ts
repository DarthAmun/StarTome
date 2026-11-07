/**
 * SF2e gear rules (STARFINDER_PLAN.md P1): upgrade slots by grade, installed
 * weapons, implanted augmentations and the Area Fire / Auto-Fire areas of a
 * weapon. Pure; the inventory and stat block call it.
 *
 * Sources (Starfinder Player Core, entered from the book 2026-11-07; AoN had
 * no readable SF2e equipment tables when this was built, so `verified: false`):
 * - Armor Improvements p. 248 and Weapon Improvements p. 267: extra upgrade
 *   slots and tracking per grade.
 * - The armor table p. 248: base upgrade slots per armor. Weapons nearly all
 *   have 1; archaic weapons have none (p. 255). The GM can set any host's base.
 * - Augmentations p. 288: four implanted augmentations; apex augmentations and
 *   those that say so don't count.
 * - Area Fire / Auto-Fire p. 427: Reflex save against class DC + tracking.
 */
import type { AreaKind } from '~/rules/areas'
import { SF2E_GRADES } from '~/rules/registry'
import type { Item } from '~/types/rules'

export const SF2E_GEAR_VERIFIED = false

export type Sf2eGrade = typeof SF2E_GRADES[number]

/** Index 0…6 in SF2E_GRADES; unknown grades count as commercial. */
export function gradeIndex(grade: string | null | undefined): number {
  const i = SF2E_GRADES.indexOf((grade ?? '').toLowerCase() as Sf2eGrade)
  return i < 0 ? 0 : i
}

/** Extra upgrade slots a grade adds, commercial → paragon. */
const WEAPON_GRADE_SLOTS = [0, 0, 1, 1, 2, 2, 3]
const ARMOR_GRADE_SLOTS = [0, 1, 1, 2, 2, 3, 3]
/** Weapon tracking bonus per grade (also Area Fire / Auto-Fire DCs). */
const TRACKING = [0, 1, 1, 2, 2, 3, 3]

export function trackingOf(grade: string | null | undefined): number {
  return TRACKING[gradeIndex(grade)]
}

/** Armor whose base slots aren't 1 (Player Core armor table). Lower-case names. */
const ARMOR_BASE_SLOTS: Record<string, number> = {
  'abadarcorp travel suit': 2,
  'flight suit': 0,
  'second skin': 0,
  'skyfire armor': 0,
  'aegis series': 0,
}

type HostItem = Pick<Item, 'name' | 'category' | 'traits'> & Partial<Pick<Item, 'description'>>

/** Upgrade slots the commercial version of a weapon or armor has. */
export function baseUpgradeSlots(item: HostItem | null | undefined): number {
  if (!item) return 0
  if (item.category === 'armor') {
    const n = item.name.toLowerCase().replace(/\s*\((?:commercial|tactical|advanced|superior|elite|ultimate|paragon)\)\s*$/, '').trim()
    return ARMOR_BASE_SLOTS[n] ?? 1
  }
  if (item.category === 'weapon') {
    if (item.traits.includes('archaic')) return 0
    if (/starts? with 0 upgrade slots/i.test(item.description ?? '')) return 0
    return 1
  }
  return 0
}

/** "one fewer upgrade slot than usual" on an attached fusion or the host itself. */
const FEWER_SLOT = /one fewer upgrade slot/i

export interface SlotInput {
  item: HostItem | null | undefined
  /** The entry's grade, else the item's. */
  grade: string | null | undefined
  /** GM-set base slots (replaces the table value). */
  baseOverride?: number | null
  /** Descriptions of what's attached, for "one fewer upgrade slot". */
  attachedTexts?: string[]
}

/** Upgrade slots a host has at its grade. */
export function upgradeSlots(input: SlotInput): number {
  const { item } = input
  if (!item || (item.category !== 'weapon' && item.category !== 'armor')) return 0
  const base = input.baseOverride ?? baseUpgradeSlots(item)
  const table = item.category === 'armor' ? ARMOR_GRADE_SLOTS : WEAPON_GRADE_SLOTS
  const fewer = (input.attachedTexts ?? []).filter(t => FEWER_SLOT.test(t)).length + (FEWER_SLOT.test(item.description ?? '') ? 1 : 0)
  return Math.max(0, base + table[gradeIndex(input.grade)] - fewer)
}

// ── Installed weapons ─────────────────────────────────────────────────────

/** An installed weapon's trait, e.g. `installed-two-handed-melee-weapon` → "two-handed melee weapon". */
export function installedHostText(item: Pick<Item, 'category' | 'traits'> | null | undefined): string | null {
  if (item?.category !== 'weapon') return null
  const t = item.traits.find(x => x.startsWith('installed-'))
  return t ? t.slice('installed-'.length).replace(/-/g, ' ') : null
}

export interface SlottedLike {
  kind: string            // AttachKind
  name: string
  grade?: string | null
  description?: string
}

/** Rule warnings for an SF2e host's upgrades. Never blocking: feats and the GM bend these. */
export function upgradeWarnings(attached: SlottedLike[], host: SlotInput): string[] {
  const out: string[] = []
  const slots = upgradeSlots({ ...host, attachedTexts: attached.map(a => a.description ?? '') })
  const used = attached.filter(a => a.kind === 'upgrade' || a.kind === 'installed').length
  if (used > slots) out.push(`${used} upgrades installed but ${slots} slot${slots === 1 ? '' : 's'} at this grade.`)
  const installed = attached.filter(a => a.kind === 'installed')
  if (installed.length > 1) out.push(`${installed.length} installed weapons: an item normally takes one.`)
  const hostGrade = gradeIndex(host.grade)
  for (const w of installed) {
    if (gradeIndex(w.grade) > hostGrade) out.push(`${w.name} is a higher grade than the item it's installed in.`)
  }
  return out
}

// ── Augmentations ─────────────────────────────────────────────────────────

export const IMPLANT_LIMIT = 4

/** Whether an item is an augmentation (its usage is "implanted"). */
export function isAugmentation(item: Pick<Item, 'usage'> | null | undefined): boolean {
  return (item?.usage ?? '').toLowerCase().startsWith('implanted')
}

/** Apex augmentations and those whose text says so don't count toward the limit. */
export function countsTowardImplantLimit(item: Pick<Item, 'traits'> & Partial<Pick<Item, 'description'>> | null | undefined): boolean {
  if (!item) return true
  if (item.traits.includes('apex')) return false
  return !/(?:doesn.t|does not|don.t|do not) count (?:against|toward|towards) (?:your|the) (?:implant|augmentation) limit/i.test(item.description ?? '')
}

export function augmentationWarnings(implanted: (Pick<Item, 'traits'> & Partial<Pick<Item, 'description'>> | null)[]): string[] {
  const counted = implanted.filter(countsTowardImplantLimit).length
  return counted > IMPLANT_LIMIT
    ? [`${counted} augmentations implanted: the limit is ${IMPLANT_LIMIT} (Player Core p. 288).`]
    : []
}

// ── Area Fire / Auto-Fire ─────────────────────────────────────────────────

export interface WeaponArea { action: 'Area Fire' | 'Auto-Fire'; kind: AreaKind; sizeFt: number }

/**
 * The areas a weapon can fire into. Area (cone/line) reaches the range
 * increment; area-burst-N is an N-foot burst; automatic weapons Auto-Fire
 * into a cone of half the range increment.
 */
export function weaponAreas(traits: string[], rangeIncrement: number | null | undefined): WeaponArea[] {
  const out: WeaponArea[] = []
  const inc = Number(rangeIncrement) || 0
  for (const t of traits) {
    const burst = t.match(/^area-burst-(\d+)$/)
    if (burst) out.push({ action: 'Area Fire', kind: 'burst', sizeFt: Number(burst[1]) })
    else if ((t === 'area-cone' || t === 'area-line') && inc) out.push({ action: 'Area Fire', kind: t === 'area-cone' ? 'cone' : 'line', sizeFt: inc })
  }
  if (traits.includes('automatic') && inc) out.push({ action: 'Auto-Fire', kind: 'cone', sizeFt: Math.max(5, Math.floor(inc / 2 / 5) * 5) })
  return out
}

/**
 * A creature's Area Fire / Auto-Fire DC from its Strike bonus. For a PC the
 * DC is class DC + tracking = 10 + (attack − tracking) + tracking, so
 * 10 + the Strike's bonus; creature stat blocks follow the same math.
 */
export function areaFireDcFromStrike(bonus: number): number {
  return 10 + bonus
}

/** A PC's Area Fire / Auto-Fire DC. */
export function areaFireDc(classDc: number, grade: string | null | undefined): number {
  return classDc + trackingOf(grade)
}
