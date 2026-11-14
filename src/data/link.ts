/**
 * The character link's rows: which game a campaign follows, which player a
 * party member is, what that player shares (the mirror), and the outbox of
 * what was sent to them. The pairing with the app on this computer is a
 * device matter and never in a backup.
 */
import { newId, nowIso } from '@/domain/ids'
import { clampLevel } from '@/domain/rules/party'
import { FINAL_STATES, zCampaign, zCharacter, zLinkOutboxItem, zMirror, type Campaign, type Character, type Combatant, type LinkOutboxItem, type MessageState, type Mirror, type MirrorBlocks, type ShareLevel } from '@/domain/schema'
import { getDb } from './db'
import { writeEntryLevel } from './party'

const characters = () => getDb().rows('characters')
const outboxTable = () => getDb().rows('linkOutbox')

// ── Pairing (this device) ──────────────────────────────────────────────────

export interface Pairing { port: number; token: string | null; clientId: string | null }
const PAIRING_KEY = 'playbuddy'

export const pairing = {
  async get(fallbackPort: number): Promise<Pairing> {
    const saved = (await getDb().deviceHandles.get(PAIRING_KEY))?.handle as Partial<Pairing> | undefined
    return { port: typeof saved?.port === 'number' ? saved.port : fallbackPort, token: saved?.token ?? null, clientId: saved?.clientId ?? null }
  },
  set: (p: Pairing) => getDb().deviceHandles.put({ key: PAIRING_KEY, handle: { ...p } }),
}

// ── Campaign ───────────────────────────────────────────────────────────────

export type CampaignLink = NonNullable<Campaign['characterLink']>

export async function campaignLink(campaignId: string): Promise<CampaignLink | null> {
  return (await getDb().rows('campaigns').get(campaignId))?.characterLink ?? null
}

export async function setCampaignLink(campaignId: string, link: Omit<CampaignLink, 'provider'> | null): Promise<void> {
  const c = await getDb().rows('campaigns').get(campaignId)
  if (c) await getDb().rows('campaigns').put(zCampaign.parse({ ...c, characterLink: link ? { provider: 'playbuddy', ...link } : null, updatedAt: nowIso() }))
}

/** Where the event stream continues. Does not count as a change to the campaign. */
export async function setLinkSeq(campaignId: string, lastSeq: number): Promise<void> {
  const c = await getDb().rows('campaigns').get(campaignId)
  if (c?.characterLink && c.characterLink.lastSeq !== lastSeq) await getDb().rows('campaigns').put({ ...c, characterLink: { ...c.characterLink, lastSeq } })
}

// ── Characters ─────────────────────────────────────────────────────────────

export async function linkedCharacters(campaignId: string): Promise<Character[]> {
  return (await characters().where('campaignId').equals(campaignId).toArray()).filter(c => c.link)
}

/** Ties a party member to a player (their app owns the sheet from now on), or cuts the tie with null. */
export async function setCharacterLink(id: string, link: { playerId: string; characterId: string | null } | null): Promise<void> {
  const c = await characters().get(id)
  if (!c) return
  const keep = link && c.link?.playerId === link.playerId && (!link.characterId || c.link.mirror?.characterId === link.characterId) ? c.link.mirror : null
  await characters().put(zCharacter.parse({ ...c, link: link ? { provider: 'playbuddy', playerId: link.playerId, characterId: link.characterId, mirror: keep } : null, updatedAt: nowIso() }))
}

/**
 * Stores what a player shares. Blocks given replace the ones kept; levels in
 * `unshared` are forgotten. Level and Strength follow the player's app.
 * A character without a link takes the numbers once (a share file).
 */
export async function applyMirror(id: string, sheet: { characterId: string; at: string; blocks: Partial<MirrorBlocks>; unshared?: ShareLevel[] }): Promise<Character | undefined> {
  const c = await characters().get(id)
  if (!c) return undefined
  const sameCharacter = !c.link?.mirror?.characterId || !sheet.characterId || c.link.mirror.characterId === sheet.characterId
  const merged: Mirror = zMirror.parse({ ...(sameCharacter ? c.link?.mirror ?? {} : {}), ...sheet.blocks, characterId: sheet.characterId, at: sheet.at })
  for (const level of sheet.unshared ?? []) delete merged[level]
  const next: Character = { ...c, updatedAt: nowIso() }
  if (c.link) next.link = { ...c.link, characterId: sheet.characterId || c.link.characterId, mirror: merged }
  if (merged.basic && merged.basic.level !== c.level) next.level = clampLevel(merged.basic.level)
  if (merged.skills) next.strMod = merged.skills.strMod
  await characters().put(zCharacter.parse(next))
  if (next.level !== c.level) await writeEntryLevel(c.entryId, next.level)
  return next
}

// ── Tokens of a character ──────────────────────────────────────────────────

/** A token stands for the character itself, or is its library token. */
export function isTokenOf(t: Pick<Combatant, 'ref' | 'actorId'>, c: Pick<Character, 'id' | 'actorId'>): boolean {
  return (t.ref.kind === 'character' && t.ref.characterId === c.id) || (!!c.actorId && t.actorId === c.actorId)
}

/** Writes a rolled initiative to the character's tokens in that encounter. Returns how many it found. */
export async function placeInitiative(encounterId: string, characterId: string, total: number): Promise<number> {
  const c = await characters().get(characterId)
  if (!c) return 0
  const tokens = (await getDb().rows('combatants').where('encounterId').equals(encounterId).toArray()).filter(t => isTokenOf(t, c))
  for (const t of tokens) await getDb().rows('combatants').put({ ...t, initiative: total })
  return tokens.length
}

// ── Outbox ─────────────────────────────────────────────────────────────────

export type OutboxInput = Pick<LinkOutboxItem, 'campaignId' | 'kind' | 'characterId' | 'playerId' | 'summary' | 'body'> & Partial<Pick<LinkOutboxItem, 'stacks' | 'encounterId' | 'fromOwner' | 'ledgerId'>>
export const isFinal = (state: LinkOutboxItem['state']): boolean => (FINAL_STATES as readonly string[]).includes(state)

export const outbox = {
  /** Newest first. */
  ofCampaign: async (campaignId: string): Promise<LinkOutboxItem[]> => (await outboxTable().where('campaignId').equals(campaignId).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  get: (id: string): Promise<LinkOutboxItem | undefined> => outboxTable().get(id),
  byRemote: async (campaignId: string, remoteId: string): Promise<LinkOutboxItem | undefined> => (await outboxTable().where('campaignId').equals(campaignId).toArray()).find(r => r.remoteId === remoteId),
  async add(input: OutboxInput): Promise<LinkOutboxItem> {
    const ts = nowIso()
    const row = zLinkOutboxItem.parse({ ...input, id: newId(), key: crypto.randomUUID(), createdAt: ts, updatedAt: ts })
    await outboxTable().put(row)
    return row
  },
  async patch(id: string, patch: Partial<Pick<LinkOutboxItem, 'remoteId' | 'state' | 'reason' | 'roll'>>): Promise<LinkOutboxItem | undefined> {
    const row = await outboxTable().get(id)
    if (!row) return undefined
    const next = zLinkOutboxItem.parse({ ...row, ...patch, updatedAt: nowIso() })
    await outboxTable().put(next)
    return next
  },
  /** Moves a row to a final state once. Returns the row if this call was the one that did it. */
  async finish(id: string, state: MessageState, reason: string | null): Promise<LinkOutboxItem | null> {
    return getDb().transaction('rw', outboxTable(), async () => {
      const row = await outboxTable().get(id)
      if (!row || isFinal(row.state)) return null
      const next = { ...row, state, reason, updatedAt: nowIso() }
      await outboxTable().put(next)
      return next
    })
  },
  async clearAnswered(campaignId: string): Promise<void> {
    const done = (await outboxTable().where('campaignId').equals(campaignId).toArray()).filter(r => isFinal(r.state))
    await outboxTable().bulkDelete(done.map(r => r.id))
  },
}
