/**
 * The character link (Play Buddy, PLAYBUDDY_API.md): pairing with the GM's
 * own Play Buddy, linking a campaign to its game and party members to its
 * players, mirroring what they share, and following the game while the
 * campaign is open.
 *
 * Players own their characters: nothing here writes a character except as a
 * read-only mirror of what their app reports.
 */
import { emitDomainEvent } from '@/domain/events'
import { STASH } from '@/domain/rules/inventory'
import type { Character } from '@/domain/schema'
import { addEntry } from '@/data/inventory'
import { applyMirror, campaignLink, linkedCharacters, outbox, setCampaignLink, setCharacterLink, setLinkSeq } from '@/data/link'
import { releaseMirror, replaceMirror } from '@/data/linkInventory'
import { addCharacter } from '@/data/party'
import { getRow, rulesByName } from '@/data/repo'
import { rulesGetMany } from '@/data/rules'
import { baseUrlFor, LinkError, pair } from './client'
import { itemFromWire, readShareFile, rollLine, sheetFromWire, type SheetParts } from './convert'
import { applyMessage, flushOutbox, reconcile } from './outbox'
import { client, currentFetch, explain, link, playerFromWire, ready, savePairing, say, type LinkedGame, type LinkedPlayer } from './state'
import type * as W from './wire'

export { link, paired, ready, onLinkNotice, type LinkedPlayer, type LinkedGame } from './state'
export * from './outbox'

// ── Connection ─────────────────────────────────────────────────────────────

export async function refreshHealth() {
  link.health = await client().probe()
  return link.health
}

export async function connect(port: number, code: string, clientVersion: string): Promise<boolean> {
  link.busy = true
  link.error = ''
  try {
    const res = await pair(baseUrlFor(port), code, clientVersion, currentFetch())
    Object.assign(link, { port, token: res.token, clientId: res.clientId })
    await savePairing()
    await refreshHealth()
    await loadGame()
    return true
  } catch (err) {
    link.error = explain(err)
    return false
  } finally { link.busy = false }
}

/** Forgets the pairing; Play Buddy is told when it can be reached. */
export async function disconnect(): Promise<void> {
  stopLive()
  if (link.token) await client().unpair().catch(() => undefined)
  Object.assign(link, { token: null, clientId: null, health: null, game: null, error: '' })
  await savePairing()
}

/** The game's sheets as they came, for whoever links a character next. */
const sheets = new Map<string, W.Sheet>()

async function readGame(): Promise<W.Game> {
  const g = await client().game()
  sheets.clear()
  for (const p of g.players) if (p.sheet) sheets.set(p.playerId, p.sheet)
  link.game = { gameId: g.gameId, name: g.name, system: g.system ?? 'pf2e', players: g.players.map(p => playerFromWire(p, p.sheet)) }
  return g
}

export async function loadGame(): Promise<LinkedGame | null> {
  try { await readGame(); link.error = '' }
  catch (err) { link.game = null; link.error = explain(err) }
  return link.game
}

// ── Campaign and character links ───────────────────────────────────────────

export async function linkCampaign(campaignId: string): Promise<void> {
  // A fresh read: the event stream starts at the game's current position
  const g = await readGame().catch((err) => { link.error = explain(err); return null })
  if (!g) return
  await setCampaignLink(campaignId, { gameId: g.gameId, gameName: g.name, lastSeq: g.eventSeq })
  await startLive(campaignId)
}

export async function unlinkCampaign(campaignId: string): Promise<void> {
  stopLive()
  for (const c of await linkedCharacters(campaignId)) await unlinkCharacter(c)
  await setCampaignLink(campaignId, null)
}

export async function linkCharacter(characterId: string, player: LinkedPlayer): Promise<void> {
  await setCharacterLink(characterId, { playerId: player.playerId, characterId: player.characterId })
  const c = await getRow('characters', characterId), sheet = sheets.get(player.playerId)
  if (c && sheet) await mirror(c, sheetFromWire(sheet.characterId, sheet.at, sheet))
}

/** A new party member for a player who has no character here yet. */
export async function addFromPlayer(campaignId: string, player: LinkedPlayer): Promise<void> {
  const c = await addCharacter({ campaignId, name: player.characterName ?? player.name, role: 'pc', ...(player.level ? { level: player.level } : {}) })
  await linkCharacter(c.id, player)
}

/** Back to a plain party member: the last mirrored items stay as ordinary, editable stacks. */
export async function unlinkCharacter(c: Pick<Character, 'id' | 'campaignId'>): Promise<void> {
  await releaseMirror(c.campaignId, c.id)
  await setCharacterLink(c.id, null)
}

// ── The mirror ─────────────────────────────────────────────────────────────

/** Items named by Foundry id must exist in this compendium (it may not be synced); the rest match by name. */
async function matchItems(parts: SheetParts): Promise<void> {
  const all = (parts.items ?? []).flatMap(i => [i, ...i.attachments.filter(a => a.kind !== 'gift')])
  const known = new Set((await rulesGetMany(all.map(i => i.rulesId).filter((x): x is string => !!x))).map(e => e.id))
  for (const i of all) if (!i.rulesId || !known.has(i.rulesId)) i.rulesId = (await rulesByName(i.name, 'item'))?.id ?? null
}

async function mirror(c: Character, parts: SheetParts, mirrored = true): Promise<void> {
  await matchItems(parts)
  await applyMirror(c.id, parts)
  if (parts.items) await replaceMirror(c.campaignId, c.id, parts.items, parts.coinsCp, mirrored)
  emitDomainEvent('characterMirrored', { campaignId: c.campaignId, characterId: c.id })
}

/** Reads the game again and mirrors every linked player's sheet. */
export async function refreshAll(campaignId: string): Promise<void> {
  const g = await readGame()
  const chars = await linkedCharacters(campaignId)
  for (const p of g.players) {
    const c = chars.find(x => x.link?.playerId === p.playerId)
    if (c && p.sheet) await mirror(c, sheetFromWire(p.sheet.characterId, p.sheet.at, p.sheet))
  }
}

/**
 * A share file (PLAYBUDDY_API.md §10) for one party member: a snapshot of what
 * the player chose to include. Without a live link the items become ordinary,
 * editable stacks. Returns what is wrong with the file, or null.
 */
export async function importShareFile(characterId: string, text: string): Promise<string | null> {
  const file = readShareFile(text)
  if (!file) return 'This is not a Play Buddy share file (format 2).'
  const c = await getRow('characters', characterId)
  if (!c) return 'That character is no longer in the party.'
  await mirror(c, sheetFromWire(file.sheet.characterId, file.sheet.at ?? file.exportedAt, file.sheet), !!c.link)
  return null
}

// ── Events ─────────────────────────────────────────────────────────────────

const characterOf = async (campaignId: string, playerId: string) => (await linkedCharacters(campaignId)).find(c => c.link?.playerId === playerId)

async function handle(campaignId: string, e: W.GameEvent): Promise<void> {
  switch (e.type) {
    case 'sheet': {
      const p = link.game?.players.find(x => x.playerId === e.playerId)
      if (p && e.blocks.basic) Object.assign(p, { characterId: e.characterId, characterName: e.blocks.basic.name, level: e.blocks.basic.level })
      const kept = sheets.get(e.playerId)
      const next: W.Sheet = { ...(kept?.characterId === e.characterId ? kept : {}), ...e.blocks, characterId: e.characterId, at: e.sheetAt }
      for (const level of e.unshared ?? []) delete next[level]
      sheets.set(e.playerId, next)
      const c = await characterOf(campaignId, e.playerId)
      if (c) await mirror(c, sheetFromWire(e.characterId, e.sheetAt, e.blocks, e.unshared ?? []))
      break
    }
    case 'player': {
      if (!link.game) break
      const i = link.game.players.findIndex(p => p.playerId === e.player.playerId)
      const next = playerFromWire(e.player, undefined, link.game.players[i])
      if (i < 0) link.game.players.push(next)
      else link.game.players[i] = next
      break
    }
    case 'playerLeft': if (link.game) link.game.players = link.game.players.filter(p => p.playerId !== e.playerId); break
    case 'message': {
      const row = await outbox.byRemote(campaignId, e.message.messageId)
      if (row) await applyMessage(row, e.message)
      break
    }
    case 'roll': {
      const c = await characterOf(campaignId, e.roll.playerId)
      const who = c?.name ?? link.game?.players.find(p => p.playerId === e.roll.playerId)?.characterName ?? 'A player'
      const line = rollLine(e.roll)
      link.rolls = [{ id: e.roll.rollId, at: e.roll.at, who, line, secret: e.roll.secret }, ...link.rolls].slice(0, 50)
      emitDomainEvent('linkRoll', { campaignId, characterId: c?.id ?? null, line })
      break
    }
    case 'itemReturned': {
      const c = await characterOf(campaignId, e.playerId)
      const i = itemFromWire(e.item)
      await matchItems({ characterId: '', at: e.at, blocks: {}, unshared: [], items: [i], coinsCp: null })
      await addEntry({ campaignId, owner: STASH, itemId: i.rulesId, name: i.name, quantity: i.quantity, priceOverride: i.rulesId ? null : Math.round(i.price / i.priceFor), identified: i.identified })
      say(`${c?.name ?? 'A player'} gave ${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.name} to the party stash${e.note ? `: “${e.note}”` : ''}`)
      break
    }
    case 'gameClosed': await refreshHealth(); say('The Play Buddy game was closed.'); break
  }
}

// ── Following the game ─────────────────────────────────────────────────────

let loopAbort: AbortController | null = null

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms)
  signal.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
})

/** Everything a (re)connection does before it listens: outbox out, missed answers in, sheets fresh. */
async function catchUp(campaignId: string, info: { gameId: string; gameName: string }): Promise<boolean> {
  const h = await refreshHealth()
  if (!h.ok) throw new LinkError(h.reason, h.message)
  const g = await readGame()
  if (g.gameId !== info.gameId) {
    link.error = `Play Buddy has another game open (${g.name}); this campaign is linked to ${info.gameName}.`
    return false
  }
  await flushOutbox(campaignId)
  await reconcile(campaignId)
  await refreshAll(campaignId)
  return true
}

/** Follows the game while this campaign is open: events by long poll, the mirror kept in step. */
export async function startLive(campaignId: string): Promise<void> {
  await ready()
  if (link.liveCampaignId === campaignId && loopAbort) return
  stopLive()
  // Claimed before the first wait, so two callers asking at once start one loop
  const abort = new AbortController()
  loopAbort = abort
  link.liveCampaignId = campaignId
  const info = await campaignLink(campaignId)
  if (abort.signal.aborted) return
  if (!info || !link.token) { stopLive(); return }
  void (async () => {
    let after = info.lastSeq
    let fresh = true
    while (!abort.signal.aborted) {
      try {
        if (fresh) {
          if (!await catchUp(campaignId, info)) { await sleep(15000, abort.signal); continue }
          fresh = false
        }
        const batch = await client().events(after, 25, abort.signal)
        if (abort.signal.aborted) break
        if (batch.resetRequired) { fresh = true; after = batch.lastSeq; await setLinkSeq(campaignId, after); continue }
        for (const e of batch.events) await handle(campaignId, e)
        if (batch.lastSeq !== after) { after = batch.lastSeq; await setLinkSeq(campaignId, after) }
        link.error = ''
      } catch (err) {
        if (abort.signal.aborted) break
        link.error = explain(err)
        fresh = true
        await sleep(5000, abort.signal)
      }
    }
  })()
}

export function stopLive(): void {
  loopAbort?.abort()
  loopAbort = null
  link.liveCampaignId = null
}
