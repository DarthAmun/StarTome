import { describe, expect, it } from 'vitest'
import { APP_NS, DB_NAME, channelName, exportFilename, lsKey, windowName } from '~/utils/appNamespace'

describe('appNamespace', () => {
  it('uses the startome namespace, never the DM\'s Tome one', () => {
    expect(APP_NS).toBe('startome')
    expect(DB_NAME).toBe('startome')
    expect(DB_NAME).not.toBe('dmforge')
  })

  it('prefixes every storage name', () => {
    expect(lsKey('bookmarks')).toBe('startome.bookmarks')
    expect(channelName('player')).toBe('startome-player')
    expect(windowName('map-player')).toBe('startome-map-player')
    expect(exportFilename('all-2026-10-28.json')).toBe('startome-all-2026-10-28.json')
  })
})
