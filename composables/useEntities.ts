// Manages DbEntity (entities table) — campaign-scoped notes and lore.
// See the DATA MODEL NOTE in composables/useDb.ts for the full two-system explanation.
import { ref, computed, reactive } from 'vue'
import { extractLinks } from '~/composables/useEntityParser'
import { dbApi, getDb, parseRecordData } from '~/composables/useDb'
import type { DbEntitySnapshot } from '~/composables/useDb'
import type { EntityType, EntityAttributes } from '~/types/entities'
import { campaignRules } from '~/types/game'
import { useParty } from '~/composables/useParty'

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

async function loadAll(campaignId: number) {
  if (isLoading.value) return
  isLoading.value = true
  currentEntity.value = null
  try {
    const [ents, lnks] = await Promise.all([
      dbApi.entities.list(campaignId),
      dbApi.entities.listLinks(campaignId),
    ])
    entities.value = ents.map(normalize)
    links.value = lnks.map(normalizeLink)
  } catch (err) {
    console.error('[NotesStore] loadAll:', err)
  } finally {
    isLoading.value = false
  }
}

async function loadEntity(id: number) {
  try {
    const raw = await dbApi.entities.get(id)
    if (!raw) return null
    currentEntity.value = normalize(raw)
    return currentEntity.value
  } catch (err) {
    console.error('[NotesStore] loadEntity:', err)
    return null
  }
}

async function createEntity(campaignId: number, type: EntityType, name: string, initialAttributes?: EntityAttributes) {
  try {
    const raw = await dbApi.entities.create({
      campaignId, type, name, content: '',
      attributes: initialAttributes ? JSON.stringify(initialAttributes) : '{}',
    })
    const entity = normalize(raw)
    entities.value.unshift(entity)
    return entity
  } catch (err) {
    console.error('[NotesStore] createEntity:', err)
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
    if (updates.attributes !== undefined) payload.attributes = JSON.stringify(updates.attributes)

    await dbApi.entities.update(payload)

    if (updates.content !== undefined) await syncLinks(id, updates.content)

    const after = updates.attributes as { status?: string; milestone?: boolean } | undefined
    if (before?.type === 'quest' && !wasCompleted && after?.status === 'completed') {
      if (after.milestone) await promptMilestone(before.campaignId, id, updates.name ?? before.name)
      await promptQuestXp(before.campaignId, id, updates.name ?? before.name)
    }
  } catch (err) {
    console.error('[NotesStore] updateEntity:', err)
    throw err
  }
}

/** A milestone quest was completed: in a milestone campaign, ask to level up the party. */
async function promptMilestone(campaignId: number, questId: number, questName: string) {
  const campaign = await dbApi.campaigns.get(campaignId)
  if (campaignRules(campaign).advancement !== 'milestone') return
  useParty().requestLevelUp({ campaignId, trigger: 'quest', refId: questId, reason: `Milestone reached: ${questName}` })
}

/** A quest was completed in an XP campaign: offer accomplishment XP (FEATURES_PLAN.md §5). */
async function promptQuestXp(campaignId: number, questId: number, questName: string) {
  const campaign = await dbApi.campaigns.get(campaignId)
  if (campaignRules(campaign).advancement !== 'xp') return
  useParty().requestXpAward({ campaignId, refType: 'quest', refId: questId, reason: `Quest: ${questName}` })
}

async function setFavorite(id: number, isFavorite: boolean) {
  const entity = entities.value.find(e => e.id === id)
  if (entity) entity.isFavorite = isFavorite
  if (currentEntity.value?.id === id) currentEntity.value.isFavorite = isFavorite
  await dbApi.entities.setFavorite(id, isFavorite)
}

async function deleteEntity(id: number) {
  try {
    await dbApi.snapshots.deleteByEntity(id)
    await dbApi.connections.deleteByEntity(id)
    await dbApi.entities.delete(id)
    entities.value = entities.value.filter(e => e.id !== id)
    links.value = links.value.filter(l => l.sourceId !== id)
    if (currentEntity.value?.id === id) currentEntity.value = null
  } catch (err) {
    console.error('[NotesStore] deleteEntity:', err)
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
      metadata: JSON.stringify(link.metadata),
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

function getGraphData(campaignId: number) {
  const campaignEntities = entities.value.filter(e => e.campaignId === campaignId)
  const byId = new Map(campaignEntities.map(e => [e.id, e]))
  const byTypeName = new Map(campaignEntities.map(e => [`${e.type}:${e.name.toLowerCase()}`, e]))

  const nodes = campaignEntities.map(e => ({
    data: { id: `${e.type}-${e.id}`, label: e.name, type: e.type, entityId: e.id }
  }))

  const edgeSeen = new Set<string>()
  const edges: any[] = []
  for (const l of links.value) {
    const source = byId.get(l.sourceId)
    if (!source) continue
    const target = byTypeName.get(`${l.targetType}:${l.targetName.toLowerCase()}`)
    if (!target) continue
    const edgeKey = `${source.type}-${source.id}→${target.type}-${target.id}`
    if (edgeSeen.has(edgeKey)) continue
    edgeSeen.add(edgeKey)
    edges.push({ data: { id: `edge-${l.id}`, source: `${source.type}-${source.id}`, target: `${target.type}-${target.id}`, label: '' } })
  }

  return { nodes, edges }
}

// ── Snapshots ────────────────────────────────────────────────────────────────

async function loadSnapshots(entityId: number) {
  try {
    const raw = await dbApi.snapshots.list(entityId)
    snapshots.value = raw.map(normalizeSnapshot)
    snapshotsEntityId.value = entityId
  } catch (err) {
    console.error('[NotesStore] loadSnapshots:', err)
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
      attributes: JSON.stringify(entity.attributes),
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
    console.error('[NotesStore] createSnapshot:', err)
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
    console.error('[NotesStore] updateSnapshot:', err)
    throw err
  }
}

async function deleteSnapshot(id: number): Promise<void> {
  try {
    await dbApi.snapshots.delete(id)
    snapshots.value = snapshots.value.filter(s => s.id !== id)
  } catch (err) {
    console.error('[NotesStore] deleteSnapshot:', err)
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
      dbChanges.attributes = JSON.stringify(changes.attributes)

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
    console.error('[NotesStore] updateSnapshotContent:', err)
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
    attributes: typeof raw.attributes === 'string'
      ? JSON.parse(raw.attributes || '{}')
      : raw.attributes,
    name: raw.name,
    createdAt: raw.created_at,
    eventId: raw.event_id,
    eventName: raw.event_name,
  }
}

function normalize(raw: any): Entity {
  return {
    id: raw.id,
    campaignId: raw.campaign_id,
    type: raw.type,
    name: raw.name,
    content: raw.content ?? '',
    attributes: typeof raw.attributes === 'string' ? JSON.parse(raw.attributes || '{}') : (raw.attributes ?? {}),
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
    metadata: parseRecordData(raw.metadata),
  }
}

// ── Exported composable ───────────────────────────────────────────────────────

export function useEntities() {
  return reactive({
    entities, currentEntity, links, isLoading, byType, snapshots, snapshotsEntityId,
    loadAll, loadEntity, createEntity, updateEntity, deleteEntity, setFavorite,
    syncLinks, loadSnapshots, createSnapshot, updateSnapshot,
    updateSnapshotContent, deleteSnapshot,
    findByTypeAndName, linksFrom, backlinksTo, getGraphData, pinnedLocationsFor,
  })
}
