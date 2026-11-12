/** Pins and regions on location maps. */
import { newId } from '@/domain/ids'
import type { Entry, EntryOf, MapPin } from '@/domain/schema'
import { createEntry, saveEntry } from './entries'
import { getDb } from './db'

export const maps = {
  pins: (mapEntryId: string): Promise<MapPin[]> => getDb().rows('mapPins').where('mapEntryId').equals(mapEntryId).toArray(),
  async addPin(map: Entry, entryId: string, x: number, y: number): Promise<void> {
    await getDb().rows('mapPins').put({ id: newId(), campaignId: map.campaignId, mapEntryId: map.id, entryId, x, y, hidden: false })
  },
  movePin: (id: string, x: number, y: number) => getDb().rows('mapPins').update(id, { x, y }),
  setPinHidden: (id: string, hidden: boolean) => getDb().rows('mapPins').update(id, { hidden }),
  removePin: (id: string) => getDb().rows('mapPins').delete(id),

  async regions(map: Entry): Promise<EntryOf<'region'>[]> {
    const all = await getDb().rows('entries').where('[campaignId+type]').equals([map.campaignId, 'region']).toArray()
    return all.filter((e): e is EntryOf<'region'> => e.type === 'region' && e.data.mapEntryId === map.id)
  },
  /** Regions of the campaign that are on no map yet. */
  async unplacedRegions(campaignId: string): Promise<EntryOf<'region'>[]> {
    const all = await getDb().rows('entries').where('[campaignId+type]').equals([campaignId, 'region']).toArray()
    return all.filter((e): e is EntryOf<'region'> => e.type === 'region' && e.data.mapEntryId === null)
  },
  /** Draws a region on a map: a new one, or one that existed without a place. */
  async placeRegion(map: Entry, polygon: { x: number; y: number }[], existingId: string | null, name: string, color: string): Promise<void> {
    const id = existingId ?? (await createEntry(map.campaignId, 'region', name || 'New Region')).id
    await saveEntry(id, { data: { mapEntryId: map.id, polygon, ...(existingId ? {} : { color }) } })
  },
  /** Takes a region off its map; the entry and its notes stay. */
  unplaceRegion: (id: string) => saveEntry(id, { data: { mapEntryId: null, polygon: [] } }),
  /** Locations whose map pins this one: the way back up from a sub-map. */
  async parents(mapEntryId: string): Promise<Entry[]> {
    const pins = await getDb().rows('mapPins').where('entryId').equals(mapEntryId).toArray()
    const rows = await getDb().rows('entries').bulkGet([...new Set(pins.map(p => p.mapEntryId))])
    return rows.filter((e): e is Entry => !!e)
  },
}
