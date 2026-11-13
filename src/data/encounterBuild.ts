/**
 * The encounter builder's "Create encounter": a new prepared encounter with
 * the party on the left and every chosen enemy on free squares to the right.
 * The builder's selection itself is a draft kept in the campaign's workspace.
 */
import { adjustedName, tokenStats, type Adjustment } from '@/domain/rules/combat'
import { partyMembers } from '@/domain/rules/party'
import { actors, addCombatant, createEncounter, imageOfRules } from './encounters'
import { partyOf } from './party'
import { rulesGet } from './rules'

export interface BuildSlot { rulesId: string; count: number; adjustment: Adjustment | null }

export interface BuildState {
  name: string
  slots: BuildSlot[]
  /** Overrides the party's level; null follows the party. */
  partyLevel: number | null
}

export const emptyBuild = (): BuildState => ({ name: '', slots: [], partyLevel: null })

/** A draft read back from the workspace: anything malformed is left out. */
export function readBuild(raw: unknown): BuildState {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<BuildState>
  const slots = Array.isArray(v.slots) ? v.slots.filter(s => s && typeof s.rulesId === 'string' && typeof s.count === 'number') : []
  return { name: typeof v.name === 'string' ? v.name : '', slots: slots.map(s => ({ rulesId: s.rulesId, count: Math.max(1, Math.floor(s.count)), adjustment: s.adjustment === 'weak' || s.adjustment === 'elite' ? s.adjustment : null })), partyLevel: typeof v.partyLevel === 'number' ? v.partyLevel : null }
}

/** Hands out squares column by column, so tokens of any size do not overlap. */
export function columnPlacer(startX: number, startY: number, rows: number): (size: number) => { x: number; y: number } {
  let x = startX, y = startY, width = 1
  return (size) => {
    if (y > startY && y + size > startY + rows) { x += width + 1; y = startY; width = 1 }
    const at = { x, y }
    y += size + 1
    width = Math.max(width, size)
    return at
  }
}

export interface CreateResult { encounterId: string; /** Slots whose compendium entry no longer exists. */ missing: number }

export async function createEncounterFromBuild(campaignId: string, build: BuildState): Promise<CreateResult> {
  const enc = await createEncounter(campaignId, build.name.trim() || 'New encounter', { partyLevel: build.partyLevel })
  const placeParty = columnPlacer(2, 2, 10)
  for (const c of partyMembers(await partyOf(campaignId))) {
    const actor = await actors.forCharacter(c.id)
    if (!actor) continue
    const entry = actor.statBlock ? await rulesGet(actor.statBlock.rulesId).catch(() => undefined) : undefined
    const stats = tokenStats(entry, actor.statBlock?.adjustment ?? null)
    await addCombatant(enc.id, {
      ...placeParty(stats.size), actorId: actor.id, ref: { kind: 'character', characterId: c.id }, statBlock: actor.statBlock, size: stats.size,
      hp: { current: stats.hpMax, max: stats.hpMax, temp: 0 }, ac: stats.ac, playerToken: true,
    })
  }
  const placeEnemy = columnPlacer(10, 2, 10)
  let missing = 0
  for (const slot of build.slots) {
    const entry = await rulesGet(slot.rulesId).catch(() => undefined)
    if (!entry) { missing++; continue }
    const stats = tokenStats(entry, slot.adjustment)
    for (let i = 0; i < slot.count; i++) {
      await addCombatant(enc.id, {
        ...placeEnemy(stats.size), ref: { kind: 'rules', rulesId: slot.rulesId, adjustment: slot.adjustment }, size: stats.size,
        label: slot.count > 1 ? `${adjustedName(entry.name, slot.adjustment)} ${i + 1}` : null,
        hp: { current: stats.hpMax, max: stats.hpMax, temp: 0 }, ac: stats.ac, image: imageOfRules((entry as { tokenImg?: string | null }).tokenImg ?? null),
      })
    }
  }
  return { encounterId: enc.id, missing }
}
