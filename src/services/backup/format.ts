/**
 * Backup format version 3 (docs/formats/BACKUP_V3.md): what goes into a
 * backup and what stays out. Pure; zip.ts reads and writes the container.
 */
import { collectImageIds } from '@/domain/images'
import { COLLECTION_NAMES, SCHEMA_VERSION, emptySnapshot, type CollectionName, type Snapshot } from '@/domain/schema'

export const BACKUP_FORMAT = 'startome-backup'
export const BACKUP_VERSION = 3

export interface Manifest {
  format: typeof BACKUP_FORMAT
  version: number
  schemaVersion: number
  app: 'startome'
  appVersion: string
  exportedAt: string
  scope: 'all' | 'campaigns'
  campaignIds: string[] | null
  collections: Record<string, number>
}

/** Never part of a backup: pending offers and bookkeeping of this device. */
const NEVER: CollectionName[] = ['linkOutbox', 'meta']
/** Only in a full backup. */
const ALL_ONLY: CollectionName[] = ['rules', 'rulesOverlays', 'syncState', 'soundTracks', 'soundPlaylists', 'settings']

/** The fields of a synced compendium entry that are the user's own (the rest comes back with a sync). */
export const USER_OWNED_RULES_FIELDS = ['img', 'tokenImg', 'gmNotes', 'tags', 'isFavorite', 'style', 'localEdits', 'unidentified'] as const

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null || v === '' || v === false) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return true
}

/** A full backup: own compendium entries in full, synced ones as overlays of what the user added to them. */
export function forFullBackup(db: Snapshot): Snapshot {
  const out = { ...db }
  for (const name of NEVER) (out as Record<string, unknown[]>)[name] = []
  const overlays = new Map(db.rulesOverlays.map(o => [o.id, o]))
  out.rules = db.rules.filter((row) => {
    if (row.origin !== 'foundry') return true
    const overlay: Record<string, unknown> = { id: row.id }
    for (const key of USER_OWNED_RULES_FIELDS) if (hasValue(row[key])) overlay[key] = row[key]
    if (Object.keys(overlay).length > 1) overlays.set(row.id, overlay as { id: string })
    return false
  })
  out.rulesOverlays = [...overlays.values()]
  return out
}

/** Some campaigns with everything that hangs on them, plus the library tokens and map assets they use. */
export function forCampaigns(db: Snapshot, campaignIds: string[]): Snapshot {
  const out = emptySnapshot()
  const camp = new Set(campaignIds)
  const inCampaign = <T extends { campaignId: string }>(rows: T[]) => rows.filter(r => camp.has(r.campaignId))
  out.campaigns = db.campaigns.filter(c => camp.has(c.id))
  out.entries = inCampaign(db.entries)
  out.mapPins = inCampaign(db.mapPins)
  out.graphs = inCampaign(db.graphs)
  out.graphEdges = inCampaign(db.graphEdges)
  out.sessionPanels = inCampaign(db.sessionPanels)
  out.encounters = inCampaign(db.encounters)
  out.characters = inCampaign(db.characters)
  out.partyLedger = inCampaign(db.partyLedger)
  out.inventory = inCampaign(db.inventory)
  out.purses = inCampaign(db.purses)
  out.starships = inCampaign(db.starships)
  out.workspace = inCampaign(db.workspace)
  const entries = new Set(out.entries.map(e => e.id)), encounters = new Set(out.encounters.map(e => e.id))
  out.links = db.links.filter(l => entries.has(l.sourceId))
  out.entryVersions = db.entryVersions.filter(v => entries.has(v.entryId))
  out.sessionEdges = db.sessionEdges.filter(e => entries.has(e.sessionId))
  out.encounterMaps = db.encounterMaps.filter(m => encounters.has(m.id))
  out.combatants = db.combatants.filter(c => encounters.has(c.encounterId))
  out.combatLog = db.combatLog.filter(l => encounters.has(l.encounterId))
  const actors = new Set([...out.combatants.map(c => c.actorId), ...out.characters.map(c => c.actorId)])
  out.actors = db.actors.filter(a => actors.has(a.id))
  const placed = collectImageIds(out.encounterMaps)
  out.mapAssets = db.mapAssets.filter(a => placed.has(a.imageId))
  return out
}

export function buildManifest(rows: Snapshot, imageCount: number, scope: Manifest['scope'], appVersion: string, exportedAt: string): Manifest {
  const collections: Record<string, number> = {}
  for (const name of COLLECTION_NAMES) if (rows[name].length) collections[name] = rows[name].length
  collections.images = imageCount
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION, app: 'startome', appVersion, exportedAt, scope,
    campaignIds: scope === 'campaigns' ? rows.campaigns.map(c => c.id) : null, collections,
  }
}

export function isAllOnly(name: CollectionName): boolean {
  return ALL_ONLY.includes(name)
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

export function checkManifest(raw: unknown): Manifest {
  const m = raw as Partial<Manifest> | null
  if (!m || m.format !== BACKUP_FORMAT) throw new BackupError('This zip is not a StarTome backup (no manifest.json with format "startome-backup").')
  if (m.version !== BACKUP_VERSION) throw new BackupError(`This backup has container version ${String(m.version)}; this app reads version ${BACKUP_VERSION}.`)
  if (typeof m.schemaVersion !== 'number' || m.schemaVersion > SCHEMA_VERSION) throw new BackupError(`This backup was written by a newer StarTome (data version ${String(m.schemaVersion)}, this app knows ${SCHEMA_VERSION}). Update the app, then import it again.`)
  return m as Manifest
}
