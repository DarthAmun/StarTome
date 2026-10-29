/**
 * Party repository (FEATURES_PLAN.md P1): characters, level-ups and the
 * milestone prompt. The only module that writes `characters` and `levelUps`.
 *
 * PCs used to be NPC entries flagged `isPlayerCharacter`. On load, every such
 * NPC without a character gets one, so the old workflow (flag an NPC as PC)
 * keeps working. A character's level is mirrored to its NPC entry's free-text
 * `level` so the NPC page shows the same number.
 */
import { computed, ref } from 'vue'
import { getDb, now, parseRecordData, type DbCharacter, type DbLevelUp } from '~/composables/useDb'
import { useEntities } from '~/composables/useEntities'
import { clampLevel, defaultLevelUpSelection, parseLevel, partyLevel, planLevelUp, type CharacterRole, type LevelChange, type PartyCharacter } from '~/rules/party'
import type { NpcAttributes } from '~/types/entities'

export interface Character extends PartyCharacter {
  campaignId: number
  xp: number
  strMod: number | null
  npcEntityId: number | null
  /** Library token the encounter builder places for this character. */
  tokenId: number | null
}

export interface LevelUpEntry {
  id: number
  at: string
  trigger: DbLevelUp['trigger']
  refId: number | null
  changes: LevelChange[]
  undoneAt: string | null
}

function toCharacter(r: DbCharacter): Character {
  return {
    id: r.id!, campaignId: r.campaign_id, name: r.name, role: r.role,
    level: r.level, xp: r.xp ?? 0, treatAsPc: r.role === 'pc' || !!r.treat_as_pc,
    strMod: r.str_mod ?? null, npcEntityId: r.npc_entity_id ?? null, tokenId: r.token_id ?? null,
  }
}

function toLevelUp(r: DbLevelUp): LevelUpEntry {
  let changes: LevelChange[] = []
  try { changes = JSON.parse(r.changes) } catch {}
  return { id: r.id!, at: r.at, trigger: r.trigger, refId: r.ref_id ?? null, changes, undoneAt: r.undone_at ?? null }
}

const characters = ref<Character[]>([])
const levelUps = ref<LevelUpEntry[]>([])
const loadedCampaign = ref<number | null>(null)

/** "Level up the party?" — set by a completed milestone quest, shown by LevelUpDialog in app.vue. */
export interface LevelUpPrompt { campaignId: number; trigger: DbLevelUp['trigger']; refId: number | null; reason: string }
const prompt = ref<LevelUpPrompt | null>(null)

async function npcAttributes(npcId: number): Promise<Record<string, any>> {
  const cached = useEntities().entities.find(e => e.id === npcId)
  if (cached) return { ...(cached.attributes as Record<string, any>) }
  return parseRecordData((await getDb().entities.get(npcId))?.attributes)
}

async function patchNpc(npcId: number | null, patch: Partial<NpcAttributes>) {
  if (!npcId) return
  if (!(await getDb().entities.get(npcId))) return
  const attrs = await npcAttributes(npcId)
  await useEntities().updateEntity(npcId, { attributes: { ...attrs, ...patch } as NpcAttributes })
}

/** Creates characters for PC-flagged NPCs that don't have one yet. */
async function adoptFlaggedNpcs(campaignId: number) {
  const db = getDb()
  const [npcs, existing] = await Promise.all([
    db.entities.where('campaign_id').equals(campaignId).filter(e => e.type === 'npc').toArray(),
    db.characters.where('campaign_id').equals(campaignId).toArray(),
  ])
  const linked = new Set(existing.map(c => c.npc_entity_id).filter((id): id is number => id != null))
  const ts = now()
  const fresh = npcs
    .filter(n => !linked.has(n.id!) && parseRecordData(n.attributes).isPlayerCharacter)
    .map((n): DbCharacter => ({
      campaign_id: campaignId, name: n.name, role: 'pc',
      level: parseLevel(parseRecordData(n.attributes).level) ?? 1, xp: 0, treat_as_pc: 1, str_mod: null,
      npc_entity_id: n.id!, created_at: ts, updated_at: ts,
    }))
  if (fresh.length) await db.characters.bulkAdd(fresh)
}

async function load(campaignId: number) {
  await adoptFlaggedNpcs(campaignId)
  const db = getDb()
  const [rows, ups] = await Promise.all([
    db.characters.where('campaign_id').equals(campaignId).toArray(),
    db.levelUps.where('campaign_id').equals(campaignId).toArray(),
  ])
  loadedCampaign.value = campaignId
  characters.value = rows.map(toCharacter).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'pc' ? -1 : 1))
  levelUps.value = ups.map(toLevelUp).sort((a, b) => b.at.localeCompare(a.at))
}

async function reloadIfLoaded(campaignId: number) {
  if (loadedCampaign.value === campaignId) await load(campaignId)
}

async function addCharacter(input: { campaignId: number; name: string; role: CharacterRole; npcEntityId?: number | null; level?: number }) {
  const ts = now()
  const npcLevel = input.npcEntityId ? parseLevel((await npcAttributes(input.npcEntityId)).level) : null
  const level = clampLevel(input.level ?? npcLevel ?? partyLevel(characters.value).level ?? 1)
  await getDb().characters.add({
    campaign_id: input.campaignId, name: input.name.trim(), role: input.role, level, xp: 0,
    treat_as_pc: input.role === 'pc' ? 1 : 0, str_mod: null, npc_entity_id: input.npcEntityId ?? null,
    created_at: ts, updated_at: ts,
  })
  // Keep the NPC's PC flag in line, so tokens and the NPC list agree with the party
  if (input.role === 'pc') await patchNpc(input.npcEntityId ?? null, { isPlayerCharacter: true, level: String(level) })
  else await patchNpc(input.npcEntityId ?? null, { level: String(level) })
  await reloadIfLoaded(input.campaignId)
}

async function updateCharacter(id: number, patch: Partial<Pick<Character, 'name' | 'role' | 'level' | 'treatAsPc' | 'strMod'>>) {
  const c = characters.value.find(x => x.id === id) ?? (await getDb().characters.get(id).then(r => (r ? toCharacter(r) : undefined)))
  if (!c) return
  const changes: Partial<DbCharacter> = { updated_at: now() }
  if (patch.name !== undefined) changes.name = patch.name.trim()
  if (patch.role !== undefined) changes.role = patch.role
  if (patch.level !== undefined) changes.level = clampLevel(patch.level)
  if (patch.treatAsPc !== undefined) changes.treat_as_pc = patch.treatAsPc ? 1 : 0
  if (patch.strMod !== undefined) changes.str_mod = patch.strMod
  await getDb().characters.update(id, changes)
  const npcPatch: Partial<NpcAttributes> = {}
  if (changes.level !== undefined) npcPatch.level = String(changes.level)
  if (patch.role !== undefined) npcPatch.isPlayerCharacter = patch.role === 'pc'
  if (Object.keys(npcPatch).length) await patchNpc(c.npcEntityId, npcPatch)
  await reloadIfLoaded(c.campaignId)
}

/** Remembers the library token that stands for the character on the map. */
async function linkToken(id: number, tokenId: number | null) {
  const row = await getDb().characters.get(id)
  if (!row || (row.token_id ?? null) === tokenId) return
  await getDb().characters.update(id, { token_id: tokenId, updated_at: now() })
  await reloadIfLoaded(row.campaign_id)
}

/** Removes the character from the party. The NPC entry stays; a PC loses its PC flag so it isn't re-adopted. */
async function removeCharacter(id: number) {
  const row = await getDb().characters.get(id)
  if (!row) return
  if (row.role === 'pc') await patchNpc(row.npc_entity_id, { isPlayerCharacter: false })
  await getDb().characters.delete(id)
  await reloadIfLoaded(row.campaign_id)
}

/** Raises each selected character by one level and records the action. Returns the log entry id. */
async function levelUp(campaignId: number, selected: number[], trigger: DbLevelUp['trigger'] = 'manual', refId: number | null = null): Promise<number | null> {
  const db = getDb()
  const rows = (await db.characters.where('campaign_id').equals(campaignId).toArray()).map(toCharacter)
  const changes = planLevelUp(rows, selected)
  if (!changes.length) return null
  const ts = now()
  const logId = await db.transaction('rw', db.characters, db.levelUps, async () => {
    for (const ch of changes) await db.characters.update(ch.characterId, { level: ch.to, updated_at: ts })
    return db.levelUps.add({ campaign_id: campaignId, at: ts, trigger, ref_id: refId, changes: JSON.stringify(changes), undone_at: null })
  }) as number
  for (const ch of changes) await patchNpc(rows.find(r => r.id === ch.characterId)?.npcEntityId ?? null, { level: String(ch.to) })
  await reloadIfLoaded(campaignId)
  return logId
}

/** Reverts a level-up for every character still at the level it raised them to. */
async function undoLevelUp(logId: number) {
  const db = getDb()
  const row = await db.levelUps.get(logId)
  if (!row || row.undone_at) return
  const entry = toLevelUp(row)
  const ts = now()
  const reverted: { npcId: number | null; level: number }[] = []
  await db.transaction('rw', db.characters, db.levelUps, async () => {
    for (const ch of entry.changes) {
      const c = await db.characters.get(ch.characterId)
      if (c && c.level === ch.to) {
        await db.characters.update(ch.characterId, { level: ch.from, updated_at: ts })
        reverted.push({ npcId: c.npc_entity_id, level: ch.from })
      }
    }
    await db.levelUps.update(logId, { undone_at: ts })
  })
  for (const r of reverted) await patchNpc(r.npcId, { level: String(r.level) })
  await reloadIfLoaded(row.campaign_id)
}

function requestLevelUp(p: LevelUpPrompt) { prompt.value = p }
function dismissPrompt() { prompt.value = null }

export function useParty() {
  return {
    characters,
    levelUps,
    loadedCampaign,
    prompt,
    party: computed(() => partyLevel(characters.value)),
    defaultSelection: computed(() => defaultLevelUpSelection(characters.value)),
    load, addCharacter, updateCharacter, removeCharacter, linkToken, levelUp, undoLevelUp,
    requestLevelUp, dismissPrompt,
  }
}
