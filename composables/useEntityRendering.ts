/**
 * Shared entity rendering context: icon helpers, encounter/compendium lookups,
 * and the entityLookup + extraTypes needed by renderMarkdown /
 * renderInline.  Extracted from MarkdownEditor so other components (e.g.
 * random-table widgets/editors) can reuse the exact same logic.
 */
import * as GiIcons from 'oh-vue-icons/icons/gi'
import { useEntities } from '~/composables/useEntities'
import { getDb } from '~/composables/useDb'
import { ENTITY_TYPE_CONFIG } from '~/types/entities'
import type { EntityType } from '~/types/entities'
import type { MaybeRefOrGetter } from 'vue'
import { useRulesIndex } from '~/composables/useRules'
import { campaignGame, type GameId } from '~/types/game'
import { isRulesKind, RULES_KIND_CONFIG, RULES_KINDS } from '~/types/rules'

// ── Constants ─────────────────────────────────────────────────────────────────

export const ENCOUNTER_COLOR = '#e8a87a'

export const typeColorMap: Record<string, string> = {
  ...Object.fromEntries(Object.entries(ENTITY_TYPE_CONFIG).map(([t, c]) => [t, c.color])),
  encounter: ENCOUNTER_COLOR,
  graph: '#7cc44e',
  ...Object.fromEntries(RULES_KINDS.map(k => [k, RULES_KIND_CONFIG[k].color])),
}

// ── Icon helpers ──────────────────────────────────────────────────────────────

function giNameToExport(name: string): string {
  const body = name.replace(/^gi-/, '')
  return 'Gi' + body.charAt(0).toUpperCase() + body.slice(1).replace(/-([a-z])/g, (_, l) => l.toUpperCase())
}

export function iconToSvg(icon: any, color: string): string {
  const vb = `${icon.minX ?? 0} ${icon.minY ?? 0} ${icon.width} ${icon.height}`
  return `<svg viewBox="${vb}" fill="${color}" style="display:inline-block;width:13px;height:13px;vertical-align:middle;margin-right:3px;margin-top:-2px;flex-shrink:0">${icon.raw}</svg>`
}

export function typeIconHtml(type: string, color: string): string {
  const iconName = ENTITY_TYPE_CONFIG[type as EntityType]?.defaultIcon
    ?? (type === 'encounter' ? 'gi-broadsword' : '')
  const icon = (GiIcons as any)[giNameToExport(iconName)]
  return icon ? iconToSvg(icon, color) : ''
}

export function giIconByName(name: string): any | null {
  return (GiIcons as any)[giNameToExport(name)] ?? null
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useEntityRendering(campaignId: MaybeRefOrGetter<number>) {
  const store = useEntities()

  const campaignEncounters = ref<{ id: number; name: string; mapSource?: string }[]>([])
  const campaignGameId = ref<GameId>('pf2e')
  const rulesIndex = useRulesIndex()

  watch(
    () => toValue(campaignId),
    async (id) => {
      if (!id) return
      campaignEncounters.value = await getDb()
        .encounters.where('campaign_id').equals(id).toArray()
        .then(rows => rows.map(r => ({ id: r.id!, name: r.name, mapSource: r.map_source ?? undefined })))
      const campaign = await getDb().campaigns.get(id)
      campaignGameId.value = campaignGame(campaign)
    },
    { immediate: true },
  )

  // Compendium kinds are linkable next to the lore types
  const extraTypes = computed(() => [...RULES_KINDS])

  function entityLookup(type: string, name: string) {
    const typeKey = type.toLowerCase()
    if (typeKey === 'encounter') {
      const enc = campaignEncounters.value.find(e => e.name.toLowerCase() === name.toLowerCase())
      return {
        imageUrl: enc?.mapSource,
        iconHtml: enc?.mapSource ? undefined : typeIconHtml('encounter', ENCOUNTER_COLOR),
        color: ENCOUNTER_COLOR,
      }
    }
    if (typeKey === 'graph') return { color: '#7cc44e' }
    const ent = store.findByTypeAndName(typeKey, name)
    if (ent) {
      const attrs = ent.attributes as any
      const imageUrl = attrs.portraitSource || attrs.logoSource || attrs.imageSource || undefined
      const color = typeColorMap[ent.type] ?? '#888'
      return { imageUrl, iconHtml: imageUrl ? undefined : typeIconHtml(ent.type, color), color }
    }
    if (isRulesKind(typeKey) && rulesIndex.has(typeKey, name)) {
      const cfg = RULES_KIND_CONFIG[typeKey]
      const icon = giIconByName(cfg.icon)
      return { iconHtml: icon ? iconToSvg(icon, cfg.color) : undefined, color: cfg.color }
    }
    return null
  }

  return {
    entityLookup,
    extraTypes,
    campaignEncounters,
    campaignGameId,
  }
}
