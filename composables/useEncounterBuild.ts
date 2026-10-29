/**
 * Encounter builder (FEATURES_PLAN.md P2): the unsaved selection, kept per
 * campaign in the browser, and "Create encounter", which turns it into a VTT
 * encounter with the party's tokens and every enemy placed on free squares.
 * The builder itself is a tool; the VTT encounter is the only saved thing.
 */
import { ref, watch } from 'vue'
import { dbApi, getDb } from '~/composables/useDb'
import { useParty, type Character } from '~/composables/useParty'
import { rulesGet } from '~/composables/useRules'
import { adjustedName, tokenStats, type Adjustment } from '~/rules/combat'
import { partyMembers } from '~/rules/party'
import { lsKey } from '~/utils/appNamespace'

export interface BuildSlot {
  rulesId: string
  count: number
  adjustment: Adjustment | null
}

export interface BuildState {
  name: string
  slots: BuildSlot[]
  /** Overrides the party tab's level; null follows the party. */
  partyLevel: number | null
}

function emptyBuild(): BuildState {
  return { name: '', slots: [], partyLevel: null }
}

function storageKey(campaignId: number) {
  return lsKey(`encounterBuilder.${campaignId}`)
}

function readBuild(campaignId: number): BuildState {
  try {
    const raw = localStorage.getItem(storageKey(campaignId))
    if (!raw) return emptyBuild()
    const parsed = JSON.parse(raw) as Partial<BuildState>
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      slots: Array.isArray(parsed.slots) ? parsed.slots.filter(s => s && typeof s.rulesId === 'string') : [],
      partyLevel: typeof parsed.partyLevel === 'number' ? parsed.partyLevel : null,
    }
  } catch {
    return emptyBuild()
  }
}

/** The selection for one campaign, saved to localStorage on every change. */
export function useBuildState(campaignId: number) {
  const state = ref<BuildState>(readBuild(campaignId))
  watch(state, (s) => {
    try { localStorage.setItem(storageKey(campaignId), JSON.stringify(s)) } catch {}
  }, { deep: true })

  function add(rulesId: string, adjustment: Adjustment | null = null) {
    const slot = state.value.slots.find(s => s.rulesId === rulesId && s.adjustment === adjustment)
    if (slot) slot.count++
    else state.value.slots.push({ rulesId, count: 1, adjustment })
  }

  function remove(index: number) {
    state.value.slots.splice(index, 1)
  }

  function clear() {
    state.value = emptyBuild()
  }

  return { state, add, remove, clear }
}

// ── Create encounter ───────────────────────────────────────────────────────

/** Library token for a party member: the remembered one, the NPC's, or a new one from name and portrait. */
async function partyToken(c: Character) {
  const db = getDb()
  if (c.tokenId) {
    const tok = await db.tokens.get(c.tokenId)
    if (tok) return tok
  }
  if (c.npcEntityId) {
    const tok = await db.tokens.where('is_template').equals(1).filter(t => t.linked_entity_id === c.npcEntityId).first()
    if (tok) return tok
  }
  const img = c.npcEntityId ? await dbApi.linkedImages.get(c.npcEntityId) : null
  return dbApi.tokens.create({
    name: c.name,
    imageSource: img?.source ?? null,
    imageType: img?.type ?? 'file',
    linkedEntityId: c.npcEntityId,
    isPlayerCharacter: true,
    syncImage: !!c.npcEntityId,
  })
}

/** Hands out squares column by column, so tokens of any size don't overlap. */
function columnPlacer(startX: number, startY: number, rows: number) {
  let x = startX
  let y = startY
  let colWidth = 1
  return (size: number) => {
    if (y > startY && y + size > startY + rows) {
      x += colWidth + 1
      y = startY
      colWidth = 1
    }
    const at = { gridX: x, gridY: y }
    y += size + 1
    colWidth = Math.max(colWidth, size)
    return at
  }
}

export interface CreateResult {
  encounterId: number
  /** Slots whose compendium entry no longer exists. */
  missing: number
}

/** Makes a new prepared VTT encounter with the party and the selected enemies on it. */
export async function createEncounterFromBuild(campaignId: number, build: BuildState, characters: Character[]): Promise<CreateResult | null> {
  const enc = await dbApi.encounters.create({ campaignId, name: build.name.trim() || 'New Encounter' })
  if (!enc?.id) return null
  await dbApi.encounters.update({ id: enc.id, status: 'prepared', party_level: build.partyLevel })

  // Party on the left
  const placeParty = columnPlacer(2, 2, 10)
  for (const c of partyMembers(characters)) {
    const tok = await partyToken(c)
    if (!tok?.id) continue
    await useParty().linkToken(c.id, tok.id)
    const entry = tok.linked_rules_id ? await rulesGet(tok.linked_rules_id).catch(() => undefined) : undefined
    const stats = tokenStats(entry, tok.rules_adjustment ?? null)
    await dbApi.encounterTokens.add({
      encounterId: enc.id,
      tokenId: tok.id,
      ...placeParty(stats.size),
      size: stats.size,
      hpCurrent: stats.hpMax,
      hpMax: stats.hpMax,
      ac: stats.ac,
      linkedRulesId: tok.linked_rules_id ?? null,
      adjustment: tok.rules_adjustment ?? null,
      linkedEntityId: tok.linked_entity_id ?? null,
      isPlayerToken: true,
    })
  }

  // Enemies on the right, numbered when there are several of one kind
  const placeEnemy = columnPlacer(10, 2, 10)
  let missing = 0
  for (const slot of build.slots) {
    const entry = await rulesGet(slot.rulesId).catch(() => undefined)
    if (!entry) { missing++; continue }
    const stats = tokenStats(entry, slot.adjustment)
    const img = await dbApi.linkedImages.get(null, slot.rulesId)
    for (let i = 0; i < slot.count; i++) {
      await dbApi.encounterTokens.add({
        encounterId: enc.id,
        tokenId: null,
        ...placeEnemy(stats.size),
        size: stats.size,
        label: slot.count > 1 ? `${adjustedName(entry.name, slot.adjustment)} ${i + 1}` : null,
        hpCurrent: stats.hpMax,
        hpMax: stats.hpMax,
        ac: stats.ac,
        linkedRulesId: slot.rulesId,
        adjustment: slot.adjustment,
        imageSource: img?.source ?? null,
        imageType: img?.type ?? 'file',
      })
    }
  }
  return { encounterId: enc.id, missing }
}
