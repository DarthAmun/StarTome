/**
 * Play Buddy wire format (wire/v1.ts) ⇄ StarTome's port vocabulary (port.ts).
 * Pure: no fetch, no database. Item matching takes a resolver the caller
 * builds from the compendium (see composables/usePlayBuddy.ts).
 */
import type {
  CharacterMirror, DeliveryResult, LinkedGame, LinkEvent, LinkOffer, LinkRequest, MirrorAttachment, MirrorItem, OfferAttachment, OfferStack, RollEntry,
} from '~/partylink/port'
import type * as W from '~/partylink/wire/v1'
import type { InventoryEntry } from '~/rules/inventory'
import type { Item, ItemCategory, RelicGift } from '~/types/rules'

/** Our compendium id for a Play Buddy item, or null. Called with the ref and the item's name. */
export type ItemResolver = (ref: W.ItemRef, name: string) => string | null

// ── Small conversions ──────────────────────────────────────────────────────

/** Foundry's sluggify, which Play Buddy's catalog ids follow: "Healing Potion (Minor)" → "healing-potion-minor". */
export function slugify(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function coinsToCp(c: W.Coins): number {
  return (c.pp ?? 0) * 1000 + (c.gp ?? 0) * 100 + (c.sp ?? 0) * 10 + (c.cp ?? 0)
}

/** Plain gold/silver/copper, no platinum (players' apps make change themselves). */
export function cpToCoins(cp: number): W.Coins {
  const n = Math.max(0, Math.round(cp))
  return { pp: 0, gp: Math.floor(n / 100), sp: Math.floor((n % 100) / 10), cp: n % 10 }
}

/** Play Buddy Bulk (0.1 = L) → our tenths. */
export const bulkToTenths = (b: number) => Math.round((b ?? 0) * 10)
export const tenthsToBulk = (t: number) => Math.round(t) / 10

/** Our compendium id `fvtt:pf2e:<pack>:<_id>` → Play Buddy's item ref. */
export function itemRefOf(rulesId: string | null, name: string): W.ItemRef {
  const m = rulesId?.match(/^fvtt:pf2e:([^:]+):([^:]+)$/)
  return m ? { slug: slugify(name), foundryId: m[2], pack: m[1] } : { slug: slugify(name) }
}

// ── Play Buddy → StarTome ──────────────────────────────────────────────────

export function gameFromWire(g: W.Game): LinkedGame {
  return {
    gameId: g.gameId, name: g.name, eventSeq: g.eventSeq,
    players: g.players.map(p => ({
      playerId: p.playerId, name: p.displayName, online: p.online,
      characterId: p.character?.characterId ?? null, characterName: p.character?.name ?? null,
      level: p.character?.level ?? null,
      className: p.character ? [p.character.class, p.character.class2].filter(Boolean).join(' / ') || null : null,
      shares: p.shares ?? [],
      autoAccept: { items: !!p.autoAccept?.items, coins: !!p.autoAccept?.coins, levelUp: !!p.autoAccept?.levelUp, heroPoints: !!p.autoAccept?.heroPoints, requests: !!p.autoAccept?.requests },
    })),
  }
}

export function itemFromWire(i: W.InventoryItem, resolve: ItemResolver): MirrorItem {
  return {
    entryId: i.entryId, rulesId: i.custom ? null : resolve(i.ref, i.name),
    slug: i.ref.slug, foundryId: i.ref.foundryId ?? null, custom: i.custom,
    name: i.name, quantity: i.quantity, level: i.level, price: i.price, priceFor: i.priceFor || 1,
    bulk: bulkToTenths(i.bulk), identified: i.identified !== false, invested: !!i.invested,
    attachments: (i.attachments ?? []).map((a, n) => attachmentFromWire(a, `${i.entryId}:${n}`, resolve)),
    relic: i.relic ? { aspects: [...i.relic.aspects] } : null,
    containerEntryId: i.container ?? null,
  }
}

function attachmentFromWire(a: W.WireAttachment, fallbackId: string, resolve: ItemResolver): MirrorAttachment {
  return {
    entryId: a.entryId ?? fallbackId,
    rulesId: a.ref && a.kind !== 'gift' ? resolve(a.ref, a.name) : null,
    kind: a.kind, name: a.name, level: a.level ?? 0, price: a.price ?? 0, identified: a.identified !== false,
  }
}

export function statusFromWire(s: W.StatusResponse, resolve: ItemResolver): CharacterMirror {
  const out: CharacterMirror = { playerId: s.playerId, characterId: s.characterId, at: s.at, notShared: s.notShared ?? [] }
  if (s.basic) {
    out.basic = {
      name: s.basic.name, level: s.basic.level, ancestry: s.basic.ancestry,
      className: [s.basic.class, s.basic.class2].filter(Boolean).join(' / '),
      hp: { value: s.basic.hp.current, max: s.basic.hp.max, temp: s.basic.hp.temp ?? 0 },
      conditions: (s.basic.conditions ?? []).map(c => ({ slug: c.id, name: c.name, value: c.value ?? null })),
      heroPoints: s.basic.heroPoints ?? null,
    }
  }
  if (s.defenses) {
    out.defenses = {
      ac: s.defenses.ac, fort: s.defenses.saves.fortitude, ref: s.defenses.saves.reflex, will: s.defenses.saves.will,
      perception: s.defenses.perception, speed: s.defenses.speeds?.land ?? 0,
    }
  }
  if (s.skills) {
    const dcs = (s.skills.spellcasting ?? []).map(x => x.dc)
    out.skills = {
      strMod: s.skills.attributes.str, skills: { ...s.skills.skills },
      classDc: s.skills.classDc ?? null, spellDc: dcs.length ? Math.max(...dcs) : null,
    }
  }
  if (s.inventory) {
    out.inventory = {
      coinsCp: coinsToCp(s.inventory.coins), items: s.inventory.items.map(i => itemFromWire(i, resolve)),
      bulkTenths: bulkToTenths(s.inventory.bulk?.carried ?? 0), investedCount: s.inventory.invested?.count ?? 0,
    }
  }
  return out
}

export function rollFromWire(r: W.Roll): RollEntry {
  return {
    rollId: r.rollId, playerId: r.playerId, requestId: r.requestId ?? null, at: r.at, kind: r.kind,
    label: r.label, formula: r.formula, total: r.total, dc: r.dc ?? null, degree: r.degree ?? null, secret: !!r.secret,
  }
}

export function deliveriesFromWire(list: W.Delivery[]): DeliveryResult[] {
  return list.map(d => ({ playerId: d.playerId, state: d.state, ...(d.reason ? { reason: d.reason } : {}) }))
}

const PRESENCE = { playerJoined: 'joined', playerLeft: 'left', playerOnline: 'online', playerOffline: 'offline' } as const

export function eventFromWire(e: W.GameEvent, resolve: ItemResolver): LinkEvent | null {
  const base = { seq: e.seq, at: e.at }
  switch (e.type) {
    case 'roll': return { ...base, type: 'roll', roll: rollFromWire(e.roll) }
    case 'statusChanged': return { ...base, type: 'status', playerId: e.playerId, levels: e.levels }
    case 'sharesChanged': return { ...base, type: 'shares', playerId: e.playerId, shares: e.shares }
    case 'offerChanged': return { ...base, type: 'offer', offerId: e.offerId, playerId: e.playerId, state: e.state, ...(e.reason ? { reason: e.reason } : {}) }
    case 'requestChanged': return { ...base, type: 'request', requestId: e.requestId, playerId: e.playerId, state: e.state, ...(e.reason ? { reason: e.reason } : {}) }
    case 'itemReturned': return { ...base, type: 'itemReturned', playerId: e.playerId, item: itemFromWire(e.item, resolve), ...(e.note ? { note: e.note } : {}) }
    case 'playerJoined': case 'playerLeft': case 'playerOnline': case 'playerOffline':
      return { ...base, type: 'presence', playerId: e.playerId, change: PRESENCE[e.type] }
    case 'characterChanged': return { ...base, type: 'character', playerId: e.playerId, characterId: e.characterId }
    case 'gameClosed': return { ...base, type: 'gameClosed' }
    default: return null   // a newer server's event type: ignore it
  }
}

/** A Play Buddy share file (§9), or null if the text isn't one. */
export function readShareFile(text: string): W.ShareFile | null {
  let raw: any
  try { raw = JSON.parse(text) } catch { return null }
  if (raw?.format !== 'playbuddy-share' || raw.formatVersion !== 1 || typeof raw.status !== 'object' || !raw.status) return null
  return raw as W.ShareFile
}

// ── StarTome → Play Buddy ──────────────────────────────────────────────────

const PB_TYPE: Record<ItemCategory, string> = {
  weapon: 'weapon', armor: 'armor', shield: 'shield', equipment: 'gear', consumable: 'consumable',
  treasure: 'treasure', container: 'container', ammunition: 'ammo', kit: 'kit',
}

type Linked = Item | RelicGift | undefined

/** The parts of an offer Play Buddy needs for items its catalog doesn't know. */
function customOf(entry: InventoryEntry, item: Linked): OfferStack['custom'] {
  const it = item?.kind === 'item' ? item : undefined
  return {
    level: item?.level ?? 0,
    priceCp: entry.priceOverride ?? entry.giftValue ?? it?.price?.cp ?? 0,
    priceFor: it?.priceFor ?? 1,
    bulkTenths: entry.bulkOverride ?? it?.bulk ?? 0,
    rarity: item?.rarity ?? 'common',
    traits: item?.traits ?? [],
    category: item?.kind === 'relicGift' ? 'relic-gift' : it?.category ?? 'equipment',
    weapon: it?.category === 'weapon',
    armor: it?.category === 'armor',
    summary: '',
  }
}

/**
 * An inventory stack (and its compendium item, if linked) as an offer stack,
 * with what's attached to it.
 */
export function stackFromEntry(entry: InventoryEntry, item: Item | undefined, attached: { entry: InventoryEntry; item: Linked }[] = []): OfferStack {
  return {
    rulesId: item?.id ?? null,
    name: entry.nameOverride ?? item?.name ?? 'Unnamed item',
    quantity: entry.quantity,
    identified: entry.identified,
    playerName: entry.identified ? null : (entry.playerName ?? item?.unidentified?.name ?? null),
    playerDescription: entry.identified ? null : (entry.playerDescription ?? item?.unidentified?.description ?? null),
    attachments: attached.map(a => ({
      rulesId: a.item?.id ?? null,
      kind: a.entry.attachKind ?? 'accessory',
      name: a.entry.nameOverride ?? a.item?.name ?? 'Unnamed item',
      identified: a.entry.identified,
      ...(a.item?.kind === 'relicGift' ? { tier: a.item.tier } : {}),
      custom: customOf(a.entry, a.item),
    } satisfies OfferAttachment)),
    relic: entry.relic ? { aspects: [...entry.relic.aspects] } : null,
    custom: customOf(entry, item),
  }
}

/** Synced Foundry items by ref; relic gifts, homebrew and free text with a definition. */
function definitionOf(rulesId: string | null, name: string, custom: OfferStack['custom']): Pick<W.OfferItem, 'ref' | 'definition'> {
  if (rulesId?.startsWith('fvtt:pf2e:')) return { ref: itemRefOf(rulesId, name) }
  return {
    definition: {
      id: slugify(name) || 'custom-item', name, type: PB_TYPE[custom.category as ItemCategory] ?? (custom.category === 'relic-gift' ? 'relic-gift' : 'gear'),
      level: custom.level, price: custom.priceCp, priceFor: custom.priceFor, bulk: tenthsToBulk(custom.bulkTenths),
      rarity: custom.rarity, traits: custom.traits, source: 'StarTome homebrew', summary: custom.summary,
    },
  }
}

function attachmentToWire(a: OfferAttachment): W.WireAttachment {
  return {
    kind: a.kind, name: a.name, ...definitionOf(a.rulesId, a.name, a.custom),
    ...(a.identified ? {} : { identified: false }), ...(a.tier ? { tier: a.tier } : {}),
  }
}

/** Synced items go by catalog ref; homebrew and free-text items carry a definition. */
export function offerItemToWire(s: OfferStack): W.OfferItem {
  const item: W.OfferItem = { quantity: s.quantity, ...definitionOf(s.rulesId, s.name, s.custom) }
  // On an unidentified item everything attached is unidentified too: it's revealed with the item
  if (s.attachments?.length) item.attachments = s.attachments.map(a => attachmentToWire(s.identified ? a : { ...a, identified: false }))
  if (s.relic) item.relic = { aspects: [...s.relic.aspects] }
  if (!s.identified) {
    item.identified = false
    item.unidentifiedName = s.playerName ?? 'Unidentified item'
    if (s.playerDescription) item.unidentifiedDescription = s.playerDescription
  }
  return item
}

/** Same stack without its catalog refs: what to send when Play Buddy answers `unknownItem`. */
export function asCustomStack(s: OfferStack): OfferStack {
  return { ...s, rulesId: null, attachments: (s.attachments ?? []).map(a => ({ ...a, rulesId: null })) }
}

export function offerToWire(o: LinkOffer): W.OfferPayload {
  switch (o.kind) {
    case 'items': return { kind: 'item', items: o.stacks.map(offerItemToWire) }
    case 'coins': return { kind: 'coins', coins: cpToCoins(o.cp) }
    case 'levelUp': return { kind: 'levelUp', toLevel: o.toLevel }
    case 'heroPoint': return { kind: 'heroPoint', amount: o.amount, ...(o.reason ? { reason: o.reason } : {}) }
    case 'identify': return { kind: 'identify', playerId: o.playerId, entryId: o.entryId }
  }
}

export function requestToWire(to: string[], r: LinkRequest): W.GmRequest {
  if (r.kind === 'roll') {
    return {
      to, kind: 'roll', check: r.check,
      ...(r.dc !== undefined ? { dc: r.dc } : {}), ...(r.secret ? { secret: true } : {}),
      purpose: r.initiative ? 'initiative' : 'check', ...(r.label ? { label: r.label } : {}),
    }
  }
  return {
    to, kind: 'damage',
    ...(r.damage.length ? { damage: r.damage } : {}),
    ...(r.conditions.length ? { conditions: r.conditions.map(c => ({ id: c.slug, ...(c.value !== undefined ? { value: c.value } : {}) })) } : {}),
    ...(r.label ? { label: r.label } : {}),
  }
}
