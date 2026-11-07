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
 *
 * "Player character" has one source, the party (FORK_PLAN §14 ARCH-01): a PC
 * is a character with role 'pc'. The NPC's `isPlayerCharacter`, the library
 * token's `is_player_character` and its placements' `is_player_token` are
 * caches that only `syncPcFlags` writes; the NPC page's toggle goes through
 * `setNpcPlayerCharacter`.
 */
import { computed, ref } from 'vue'
import { dbApi, getDb, now, parseJsonObject, type DbCharacter, type DbLevelUp, type DbXpAward } from '~/composables/useDb'
import { useEntities } from '~/composables/useEntities'
import { useInventory } from '~/composables/useInventory'
import { characterOwner } from '~/rules/inventory'
import { readyToLevel, XP_PER_LEVEL } from '~/rules/advancement'
import { clampLevel, defaultLevelUpSelection, parseLevel, partyLevel, planLevelUp, type CharacterRole, type LevelChange, type PartyCharacter } from '~/rules/party'
import type { NpcAttributes } from '~/types/entities'
import { parseJson, toPlain } from '~/utils/json'
import { onDomainEvent } from '~/composables/useDomainEvents'
import { onTablesChanged } from '~/db/changes'
import type { CharacterMirror } from '~/partylink/port'
import { companionStats, type CompanionBuild } from '~/rules/companions'
import { newRulesId } from '~/rules/factory'
import { rulesGet, rulesSaveUser } from '~/composables/useRules'
import { campaignGame, campaignRules } from '~/types/game'
import type { Creature } from '~/types/rules'

export interface Character extends PartyCharacter {
  campaignId: number
  xp: number
  strMod: number | null
  npcEntityId: number | null
  /** Library token the encounter builder places for this character. */
  tokenId: number | null
  /** Linked Play Buddy player (PLAYBUDDY_API.md); their app owns the sheet. */
  pbPlayerId: string | null
  /** What that player last shared. */
  pbStatus: CharacterMirror | null
  /** Companion type and stage (rules/companions.ts); its stat block is `companionRulesId`. */
  companion: CompanionBuild | null
  companionRulesId: string | null
  /** SF2e skills entered by hand (starship crew cards); Play Buddy values win once it supports SF2e (P10). */
  sfSkills: Record<string, number>
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
    pbPlayerId: r.pb_player_id ?? null, pbStatus: r.pb_status ?? null,
    companion: r.companion ?? null, companionRulesId: r.companion_rules_id ?? null, sfSkills: r.sf_skills ?? {},
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
  const characterIds = parseJson<number[]>(r.character_ids, [])
  return {
    id: r.id!, at: r.at, source: r.source, refType: r.ref_type ?? null, refId: r.ref_id ?? null,
    amount: r.amount, characterIds, reason: r.reason ?? '', undoneAt: r.undone_at ?? null,
  }
}

function toLevelUp(r: DbLevelUp): LevelUpEntry {
  const changes = parseJson<LevelChange[]>(r.changes, [])
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
  return parseJsonObject((await getDb().entities.get(npcId))?.attributes)
}

async function patchNpc(npcId: number | null, patch: Partial<NpcAttributes>) {
  if (!npcId) return
  if (!(await getDb().entities.get(npcId))) return
  const attrs = await npcAttributes(npcId)
  await useEntities().updateEntity(npcId, { attributes: { ...attrs, ...patch } as NpcAttributes })
}

/**
 * What the party says about a token: true/false when the token stands for a
 * party member (its NPC is one, or a character places it), null when the
 * party has no say and the token's own flag counts.
 */
export async function partyPcFlag(tokenId: number | null | undefined, linkedEntityId: number | null | undefined): Promise<boolean | null> {
  const db = getDb()
  const byNpc = linkedEntityId ? await db.characters.where('npc_entity_id').equals(linkedEntityId).toArray() : []
  const byToken = tokenId ? await db.characters.filter(c => c.token_id === tokenId).toArray() : []
  const all = [...byNpc, ...byToken]
  if (!all.length) return linkedEntityId ? false : null
  return all.some(c => c.role === 'pc')
}

/** Writes the cached PC flags of an NPC, its library tokens and their placements from the party. */
async function syncPcFlags(npcId: number | null | undefined, tokenId?: number | null) {
  const db = getDb()
  const tokenIds = new Set<number>()
  if (tokenId) tokenIds.add(tokenId)
  if (npcId) {
    const isPc = await db.characters.where('npc_entity_id').equals(npcId).filter(c => c.role === 'pc').count() > 0
    const attrs = await npcAttributes(npcId)
    if (!!attrs.isPlayerCharacter !== isPc && await db.entities.get(npcId)) {
      await useEntities().updateEntity(npcId, { attributes: { ...attrs, isPlayerCharacter: isPc } as NpcAttributes })
    }
    for (const id of await db.tokens.filter(t => t.linked_entity_id === npcId).primaryKeys()) tokenIds.add(id as number)
  }
  for (const id of tokenIds) {
    const tok = await db.tokens.get(id)
    if (!tok) continue
    const isPc = await partyPcFlag(id, tok.linked_entity_id)
    if (isPc == null || !!tok.is_player_character === isPc) continue
    await dbApi.tokens.update(id, { isPlayerCharacter: isPc })
    await dbApi.encounterTokens.setPlayerFlagForLibraryToken(id, isPc)
  }
}

/**
 * The NPC page's "Player character" toggle: on adds the NPC to the party as a
 * PC, off removes that character (their items and coins go to the stash).
 */
async function setNpcPlayerCharacter(campaignId: number, npcId: number, isPc: boolean) {
  const db = getDb()
  const row = await db.characters.where('npc_entity_id').equals(npcId).first()
  if (isPc) {
    if (!row) {
      const npc = await db.entities.get(npcId)
      await addCharacter({ campaignId, name: npc?.name ?? 'Player character', role: 'pc', npcEntityId: npcId })
    } else if (row.role !== 'pc') {
      await updateCharacter(row.id!, { role: 'pc' })
    }
  } else if (row?.role === 'pc') {
    await removeCharacter(row.id!)
  }
  await syncPcFlags(npcId, row?.token_id)
}

/** Creates characters for PC-flagged NPCs that don't have one yet. */
async function adoptFlaggedNpcs(campaignId: number) {
  const db = getDb()
  // Read and write in one transaction: concurrent loads (party page, encounter
  // page, resolve dialog) would otherwise adopt the same NPC twice (BUG-10)
  let adopted: (number | null)[] = []
  await db.transaction('rw', db.entities, db.characters, async () => {
    const [npcs, existing] = await Promise.all([
      db.entities.where('[campaign_id+type]').equals([campaignId, 'npc']).toArray(),
      db.characters.where('campaign_id').equals(campaignId).toArray(),
    ])
    const linked = new Set(existing.map(c => c.npc_entity_id).filter((id): id is number => id != null))
    const ts = now()
    const fresh = npcs
      .filter(n => !linked.has(n.id!) && parseJsonObject(n.attributes).isPlayerCharacter)
      .map((n): DbCharacter => ({
        campaign_id: campaignId, name: n.name, role: 'pc',
        level: parseLevel(parseJsonObject(n.attributes).level) ?? 1, xp: 0, treat_as_pc: 1, str_mod: null,
        npc_entity_id: n.id!, created_at: ts, updated_at: ts,
      }))
    if (fresh.length) await db.characters.bulkAdd(fresh)
    adopted = fresh.map(c => c.npc_entity_id)
  })
  // Their tokens now count as PCs too
  for (const npcId of adopted) await syncPcFlags(npcId)
}

/** `adopt`: create characters for newly PC-flagged NPCs; reloads after our own writes skip it. */
async function load(campaignId: number, { adopt = true }: { adopt?: boolean } = {}) {
  if (adopt) await adoptFlaggedNpcs(campaignId)
  const db = getDb()
  const [rows, ups, awards] = await Promise.all([
    db.characters.where('campaign_id').equals(campaignId).toArray(),
    db.levelUps.where('campaign_id').equals(campaignId).toArray(),
    db.xpAwards.where('campaign_id').equals(campaignId).toArray(),
  ])
  loadedCampaign.value = campaignId
  // Companion stat blocks follow their character's level, however it changed
  for (const r of rows) if (r.companion) void syncCompanionEntry(r)
  characters.value = rows.map(toCharacter).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'pc' ? -1 : 1))
  levelUps.value = ups.map(toLevelUp).sort((a, b) => b.at.localeCompare(a.at))
  xpAwards.value = awards.map(toXpAward).sort((a, b) => b.at.localeCompare(a.at))
}

async function reloadIfLoaded(campaignId: number) {
  if (loadedCampaign.value === campaignId) await load(campaignId, { adopt: false })
}

// Level-ups and XP awarded in another window show up here too
onTablesChanged(['characters', 'levelUps', 'xpAwards'], () => {
  if (loadedCampaign.value != null) void load(loadedCampaign.value, { adopt: false })
})

async function addCharacter(input: { campaignId: number; name: string; role: CharacterRole; npcEntityId?: number | null; level?: number }): Promise<number> {
  const ts = now()
  const npcLevel = input.npcEntityId ? parseLevel((await npcAttributes(input.npcEntityId)).level) : null
  const level = clampLevel(input.level ?? npcLevel ?? partyLevel(characters.value).level ?? 1)
  const id = await getDb().characters.add({
    campaign_id: input.campaignId, name: input.name.trim(), role: input.role, level, xp: 0,
    treat_as_pc: input.role === 'pc' ? 1 : 0, str_mod: null, npc_entity_id: input.npcEntityId ?? null,
    created_at: ts, updated_at: ts,
  })
  await patchNpc(input.npcEntityId ?? null, { level: String(level) })
  // The NPC, its tokens and their placements follow the party
  await syncPcFlags(input.npcEntityId)
  await reloadIfLoaded(input.campaignId)
  return id as number
}

async function updateCharacter(id: number, patch: Partial<Pick<Character, 'name' | 'role' | 'level' | 'treatAsPc' | 'strMod' | 'xp' | 'sfSkills'>>) {
  const c = characters.value.find(x => x.id === id) ?? (await getDb().characters.get(id).then(r => (r ? toCharacter(r) : undefined)))
  if (!c) return
  const changes: Partial<DbCharacter> = { updated_at: now() }
  if (patch.name !== undefined) changes.name = patch.name.trim()
  if (patch.role !== undefined) changes.role = patch.role
  if (patch.level !== undefined) changes.level = clampLevel(patch.level)
  if (patch.treatAsPc !== undefined) changes.treat_as_pc = patch.treatAsPc ? 1 : 0
  if (patch.strMod !== undefined) changes.str_mod = patch.strMod
  if (patch.xp !== undefined && Number.isFinite(patch.xp)) changes.xp = Math.max(0, Math.round(patch.xp))
  if (patch.sfSkills !== undefined) changes.sf_skills = toPlain(patch.sfSkills)
  await getDb().characters.update(id, changes)
  if (changes.level !== undefined) await patchNpc(c.npcEntityId, { level: String(changes.level) })
  if (patch.role !== undefined) await syncPcFlags(c.npcEntityId, c.tokenId)
  await reloadIfLoaded(c.campaignId)
}

/** Links a character to a Play Buddy player, or unlinks it (null). Unlinking keeps the last mirror as plain data. */
async function linkPlayer(id: number, link: { playerId: string; characterId: string | null } | null) {
  const row = await getDb().characters.get(id)
  if (!row) return
  await getDb().characters.update(id, {
    pb_player_id: link?.playerId ?? null, pb_character_id: link?.characterId ?? null,
    ...(link ? {} : { pb_status: null }), updated_at: now(),
  })
  await reloadIfLoaded(row.campaign_id)
}

/**
 * Stores what a linked player shares. Their level and Strength follow Play
 * Buddy, since the player levels up in their own app.
 */
async function applyMirror(id: number, mirror: CharacterMirror) {
  const row = await getDb().characters.get(id)
  if (!row) return
  // Levels the player didn't send this time keep their last known values
  // (and levels the player stopped sharing are dropped)
  const merged: CharacterMirror = { ...(row.pb_status ?? {}), ...mirror }
  for (const level of mirror.notShared) delete merged[level]
  const changes: Partial<DbCharacter> = { pb_status: toPlain(merged), pb_character_id: mirror.characterId || row.pb_character_id || null, updated_at: now() }
  if (mirror.basic && mirror.basic.level !== row.level) changes.level = clampLevel(mirror.basic.level)
  if (mirror.skills) changes.str_mod = mirror.skills.strMod
  await getDb().characters.update(id, changes)
  if (changes.level !== undefined) await patchNpc(row.npc_entity_id, { level: String(changes.level) })
  await reloadIfLoaded(row.campaign_id)
}

// ── Companions (rules/companions.ts) ──────────────────────────────────────

/** Sets or clears a companion's build, and writes its stat block. */
async function setCompanion(id: number, build: CompanionBuild | null) {
  const row = await getDb().characters.get(id)
  if (!row) return
  await getDb().characters.update(id, { companion: build ? toPlain(build) : null, updated_at: now() })
  if (build) await syncCompanionEntry({ ...row, companion: build }, true)
  await reloadIfLoaded(row.campaign_id)
}

const syncing = new Set<number>()
/**
 * Writes the companion's homebrew creature entry when it's missing, its level
 * is behind, or `force`. The character's library token links to it, so the
 * map and the stat panel use the stat block.
 */
async function syncCompanionEntry(row: DbCharacter, force = false) {
  if (!row.companion || syncing.has(row.id!)) return
  syncing.add(row.id!)
  try {
    const existing = row.companion_rules_id ? await rulesGet(row.companion_rules_id) : undefined
    if (!force && existing && existing.level === row.level && existing.name === row.name) return
    const game = campaignGame(await dbApi.campaigns.get(row.campaign_id))
    const stats = companionStats(row.companion, row.level)
    const ts = now()
    const entry: Creature = {
      id: existing?.id ?? row.companion_rules_id ?? newRulesId(), origin: 'user', kind: 'creature', game,
      name: row.name, sortName: row.name.toLowerCase(), level: row.level, rarity: 'common',
      description: `${row.companion.base.typeName} companion, kept at its character's level by the party page.`,
      sourceRefs: [], publication: { title: 'Companions', remaster: true },
      createdAt: existing?.createdAt ?? ts, updatedAt: ts,
      ...(existing?.img ? { img: existing.img } : {}), ...(existing?.gmNotes ? { gmNotes: existing.gmNotes } : {}),
      spellcasting: [], inventory: [], ...stats,
    }
    await rulesSaveUser(entry)
    if (row.companion_rules_id !== entry.id) await getDb().characters.update(row.id!, { companion_rules_id: entry.id })
    // The character's map token stands for the stat block
    if (row.token_id) await dbApi.tokens.update(row.token_id, { linkedRulesId: entry.id })
  } finally {
    syncing.delete(row.id!)
  }
}

/** Remembers the library token that stands for the character on the map. */
async function linkToken(id: number, tokenId: number | null) {
  const row = await getDb().characters.get(id)
  if (!row || (row.token_id ?? null) === tokenId) return
  await getDb().characters.update(id, { token_id: tokenId, updated_at: now() })
  await syncPcFlags(row.npc_entity_id, tokenId)
  if (tokenId && row.companion_rules_id) await dbApi.tokens.update(tokenId, { linkedRulesId: row.companion_rules_id })
  await reloadIfLoaded(row.campaign_id)
}

/**
 * Removes the character from the party. The NPC entry stays; a PC loses its PC
 * flag so it isn't re-adopted. Their items and coins go to the party stash.
 */
async function removeCharacter(id: number) {
  const row = await getDb().characters.get(id)
  if (!row) return
  // A linked character's items are Play Buddy's mirror, not the party's: they go, not to the stash.
  // Unlinked first, so a status read still in flight writes nothing (see replaceMirror)
  if (row.pb_player_id) {
    await getDb().characters.update(id, { pb_player_id: null })
    await useInventory().replaceMirror(row.campaign_id, characterOwner(id), [], 0)
  }
  await useInventory().releaseOwner(row.campaign_id, characterOwner(id))
  await getDb().characters.delete(id)
  // A removed PC stops being one everywhere, so it isn't adopted again either
  await syncPcFlags(row.npc_entity_id, row.token_id)
  await reloadIfLoaded(row.campaign_id)
}

/** Raises each selected character by one level and records the action. Returns the log entry id. */
/** Characters with a level-up still waiting for their Play Buddy player: id → offered level. */
async function pendingLevelUps(campaignId: number): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  for (const r of await getDb().levelUps.where('campaign_id').equals(campaignId).toArray()) {
    if (r.undone_at) continue
    for (const ch of toLevelUp(r).changes) if (ch.offer?.state === 'pending') out.set(ch.characterId, ch.to)
  }
  return out
}

async function levelUp(campaignId: number, selected: number[], trigger: DbLevelUp['trigger'] = 'manual', refId: number | null = null): Promise<number | null> {
  const db = getDb()
  const rows = (await db.characters.where('campaign_id').equals(campaignId).toArray()).map(toCharacter)
  const xpMode = campaignRules(await dbApi.campaigns.get(campaignId)).advancement === 'xp'
  // A character whose level-up still waits for the player isn't offered a second one
  const waiting = await pendingLevelUps(campaignId)
  const changes = planLevelUp(rows, selected.filter(id => !waiting.has(id)), xpMode ? XP_PER_LEVEL : undefined)
  if (!changes.length) return null
  const linked = new Set(rows.filter(r => r.pbPlayerId).map(r => r.id))
  for (const ch of changes) if (linked.has(ch.characterId)) ch.offer = { id: null, state: 'pending' }
  const ts = now()
  const logId = await db.transaction('rw', db.characters, db.levelUps, async () => {
    for (const ch of changes) {
      // XP is StarTome's and is paid now (refunded if declined); a linked character's level waits for the player
      await db.characters.update(ch.characterId, {
        ...(ch.offer ? {} : { level: ch.to }), ...(ch.xpTo !== undefined ? { xp: ch.xpTo } : {}), updated_at: ts,
      })
    }
    return db.levelUps.add({ campaign_id: campaignId, at: ts, trigger, ref_id: refId, changes: toPlain(changes), undone_at: null })
  }) as number
  for (const ch of changes) if (!ch.offer) await patchNpc(rows.find(r => r.id === ch.characterId)?.npcEntityId ?? null, { level: String(ch.to) })
  await reloadIfLoaded(campaignId)
  if (changes.some(ch => ch.offer)) {
    const { usePlayBuddy } = await import('~/composables/usePlayBuddy')
    for (const ch of changes.filter(x => x.offer)) {
      const offer = await usePlayBuddy().offerLevelUp(campaignId, rows.find(r => r.id === ch.characterId)!, ch.to, logId)
      await setLevelUpOffer(logId, ch.characterId, { id: offer?.id ?? null })
    }
    await reloadIfLoaded(campaignId)
  }
  return logId
}

/** Updates a linked character's change in a level-up log entry. */
async function setLevelUpOffer(logId: number, characterId: number, patch: Partial<NonNullable<LevelChange['offer']>>) {
  const db = getDb()
  const row = await db.levelUps.get(logId)
  if (!row) return null
  const changes = toLevelUp(row).changes
  const ch = changes.find(x => x.characterId === characterId)
  if (!ch?.offer) return null
  ch.offer = { ...ch.offer, ...patch }
  await db.levelUps.update(logId, { changes: toPlain(changes) })
  return ch
}

/**
 * The player answered a level-up offer. Accepted: the level moves (Play Buddy's
 * status says the same). Anything else: the XP it cost comes back.
 */
async function settleLevelUp(logId: number, characterId: number, state: Exclude<NonNullable<LevelChange['offer']>['state'], 'pending'>) {
  const before = (await getDb().levelUps.get(logId))
  const prev = before ? toLevelUp(before).changes.find(x => x.characterId === characterId)?.offer?.state : undefined
  if (prev !== 'pending') return
  const ch = await setLevelUpOffer(logId, characterId, { state })
  const c = await getDb().characters.get(characterId)
  if (!ch || !c) return
  if (state === 'accepted') {
    const level = Math.max(c.level, ch.to)
    await getDb().characters.update(characterId, { level, updated_at: now() })
    await patchNpc(c.npc_entity_id, { level: String(level) })
  } else if (ch.xpFrom !== undefined && ch.xpTo !== undefined) {
    await getDb().characters.update(characterId, { xp: (c.xp ?? 0) + ch.xpFrom - ch.xpTo, updated_at: now() })
  }
  await reloadIfLoaded(c.campaign_id)
}

/** Reverts a level-up for every character still at the level it raised them to. */
async function undoLevelUp(logId: number) {
  const db = getDb()
  const row = await db.levelUps.get(logId)
  if (!row || row.undone_at) return
  const entry = toLevelUp(row)
  // Play Buddy level-ups the player hasn't answered are withdrawn (which refunds their XP);
  // accepted ones stay, since the player already levelled up in their app
  const offered = entry.changes.filter(ch => ch.offer)
  if (offered.length) {
    const { usePlayBuddy } = await import('~/composables/usePlayBuddy')
    for (const ch of offered) {
      if (ch.offer!.state !== 'pending') continue
      const offer = ch.offer!.id != null ? await db.linkOffers.get(ch.offer!.id) : undefined
      if (offer) await usePlayBuddy().withdraw(offer)
      else await settleLevelUp(logId, ch.characterId, 'withdrawn')
    }
  }
  const ts = now()
  const reverted: { npcId: number | null; level: number }[] = []
  await db.transaction('rw', db.characters, db.levelUps, async () => {
    for (const ch of entry.changes) {
      if (ch.offer) continue
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
      amount, character_ids: ids, reason: input.reason ?? '', undone_at: null,
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

// A completed quest: a milestone campaign may level up, an XP campaign may award quest XP
onDomainEvent('questCompleted', async ({ campaignId, questId, name, milestone }) => {
  const advancement = campaignRules(await dbApi.campaigns.get(campaignId)).advancement
  if (advancement === 'milestone' && milestone) requestLevelUp({ campaignId, trigger: 'quest', refId: questId, reason: `Milestone reached: ${name}` })
  if (advancement === 'xp') requestXpAward({ campaignId, refType: 'quest', refId: questId, reason: `Quest: ${name}` })
})

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
    load, addCharacter, updateCharacter, removeCharacter, linkToken, setCompanion, linkPlayer, applyMirror, levelUp, settleLevelUp, pendingLevelUps, undoLevelUp, setNpcPlayerCharacter,
    requestLevelUp, dismissPrompt, requestXpAward, dismissXpPrompt,
    awardXp, undoXpAward, writeXpAward, writeXpUndo, promptReadyToLevel, reload: reloadIfLoaded,
  }
}
