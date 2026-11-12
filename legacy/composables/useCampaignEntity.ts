import { useEntities } from '~/composables/useEntities'
import type { Entity } from '~/composables/useEntities'
import type { EntityType } from '~/types/entities'
import { ENTITY_TYPE_CONFIG, ENTITY_TYPE_ROUTE } from '~/types/entities'
import { useFormatters } from '~/composables/useFormatters'

function typeRoute(t: string) {
  return ENTITY_TYPE_ROUTE[t as EntityType] ?? t + 's'
}

export function useCampaignEntity(type: EntityType) {
  const route = useRoute()
  const router = useRouter()
  const store = useEntities()
  const { formatDateShort } = useFormatters()

  const campaignId = computed(() => {
    const n = Number(route.params.id)
    return Number.isFinite(n) ? n : 0
  })
  const typeConfig = computed(() => ENTITY_TYPE_CONFIG[type])

  // ── List ────────────────────────────────────────────────────
  const entries = computed(() =>
    (store.byType[type] ?? []).slice().sort((a, b) =>
      type === 'session' ? b.id - a.id : b.updatedAt.localeCompare(a.updatedAt)
    )
  )

  const leftEntries = computed(() => {
    const a = entries.value
    return a.slice(0, Math.ceil(a.length / 2))
  })

  const rightEntries = computed(() => {
    const a = entries.value
    return a.slice(Math.ceil(a.length / 2))
  })

  // ── Entry ───────────────────────────────────────────────────
  const entryId = computed(() =>
    route.params.entryId ? Number(route.params.entryId) : null
  )

  const currentEntry = computed(() =>
    entryId.value
      ? store.entities.find(e => e.id === entryId.value) ?? null
      : null
  )

  // ── Navigation ──────────────────────────────────────────────
  function openEntry(entry: Entity) {
    router.push(`/campaign/${campaignId.value}/${typeRoute(type)}/${entry.id}`)
  }

  function goToList() {
    router.push(`/campaign/${campaignId.value}/${typeRoute(type)}`)
  }

  // ── CRUD ────────────────────────────────────────────────────
  async function createEntry() {
    const entity = await store.createEntity(
      campaignId.value, type,
      `New ${typeConfig.value?.label ?? type}`
    )
    openEntry(entity)
  }

  async function deleteEntry(id: number) {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    await store.deleteEntity(id)
    if (entryId.value === id) goToList()
  }

  // ── Load ────────────────────────────────────────────────────
  async function ensureLoaded() {
    if (!store.entities.length) {
      await store.loadAll(campaignId.value)
    }
  }

  return {
    campaignId, typeConfig,
    entries, leftEntries, rightEntries,
    entryId, currentEntry,
    openEntry, goToList, createEntry, deleteEntry,
    ensureLoaded, formatDateShort,
    store,
  }
}
