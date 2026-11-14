/**
 * The database: one Dexie store per collection of domain/schema, plus image
 * blobs and device-only handles. Only files in data/ import this module;
 * everything else goes through the repositories.
 *
 * Database name `startome-next`: the v0.42 app's database `startome` is left
 * untouched beside it (the legacy import reads it, never writes it).
 */
import Dexie, { type Table } from 'dexie'
import type { CollectionName, ImageRow, RowOf } from '@/domain/schema'

export const DB_NAME = 'startome-next'

/** Indexes per store. The first key is the primary key. */
const STORES: Record<CollectionName | 'images' | 'deviceHandles', string> = {
  campaigns: 'id, updatedAt',
  entries: 'id, campaignId, [campaignId+type], [campaignId+updatedAt]',
  links: 'id, sourceId, targetEntryId, [targetType+targetName]',
  entryVersions: 'id, entryId',
  mapPins: 'id, campaignId, mapEntryId, entryId',
  graphs: 'id, campaignId',
  graphEdges: 'id, campaignId',
  sessionPanels: 'id, campaignId, sessionId',
  sessionEdges: 'id, sessionId',
  actors: 'id, name',
  encounters: 'id, campaignId, [campaignId+status]',
  encounterMaps: 'id',
  combatants: 'id, encounterId, actorId',
  combatLog: 'id, [encounterId+seq]',
  characters: 'id, campaignId, entryId',
  partyLedger: 'id, campaignId, [campaignId+at]',
  inventory: 'id, campaignId, [campaignId+ownerKey], itemId',
  purses: 'id, campaignId, [campaignId+ownerKey]',
  starships: 'id, campaignId',
  mapAssets: 'id, name',
  soundTracks: 'id, name',
  soundPlaylists: 'id, name',
  workspace: 'id, campaignId',
  settings: 'id',
  rules: 'id, kind, game, sortName, level, rarity, *traits, origin, [kind+sortName], [kind+level+sortName], updatedAt',
  rulesOverlays: 'id',
  syncState: 'game',
  linkOutbox: 'id, campaignId',
  meta: 'key',
  images: 'id',
  /** File and folder handles (backup folder, local sound files). Device-only: never in a backup. */
  deviceHandles: 'key',
}

export interface DeviceHandle { key: string; handle: unknown }

export class StarTomeDb extends Dexie {
  images!: Table<ImageRow, string>
  deviceHandles!: Table<DeviceHandle, string>

  constructor(name = DB_NAME) {
    super(name)
    this.version(1).stores(STORES)
  }

  rows<C extends CollectionName>(name: C): Table<RowOf<C>, string> {
    return this.table(name) as Table<RowOf<C>, string>
  }
}

let db: StarTomeDb | null = null

const changeListeners = new Set<() => void>()

/** Called when a newer version of the app, in another tab, upgrades the database: this tab's connection is closed. */
export function onDatabaseChange(listener: () => void): void {
  changeListeners.add(listener)
}

export function getDb(): StarTomeDb {
  if (!db) {
    db = new StarTomeDb()
    const opened = db
    opened.on('versionchange', () => { opened.close(); for (const l of changeListeners) l() })
  }
  return db
}

/** Tests open a database of their own. */
export function useDbForTests(instance: StarTomeDb | null): void {
  db = instance
}
