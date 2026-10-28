/**
 * Opt-in: the v4 upgrade on a library the size of the real one (10,617
 * records, ~90 MB of inline images). Run with LIB_SCALE=1.
 */
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { DB_NAME } from '~/utils/appNamespace'

describe.skipIf(!process.env.LIB_SCALE)('v4 upgrade at scale', () => {
  it('copies 10,617 records with images', async () => {
    const old = new Dexie(DB_NAME)
    old.version(3).stores({ campaigns: '++id', tokens: '++id', encounterTokens: '++id', systems: '++id', records: '++id' })
    await old.open()
    const img = 'data:image/jpeg;base64,' + 'A'.repeat(85_000)
    const rows = Array.from({ length: 10_617 }, (_, i) => ({ systemId: 1, entityTypeId: 'creature', name: `R${i}`, data: JSON.stringify({ image: i < 1100 ? img : '', text: 'x'.repeat(500) }) }))
    await old.table('records').bulkAdd(rows)
    old.close()
    const t0 = Date.now()
    const db = getDb()
    await db.open()
    console.log('upgrade ms', Date.now() - t0)
    expect(await db.legacyLibrary.count()).toBe(10_617)
  }, 300_000)
})
