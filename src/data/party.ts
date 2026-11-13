/**
 * The party: its members and the ledger of what advanced them (level-ups, XP
 * awards, treasure awards). Every ledger entry carries what its undo needs.
 * "Is this NPC a player character" is one fact: a party member of role `pc`
 * points at its entry.
 */
import { campaignRules, type CampaignRules, type GameId } from '@/domain/game'
import { newId, nowIso } from '@/domain/ids'
import { readyToLevel, XP_PER_LEVEL } from '@/domain/rules/advancement'
import { companionStats, type CompanionBuild } from '@/domain/rules/companions'
import { newRulesId } from '@/domain/rules/factory'
import { characterOwner } from '@/domain/rules/inventory'
import { clampLevel, parseLevel, partyLevel, planLevelUp } from '@/domain/rules/party'
import type { Creature } from '@/domain/rules/types'
import { zCampaign, zCharacter, zEntry, zLedgerEntry, type Character, type Entry, type LedgerEntry } from '@/domain/schema'
import { getDb } from './db'
import { releaseOwner } from './inventory'
import { rulesGet, rulesSaveUser } from './rules'

const table = () => getDb().rows('characters')
const ledger = () => getDb().rows('partyLedger')

export type LevelUpEntry = Extract<LedgerEntry, { kind: 'levelUp' }>
export type XpAwardEntry = Extract<LedgerEntry, { kind: 'xpAward' }>
export type TreasureAwardEntry = Extract<LedgerEntry, { kind: 'treasureAward' }>
export type ResolvedEntry = Extract<LedgerEntry, { kind: 'encounterResolved' }>

// ── Reads ──────────────────────────────────────────────────────────────────

/** Party members, player characters first; a member that stands for an NPC entry carries that entry's name. */
export async function partyOf(campaignId: string): Promise<Character[]> {
  const rows = await table().where('campaignId').equals(campaignId).toArray()
  const entries = await getDb().rows('entries').bulkGet(rows.map(r => r.entryId ?? ''))
  return rows.map((r, i) => ({ ...r, name: entries[i]?.name ?? r.name }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'pc' ? -1 : 1))
}

export async function characterOfEntry(entryId: string): Promise<Character | undefined> {
  return table().where('entryId').equals(entryId).first()
}

/** The ledger, newest first. */
export async function ledgerOf(campaignId: string): Promise<LedgerEntry[]> {
  return (await ledger().where('campaignId').equals(campaignId).toArray()).sort((a, b) => b.at.localeCompare(a.at))
}

export async function campaignSettings(campaignId: string): Promise<{ game: GameId; rules: CampaignRules }> {
  const c = await getDb().rows('campaigns').get(campaignId)
  return { game: c?.game ?? 'pf2e', rules: campaignRules(c) }
}

export async function updateCampaignRules(campaignId: string, patch: Partial<CampaignRules>): Promise<void> {
  const c = await getDb().rows('campaigns').get(campaignId)
  if (c) await getDb().rows('campaigns').put(zCampaign.parse({ ...c, rules: { ...campaignRules(c), ...patch }, updatedAt: nowIso() }))
}

// ── Members ────────────────────────────────────────────────────────────────

/** A member's level is also what its NPC entry states. */
async function writeEntryLevel(entryId: string | null, level: number): Promise<void> {
  const e = entryId ? await getDb().rows('entries').get(entryId) : undefined
  if (e?.type === 'npc' && e.data.level !== String(level)) await getDb().rows('entries').put(zEntry.parse({ ...e, data: { ...e.data, level: String(level) } }))
}

export interface AddCharacterInput { campaignId: string; name: string; role: Character['role']; entryId?: string | null; level?: number }

export async function addCharacter(input: AddCharacterInput): Promise<Character> {
  const existing = input.entryId ? await characterOfEntry(input.entryId) : undefined
  if (existing) return existing
  const entry = input.entryId ? await getDb().rows('entries').get(input.entryId) : undefined
  const stated = entry?.type === 'npc' ? parseLevel(entry.data.level) : null
  const level = clampLevel(input.level ?? stated ?? partyLevel(await partyOf(input.campaignId)).level ?? 1)
  const ts = nowIso()
  const row = zCharacter.parse({ id: newId(), campaignId: input.campaignId, name: (entry?.name ?? input.name).trim(), role: input.role, level, entryId: input.entryId ?? null, createdAt: ts, updatedAt: ts })
  await table().put(row)
  await writeEntryLevel(row.entryId, level)
  return row
}

/** Adds the NPC to the party as a player character, at the level its entry states. */
export function addCharacterFor(entry: Entry): Promise<Character> {
  return addCharacter({ campaignId: entry.campaignId, name: entry.name, role: 'pc', entryId: entry.id })
}

export type CharacterPatch = Partial<Pick<Character, 'name' | 'role' | 'level' | 'treatAsPc' | 'strMod' | 'xp' | 'skills'>>

export async function updateCharacter(id: string, patch: CharacterPatch): Promise<void> {
  const c = await table().get(id)
  if (!c) return
  const next: Character = { ...c, updatedAt: nowIso() }
  if (patch.name !== undefined && patch.name.trim()) next.name = patch.name.trim()
  if (patch.role !== undefined) next.role = patch.role
  if (patch.level !== undefined && Number.isFinite(patch.level)) next.level = clampLevel(patch.level)
  if (patch.treatAsPc !== undefined) next.treatAsPc = patch.treatAsPc
  if (patch.strMod !== undefined) next.strMod = patch.strMod
  if (patch.xp !== undefined && Number.isFinite(patch.xp)) next.xp = Math.max(0, Math.round(patch.xp))
  if (patch.skills !== undefined) next.skills = patch.skills
  await table().put(next)
  if (next.level !== c.level) { await writeEntryLevel(c.entryId, next.level); await syncCompanionEntry(next) }
}

/** Takes a character out of the party; what they carried goes to the party stash. The NPC entry stays. */
export async function removeCharacter(characterId: string): Promise<void> {
  const c = await table().get(characterId)
  if (!c) return
  await releaseOwner(c.campaignId, characterOwner(characterId))
  await table().delete(characterId)
}

// ── Companions ─────────────────────────────────────────────────────────────

/** Sets or clears a companion's build, and writes its stat block. */
export async function setCompanion(id: string, build: CompanionBuild | null): Promise<void> {
  const c = await table().get(id)
  if (!c) return
  const next = { ...c, companion: build ? JSON.parse(JSON.stringify(build)) as Record<string, unknown> : null, updatedAt: nowIso() }
  await table().put(next)
  if (build) await syncCompanionEntry(next, true)
}

/** Writes the companion's homebrew creature when it is missing, behind its character's level or renamed. */
export async function syncCompanionEntry(c: Character, force = false): Promise<void> {
  if (!c.companion) return
  const build = c.companion as unknown as CompanionBuild
  const existing = c.companionRulesId ? await rulesGet(c.companionRulesId) : undefined
  if (!force && existing && existing.level === c.level && existing.name === c.name) return
  const { game } = await campaignSettings(c.campaignId)
  const ts = nowIso()
  const entry: Creature = {
    id: existing?.id ?? c.companionRulesId ?? newRulesId(), origin: 'user', kind: 'creature', game, name: c.name, sortName: c.name.toLowerCase(), level: c.level, rarity: 'common',
    description: `${build.base.typeName} companion, kept at its character's level by the party page.`, sourceRefs: [], publication: { title: 'Companions', remaster: true },
    createdAt: existing?.createdAt ?? ts, updatedAt: ts, ...(existing?.img ? { img: existing.img } : {}), ...(existing?.gmNotes ? { gmNotes: existing.gmNotes } : {}),
    spellcasting: [], inventory: [], ...companionStats(build, c.level),
  }
  await rulesSaveUser(entry)
  if (c.companionRulesId !== entry.id) await table().update(c.id, { companionRulesId: entry.id })
}

// ── Level-ups ──────────────────────────────────────────────────────────────

/** Raises each selected character by one level and records it. In XP campaigns a level costs 1,000 XP. */
export async function levelUp(campaignId: string, selected: string[], trigger: LevelUpEntry['trigger'] = 'manual', refId: string | null = null): Promise<LevelUpEntry | null> {
  const rows = await table().where('campaignId').equals(campaignId).toArray()
  const xpMode = (await campaignSettings(campaignId)).rules.advancement === 'xp'
  const changes = planLevelUp(rows, selected, xpMode ? XP_PER_LEVEL : undefined)
  if (!changes.length) return null
  const ts = nowIso()
  const entry = zLedgerEntry.parse({ id: newId(), campaignId, kind: 'levelUp', at: ts, trigger, refId, changes }) as LevelUpEntry
  await getDb().transaction('rw', table(), ledger(), async () => {
    for (const ch of changes) await table().update(ch.characterId, { level: ch.to, ...(ch.xpTo !== undefined ? { xp: ch.xpTo } : {}), updatedAt: ts })
    await ledger().put(entry)
  })
  for (const ch of changes) {
    const c = rows.find(r => r.id === ch.characterId)
    if (!c) continue
    await writeEntryLevel(c.entryId, ch.to)
    await syncCompanionEntry({ ...c, level: ch.to })
  }
  return entry
}

/** Reverts a level-up for every character still at the level it raised them to. XP earned since stays. */
export async function undoLevelUp(id: string): Promise<void> {
  const entry = await ledger().get(id)
  if (entry?.kind !== 'levelUp' || entry.undoneAt) return
  const ts = nowIso()
  const reverted: Character[] = []
  await getDb().transaction('rw', table(), ledger(), async () => {
    for (const ch of entry.changes) {
      const c = await table().get(ch.characterId)
      if (!c || c.level !== ch.to) continue
      const next = { ...c, level: ch.from, xp: ch.xpFrom !== undefined && ch.xpTo !== undefined ? c.xp + ch.xpFrom - ch.xpTo : c.xp, updatedAt: ts }
      await table().put(next)
      reverted.push(next)
    }
    await ledger().put({ ...entry, undoneAt: ts })
  })
  for (const c of reverted) { await writeEntryLevel(c.entryId, c.level); await syncCompanionEntry(c) }
}

/** When the party last levelled up (undone level-ups aside), or null. */
export async function lastLevelUpAt(campaignId: string): Promise<string | null> {
  return (await ledgerOf(campaignId)).find(l => l.kind === 'levelUp' && !l.undoneAt)?.at ?? null
}

// ── XP ─────────────────────────────────────────────────────────────────────

export interface AwardXpInput { campaignId: string; amount: number; characterIds: string[]; source: XpAwardEntry['source']; refType?: XpAwardEntry['refType']; refId?: string | null; reason?: string }

/** Awards XP to each character. Returns the entry and who can now level up (XP campaigns). */
export async function awardXp(input: AwardXpInput): Promise<{ entry: XpAwardEntry; ready: Character[] } | null> {
  const amount = Math.round(input.amount)
  const ids = [...new Set(input.characterIds)]
  if (!amount || !ids.length) return null
  const ts = nowIso()
  const entry = zLedgerEntry.parse({ id: newId(), campaignId: input.campaignId, kind: 'xpAward', at: ts, source: input.source, refType: input.refType ?? null, refId: input.refId ?? null, amount, characterIds: ids, reason: input.reason ?? '' }) as XpAwardEntry
  await getDb().transaction('rw', table(), ledger(), async () => {
    for (const id of ids) {
      const c = await table().get(id)
      if (c) await table().put({ ...c, xp: Math.max(0, c.xp + amount), updatedAt: ts })
    }
    await ledger().put(entry)
  })
  const rows = await partyOf(input.campaignId)
  const xpMode = (await campaignSettings(input.campaignId)).rules.advancement === 'xp'
  const ready = xpMode ? readyToLevel(rows) : []
  return { entry, ready: rows.filter(c => ready.includes(c.id)) }
}

/** Takes an award's XP back (never below 0). */
export async function undoXpAward(id: string): Promise<void> {
  await getDb().transaction('rw', table(), ledger(), async () => {
    const entry = await ledger().get(id)
    if (entry?.kind !== 'xpAward' || entry.undoneAt) return
    const ts = nowIso()
    for (const cid of entry.characterIds) {
      const c = await table().get(cid)
      if (c) await table().put({ ...c, xp: Math.max(0, c.xp - entry.amount), updatedAt: ts })
    }
    await ledger().put({ ...entry, undoneAt: ts })
  })
}

// ── Treasure awards ────────────────────────────────────────────────────────

/** Records items or coins given as treasure (not a correction). */
export async function awardTreasure(campaignId: string, value: { value: number; consumables: number }, label: string): Promise<void> {
  if (value.value <= 0) return
  await ledger().put(zLedgerEntry.parse({ id: newId(), campaignId, kind: 'treasureAward', at: nowIso(), value: value.value, consumables: Math.min(value.value, value.consumables), label }))
}

export async function undoTreasureAward(id: string): Promise<void> {
  const entry = await ledger().get(id)
  if (entry?.kind === 'treasureAward' && !entry.undoneAt) await ledger().put({ ...entry, undoneAt: nowIso() })
}
