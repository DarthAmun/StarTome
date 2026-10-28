/**
 * Foundry PF2e/SF2e document → StarTome rules entity. Pure: no database, no DOM.
 * The sync pipeline (sync/foundrySync.ts) feeds documents through convertFoundryDoc.
 */
import type { RulesEntity, RulesKind } from '~/types/rules'
import { convertCreature, convertHazard } from './actors'
import type { ConvertContext, ConvertIssue, FoundryDoc } from './common'
import { convertItem } from './items'
import { CONVERTED_TYPES } from './packs'
import { convertAction, convertCondition, convertFeat, convertReference, convertSpell } from './rulesItems'

export type { ConvertContext, ConvertIssue, FoundryDoc } from './common'
export { rulesIdFromSource, sourceOf } from './common'

const ITEM_TYPES = new Set(['weapon', 'armor', 'shield', 'equipment', 'consumable', 'treasure', 'backpack', 'ammo', 'kit'])

/** The compendium kind a Foundry document type becomes, or null if it is not converted. */
export function kindOfFoundryType(type: string): RulesKind | null {
  if (!CONVERTED_TYPES.has(type)) return null
  if (ITEM_TYPES.has(type)) return 'item'
  if (type === 'npc') return 'creature'
  return type as RulesKind
}

export interface ConvertResult { entity: RulesEntity | null; issues: ConvertIssue[] }

export function convertFoundryDoc(doc: FoundryDoc, base: Omit<ConvertContext, 'onIssue'>): ConvertResult {
  const issues: ConvertIssue[] = []
  const ctx: ConvertContext = { ...base, onIssue: (code, detail) => issues.push({ code, detail: `${doc.name}: ${detail}` }) }
  const kind = kindOfFoundryType(doc.type)
  if (!kind) return { entity: null, issues }
  try {
    let entity: RulesEntity
    if (kind === 'item') entity = convertItem(doc, ctx)
    else if (kind === 'creature') entity = convertCreature(doc, ctx)
    else if (kind === 'hazard') entity = convertHazard(doc, ctx)
    else if (kind === 'spell') entity = convertSpell(doc, ctx)
    else if (kind === 'feat') entity = convertFeat(doc, ctx)
    else if (kind === 'action') entity = convertAction(doc, ctx)
    else if (kind === 'condition') entity = convertCondition(doc, ctx)
    else entity = convertReference(doc, ctx)
    return { entity: stripUndefined(entity), issues }
  } catch (err) {
    issues.push({ code: 'convert-failed', detail: `${doc.name}: ${(err as Error).message}` })
    return { entity: null, issues }
  }
}

/** IndexedDB stores undefined fine, but stable hashing and tests want clean objects. */
function stripUndefined<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}
