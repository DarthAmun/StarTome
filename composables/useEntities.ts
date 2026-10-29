// Manages DbEntity (entities table) — campaign-scoped notes and lore.
// See the DATA MODEL NOTE in composables/useDb.ts for the full two-system explanation.
import { toPlain } from '~/utils/json'
import { ref, computed, reactive } from 'vue'
import { extractLinks } from '~/composables/useEntityParser'
import { dbApi, getDb, parseJsonObject } from '~/composables/useDb'
import type { DbEntitySnapshot } from '~/composables/useDb'
import type { EntityType, EntityAttributes } from '~/types/entities'
import { emitDomainEvent } from '~/composables/useDomainEvents'
import { reportError } from '~/composables/useNotices'

export interface Entity {
  id: number
  campaignId: number
  type: EntityType
  name: string
  content: string
  attributes: EntityAttributes
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}

export interface EntityLink {
  id: number
  sourceId: number
  targetType: string
  targetName: string
  metadata: Record<string, string>
}

export interface EntitySnapshot {
  id: number
  entityId: number
  label: string
  note: string
  content: string
  attributes: Record<string, any>
  name: string
  createdAt: string
  eventId: number | null
  eventName: string | null
}

// ── Module-level singleton state ──────────────────────────────────────────────

const entities = ref<Entity[]>([])
const currentEntity = ref<Entity | null>(null)
const links = ref<EntityLink[]>([])
const isLoading = ref(false)
const snapshots = ref<EntitySnapshot[]>([])
const snapshotsEntityId = ref<number | null>(null)

// ── Module-level computed ─────────────────────────────────────────────────────

const byType = computed(() => {
  const map: Record<string, Entity[]> = {}
  for (const e of entities.value) {
    if (!map[e.type]) map[e.type] = []
    map[e.type].push(e)
  }
  return map
})

// ── Module-level functions ────────────────────────────────────────────────────

// The campaign whose entities are in memory, and the load in flight (BUG-09):
// a second caller for the same campaign waits for the same load instead of
// carrying on with what was there before.
const loadedCampaign = ref<number | null>(null)
let inflight: { campaignId: number; token: object; promise: Promise<void> } | null = null

/** Data changed outside this store (import, legacy import, wipe): the next loadAll reads again. */
export function invalidateEntities() {
  loadedCampaign.value = null
}

/** Loads a campaign's entities and links. Already loaded → no-op unless `force`. */
async function loadAll(campaignId: number, { force = false }: { force?: boolean } = {}) {
  if (inflight?.campaignId === campaignId) return inflight.promise
  if (!force && loadedCampaign.value === campaignId) return
  const token = {}
  const promise = (async () => {
    isLoading.value = true
    if (loadedCampaign.value !== campaignId) currentEntity.value = null
    try {
      const [ents, lnks] = await Promise.all([
        dbApi.entities.list(campaignId),
        dbApi.entities.listLinks(campaignId),
      ])
      // A newer load for another campaign started meanwhile: it wins
      if (inflight?.token !== token) return
      entities.value = ents.map(normalizeEntity)
      links.value = lnks.map(normalizeLink)
      loadedCampaign.value = campaignId
    } catch (err) {
      reportError('Loading the campaign', err)
    } finally {
      if (inflight?.token === token) { inflight = null; isLoading.value = false }
    }
  })()
  inflight = { campaignId, token, promise }
  return promise
}

async function loadEntity(id: number) {
  try {
    const raw = await dbApi.entities.get(id)
    if (!raw) return null
    currentEntity.value = normalizeEntity(raw)
    return currentEntity.value
  } catch (err) {
    reportError('Loading the entry', err)
    return null
  }
}

async function createEntity(campaignId: number, type: EntityType, name: string, initialAttributes?: EntityAttributes) {
  try {
    const raw = await dbApi.entities.create({
      campaignId, type, name, content: '',
      attributes: toPlain(initialAttributes ?? {}),
    })
    const entity = normalizeEntity(raw)
    entities.value.unshift(entity)
    return entity
  } catch (err) {
    reportError('Creating the entry', err)
    throw err
  }
}

async function updateEntity(id: number, updates: { name?: string; content?: string; attributes?: EntityAttributes }) {
  try {
    const entity = entities.value.find(e => e.id === id)
    const before = entity ?? (currentEntity.value?.id === id ? currentEntity.value : null)
    const wasCompleted = (before?.attributes as { status?: string } | undefined)?.status === 'completed'
    if (entity) Object.assign(entity, updates)
    if (currentEntity.value?.id === id) Object.assign(currentEntity.value, updates)

    const payload: any = { id }
    if (updates.name !== undefined) payload.name = updates.name
    if (updates.content !== undefined) payload.content = updates.content
    if (updates.attributes !== undefined) payload.attributes = toPlain(updates.attributes)

    await dbApi.entities.update(payload)

    if (updates.content !== undefined) await syncLinks(id, updates.content)

    const after = updates.attributes as { status?: string; milestone?: boolean } | undefined
    if (before?.type === 'quest' && !wasCompleted && after?.status === 'completed') {
      await emitDomainEvent('questCompleted', { campaignId: before.campaignId, questId: id, name: updates.name ?? before.name, milestone: !!after.milestone })
    }
  } catch (err) {
    reportError('Saving the entry', err)
    throw err
  }
}

async function setFavorite(id: number, isFavorite: boolean) {
  const entity = entities.value.find(e => e.id === id)
  if (entity) entity.isFavorite = isFavorite
  if (currentEntity.value?.id === id) currentEntity.value.isFavorite = isFavorite
  await dbApi.entities.setFavorite(id, isFavorite)
}

async function deleteEntity(id: number) {
  try {
    // Links, snapshots, edges and references to it go in the same transaction
    await dbApi.entities.delete(id)
    entities.value = entities.value.filter(e => e.id !== id)
    // The delete also took its pins off other entries; mirror that here
    for (const e of entities.value) {
      const pins = (e.attributes as { mapPins?: { entityId: number }[] }).mapPins
      if (pins?.some(p => p.entityId === id)) (e.attributes as { mapPins?: unknown[] }).mapPins = pins.filter(p => p.entityId !== id)
    }
    links.value = links.value.filter(l => l.sourceId !== id)
    if (currentEntity.value?.id === id) currentEntity.value = null
  } catch (err) {
    reportError('Deleting the entry', err)
    throw err
  }
}

async function syncLinks(entityId: number, content: string) {
  const parsed = extractLinks(content)
  await dbApi.entities.deleteLinks(entityId)
  const newLinks: EntityLink[] = []
  for (const link of parsed) {
    const raw = await dbApi.entities.createLink({
      sourceId: entityId,
      targetType: link.type,
      targetName: link.name,
      metadata: toPlain(link.metadata ?? {}),
    })
    newLinks.push(normalizeLink(raw))
  }
  links.value = [...links.value.filter(l => l.sourceId !== entityId), ...newLinks]
}

function findByTypeAndName(type: string, name: string): Entity | null {
  return entities.value.find(
    e => e.type === type && e.name.toLowerCase() === name.toLowerCase()
  ) ?? null
}

function linksFrom(id: number) {
  return links.value.filter(l => l.sourceId === id)
}

function backlinksTo(type: string, name: string) {
  return links.value.filter(
    l => l.targetType === type && l.targetName.toLowerCase() === name.toLowerCase()
  )
}

// ── Snapshots ────────────────────────────────────────────────────────────────

async function loadSnapshots(entityId: number) {
  try {
    const raw = await dbApi.snapshots.list(entityId)
    snapshots.value = raw.map(normalizeSnapshot)
    snapshotsEntityId.value = entityId
  } catch (err) {
    reportError('Loading the snapshots', err)
  }
}

async function createSnapshot(
  entityId: number,
  label: string,
  note: string,
  eventId: number | null = null,
  eventName: string | null = null
): Promise<EntitySnapshot> {
  try {
    const entity = entities.value.find(e => e.id === entityId)
    if (!entity) throw new Error('Entity not found')
    const raw = await dbApi.snapshots.create({
      entity_id: entityId,
      label,
      note,
      content: entity.content,
      attributes: toPlain(entity.attributes),
      name: entity.name,
      created_at: new Date().toISOString(),
      event_id: eventId,
      event_name: eventName,
    })
    const snap = normalizeSnapshot(raw)
    if (snapshotsEntityId.value === entityId) {
      snapshots.value.push(snap)
    }
    return snap
  } catch (err) {
    reportError('Saving the snapshot', err)
    throw err
  }
}

async function updateSnapshot(
  id: number,
  changes: { label?: string; note?: string; eventId?: number | null; eventName?: string | null }
): Promise<void> {
  try {
    await dbApi.snapshots.update(id, {
      label: changes.label,
      note: changes.note,
      event_id: changes.eventId,
      event_name: changes.eventName,
    })
    const idx = snapshots.value.findIndex(s => s.id === id)
    if (idx !== -1) Object.assign(snapshots.value[idx], {
      label: changes.label ?? snapshots.value[idx].label,
      note: changes.note ?? snapshots.value[idx].note,
      eventId: changes.eventId !== undefined ? changes.eventId : snapshots.value[idx].eventId,
      eventName: changes.eventName !== undefined ? changes.eventName : snapshots.value[idx].eventName,
    })
  } catch (err) {
    reportError('Saving the snapshot', err)
    throw err
  }
}

async function deleteSnapshot(id: number): Promise<void> {
  try {
    await dbApi.snapshots.delete(id)
    snapshots.value = snapshots.value.filter(s => s.id !== id)
  } catch (err) {
    reportError('Deleting the snapshot', err)
    throw err
  }
}

async function updateSnapshotContent(
  id: number,
  changes: { content?: string; attributes?: Record<string, any>; name?: string }
): Promise<void> {
  try {
    const dbChanges: any = {}
    if (changes.content !== undefined) dbChanges.content = changes.content
    if (changes.name !== undefined) dbChanges.name = changes.name
    if (changes.attributes !== undefined)
      dbChanges.attributes = toPlain(changes.attributes)

    await getDb().entitySnapshots.update(id, dbChanges)

    const idx = snapshots.value.findIndex(s => s.id === id)
    if (idx !== -1) {
      if (changes.content !== undefined)
        snapshots.value[idx].content = changes.content
      if (changes.name !== undefined)
        snapshots.value[idx].name = changes.name
      if (changes.attributes !== undefined)
        snapshots.value[idx].attributes = changes.attributes
    }
  } catch (err) {
    reportError('Saving the snapshot', err)
    throw err
  }
}

// Returns all locations that have a pin for the given entity id
function pinnedLocationsFor(entityId: number) {
  return entities.value.filter(e => {
    const attrs = e.attributes as any
    return Array.isArray(attrs.mapPins) && attrs.mapPins.some((p: any) => p.entityId === entityId)
  }).map(e => {
    const attrs = e.attributes as any
    const pin = attrs.mapPins.find((p: any) => p.entityId === entityId)
    return { location: e, x: pin.x, y: pin.y }
  })
}

// ── Internal normalizers (not exported) ──────────────────────────────────────

function normalizeSnapshot(raw: DbEntitySnapshot): EntitySnapshot {
  return {
    id: raw.id!,
    entityId: raw.entity_id,
    label: raw.label,
    note: raw.note,
    content: raw.content,
    attributes: parseJsonObject(raw.attributes),
    name: raw.name,
    createdAt: raw.created_at,
    eventId: raw.event_id,
    eventName: raw.event_name,
  }
}

export function normalizeEntity(raw: any): Entity {
  return {
    id: raw.id,
    campaignId: raw.campaign_id,
    type: raw.type,
    name: raw.name,
    content: raw.content ?? '',
    // A corrupt row must not break the whole list (FORK_PLAN §14 REUSE-01)
    attributes: parseJsonObject(raw.attributes) as EntityAttributes,
    isFavorite: Boolean(raw.is_favorite),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function normalizeLink(raw: any): EntityLink {
  return {
    id: raw.id,
    sourceId: raw.source_id,
    targetType: raw.target_type,
    targetName: raw.target_name,
    metadata: parseJsonObject(raw.metadata),
  }
}

// ── Exported composable ───────────────────────────────────────────────────────

export function useEntities() {
  return reactive({
    entities, currentEntity, links, isLoading, loadedCampaign, byType, snapshots, snapshotsEntityId,
    loadAll, loadEntity, createEntity, updateEntity, deleteEntity, setFavorite,
    syncLinks, loadSnapshots, createSnapshot, updateSnapshot,
    updateSnapshotContent, deleteSnapshot,
    findByTypeAndName, linksFrom, backlinksTo, pinnedLocationsFor,
  })
}
