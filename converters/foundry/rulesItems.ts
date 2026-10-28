/** Foundry spell, feat, action, condition and character-option items → typed entries. */
import type { Action, Condition, Feat, ReferenceEntry, Spell } from '~/types/rules'
import { baseFields, castOf, costOf, frequencyOf, humanizeSlug, text, type ConvertContext, type FoundryDoc } from './common'

const SAVE: Record<string, 'fort' | 'ref' | 'will'> = { fortitude: 'fort', reflex: 'ref', will: 'will' }
const ABILITY: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }
const RANK = ['untrained', 'trained', 'expert', 'master', 'legendary']

export function convertSpell(doc: FoundryDoc, ctx: ConvertContext): Spell {
  const s = doc.system ?? {}
  const traits: string[] = s.traits?.value ?? []
  const lines: string[] = []
  if (s.cost?.value) lines.push(`**Cost** ${s.cost.value}`)
  if (s.requirements) lines.push(`**Requirements** ${s.requirements}`)
  if (s.ritual?.primary?.check) lines.push(`**Primary Check** ${s.ritual.primary.check}`)
  if (s.ritual?.secondary?.checks) lines.push(`**Secondary Casters** ${s.ritual.secondary.casters ?? ''}; **Secondary Checks** ${s.ritual.secondary.checks}`)
  const body = text(s.description?.value, ctx)

  const spell: Spell = {
    ...baseFields(doc, ctx, { level: s.level?.value, traits: s.traits, publication: s.publication }),
    kind: 'spell',
    description: [lines.join('\n\n'), body].filter(Boolean).join('\n\n---\n\n'),
    spellType: s.ritual ? 'ritual' : traits.includes('focus') ? 'focus' : 'spell',
    traditions: s.traits?.traditions ?? [],
    cast: castOf(s.time?.value),
  }
  if (s.range?.value) spell.range = s.range.value
  if (s.area) spell.area = s.area.details || `${s.area.value}-foot ${s.area.type}`
  if (s.target?.value) spell.targets = s.target.value
  if (s.duration?.value) spell.duration = s.duration.value
  if (s.duration?.sustained) spell.sustained = true
  if (s.defense?.save?.statistic && SAVE[s.defense.save.statistic]) spell.defense = { save: SAVE[s.defense.save.statistic], basic: !!s.defense.save.basic }
  else if (s.defense?.passive?.statistic === 'ac') spell.defense = { ac: true }
  const damage = Object.values<any>(s.damage ?? {}).filter(d => d?.formula).map(d => ({
    formula: String(d.formula),
    type: [d.category === 'persistent' ? 'persistent' : '', d.type === 'untyped' ? '' : d.type ?? ''].filter(Boolean).join(' '),
  }))
  if (damage.length) spell.damage = damage
  return spell
}

export function convertFeat(doc: FoundryDoc, ctx: ConvertContext): Feat {
  const s = doc.system ?? {}
  const feat: Feat = {
    ...baseFields(doc, ctx, { level: s.level?.value, traits: s.traits, publication: s.publication }),
    kind: 'feat',
    description: text(s.description?.value, ctx),
    category: s.category ?? 'general',
    cost: costOf(s.actionType, s.actions),
    prerequisites: (s.prerequisites?.value ?? []).map((p: any) => String(p?.value ?? p)).filter(Boolean),
  }
  const freq = frequencyOf(s.frequency)
  if (freq) feat.frequency = freq
  return feat
}

export function convertAction(doc: FoundryDoc, ctx: ConvertContext): Action {
  const s = doc.system ?? {}
  const action: Action = {
    ...baseFields(doc, ctx, { level: 0, traits: s.traits, publication: s.publication }),
    kind: 'action',
    description: text(s.description?.value, ctx),
    cost: costOf(s.actionType, s.actions),
  }
  if (s.category) action.category = s.category
  const freq = frequencyOf(s.frequency)
  if (freq) action.frequency = freq
  return action
}

export function convertCondition(doc: FoundryDoc, ctx: ConvertContext): Condition {
  const s = doc.system ?? {}
  const condition: Condition = {
    ...baseFields(doc, ctx, { level: 0, traits: s.traits, publication: s.publication }),
    kind: 'condition',
    description: text(s.description?.value, ctx),
    valued: !!s.value?.isValued,
    overrides: (s.overrides ?? []).map(humanizeSlug),
  }
  if (s.group) condition.group = s.group
  if (doc.name === 'Off-Guard') condition.aliases = ['Flat-Footed']
  return condition
}

function boostsText(boosts: any): string[] {
  return Object.values<any>(boosts ?? {}).map(b => {
    const v: string[] = b?.value ?? []
    if (!v.length) return ''
    return v.length >= 6 ? 'free' : v.map(a => ABILITY[a] ?? a).join(' or ')
  }).filter(Boolean)
}

function namesOfItems(items: any): string[] {
  return Object.values<any>(items ?? {}).map(i => i?.name).filter(Boolean)
}

/** Ancestry, heritage, background, class, deity: the facts a GM looks up, no rules automation. */
export function convertReference(doc: FoundryDoc, ctx: ConvertContext): ReferenceEntry {
  const s = doc.system ?? {}
  const facts: ReferenceEntry['facts'] = {}
  const set = (k: string, v: string | number | string[] | undefined | null) => {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return
    facts[k] = v
  }
  switch (doc.type) {
    case 'ancestry':
      set('HP', s.hp)
      set('Size', s.size)
      set('Speed', s.speed ? `${s.speed} feet` : undefined)
      set('Attribute boosts', boostsText(s.boosts))
      set('Attribute flaw', boostsText(s.flaws))
      set('Languages', [...(s.languages?.value ?? []), ...(s.languages?.custom ? [s.languages.custom] : [])])
      set('Additional languages', s.additionalLanguages?.value)
      set('Vision', s.vision && s.vision !== 'normal' ? humanizeSlug(s.vision) : undefined)
      if (s.hands && s.hands !== 2) set('Hands', s.hands)
      if (s.reach && s.reach !== 5) set('Reach', `${s.reach} feet`)
      break
    case 'heritage':
      set('Ancestry', s.ancestry?.name ?? 'Versatile')
      break
    case 'background':
      set('Attribute boosts', boostsText(s.boosts))
      set('Trained skills', [...(s.trainedSkills?.value ?? []).map(humanizeSlug), ...(s.trainedSkills?.lore ?? [])])
      set('Feat', namesOfItems(s.items))
      break
    case 'class':
      set('HP per level', s.hp)
      set('Key attribute', (s.keyAbility?.value ?? []).map((a: string) => ABILITY[a] ?? a).join(' or '))
      set('Perception', RANK[s.perception])
      for (const [k, label] of [['fortitude', 'Fortitude'], ['reflex', 'Reflex'], ['will', 'Will']] as const) set(label, RANK[s.savingThrows?.[k]])
      set('Trained skills', [...(s.trainedSkills?.value ?? []).map(humanizeSlug), ...(s.trainedSkills?.additional ? [`${s.trainedSkills.additional} more`] : [])])
      break
    case 'deity': {
      set('Category', s.category)
      set('Divine attribute', (s.attribute ?? []).map((a: string) => ABILITY[a] ?? a))
      set('Divine font', s.font)
      set('Divine skill', (s.skill ?? []).map(humanizeSlug))
      if (s.sanctification?.what?.length) set('Sanctification', `${s.sanctification.modal} be ${s.sanctification.what.join(' or ')}`)
      set('Domains', s.domains?.primary)
      set('Alternate domains', s.domains?.alternate)
      set('Favored weapon', (s.weapons ?? []).map(humanizeSlug))
      const spells = Object.entries<string>(s.spells ?? {}).map(([rank, uuid]) => {
        const target = ctx.resolveUuid(uuid)
        return target ? `${rank}: ${target.name}` : null
      }).filter((x): x is string => !!x)
      set('Cleric spells', spells)
      break
    }
  }
  return {
    ...baseFields(doc, ctx, { level: s.level?.value ?? 0, traits: s.traits, publication: s.publication }),
    kind: doc.type as ReferenceEntry['kind'],
    description: text(s.description?.value, ctx),
    facts,
  }
}
