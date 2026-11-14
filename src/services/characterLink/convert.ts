/**
 * Play Buddy's wire format (wire.ts) ⇄ what StarTome keeps (the mirror, the
 * mirrored items) and sends (gifts from the stash). Pure: no fetch, no
 * database.
 */
import type { InventoryEntry as Stack } from '@/domain/rules/inventory'
import type { Item, ItemCategory, RelicGift } from '@/domain/rules/types'
import type { LinkOutboxItem, MirrorAttachment, MirrorBlocks, MirrorItem, ShareLevel } from '@/domain/schema'
import type * as W from './wire'

/** Foundry's sluggify, which Play Buddy's catalog follows: "Healing Potion (Minor)" → "healing-potion-minor". */
export function slugify(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Our compendium id `fvtt:<system>:<pack>:<_id>` → the item's ref; nothing for homebrew and free text. */
export function itemRefOf(rulesId: string | null, name: string): W.ItemRef | undefined {
  const m = rulesId?.match(/^fvtt:(pf2e|sf2e):([^:]+):([^:]+)$/)
  if (!m?.[2] || !m[3]) return undefined
  return { slug: slugify(name), foundryId: m[3], pack: m[2], ...(m[1] === 'sf2e' ? { system: 'sf2e' as const } : {}) }
}

/** A ref → the compendium id it would have here; refs without a system are PF2e. */
export function rulesIdOfRef(ref: W.ItemRef | undefined): string | null {
  return ref?.foundryId && ref.pack ? `fvtt:${ref.system ?? 'pf2e'}:${ref.pack}:${ref.foundryId}` : null
}

// ── Play Buddy → StarTome ──────────────────────────────────────────────────

function attachmentFromWire(a: W.HeldAttachment): MirrorAttachment {
  return { entryId: a.entryId, rulesId: a.kind === 'gift' ? null : rulesIdOfRef(a.ref), kind: a.kind, name: a.facts.name, level: a.facts.level ?? 0, price: a.facts.price ?? 0, identified: a.identified !== false }
}

export function itemFromWire(i: W.HeldItem): MirrorItem {
  return {
    entryId: i.entryId, rulesId: rulesIdOfRef(i.ref), name: i.facts.name, quantity: i.quantity, level: i.facts.level ?? 0,
    price: i.facts.price ?? 0, priceFor: i.facts.priceFor || 1, bulkTenths: Math.round(i.facts.bulk ?? 0), identified: i.identified !== false,
    attachments: (i.attachments ?? []).map(attachmentFromWire), relic: i.relic ? { aspects: [...i.relic.aspects] } : null,
    containerEntryId: i.container ?? null, grade: i.grade ?? null, implanted: !!i.implanted,
  }
}

/** A sheet, or the changed blocks of one, as the mirror keeps it; the items and coins go to the inventory. */
export interface SheetParts { characterId: string; at: string; blocks: Partial<MirrorBlocks>; unshared: ShareLevel[]; items: MirrorItem[] | null; coinsCp: number | null }

export function sheetFromWire(characterId: string, at: string, b: W.SheetBlocks, unshared: ShareLevel[] = []): SheetParts {
  const blocks: Partial<MirrorBlocks> = {}
  if (b.basic) {
    blocks.basic = {
      name: b.basic.name, level: b.basic.level, ancestry: b.basic.ancestry ?? '', className: [b.basic.class, b.basic.class2].filter(Boolean).join(' / '),
      hp: { value: b.basic.hp.current, max: b.basic.hp.max, temp: b.basic.hp.temp ?? 0 },
      conditions: (b.basic.conditions ?? []).map(c => ({ slug: c.id, name: c.name, value: c.value ?? null })),
      heroPoints: b.basic.heroPoints ?? null,
    }
  }
  if (b.defenses) blocks.defenses = { ac: b.defenses.ac, fort: b.defenses.saves.fortitude, ref: b.defenses.saves.reflex, will: b.defenses.saves.will, perception: b.defenses.perception, speed: b.defenses.speeds?.land ?? 0 }
  if (b.skills) {
    blocks.skills = {
      strMod: b.skills.attributes?.str ?? 0, skills: { ...b.skills.skills }, classDc: b.skills.classDc ?? null, spellDc: b.skills.spellDc ?? null,
      rangedAttack: b.skills.attacks?.ranged ?? null, meleeAttack: b.skills.attacks?.melee ?? null,
    }
  }
  if (b.inventory) blocks.inventory = { coinsCp: b.inventory.coins ?? 0, bulkTenths: Math.round(b.inventory.bulk ?? 0), investedCount: b.inventory.invested ?? 0 }
  return { characterId, at, blocks, unshared, items: b.inventory ? b.inventory.items.map(itemFromWire) : null, coinsCp: b.inventory ? b.inventory.coins ?? 0 : null }
}

/** A Play Buddy share file (PLAYBUDDY_API.md §10), or null if the text is not one. */
export function readShareFile(text: string): W.ShareFile | null {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return null }
  const f = raw as Partial<W.ShareFile> | null
  if (f?.format !== 'playbuddy-share' || f.formatVersion !== 2 || typeof f.sheet !== 'object' || !f.sheet) return null
  return f as W.ShareFile
}

export function rollResult(r: W.Roll): NonNullable<LinkOutboxItem['roll']> {
  return { label: r.label, formula: r.formula ?? '', total: r.total, dc: r.dc ?? null, degree: r.degree ?? null, secret: !!r.secret }
}

/** A roll in words: "Athletics: 23 vs DC 20 — success (secret)". */
export function rollLine(r: Pick<W.Roll, 'label' | 'total' | 'dc' | 'degree' | 'secret'>): string {
  const degree = r.degree ? ` — ${r.degree.replace(/([A-Z])/g, ' $1').toLowerCase()}` : ''
  return `${r.label}: ${r.total}${r.dc ? ` vs DC ${r.dc}` : ''}${degree}${r.secret ? ' (secret)' : ''}`
}

// ── StarTome → Play Buddy ──────────────────────────────────────────────────

const PB_TYPE: Record<ItemCategory, string> = {
  weapon: 'weapon', armor: 'armor', shield: 'shield', equipment: 'gear', consumable: 'consumable',
  treasure: 'treasure', container: 'container', ammunition: 'ammo', kit: 'kit',
}

type Linked = Item | RelicGift | undefined
const nameOf = (entry: Stack, item: Linked) => entry.nameOverride ?? item?.name ?? 'Unnamed item'

function factsOf(entry: Stack, item: Linked): W.ItemFacts {
  const it = item?.kind === 'item' ? item : undefined
  return {
    name: nameOf(entry, item), type: item?.kind === 'relicGift' ? 'relic-gift' : it ? PB_TYPE[it.category] ?? 'gear' : 'gear', level: item?.level ?? 0,
    price: entry.priceOverride ?? entry.giftValue ?? it?.price?.cp ?? 0, priceFor: it?.priceFor ?? 1, bulk: entry.bulkOverride ?? it?.bulk ?? 0,
    rarity: item?.rarity ?? 'common', traits: item?.traits ?? [],
  }
}

/** A stack of the stash (with its compendium item and what is attached to it) as a gift. */
export function givenItem(entry: Stack, item: Item | undefined, attached: { entry: Stack; item: Linked }[] = []): W.GivenItem {
  const ref = itemRefOf(item?.id ?? null, item?.name ?? '')
  const out: W.GivenItem = { ...(ref ? { ref } : {}), facts: factsOf(entry, item), quantity: entry.quantity }
  if (attached.length) {
    out.attachments = attached.map((a) => {
      const aRef = a.item?.kind === 'item' ? itemRefOf(a.item.id, a.item.name) : undefined
      return {
        kind: a.entry.attachKind ?? 'accessory', ...(aRef ? { ref: aRef } : {}), facts: factsOf(a.entry, a.item),
        // On an unidentified item everything attached is unidentified too: it is revealed with the item
        ...(a.entry.identified && entry.identified ? {} : { identified: false }), ...(a.item?.kind === 'relicGift' ? { tier: a.item.tier } : {}),
      }
    })
  }
  if (entry.relic) out.relic = { aspects: [...entry.relic.aspects] }
  if (entry.grade) out.grade = entry.grade
  if (!entry.identified) {
    out.identified = false
    out.unidentifiedName = entry.playerName ?? item?.unidentified?.name ?? 'Unidentified item'
    const text = entry.playerDescription ?? item?.unidentified?.description
    if (text) out.unidentifiedDescription = text
  }
  return out
}

/** What the player reads in the list: the unidentified name while it is one. */
export function givenLabel(g: W.GivenItem): string {
  return `${g.quantity > 1 ? `${g.quantity}× ` : ''}${g.identified === false ? g.unidentifiedName ?? 'Unidentified item' : g.facts.name}`
}
