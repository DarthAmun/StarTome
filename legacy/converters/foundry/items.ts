/** Foundry physical items (weapon, armor, shield, equipment, consumable, treasure, backpack, ammo, kit) → Item. */
import type { Item, ItemCategory, Runes } from '~/types/rules'
import { parseActionCost } from '~/rules/format'
import { baseFields, bulkOf, handsOf, moneyOf, text, usageOf, type ConvertContext, type FoundryDoc } from './common'

const CATEGORY: Record<string, ItemCategory> = {
  weapon: 'weapon', armor: 'armor', shield: 'shield', equipment: 'equipment', consumable: 'consumable',
  treasure: 'treasure', backpack: 'container', ammo: 'ammunition', kit: 'kit',
}

/** "**Activate** ◆◆ (manipulate)" lines in the converted description → activation entries. */
function activationsOf(markdown: string): Item['activation'] {
  const out: NonNullable<Item['activation']> = []
  const re = /\*\*Activate[^*]*\*\*\s*((?:[◆◇↺]+)(?:\s+to\s+◆+)?|[\w ]+?(?=\s*\(|$|\n|;))?\s*(?:\(([^)]*)\))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown))) {
    const cost = parseActionCost(m[1]?.trim())
    const traits = m[2]?.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    out.push({ cost, ...(traits?.length ? { traits } : {}) })
  }
  return out.length ? out : undefined
}

/** Foundry `system.runes` → Runes; undefined when the item carries none (base items). */
function runesOf(raw: any, fundamental: 'striking' | 'resilient'): Runes | undefined {
  if (!raw) return undefined
  const potency = Number(raw.potency) || 0
  const second = Number(raw[fundamental]) || 0
  const property = Array.isArray(raw.property) ? raw.property.filter((p: unknown): p is string => typeof p === 'string' && !!p) : []
  if (!potency && !second && !property.length) return undefined
  return { potency, ...(second ? { [fundamental]: second } : {}), property }
}

export function convertItem(doc: FoundryDoc, ctx: ConvertContext): Item {
  const s = doc.system ?? {}
  const category = CATEGORY[doc.type] ?? 'equipment'
  const description = text(s.description?.value, ctx)
  const usage = s.usage?.value as string | undefined
  const item: Item = {
    ...baseFields(doc, ctx, { level: s.level?.value, traits: s.traits, publication: s.publication }),
    kind: 'item',
    category,
    description,
    price: moneyOf(s.price?.value),
    bulk: bulkOf(s.bulk?.value),
  }
  const per = Number(s.price?.per)
  if (per > 1) item.priceFor = per
  if ((category === 'consumable' || category === 'treasure') && s.category) item.subcategory = s.category
  if (s.baseItem) item.baseItem = s.baseItem
  const u = usageOf(usage)
  if (u) item.usage = u
  const hands = handsOf(usage)
  if (hands) item.hands = hands
  if (s.uses?.max > 1) item.uses = { max: s.uses.max }
  const activation = activationsOf(description)
  if (activation) item.activation = activation
  if (s.material?.type) item.material = { type: s.material.type, grade: s.material.grade ?? '' }

  if (doc.type === 'weapon' && s.damage) {
    item.weapon = {
      category: s.category ?? 'simple',
      ...(s.group ? { group: s.group } : {}),
      damage: { dice: Number(s.damage.dice) || 1, die: s.damage.die ?? 'd4', type: s.damage.damageType ?? '' },
      ...(s.range ? { range: Number(s.range) } : {}),
      ...(s.reload?.value ? { reload: String(s.reload.value) } : {}),
      ...(s.ammo?.baseType || s.ammo?.capacity ? { ammo: { ...(s.ammo.baseType ? { type: s.ammo.baseType } : {}), ...(s.ammo.capacity ? { capacity: s.ammo.capacity } : {}) } } : {}),
      ...(s.expend ? { expend: Number(s.expend) } : {}),
      ...(s.grade ? { grade: s.grade } : {}),
      ...(s.splashDamage?.value ? { splash: Number(s.splashDamage.value) } : {}),
    }
    const runes = runesOf(s.runes, 'striking')
    if (runes) item.weapon.runes = runes
  }
  if (doc.type === 'armor') {
    item.armor = {
      category: s.category ?? 'light',
      ...(s.group ? { group: s.group } : {}),
      acBonus: Number(s.acBonus) || 0,
      dexCap: s.dexCap === null || s.dexCap === undefined ? null : Number(s.dexCap),
      checkPenalty: Number(s.checkPenalty) || 0,
      speedPenalty: Number(s.speedPenalty) || 0,
      strength: s.strength === null || s.strength === undefined ? null : Number(s.strength),
      ...(s.grade ? { grade: s.grade } : {}),
    }
    const runes = runesOf(s.runes, 'resilient')
    if (runes) item.armor.runes = runes
  }
  if (doc.type === 'shield') {
    const hp = Number(s.hp?.max) || 0
    item.shield = { acBonus: Number(s.acBonus) || 0, hardness: Number(s.hardness) || 0, hp, bt: Math.floor(hp / 2) }
  }
  if (doc.type === 'backpack' && s.bulk?.capacity) {
    item.container = { capacity: bulkOf(s.bulk.capacity), bulkReduction: bulkOf(s.bulk.ignored) }
  }
  return item
}
