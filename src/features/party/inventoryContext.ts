/**
 * What every part of the inventory screen reads: the campaign's stacks and
 * purses (live), the compendium items they link to, and the helpers that turn
 * a stack into what is shown. Made once by the panel, injected by its rows.
 */
import { computed, shallowRef, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { GameId } from '@/domain/game'
import { attachedLabel, fundamentalOf, giftValues, type AttachKind } from '@/domain/rules/attachments'
import { formatMoney } from '@/domain/rules/format'
import { containerOf, dormantGift, effective, toPlayerView, type EffectiveEntry, type InventoryEntry as Stack, type OwnerKey, type PlayerEntry } from '@/domain/rules/inventory'
import type { Item, RelicGift } from '@/domain/rules/types'
import { stripGmOnly } from '@/domain/gmContent'
import { inventory, toStack } from '@/data/inventory'
import { rulesGetMany } from '@/data/rules'
import { rulesRevision } from '@/ui/rulesLive'
import { useLive } from '@/ui/useLive'

export interface OwnerInfo { key: OwnerKey; name: string; characterId: string | null; strMod: number | null }

export interface InventoryContext {
  campaignId: string
  game: Ref<GameId>
  view: Ref<'gm' | 'player'>
  stacks: ComputedRef<Stack[]>
  purses: ComputedRef<Record<OwnerKey, number>>
  items: Ref<Map<string, Item>>
  gifts: Ref<Map<string, RelicGift>>
  owners: Ref<OwnerInfo[]>
  money(cp: number | null): string
  item(e: Stack): Item | undefined
  gift(e: Stack): RelicGift | undefined
  /** The linked item, or a relic gift seen as one (name, text, traits; its value comes from `giftValue`). */
  linked(e: Stack): Item | undefined
  eff(e: Stack): EffectiveEntry
  playerOf(e: Stack): PlayerEntry
  nameOf(e: Stack): string
  /** Fundamental runes first, then the rest by name, gifts last. */
  attachedOf(host: Stack): Stack[]
  /** Players see nothing attached to an item they haven't identified, and no dormant gift. */
  shownAttached(host: Stack): Stack[]
  attachedInfo(host: Stack): { name: string; kind: AttachKind }[]
  runeLabel(e: Stack): string
  inContainer(e: Stack): Stack | null
}

export const INVENTORY: InjectionKey<InventoryContext> = Symbol('inventory')

export function createInventoryContext(campaignId: string, game: Ref<GameId>, view: Ref<'gm' | 'player'>, owners: Ref<OwnerInfo[]>): InventoryContext {
  const rows = useLive(() => inventory.ofCampaign(campaignId), [])
  const purseRows = useLive(() => inventory.purses(campaignId), [])
  const items = shallowRef(new Map<string, Item>())
  const gifts = shallowRef(new Map<string, RelicGift>())

  watch([rows, rulesRevision], async () => {
    const ids = [...new Set(rows.value.map(r => r.itemId).filter((id): id is string => !!id))]
    const found = await rulesGetMany(ids)
    items.value = new Map(found.filter((e): e is Item => e.kind === 'item').map(e => [e.id, e]))
    gifts.value = new Map(found.filter((e): e is RelicGift => e.kind === 'relicGift').map(e => [e.id, e]))
  }, { immediate: true })

  const stacks = computed(() => {
    const list = rows.value.map(toStack)
    const values = giftValues(list)
    return list.map(s => (values.has(s.id) ? { ...s, giftValue: values.get(s.id) } : s))
  })
  const purses = computed(() => Object.fromEntries(purseRows.value.map(p => [p.ownerKey, p.cp])))

  const item = (e: Stack) => (e.itemId ? items.value.get(e.itemId) : undefined)
  const gift = (e: Stack) => (e.itemId ? gifts.value.get(e.itemId) : undefined)
  const linked = (e: Stack): Item | undefined => {
    const g = !item(e) ? gift(e) : undefined
    // Gifts have no item level, price or Bulk of their own
    return g ? ({ ...g, kind: 'item', category: 'equipment', price: null, bulk: 0, level: null } as unknown as Item) : item(e)
  }
  const eff = (e: Stack) => effective(e, linked(e))
  const nameOf = (e: Stack) => eff(e).name
  const attachedOf = (host: Stack) => {
    const rank = (e: Stack) => (fundamentalOf(nameOf(e)) ? 0 : e.attachKind === 'gift' ? 2 : 1)
    return stacks.value.filter(a => a.attachedTo === host.id).sort((a, b) => rank(a) - rank(b) || nameOf(a).localeCompare(nameOf(b)))
  }
  const attachedInfo = (host: Stack) => attachedOf(host).map(a => ({ name: nameOf(a), kind: a.attachKind ?? 'accessory' as AttachKind }))

  return {
    campaignId, game, view, stacks, purses, items, gifts, owners, item, gift, linked, eff, nameOf, attachedOf, attachedInfo,
    money: cp => formatMoney(cp === null ? null : { cp }, game.value),
    playerOf: e => toPlayerView(e, linked(e), stripGmOnly),
    shownAttached(host) {
      const all = attachedOf(host)
      return view.value === 'gm' ? all : host.identified ? all.filter(a => !dormantGift(a)) : []
    },
    runeLabel(e) {
      if (e.grade) return e.grade
      if (attachedOf(e).length) return attachedLabel(attachedInfo(e))
      // Runes from before attachments, not matched to compendium runes
      const r = e.runes
      if (!r) return ''
      const fund = r.striking ? ['striking', 'greater striking', 'major striking'][r.striking - 1] : r.resilient ? ['resilient', 'greater resilient', 'major resilient'][r.resilient - 1] : ''
      return [r.potency ? `+${r.potency}` : '', fund ?? ''].filter(Boolean).join(' ')
    },
    inContainer: e => containerOf(e, stacks.value, items.value),
  }
}
