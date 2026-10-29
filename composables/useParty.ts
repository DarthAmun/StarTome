/**
 * Party repository (FEATURES_PLAN.md P1): characters, level-ups and the
 * milestone prompt. The only module that writes `characters` and `levelUps`.
 *
 * PCs used to be NPC entries flagged `isPlayerCharacter`. On load, every such
 * NPC without a character gets one, so the old workflow (flag an NPC as PC)
 * keeps working. A character's level is mirrored to its NPC entry's free-text
 * `level` so the NPC page shows the same number.
 *
 * XP campaigns (P4): awards are logged in `xpAwards` and can be undone; a
 * level-up costs 1,000 XP, and reaching it opens the level-up prompt.
 */
import { computed, ref } from 'vue'
import { dbApi, getDb, now, parseRecordData, type DbCharacter, type DbLevelUp, type DbXpAward } from '~/composables/useDb'
import { useEntities } from '~/composables/useEntities'
import { useInventory } from '~/composables/useInventory'
import { characterOwner } from '~/rules/inventory'
import { readyToLevel, XP_PER_LEVEL } from '~/rules/advancement'
import { clampLevel, defaultLevelUpSelection, parseLevel, partyLevel, planLevelUp, type CharacterRole, type LevelChange, type PartyCharacter } from '~/rules/party'
import type { NpcAttributes } from '~/types/entities'
import { campaignRules } from '~/types/game'

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

export interface XpAwardEntry {
  id: number
  at: string
  source: DbXpAward['source']
  refType: DbXpAward['ref_type']
  refId: number | null
  amount: number
  characterIds: number[]
  reason: string
  undoneAt: string | null
}

function toXpAward(r: DbXpAward): XpAwardEntry {
  let characterIds: number[] = []
  try { characterIds = JSON.parse(r.character_ids) } catch {}
  return {
    id: r.id!, at: r.at, source: r.source, refType: r.ref_type ?? null, refId: r.ref_id ?? null,
    amount: r.amount, characterIds, reason: r.reason ?? '', undoneAt: r.undone_at ?? null,
  }
}

function toLevelUp(r: DbLevelUp): LevelUpEntry {
  let changes: LevelChange[] = []
  try { changes = JSON.parse(r.changes) } catch {}
  return { id: r.id!, at: r.at, trigger: r.trigger, refId: r.ref_id ?? null, changes, undoneAt: r.undone_at ?? null }
}

const characters = ref<Character[]>([])
const levelUps = ref<LevelUpEntry[]>([])
const xpAwards = ref<XpAwardEntry[]>([])
const loadedCampaign = ref<number | null>(null)

/** "Level up the party?" — set by a completed milestone quest, shown by LevelUpDialog in app.vue. */
export interface LevelUpPrompt {
  campaignId: number
  trigger: DbLevelUp['trigger']
  refId: number | null
  reason: string
  /** Pre-ticked characters; default every party member. */
  selected?: number[]
}
const prompt = ref<LevelUpPrompt | null>(null)

/** "Award XP" — opened from the party page, a completed quest or the resolve dialog; shown by AwardXpDialog in app.vue. */
export interface XpPrompt { campaignId: number; refType: DbXpAward['ref_type']; refId: number | null; reason: string; amount?: number }
const xpPrompt = ref<XpPrompt | null>(null)

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
  const [rows, ups, awards] = await Promise.all([
    db.characters.where('campaign_id').equals(campaignId).toArray(),
    db.levelUps.where('campaign_id').equals(campaignId).toArray(),
    db.xpAwards.where('campaign_id').equals(campaignId).toArray(),
  ])
  loadedCampaign.value = campaignId
  characters.value = rows.map(toCharacter).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'pc' ? -1 : 1))
  levelUps.value = ups.map(toLevelUp).sort((a, b) => b.at.localeCompare(a.at))
  xpAwards.value = awards.map(toXpAward).sort((a, b) => b.at.localeCompare(a.at))
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

async function updateCharacter(id: number, patch: Partial<Pick<Character, 'name' | 'role' | 'level' | 'treatAsPc' | 'strMod' | 'xp'>>) {
  const c = characters.value.find(x => x.id === id) ?? (await getDb().characters.get(id).then(r => (r ? toCharacter(r) : undefined)))
  if (!c) return
  const changes: Partial<DbCharacter> = { updated_at: now() }
  if (patch.name !== undefined) changes.name = patch.name.trim()
  if (patch.role !== undefined) changes.role = patch.role
  if (patch.level !== undefined) changes.level = clampLevel(patch.level)
  if (patch.treatAsPc !== undefined) changes.treat_as_pc = patch.treatAsPc ? 1 : 0
  if (patch.strMod !== undefined) changes.str_mod = patch.strMod
  if (patch.xp !== undefined && Number.isFinite(patch.xp)) changes.xp = Math.max(0, Math.round(patch.xp))
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

/**
 * Removes the character from the party. The NPC entry stays; a PC loses its PC
 * flag so it isn't re-adopted. Their items and coins go to the party stash.
 */
async function removeCharacter(id: number) {
  const row = await getDb().characters.get(id)
  if (!row) return
  await useInventory().releaseOwner(row.campaign_id, characterOwner(id))
  if (row.role === 'pc') await patchNpc(row.npc_entity_id, { isPlayerCharacter: false })
  await getDb().characters.delete(id)
  await reloadIfLoaded(row.campaign_id)
}

/** Raises each selected character by one level and records the action. Returns the log entry id. */
async function levelUp(campaignId: number, selected: number[], trigger: DbLevelUp['trigger'] = 'manual', refId: number | null = null): Promise<number | null> {
  const db = getDb()
  const rows = (await db.characters.where('campaign_id').equals(campaignId).toArray()).map(toCharacter)
  const xpMode = campaignRules(await dbApi.campaigns.get(campaignId)).advancement === 'xp'
  const changes = planLevelUp(rows, selected, xpMode ? XP_PER_LEVEL : undefined)
  if (!changes.length) return null
  const ts = now()
  const logId = await db.transaction('rw', db.characters, db.levelUps, async () => {
    for (const ch of changes) {
      await db.characters.update(ch.characterId, { level: ch.to, ...(ch.xpTo !== undefined ? { xp: ch.xpTo } : {}), updated_at: ts })
    }
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
        // XP earned since the level-up stays on top of what the level cost
        const xp = ch.xpFrom !== undefined && ch.xpTo !== undefined ? { xp: (c.xp ?? 0) + ch.xpFrom - ch.xpTo } : {}
        await db.characters.update(ch.characterId, { level: ch.from, ...xp, updated_at: ts })
        reverted.push({ npcId: c.npc_entity_id, level: ch.from })
      }
    }
    await db.levelUps.update(logId, { undone_at: ts })
  })
  for (const r of reverted) await patchNpc(r.npcId, { level: String(r.level) })
  await reloadIfLoaded(row.campaign_id)
}

// ── XP ──

export interface AwardXpInput {
  campaignId: number
  amount: number
  characterIds: number[]
  source: DbXpAward['source']
  refType?: DbXpAward['ref_type']
  refId?: number | null
  reason?: string
}

/** Writes an award and the characters' XP. Runs inside a caller's transaction; doesn't reload. */
async function writeXpAward(input: AwardXpInput): Promise<number | null> {
  const amount = Math.round(input.amount)
  const ids = [...new Set(input.characterIds)]
  if (!amount || !ids.length) return null
  const db = getDb()
  const ts = now()
  return db.transaction('rw', db.characters, db.xpAwards, async () => {
    for (const id of ids) {
      const c = await db.characters.get(id)
      if (c) await db.characters.update(id, { xp: Math.max(0, (c.xp ?? 0) + amount), updated_at: ts })
    }
    return db.xpAwards.add({
      campaign_id: input.campaignId, at: ts, source: input.source, ref_type: input.refType ?? null, ref_id: input.refId ?? null,
      amount, character_ids: JSON.stringify(ids), reason: input.reason ?? '', undone_at: null,
    }) as Promise<number>
  })
}

/** Reverts an award's XP (never below 0). Runs inside a caller's transaction; doesn't reload. */
async function writeXpUndo(awardId: number) {
  const db = getDb()
  await db.transaction('rw', db.characters, db.xpAwards, async () => {
    const row = await db.xpAwards.get(awardId)
    if (!row || row.undone_at) return
    const ts = now()
    for (const id of toXpAward(row).characterIds) {
      const c = await db.characters.get(id)
      if (c) await db.characters.update(id, { xp: Math.max(0, (c.xp ?? 0) - row.amount), updated_at: ts })
    }
    await db.xpAwards.update(awardId, { undone_at: ts })
  })
}

/** Characters of an XP campaign who can level up now: opens the level-up prompt for them. */
async function promptReadyToLevel(campaignId: number, trigger: DbLevelUp['trigger'], refId: number | null) {
  if (campaignRules(await dbApi.campaigns.get(campaignId)).advancement !== 'xp') return
  const rows = (await getDb().characters.where('campaign_id').equals(campaignId).toArray()).map(toCharacter)
  const ready = readyToLevel(rows)
  if (!ready.length) return
  const names = rows.filter(c => ready.includes(c.id)).map(c => c.name).join(', ')
  prompt.value = { campaignId, trigger, refId, reason: `${names} reached ${XP_PER_LEVEL.toLocaleString()} XP. Levelling up costs ${XP_PER_LEVEL.toLocaleString()} XP each.`, selected: ready }
}

/** Awards XP to each character and offers a level-up to anyone who reached 1,000. */
async function awardXp(input: AwardXpInput): Promise<number | null> {
  const id = await writeXpAward(input)
  await reloadIfLoaded(input.campaignId)
  if (id != null) await promptReadyToLevel(input.campaignId, input.refType === 'encounter' ? 'encounter' : input.refType === 'quest' ? 'quest' : 'manual', input.refId ?? null)
  return id
}

async function undoXpAward(awardId: number) {
  const row = await getDb().xpAwards.get(awardId)
  if (!row) return
  await writeXpUndo(awardId)
  await reloadIfLoaded(row.campaign_id)
}

function requestLevelUp(p: LevelUpPrompt) { prompt.value = p }
function dismissPrompt() { prompt.value = null }
function requestXpAward(p: XpPrompt) { xpPrompt.value = p }
function dismissXpPrompt() { xpPrompt.value = null }

export function useParty() {
  return {
    characters,
    levelUps,
    xpAwards,
    loadedCampaign,
    prompt,
    xpPrompt,
    party: computed(() => partyLevel(characters.value)),
    defaultSelection: computed(() => defaultLevelUpSelection(characters.value)),
    load, addCharacter, updateCharacter, removeCharacter, linkToken, levelUp, undoLevelUp,
    requestLevelUp, dismissPrompt, requestXpAward, dismissXpPrompt,
    awardXp, undoXpAward, writeXpAward, writeXpUndo, promptReadyToLevel, reload: reloadIfLoaded,
  }
}
