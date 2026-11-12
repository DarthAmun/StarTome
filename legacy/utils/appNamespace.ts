/**
 * Every browser-storage name this app uses comes from here.
 *
 * StarTome and DM's Tome are deployed side by side on the same origin
 * (darthamun.github.io/StarTome/ and /DmsTome/), and same-origin pages share
 * IndexedDB, localStorage and BroadcastChannel namespaces. Prefixing every name
 * with APP_NS keeps the two apps' data and player-view sync apart.
 */

export const APP_NS = 'startome'
export const APP_NAME = 'StarTome'

/** IndexedDB database name. */
export const DB_NAME = APP_NS

/** localStorage key, e.g. lsKey('bookmarks') → 'startome.bookmarks'. */
export function lsKey(key: string): string {
  return `${APP_NS}.${key}`
}

/** BroadcastChannel name, e.g. channelName('player') → 'startome-player'. */
export function channelName(name: string): string {
  return `${APP_NS}-${name}`
}

/** window.open target name for pop-out views. */
export function windowName(name: string): string {
  return `${APP_NS}-${name}`
}

/** Filename prefix for downloaded exports, e.g. 'startome-all-2026-10-28.json'. */
export function exportFilename(rest: string): string {
  return `${APP_NS}-${rest}`
}

/**
 * DM's Tome's own IndexedDB database. Only the legacy import reads it — opened
 * read-only, never written — when both apps share an origin.
 */
export const LEGACY_DB_NAME = 'dmforge'
