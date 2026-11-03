/**
 * Play Buddy integration (PLAYBUDDY_API.md): pairing with the GM's own Play
 * Buddy, linking a campaign to its game and party characters to its players,
 * mirroring what players share, and the offer/request lifecycle with an
 * outbox. The only module that writes `linkOffers`.
 *
 * Players own their characters: nothing here writes a character's sheet or
 * items except as a read-only mirror of what Play Buddy reports. Everything
 * the GM gives goes out as an offer and lands only when the player accepts.
 *
 * The connection (port + token) is per browser, in localStorage; links and
 * offers are per campaign, in the database.
 */
import { computed, ref, shallowRef } from 'vue'
import { getDb, now, type DbLinkOffer } from '~/composables/useDb'
import { useInventory } from '~/composables/useInventory'
import { notify } from '~/composables/useNotices'
import { useParty, type Character } from '~/composables/useParty'
import { rulesFindByName, rulesGetMany } from '~/composables/useRules'
import { asCustomStack, readShareFile, stackFromEntry, statusFromWire } from '~/partylink/convert'
import {
  LinkError, type CharacterMirror, type DeliveryState, type LinkedGame, type LinkedPlayer, type LinkEvent, type LinkHealth,
  type LinkOffer, type LinkRequest, type PartyLink, type RollEntry, type ShareLevel,
} from '~/partylink/port'
import { baseUrlFor, createPlayBuddyLink, DEFAULT_PORT, pair } from '~/partylink/playbuddy'
import { characterOwner, STASH, type InventoryEntry, type OwnerKey } from '~/rules/inventory'
import type { Item } from '~/types/rules'
import { lsKey } from '~/utils/appNamespace'
import { toPlain } from '~/utils/json'

const ALL_LEVELS: ShareLevel[] = ['basic', 'defenses', 'skills', 'inventory']
const FINAL: DeliveryState[] = ['accepted', 'declined', 'withdrawn', 'expired', 'failed']
const CONN_KEY = lsKey('playbuddy')

interface StoredConn { port: number; token: string | null; clientId: string | null }

function readConn(): StoredConn {
  try {
    const raw = JSON.parse(localStorage.getItem(CONN_KEY) ?? 'null')
    if (raw && typeof raw.port === 'number') return { port: raw.port, token: raw.token ?? null, clientId: raw.clientId ?? null }
  } catch {}
  return { port: DEFAULT_PORT, token: null, clientId: null }
}

function writeConn(c: StoredConn) {
  try { localStorage.setItem(CONN_KEY, JSON.stringify(c)) } catch {}
}

// ── State (one per app) ────────────────────────────────────────────────────

const conn = ref<StoredConn>(import.meta.client ? readConn() : { port: DEFAULT_PORT, token: null, clientId: null })
const health = shallowRef<LinkHealth | null>(null)
const game = shallowRef<LinkedGame | null>(null)
const error = ref('')
const busy = ref(false)
/** Recent rolls of this session, newest first. */
const rolls = ref<(RollEntry & { characterName: string })[]>([])
const offers = ref<DbLinkOffer[]>([])
const liveCampaign = ref<number | null>(null)
let loopAbort: AbortController | null = null

/** Items Play Buddy names by Foundry id resolve directly; others by name afterwards (fillMatches). */
function link(): PartyLink {
  return createPlayBuddyLink(
    { baseUrl: baseUrlFor(conn.value.port), token: conn.value.token, clientId: conn.value.clientId },
    ref => (ref.foundryId && ref.pack ? `fvtt:pf2e:${ref.pack}:${ref.foundryId}` : null),
  )
}

/** Foundry-id matches must exist in this compendium (it may not be synced); the rest match by name. */
async function fillMatches(m: CharacterMirror) {
  const items = m.inventory?.items ?? []
  const known = new Set((await rulesGetMany(items.map(i => i.rulesId).filter((x): x is string => !!x))).map(e => e.id))
  for (const i of items) {
    if (i.rulesId && known.has(i.rulesId)) continue
    i.rulesId = i.custom ? null : (await rulesFindByName('item', i.name, 'pf2e'))?.id ?? null
  }
}

function explain(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ── Connection ─────────────────────────────────────────────────────────────

async function refreshHealth() {
  health.value = await link().probe()
  return health.value
}

async function connect(port: number, code: string) {
  busy.value = true
  error.value = ''
  try {
    const res = await pair(baseUrlFor(port), code, '1')
    conn.value = { port, token: res.token, clientId: res.clientId }
    writeConn(conn.value)
    await refreshHealth()
    await loadGame()
  } catch (err) {
    error.value = explain(err)
  } finally {
    busy.value = false
  }
}

function disconnect() {
  stopLive()
  conn.value = { ...conn.value, token: null, clientId: null }
  writeConn(conn.value)
  health.value = null
  game.value = null
}

async function loadGame() {
  try {
    game.value = await link().game()
    error.value = ''
  } catch (err) {
    game.value = null
    error.value = explain(err)
  }
  return game.value
}

// ── Campaign and character links ───────────────────────────────────────────

async function campaignLink(campaignId: number) {
  return (await getDb().campaigns.get(campaignId))?.playbuddy ?? null
}

async function linkCampaign(campaignId: number) {
  // Fresh read: the event position starts at the game's current one
  const g = await loadGame()
  if (!g) return
  await getDb().campaigns.update(campaignId, { playbuddy: { gameId: g.gameId, gameName: g.name, lastSeq: g.eventSeq }, updated_at: now() })
  await startLive(campaignId)
}

async function unlinkCampaign(campaignId: number) {
  stopLive()
  const party = useParty()
  const linked = (await getDb().characters.where('campaign_id').equals(campaignId).toArray()).filter(c => c.pb_player_id)
  for (const c of linked) await unlinkCharacter(campaignId, c.id!)
  await getDb().campaigns.update(campaignId, { playbuddy: null, updated_at: now() })
  await party.reload(campaignId)
}

async function linkCharacter(campaignId: number, characterId: number, player: LinkedPlayer) {
  await useParty().linkPlayer(characterId, { playerId: player.playerId, characterId: player.characterId })
  await refreshStatus(campaignId, [player.playerId])
}

/** A new party PC for a player who has no character here yet. */
async function addFromPlayer(campaignId: number, player: LinkedPlayer) {
  const id = await useParty().addCharacter({ campaignId, name: player.characterName ?? player.name, role: 'pc', level: player.level ?? undefined })
  await linkCharacter(campaignId, id, player)
}

/** Back to a plain party character: the last mirrored items stay as ordinary, editable stacks. */
async function unlinkCharacter(campaignId: number, characterId: number) {
  await getDb().inventory.where('[campaign_id+owner]').equals([campaignId, characterOwner(characterId)]).modify({ pb_entry_id: null })
  await useParty().linkPlayer(characterId, null)
  await useInventory().reload(campaignId)
}

async function linkedCharacters(campaignId: number) {
  return (await getDb().characters.where('campaign_id').equals(campaignId).toArray()).filter(c => c.pb_player_id)
}

// ── Status mirror ──────────────────────────────────────────────────────────

/** Reads what the given players (default: all linked) share and mirrors it into the party. */
async function refreshStatus(campaignId: number, playerIds?: string[]) {
  const chars = (await linkedCharacters(campaignId)).filter(c => !playerIds || playerIds.includes(c.pb_player_id!))
  if (!chars.length) return
  let mirrors: CharacterMirror[]
  try { mirrors = await link().status(chars.map(c => c.pb_player_id!), ALL_LEVELS) }
  catch (err) { error.value = explain(err); return }
  for (const m of mirrors) {
    const c = chars.find(x => x.pb_player_id === m.playerId)
    if (!c) continue
    await fillMatches(m)
    await useParty().applyMirror(c.id!, m)
    if (m.inventory) await useInventory().replaceMirror(campaignId, characterOwner(c.id!), m.inventory.items, m.inventory.coinsCp, c.id!)
    await syncTokens(c.token_id ?? null, m)
  }
}

/** The open encounter's tokens of this character follow its shared HP and AC. */
async function syncTokens(tokenId: number | null, m: CharacterMirror) {
  if (tokenId == null || (!m.basic && !m.defenses)) return
  const store = await encounterStore()
  if (!store) return
  for (const t of store.current?.tokens.filter(x => x.tokenId === tokenId) ?? []) {
    const updates: Record<string, number> = {}
    if (m.basic && t.hpCurrent !== m.basic.hp.value) updates.hpCurrent = m.basic.hp.value
    if (m.basic && t.hpMax !== m.basic.hp.max) updates.hpMax = m.basic.hp.max
    if (m.defenses && t.ac !== m.defenses.ac) updates.ac = m.defenses.ac
    if (Object.keys(updates).length) await store.updateToken(t.id, updates)
  }
}

/**
 * A share file (PLAYBUDDY_API.md §9) for one party character: a snapshot of
 * what the player chose to include. Without a live link the items stay
 * ordinary, editable stacks.
 */
async function importShareFile(campaignId: number, characterId: number, text: string): Promise<string | null> {
  const file = readShareFile(text)
  if (!file) return 'This is not a Play Buddy share file.'
  const m = statusFromWire(file.status, ref => (ref.foundryId && ref.pack ? `fvtt:pf2e:${ref.pack}:${ref.foundryId}` : null))
  await fillMatches(m)
  await useParty().applyMirror(characterId, m)
  const owner = characterOwner(characterId)
  if (m.inventory) await useInventory().replaceMirror(campaignId, owner, m.inventory.items, m.inventory.coinsCp)
  const row = await getDb().characters.get(characterId)
  if (!row?.pb_player_id) {
    await getDb().inventory.where('[campaign_id+owner]').equals([campaignId, owner]).modify({ pb_entry_id: null })
    await useInventory().reload(campaignId)
  }
  return null
}

// ── Offers and requests ────────────────────────────────────────────────────

async function loadOffers(campaignId: number) {
  offers.value = await getDb().linkOffers.where('campaign_id').equals(campaignId).reverse().sortBy('id')
}

/** Writes the row (the outbox) first, then sends: a retry reuses the key, so nothing goes out twice. */
async function create(campaignId: number, c: Character, kind: DbLinkOffer['kind'], payload: LinkOffer | LinkRequest, summary: string,
  extra: Partial<Pick<DbLinkOffer, 'stacks' | 'encounter_id' | 'from_owner' | 'level_up_id'>> = {}): Promise<DbLinkOffer | null> {
  if (!c.pbPlayerId) return null
  const ts = now()
  const row: DbLinkOffer = {
    campaign_id: campaignId, key: crypto.randomUUID(), kind, character_id: c.id, player_id: c.pbPlayerId,
    remote_id: null, state: 'outbox', reason: null, summary, payload: toPlain(payload), stacks: extra.stacks ?? [],
    encounter_id: extra.encounter_id ?? null, from_owner: extra.from_owner ?? null, level_up_id: extra.level_up_id ?? null,
    created_at: ts, updated_at: ts,
  }
  row.id = await getDb().linkOffers.add(row) as number
  await send(row)
  await loadOffers(campaignId)
  return (await getDb().linkOffers.get(row.id)) ?? null
}

async function send(row: DbLinkOffer, retried = false): Promise<void> {
  const l = link()
  try {
    const res = row.kind === 'roll' || row.kind === 'damage'
      ? await l.sendRequest(row.key, [row.player_id], row.payload as LinkRequest).then(r => ({ id: r.requestId, d: r.deliveries }))
      : await l.sendOffer(row.key, [row.player_id], row.payload as LinkOffer).then(r => ({ id: r.offerId, d: r.deliveries }))
    const d = res.d.find(x => x.playerId === row.player_id) ?? res.d[0]
    await getDb().linkOffers.update(row.id!, { remote_id: res.id, state: d?.state ?? 'queued', updated_at: now() })
    if (d && FINAL.includes(d.state)) await settle({ ...row, remote_id: res.id }, d.state, d.reason ?? null)
  } catch (err) {
    if (err instanceof LinkError && err.code === 'unknownItem' && row.kind === 'items' && !retried) {
      // Play Buddy's catalog doesn't know an item: send every stack with its full definition instead
      const payload: LinkOffer = { kind: 'items', stacks: (row.payload as Extract<LinkOffer, { kind: 'items' }>).stacks.map(asCustomStack) }
      const next = { ...row, key: crypto.randomUUID(), payload }
      await getDb().linkOffers.update(row.id!, { key: next.key, payload: toPlain(payload) })
      return send(next, true)
    }
    if (err instanceof LinkError && err.code === 'unreachable') {
      notify(`Play Buddy isn't reachable: "${row.summary}" waits in the outbox and goes out when it's back.`, 'warning')
      return
    }
    await settle(row, 'failed', explain(err))
    notify(`Play Buddy refused "${row.summary}": ${explain(err)}`, 'error')
  }
}

/** Sends what's still in the outbox (after reconnecting). */
async function flushOutbox(campaignId: number) {
  const waiting = await getDb().linkOffers.where('campaign_id').equals(campaignId).filter(r => r.state === 'outbox').toArray()
  for (const r of waiting) await send(r)
  await loadOffers(campaignId)
}

/** An answer arrived: the row takes the state, and the stash keeps or loses what was offered. */
async function settle(row: DbLinkOffer, state: DeliveryState, reason: string | null) {
  const current = await getDb().linkOffers.get(row.id!)
  if (!current || FINAL.includes(current.state as DeliveryState)) return
  await getDb().linkOffers.update(row.id!, { state, reason, updated_at: now() })
  const accepted = state === 'accepted'
  if (FINAL.includes(state)) {
    if (row.kind === 'items') await useInventory().settleOffered(row.campaign_id, row.stacks, accepted)
    if (row.kind === 'coins' && !accepted) await useInventory().adjustPurse(row.campaign_id, row.from_owner ?? STASH, (row.payload as { cp: number }).cp)
    if (row.kind === 'levelUp' && row.level_up_id != null) await useParty().settleLevelUp(row.level_up_id, row.character_id, state as Exclude<DeliveryState, 'queued' | 'delivered'>)
    if (!accepted && state !== 'withdrawn') notify(`${row.summary}: ${state}${reason ? ` (${reason})` : ''}`, 'info')
  }
  await loadOffers(row.campaign_id)
}

async function offerItems(campaignId: number, c: Character, picks: { entry: InventoryEntry; item: Item | undefined; quantity: number }[]) {
  // Runes, talismans and relic gifts go along with their item
  const inv = useInventory()
  const linked = (e: InventoryEntry) => (e.itemId ? inv.items.value.get(e.itemId) ?? inv.gifts.value.get(e.itemId) : undefined)
  const stacks = picks.map(p => stackFromEntry({ ...p.entry, quantity: p.quantity }, p.item,
    inv.entries.value.filter(a => a.attachedTo === p.entry.id).map(a => ({ entry: a, item: linked(a) }))))
  const summary = stacks.map(s => `${s.quantity > 1 ? `${s.quantity}× ` : ''}${s.identified ? s.name : (s.playerName ?? 'Unidentified item')}`).join(', ')
  const row = await create(campaignId, c, 'items', { kind: 'items', stacks }, `${summary} → ${c.name}`, {
    stacks: picks.map(p => ({ inventoryId: p.entry.id, quantity: p.quantity })),
  })
  if (row && !FINAL.includes(row.state as DeliveryState)) await useInventory().markOffered(campaignId, picks.map(p => p.entry.id), row.id!)
}

/** Coins leave their purse (the stash by default) at once and come back if the player declines. */
async function offerCoins(campaignId: number, c: Character, cp: number, label: string, from: OwnerKey = STASH) {
  if (cp <= 0) return
  await useInventory().adjustPurse(campaignId, from, -cp)
  await create(campaignId, c, 'coins', { kind: 'coins', cp }, `${label} → ${c.name}`, { from_owner: from })
}

/** Sent by the party's level-up (useParty.levelUp), which records it as pending in its history. */
async function offerLevelUp(campaignId: number, c: Character, toLevel: number, levelUpId: number | null = null) {
  return create(campaignId, c, 'levelUp', { kind: 'levelUp', toLevel }, `Level ${toLevel} → ${c.name}`, { level_up_id: levelUpId })
}

/** Hero points (start of a session, a great moment); the player's app keeps the total at 3 or less. */
async function offerHeroPoint(campaignId: number, c: Character, amount = 1, reason?: string) {
  await create(campaignId, c, 'heroPoint', { kind: 'heroPoint', amount, ...(reason ? { reason } : {}) }, `${amount} hero point${amount === 1 ? '' : 's'} → ${c.name}`)
}

/** One hero point to every linked character, e.g. at the start of a session. */
async function heroPointsForAll(campaignId: number, chars: Character[], reason = 'Start of session') {
  for (const c of chars.filter(x => x.pbPlayerId)) await offerHeroPoint(campaignId, c, 1, reason)
}

async function identify(campaignId: number, c: Character, entry: InventoryEntry, name: string) {
  if (!entry.pbEntryId || !c.pbPlayerId) return
  await create(campaignId, c, 'identify', { kind: 'identify', playerId: c.pbPlayerId, entryId: entry.pbEntryId }, `Identify ${name} (${c.name})`)
}

/** Asks each linked character's player to roll initiative; the results fill this encounter's turn order. */
async function requestInitiative(campaignId: number, encounterId: number, chars: Character[], check = 'perception', label = 'Initiative') {
  for (const c of chars) {
    await create(campaignId, c, 'roll', { kind: 'roll', check, initiative: true, label }, `${label} (${check}) — ${c.name}`, { encounter_id: encounterId })
  }
}

async function requestRoll(campaignId: number, c: Character, check: string, opts: { dc?: number; secret?: boolean; label?: string } = {}) {
  await create(campaignId, c, 'roll', { kind: 'roll', check, ...opts }, `${opts.label ?? check} — ${c.name}`)
}

async function requestDamage(campaignId: number, c: Character, damage: { amount: number; type: string; persistent?: boolean }[], conditions: { slug: string; value?: number }[], label?: string) {
  const what = [...damage.map(d => `${d.amount} ${d.persistent ? 'persistent ' : ''}${d.type}`), ...conditions.map(k => `${k.slug}${k.value ? ` ${k.value}` : ''}`)].join(', ')
  await create(campaignId, c, 'damage', { kind: 'damage', damage, conditions, ...(label ? { label } : {}) }, `${what} → ${c.name}`)
}

async function withdraw(row: DbLinkOffer) {
  if (row.state === 'outbox' || !row.remote_id) { await settle(row, 'withdrawn', null); return }
  try {
    if (row.kind === 'roll' || row.kind === 'damage') await link().withdrawRequest(row.remote_id)
    else await link().withdrawOffer(row.remote_id)
    await settle(row, 'withdrawn', null)
  } catch (err) {
    notify(`Couldn't withdraw: ${explain(err)}`, 'error')
  }
}

async function clearAnswered(campaignId: number) {
  await getDb().linkOffers.where('campaign_id').equals(campaignId).filter(r => FINAL.includes(r.state as DeliveryState)).delete()
  await loadOffers(campaignId)
}

// ── Events ─────────────────────────────────────────────────────────────────

async function rowByRemote(remoteId: string) {
  return getDb().linkOffers.where('remote_id').equals(remoteId).first()
}

/** An initiative result goes into the encounter it was asked for (open or not). */
async function placeInitiative(row: DbLinkOffer, total: number) {
  if (row.encounter_id == null) return
  const c = await getDb().characters.get(row.character_id)
  if (c?.token_id == null) return
  const store = await encounterStore()
  if (store?.current?.id === row.encounter_id) {
    for (const t of store.current.tokens.filter(x => x.tokenId === c.token_id)) await store.updateToken(t.id, { initiative: total })
  } else {
    await getDb().encounterTokens.where('encounter_id').equals(row.encounter_id).filter(t => t.token_id === c.token_id).modify({ initiative: total })
  }
}

async function logRoll(roll: RollEntry, tokenId: number | null) {
  const store = await encounterStore()
  const t = tokenId == null ? undefined : store?.current?.tokens.find(x => x.tokenId === tokenId)
  if (!store || !t) return
  const degree = roll.degree ? ` — ${roll.degree.replace(/([A-Z])/g, ' $1').toLowerCase()}` : ''
  await store.addLogNote(t.id, `${roll.label}: ${roll.total}${roll.dc ? ` vs DC ${roll.dc}` : ''}${degree}${roll.secret ? ' (secret)' : ''}`)
}

async function handle(campaignId: number, e: LinkEvent, statusQueue: Set<string>) {
  switch (e.type) {
    case 'roll': {
      const c = (await linkedCharacters(campaignId)).find(x => x.pb_player_id === e.roll.playerId)
      const name = c?.name ?? game.value?.players.find(p => p.playerId === e.roll.playerId)?.characterName ?? 'A player'
      rolls.value = [{ ...e.roll, characterName: name }, ...rolls.value].slice(0, 50)
      const row = e.roll.requestId ? await rowByRemote(e.roll.requestId) : undefined
      if (row?.kind === 'roll' && row.encounter_id != null) await placeInitiative(row, e.roll.total)
      await logRoll(e.roll, c?.token_id ?? null)
      break
    }
    case 'status': statusQueue.add(e.playerId); break
    case 'offer': case 'request': {
      const row = await rowByRemote(e.type === 'offer' ? e.offerId : e.requestId)
      if (row) {
        if (FINAL.includes(e.state)) await settle(row, e.state, e.reason ?? null)
        else { await getDb().linkOffers.update(row.id!, { state: e.state, updated_at: now() }); await loadOffers(campaignId) }
      }
      break
    }
    case 'itemReturned': {
      const c = (await linkedCharacters(campaignId)).find(x => x.pb_player_id === e.playerId)
      const i = e.item
      const probe: CharacterMirror = { playerId: e.playerId, characterId: '', at: e.at, notShared: [], inventory: { coinsCp: 0, items: [i], bulkTenths: 0, investedCount: 0 } }
      await fillMatches(probe)
      const rulesId = i.rulesId
      await useInventory().addEntry({
        campaignId, owner: STASH, itemId: rulesId, name: i.name, quantity: i.quantity,
        priceOverride: rulesId ? null : Math.round(i.price / (i.priceFor || 1)), identified: i.identified,
      })
      notify(`${c?.name ?? 'A player'} gave ${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.name} to the party stash${e.note ? `: "${e.note}"` : ''}`, 'info')
      break
    }
    case 'character': {
      const c = (await linkedCharacters(campaignId)).find(x => x.pb_player_id === e.playerId)
      if (c) await useParty().linkPlayer(c.id!, { playerId: e.playerId, characterId: e.characterId })
      statusQueue.add(e.playerId)
      await loadGame()
      break
    }
    case 'shares': case 'presence': await loadGame(); if (e.type === 'shares') statusQueue.add(e.playerId); break
    case 'gameClosed': await refreshHealth(); notify('The Play Buddy game was closed.', 'warning'); break
  }
}

/** Catches up on answers missed while StarTome was closed. */
async function reconcileOpen(campaignId: number) {
  const open = await getDb().linkOffers.where('campaign_id').equals(campaignId)
    .filter(r => !!r.remote_id && !FINAL.includes(r.state as DeliveryState) && r.kind !== 'roll' && r.kind !== 'damage').toArray()
  for (const r of open) {
    try {
      const o = await link().getOffer(r.remote_id!)
      const d = o.deliveries.find(x => x.playerId === r.player_id)
      if (d && FINAL.includes(d.state)) await settle(r, d.state, d.reason ?? null)
    } catch {}
  }
}

/** The encounter store, if Pinia is running (it isn't in tests or before the app mounts). */
async function encounterStore() {
  const { getActivePinia } = await import('pinia')
  if (!getActivePinia()) return null
  const { useEncounterStore } = await import('~/stores/encounter')
  return useEncounterStore()
}

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms)
  signal.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
})

/** Follows the game while this campaign is open: events by long poll, a status refresh per change. */
async function startLive(campaignId: number) {
  if (liveCampaign.value === campaignId && loopAbort) return
  stopLive()
  const linkInfo = await campaignLink(campaignId)
  if (!linkInfo || !conn.value.token) return
  const abort = new AbortController()
  loopAbort = abort
  liveCampaign.value = campaignId
  await loadOffers(campaignId)
  void (async () => {
    let after = linkInfo.lastSeq
    let first = true
    while (!abort.signal.aborted) {
      try {
        if (first) {
          const h = await refreshHealth()
          if (!h.ok) throw new LinkError(h.reason, h.message ?? h.reason)
          const g = await loadGame()
          if (g && g.gameId !== linkInfo.gameId) {
            error.value = `Play Buddy has a different game open (${g.name}); this campaign is linked to ${linkInfo.gameName}.`
            await sleep(15000, abort.signal)
            continue
          }
          await flushOutbox(campaignId)
          await reconcileOpen(campaignId)
          await refreshStatus(campaignId)
          first = false
        }
        const batch = await link().events(after, 25, abort.signal)
        if (abort.signal.aborted) break
        const statusQueue = new Set<string>()
        if (batch.resetRequired) { first = true; after = batch.lastSeq; continue }
        for (const e of batch.events) await handle(campaignId, e, statusQueue)
        if (statusQueue.size) await refreshStatus(campaignId, [...statusQueue])
        if (batch.lastSeq !== after) {
          after = batch.lastSeq
          await getDb().campaigns.update(campaignId, { playbuddy: { ...linkInfo, lastSeq: after } })
        }
        error.value = ''
      } catch (err) {
        if (abort.signal.aborted) break
        error.value = explain(err)
        first = true
        await sleep(5000, abort.signal)
      }
    }
  })()
}

function stopLive() {
  loopAbort?.abort()
  loopAbort = null
  liveCampaign.value = null
}

export function usePlayBuddy() {
  return {
    conn, health, game, error, busy, rolls, offers, liveCampaign,
    connected: computed(() => !!conn.value.token),
    connect, disconnect, refreshHealth, loadGame,
    campaignLink, linkCampaign, unlinkCampaign, linkCharacter, addFromPlayer, unlinkCharacter,
    refreshStatus, importShareFile, startLive, stopLive, loadOffers,
    offerItems, offerCoins, offerLevelUp, offerHeroPoint, heroPointsForAll, identify, requestInitiative, requestRoll, requestDamage, withdraw, clearAnswered,
  }
}
