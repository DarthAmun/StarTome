/**
 * Every collection of the database with its schema, in the order a backup
 * writes them. Row types come from the schemas (z.infer), so a type and its
 * runtime check cannot drift apart.
 */
import type { z } from 'zod'
import { zCampaign } from './campaign'
import { zCombatLogEntry, zCombatant, zEncounter, zEncounterMap, zActor } from './encounter'
import { zEntry, zEntryVersion, zGraph, zGraphEdge, zLink, zMapPin, zSessionEdge, zSessionPanel } from './entry'
import { zLinkOutboxItem } from './link'
import { zImageMeta, zMapAsset, zMeta, zRulesOverlay, zRulesRow, zSettings, zSoundPlaylist, zSoundTrack, zSyncState, zWorkspaceItem } from './library'
import { zCharacter, zInventoryEntry, zLedgerEntry, zPurse, zStarship } from './party'

export * from './common'
export * from './campaign'
export * from './entry'
export * from './encounter'
export * from './party'
export * from './library'
export * from './link'

/** The row shapes inside a backup's data/ folder; raised by every migration. */
export const SCHEMA_VERSION = 1

export const COLLECTIONS = {
  campaigns: zCampaign,
  entries: zEntry,
  links: zLink,
  entryVersions: zEntryVersion,
  mapPins: zMapPin,
  graphs: zGraph,
  graphEdges: zGraphEdge,
  sessionPanels: zSessionPanel,
  sessionEdges: zSessionEdge,
  actors: zActor,
  encounters: zEncounter,
  encounterMaps: zEncounterMap,
  combatants: zCombatant,
  combatLog: zCombatLogEntry,
  characters: zCharacter,
  partyLedger: zLedgerEntry,
  inventory: zInventoryEntry,
  purses: zPurse,
  starships: zStarship,
  mapAssets: zMapAsset,
  soundTracks: zSoundTrack,
  soundPlaylists: zSoundPlaylist,
  workspace: zWorkspaceItem,
  settings: zSettings,
  rules: zRulesRow,
  rulesOverlays: zRulesOverlay,
  syncState: zSyncState,
  linkOutbox: zLinkOutboxItem,
  meta: zMeta,
} as const

export type CollectionName = keyof typeof COLLECTIONS
export const COLLECTION_NAMES = Object.keys(COLLECTIONS) as CollectionName[]
export type RowOf<C extends CollectionName> = z.infer<(typeof COLLECTIONS)[C]>

/** A whole database as plain rows: what the legacy import produces and a backup carries. */
export type Snapshot = { [C in CollectionName]: RowOf<C>[] }

export function emptySnapshot(): Snapshot {
  return Object.fromEntries(COLLECTION_NAMES.map(c => [c, []])) as unknown as Snapshot
}

/** Collections whose rows belong to one campaign, with the field that says which. */
export const CAMPAIGN_SCOPED: Partial<Record<CollectionName, string>> = {
  entries: 'campaignId', mapPins: 'campaignId', graphs: 'campaignId', graphEdges: 'campaignId', sessionPanels: 'campaignId',
  encounters: 'campaignId', characters: 'campaignId', partyLedger: 'campaignId', inventory: 'campaignId', purses: 'campaignId',
  starships: 'campaignId', workspace: 'campaignId',
}

export { zImageMeta }
