/**
 * What the GM sends to linked players, and what becomes of it. Every message
 * is written to the outbox first and sent with its idempotency key, so a
 * retry never sends twice. Gifts leave the stash only when accepted; coins
 * leave at once and come back on a decline.
 */
import { emitDomainEvent } from '@/domain/events'
import { STASH, type InventoryEntry as Stack, type OwnerKey } from '@/domain/rules/inventory'
import type { Item, RelicGift } from '@/domain/rules/types'
import type { Character, LinkOutboxItem, MessageState } from '@/domain/schema'
import { isFinal, linkedCharacters, outbox, placeInitiative, type OutboxInput } from '@/data/link'
import { markOffered, settleOffered } from '@/data/linkInventory'
import { adjustPurse } from '@/data/inventory'
import { levelUp, setLevelUpOffer, settleLevelUp, undoLevelUp, type LevelUpEntry } from '@/data/party'
import { getRow } from '@/data/repo'
import { LinkError } from './client'
import { givenItem, givenLabel, rollResult } from './convert'
import { client, explain, say } from './state'
import type * as W from './wire'

type Extra = Partial<Pick<LinkOutboxItem, 'stacks' | 'encounterId' | 'fromOwner' | 'ledgerId'>>
type Linked = Character & { link: NonNullable<Character['link']> }
const isLinked = (c: Character): c is Linked => !!c.link

async function create(c: Character, body: W.MessageBody, summary: string, extra: Extra = {}): Promise<LinkOutboxItem | null> {
  if (!isLinked(c)) return null
  const input: OutboxInput = { campaignId: c.campaignId, kind: body.kind, characterId: c.id, playerId: c.link.playerId, summary, body: body as unknown as Record<string, unknown>, ...extra }
  const row = await outbox.add(input)
  await send(row)
  return (await outbox.get(row.id)) ?? null
}

async function send(row: LinkOutboxItem): Promise<void> {
  try {
    const m = await client().send(row.key, { to: row.playerId, body: row.body as unknown as W.MessageBody })
    await outbox.patch(row.id, { remoteId: m.messageId })
    await applyMessage({ ...row, remoteId: m.messageId }, m)
  } catch (err) {
    if (err instanceof LinkError && err.code === 'unreachable') { say(`Play Buddy isn't reachable: “${row.summary}” waits in the outbox and goes out when it is back.`); return }
    await settle(row, 'failed', explain(err))
    say(`Play Buddy refused “${row.summary}”: ${explain(err)}`, 'error')
  }
}

/** Sends what is still in the outbox (after reconnecting). */
export async function flushOutbox(campaignId: string): Promise<void> {
  for (const r of (await outbox.ofCampaign(campaignId)).filter(x => x.state === 'outbox').reverse()) await send(r)
}

/** Catches up on answers given while StarTome was closed. */
export async function reconcile(campaignId: string): Promise<void> {
  const open = (await outbox.ofCampaign(campaignId)).filter(r => r.remoteId && !isFinal(r.state))
  if (!open.length) return
  const res = await client().messages(open.map(r => r.remoteId as string))
  for (const m of res.messages) { const row = open.find(r => r.remoteId === m.messageId); if (row) await applyMessage(row, m) }
  for (const id of res.unknown) { const row = open.find(r => r.remoteId === id); if (row) await settle(row, 'expired', 'Play Buddy no longer knows it') }
}

/** A message as Play Buddy has it now: the row follows its state, and a roll is kept. */
export async function applyMessage(row: LinkOutboxItem, m: W.Message): Promise<void> {
  if (m.roll && !row.roll) {
    await outbox.patch(row.id, { roll: rollResult(m.roll) })
    if (row.encounterId && (row.body as { initiative?: boolean }).initiative) {
      await placeInitiative(row.encounterId, row.characterId, m.roll.total)
      emitDomainEvent('linkInitiative', { campaignId: row.campaignId, encounterId: row.encounterId, characterId: row.characterId, total: m.roll.total })
    }
  }
  if (isFinal(m.state)) await settle(row, m.state, m.reason ?? null)
  else if (m.state !== row.state) await outbox.patch(row.id, { state: m.state })
}

/** An answer arrived: the row takes the state once, and the stash keeps or loses what was given. */
async function settle(row: LinkOutboxItem, state: MessageState, reason: string | null): Promise<void> {
  const done = await outbox.finish(row.id, state, reason)
  if (!done) return
  const accepted = state === 'accepted'
  if (row.kind === 'items') await settleOffered(row.stacks, accepted)
  if (row.kind === 'coins' && !accepted) await adjustPurse(row.campaignId, row.fromOwner ?? STASH, (row.body as { cp: number }).cp)
  if (row.kind === 'levelUp' && row.ledgerId) await settleLevelUp(row.ledgerId, row.characterId, state as Exclude<MessageState, 'queued' | 'delivered'>)
  if (!accepted && state !== 'withdrawn') say(`${row.summary}: ${state}${reason ? ` (${reason})` : ''}`)
}

export async function withdraw(row: LinkOutboxItem): Promise<void> {
  if (isFinal(row.state)) return
  if (row.state === 'outbox' || !row.remoteId) { await settle(row, 'withdrawn', null); return }
  try { await applyMessage(row, await client().withdraw(row.remoteId)) }
  catch (err) { say(`Couldn't withdraw “${row.summary}”: ${explain(err)}`, 'error') }
}

export const clearAnswered = (campaignId: string) => outbox.clearAnswered(campaignId)

// ── What can be sent ───────────────────────────────────────────────────────

export interface ItemPick { entry: Stack; item: Item | undefined; quantity: number; attached: { entry: Stack; item: Item | RelicGift | undefined }[] }

/** Offers stacks of the stash. They stay there, marked as offered, until the player accepts. */
export async function offerItems(c: Character, picks: ItemPick[]): Promise<void> {
  const items = picks.map(p => givenItem({ ...p.entry, quantity: p.quantity }, p.item, p.attached))
  const row = await create(c, { kind: 'items', items }, `${items.map(givenLabel).join(', ')} → ${c.name}`, { stacks: picks.map(p => ({ inventoryId: p.entry.id, quantity: p.quantity })) })
  if (row && !isFinal(row.state)) await markOffered(picks.map(p => p.entry.id), row.id)
}

/** Coins leave their purse (the stash by default) at once and come back if the player declines. */
export async function offerCoins(c: Character, cp: number, label: string, from: OwnerKey = STASH): Promise<void> {
  if (cp <= 0 || !isLinked(c)) return
  await adjustPurse(c.campaignId, from, -cp)
  await create(c, { kind: 'coins', cp }, `${label} → ${c.name}`, { fromOwner: from })
}

/** Hero points (the start of a session, a great moment); the player's app keeps the total at 3 or less. */
export async function offerHeroPoints(c: Character, amount = 1, reason?: string): Promise<void> {
  await create(c, { kind: 'heroPoints', amount, ...(reason ? { reason } : {}) }, `${amount} hero point${amount === 1 ? '' : 's'} → ${c.name}`)
}

/** One hero point to every linked character. Returns how many were sent. */
export async function heroPointsForAll(campaignId: string, reason = 'Start of session'): Promise<number> {
  const chars = await linkedCharacters(campaignId)
  for (const c of chars) await offerHeroPoints(c, 1, reason)
  return chars.length
}

/** Reveals an unidentified item (or one rune, or a relic gift) the player holds. */
export async function identify(c: Character, remoteEntryId: string, name: string): Promise<void> {
  await create(c, { kind: 'identify', entryId: remoteEntryId }, `Identify ${name} (${c.name})`)
}

export interface RollAsk { check: string; dc?: number; secret?: boolean; label?: string }

export async function requestRoll(c: Character, ask: RollAsk): Promise<void> {
  await create(c, { kind: 'roll', ...ask }, `${ask.label ?? ask.check}${ask.dc ? ` DC ${ask.dc}` : ''}${ask.secret ? ' (secret)' : ''} — ${c.name}`)
}

/** Asks the players of these characters to roll initiative; the results fill that encounter's turn order. */
export async function requestInitiative(encounterId: string, chars: Character[], check = 'perception', label = 'Initiative'): Promise<number> {
  const linked = chars.filter(isLinked)
  for (const c of linked) await create(c, { kind: 'roll', check, initiative: true, label }, `${label} (${check.replace('skill:', '')}) — ${c.name}`, { encounterId })
  return linked.length
}

/** `healing`: Hit Points given back (draft 2.1 of the API); `damage` and `conditions` may be empty. */
export interface DamageAsk { damage: { amount: number; type: string; persistent?: boolean }[]; conditions: { id: string; value?: number }[]; healing?: number; label?: string }

export async function requestDamage(c: Character, ask: DamageAsk): Promise<void> {
  const what = [
    ...ask.damage.map(d => `${d.amount} ${d.persistent ? 'persistent ' : ''}${d.type}`.trim()),
    ...(ask.healing ? [`${ask.healing} healing`] : []),
    ...ask.conditions.map(k => `${k.id}${k.value ? ` ${k.value}` : ''}`),
  ].join(', ')
  if (!what) return
  await create(c, { kind: 'damage', ...(ask.damage.length ? { damage: ask.damage } : {}), ...(ask.healing ? { healing: ask.healing } : {}), ...(ask.conditions.length ? { conditions: ask.conditions } : {}), ...(ask.label ? { label: ask.label } : {}) }, `${what} → ${c.name}`)
}

// ── Level-ups ──────────────────────────────────────────────────────────────

/** The party's level-up; linked characters get theirs as an offer and level when they accept. */
export async function levelUpParty(campaignId: string, selected: string[], trigger: LevelUpEntry['trigger'] = 'manual', refId: string | null = null): Promise<LevelUpEntry | null> {
  const entry = await levelUp(campaignId, selected, trigger, refId)
  for (const ch of entry?.changes.filter(x => x.offer) ?? []) {
    const c = await getRow('characters', ch.characterId)
    const row = c ? await create(c, { kind: 'levelUp', toLevel: ch.to }, `Level ${ch.to} → ${c.name}`, { ledgerId: entry?.id ?? null }) : null
    if (row && entry) await setLevelUpOffer(entry.id, ch.characterId, row.id)
  }
  return entry
}

/** Undoes a level-up; offers the players have not answered are withdrawn. */
export async function undoPartyLevelUp(ledgerId: string): Promise<void> {
  const entry = await getRow('partyLedger', ledgerId)
  for (const ch of entry?.kind === 'levelUp' ? entry.changes : []) {
    const row = ch.offer?.state === 'pending' && ch.offer.outboxId ? await outbox.get(ch.offer.outboxId) : undefined
    if (row) await withdraw(row)
  }
  await undoLevelUp(ledgerId)
}
