/** Foundry actors (npc, hazard) → Creature / Hazard. */
import type { Creature, Hazard, Resistance, Spellcasting, StatAction, Strike, Weakness } from '~/types/rules'
import {
  baseFields, costOf, frequencyOf, humanizeSlug, inline, rulesIdFromSource, text,
  type ConvertContext, type FoundryDoc,
} from './common'

const GEAR = new Set(['weapon', 'armor', 'shield', 'equipment', 'consumable', 'treasure', 'ammo', 'backpack'])
const SPELLCASTING_TYPES = new Set(['prepared', 'spontaneous', 'innate', 'focus', 'ritual'])

/** Foundry's sluggify: apostrophes vanish ("Heretic's Smite" → "heretics-smite"). */
function slugify(s: string) {
  return s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function immunitiesOf(list: any[] | undefined): string[] {
  return (list ?? []).map(i => {
    const ex = (i.exceptions ?? []).map(humanizeSlug)
    return `${humanizeSlug(i.type)}${ex.length ? ` (except ${ex.join(', ')})` : ''}`
  })
}

function weaknessesOf(list: any[] | undefined): Weakness[] {
  return (list ?? []).map(w => ({
    type: humanizeSlug(w.type), value: Number(w.value) || 0,
    ...(w.exceptions?.length ? { note: `except ${w.exceptions.map(humanizeSlug).join(', ')}` } : {}),
  }))
}

function resistancesOf(list: any[] | undefined): Resistance[] {
  return (list ?? []).map(r => ({
    type: humanizeSlug(r.type), value: Number(r.value) || 0,
    ...(r.exceptions?.length ? { except: r.exceptions.map(humanizeSlug) } : {}),
    ...(r.doubleVs?.length ? { note: `double vs. ${r.doubleVs.map(humanizeSlug).join(', ')}` } : {}),
  }))
}

function strikesOf(items: FoundryDoc[], actionNames: Map<string, string>): Strike[] {
  return items.filter(i => i.type === 'melee').map(i => {
    const s = i.system ?? {}
    const traits: string[] = s.traits?.value ?? []
    const ranged = !!s.range?.increment || !!s.range?.max || traits.some(t => t.startsWith('range') || t.startsWith('thrown'))
    const damage = Object.values<any>(s.damageRolls ?? {}).map(d => ({
      formula: String(d.damage ?? ''),
      type: [d.category === 'persistent' ? 'persistent' : d.category === 'splash' ? 'splash' : '', d.damageType ?? ''].filter(Boolean).join(' '),
    }))
    const effects = (s.attackEffects?.value ?? []).map((slug: string) => actionNames.get(slug) ?? humanizeSlug(slug))
    return {
      name: i.name, range: ranged ? 'ranged' : 'melee', bonus: Number(s.bonus?.value) || 0, traits, damage,
      ...(effects.length ? { effects } : {}),
    }
  })
}

function actionsOf(items: FoundryDoc[], ctx: ConvertContext): StatAction[] {
  return items.filter(i => i.type === 'action').map(i => {
    const s = i.system ?? {}
    const cost = costOf(s.actionType, s.actions)
    const section = (['interaction', 'defensive', 'offensive'] as const).includes(s.category)
      ? s.category
      : s.actionType?.value === 'passive' ? 'interaction' : 'offensive'
    const freq = frequencyOf(s.frequency)
    return { name: i.name, cost, section, traits: s.traits?.value ?? [], ...(freq ? { frequency: freq } : {}), text: text(s.description?.value, ctx) }
  })
}

function spellcastingOf(doc: FoundryDoc, ctx: ConvertContext): Spellcasting[] {
  const items = doc.items ?? []
  const spells = items.filter(i => i.type === 'spell')
  const entries: Spellcasting[] = items.filter(i => i.type === 'spellcastingEntry').map(e => {
    const s = e.system ?? {}
    const prepared = s.prepared?.value
    return {
      name: e.name,
      tradition: s.tradition?.value ?? '',
      type: SPELLCASTING_TYPES.has(prepared) ? prepared : 'innate',
      dc: Number(s.spelldc?.dc) || 0,
      ...(s.spelldc?.value ? { attack: Number(s.spelldc.value) } : {}),
      spells: spells.filter(sp => sp.system?.location?.value === e._id).map(spellRef),
    }
  })
  const placed = new Set(entries.flatMap(e => e.spells.map(s => s.name)))
  const rituals = spells.filter(sp => !items.some(e => e.type === 'spellcastingEntry' && e._id === sp.system?.location?.value) && !placed.has(sp.name))
  if (rituals.length) {
    // Spells outside any casting entry are rituals in the stat block; without a ritual DC they are just "other spells"
    const ritualDc = Number(doc.system?.spellcasting?.rituals?.dc) || 0
    entries.push({ name: ritualDc ? 'Rituals' : 'Other Spells', tradition: '', type: 'ritual', dc: ritualDc, spells: rituals.map(spellRef) })
    if (!ritualDc) ctx.onIssue?.('spell-unplaced', rituals.map(r => r.name).join(', '))
  }
  return entries.filter(e => e.spells.length || e.type !== 'ritual')
}

function spellRef(sp: FoundryDoc): Spellcasting['spells'][number] {
  const s = sp.system ?? {}
  const cantrip = (s.traits?.value ?? []).includes('cantrip')
  const spellId = sp._stats?.compendiumSource ? rulesIdFromSource(sp._stats.compendiumSource) : null
  const heightened = Number(s.location?.heightenedLevel)
  const uses = Number(s.location?.uses?.max)
  return {
    ...(spellId ? { spellId } : {}),
    name: sp.name,
    rank: cantrip ? 0 : Number(s.level?.value) || 0,
    ...(heightened && !cantrip ? { heightenedTo: heightened } : {}),
    ...(uses > 1 ? { uses } : {}),
  }
}

function inventoryOf(items: FoundryDoc[]): Creature['inventory'] {
  return items.filter(i => GEAR.has(i.type)).map(i => {
    const itemId = i._stats?.compendiumSource ? rulesIdFromSource(i._stats.compendiumSource) : null
    return { ...(itemId ? { itemId } : {}), name: i.name, quantity: Number(i.system?.quantity) || 1 }
  })
}

export function convertCreature(doc: FoundryDoc, ctx: ConvertContext): Creature {
  const s = doc.system ?? {}
  const a = s.attributes ?? {}
  const items = doc.items ?? []
  const actionNames = new Map(items.filter(i => i.type === 'action').map(i => [slugify(i.name), i.name]))

  const skills: Record<string, number> = {}
  for (const [k, v] of Object.entries<any>(s.skills ?? {})) skills[k] = Number(v?.base ?? v?.value) || 0
  for (const lore of items.filter(i => i.type === 'lore')) skills[lore.name.toLowerCase()] = Number(lore.system?.mod?.value) || 0

  const speeds: Record<string, number> = {}
  if (a.speed?.value) speeds.land = Number(a.speed.value)
  for (const o of a.speed?.otherSpeeds ?? []) speeds[o.type] = Number(o.value) || 0

  const senses = (s.perception?.senses ?? []).map((x: any) => ({
    type: humanizeSlug(x.type), ...(x.acuity ? { acuity: x.acuity } : {}), ...(x.range ? { range: Number(x.range) } : {}),
  }))
  if (s.perception?.details) senses.push({ type: inline(s.perception.details, ctx) })

  const languages = [...(s.details?.languages?.value ?? [])]
  if (s.details?.languages?.details) languages.push(inline(s.details.languages.details, ctx))

  const saveNotes = [a.allSaves?.value, ...['fortitude', 'reflex', 'will'].map(k => s.saves?.[k]?.saveDetail)].filter(Boolean)

  // Public notes are the description; private notes become a GM-only block
  const blurb = s.details?.blurb ? `*${s.details.blurb}*` : ''
  const publicNotes = text(s.details?.publicNotes, ctx)
  const privateNotes = text(s.details?.privateNotes, ctx)
  const description = [
    blurb, publicNotes,
    privateNotes ? `> [!hidden] GM notes\n${privateNotes.split('\n').map(l => `> ${l}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')

  const creature: Creature = {
    ...baseFields(doc, ctx, { level: s.details?.level?.value, traits: s.traits, publication: s.details?.publication }),
    kind: 'creature',
    description,
    size: s.traits?.size?.value ?? 'med',
    perception: Number(s.perception?.mod) || 0,
    senses,
    languages,
    skills,
    abilities: {
      str: Number(s.abilities?.str?.mod) || 0, dex: Number(s.abilities?.dex?.mod) || 0, con: Number(s.abilities?.con?.mod) || 0,
      int: Number(s.abilities?.int?.mod) || 0, wis: Number(s.abilities?.wis?.mod) || 0, cha: Number(s.abilities?.cha?.mod) || 0,
    },
    ac: Number(a.ac?.value) || 0,
    saves: { fort: Number(s.saves?.fortitude?.value) || 0, ref: Number(s.saves?.reflex?.value) || 0, will: Number(s.saves?.will?.value) || 0 },
    hp: Number(a.hp?.max) || 0,
    immunities: immunitiesOf(a.immunities),
    weaknesses: weaknessesOf(a.weaknesses),
    resistances: resistancesOf(a.resistances),
    speeds,
    strikes: strikesOf(items, actionNames),
    actions: actionsOf(items, ctx),
    spellcasting: spellcastingOf(doc, ctx),
    inventory: inventoryOf(items),
  }
  if (a.ac?.details) creature.acNote = inline(a.ac.details, ctx)
  if (saveNotes.length) creature.saveNote = saveNotes.map(n => inline(n, ctx)).join('; ')
  if (a.hp?.details) creature.hpNote = inline(a.hp.details, ctx)
  if (Number(a.hardness)) creature.hardness = Number(a.hardness)
  return creature
}

export function convertHazard(doc: FoundryDoc, ctx: ConvertContext): Hazard {
  const s = doc.system ?? {}
  const a = s.attributes ?? {}
  const d = s.details ?? {}
  const items = doc.items ?? []
  const actionNames = new Map(items.filter(i => i.type === 'action').map(i => [slugify(i.name), i.name]))
  const stealthNote = inline(a.stealth?.details, ctx)

  const hazard: Hazard = {
    ...baseFields(doc, ctx, { level: d.level?.value, traits: s.traits, publication: d.publication }),
    kind: 'hazard',
    description: text(d.description, ctx),
    complex: !!d.isComplex,
    stealth: {
      bonus: a.stealth?.value === null || a.stealth?.value === undefined ? null : Number(a.stealth.value),
      ...(stealthNote ? { note: stealthNote } : {}),
    },
    disable: text(d.disable, ctx),
    actions: actionsOf(items, ctx),
  }
  const strikes = strikesOf(items, actionNames)
  if (strikes.length) hazard.strikes = strikes
  if (Number(a.ac?.value)) hazard.ac = Number(a.ac.value)
  const saves: NonNullable<Hazard['saves']> = {}
  for (const [k, key] of [['fortitude', 'fort'], ['reflex', 'ref'], ['will', 'will']] as const) {
    const v = s.saves?.[k]?.value
    if (v !== null && v !== undefined && v !== 0) saves[key] = Number(v)
  }
  if (Object.keys(saves).length) hazard.saves = saves
  if (Number(a.hardness)) hazard.hardness = Number(a.hardness)
  if (Number(a.hp?.max)) {
    hazard.hp = Number(a.hp.max)
    if (Number(a.hp.brokenThreshold)) hazard.bt = Number(a.hp.brokenThreshold)
  }
  if (a.immunities?.length) hazard.immunities = immunitiesOf(a.immunities)
  if (a.weaknesses?.length) hazard.weaknesses = weaknessesOf(a.weaknesses)
  if (a.resistances?.length) hazard.resistances = resistancesOf(a.resistances)
  const routine = text(d.routine, ctx)
  if (routine) hazard.routine = routine
  const reset = text(d.reset, ctx)
  if (reset) hazard.reset = reset
  return hazard
}
