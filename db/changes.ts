/**
 * Changes to tables, from anywhere: this window, another tab, a player
 * window or a worker (Dexie broadcasts its writes). Repositories use it to
 * refresh what they show when someone else wrote (FORK_PLAN §14 ARCH-04).
 */
import Dexie from 'dexie'
import { DB_NAME } from '~/utils/appNamespace'

/** Calls `cb` once things settle after any of `tables` changed. Returns the unsubscribe. Browser only. */
export function onTablesChanged(tables: string[], cb: () => void, delay = 150): () => void {
  if (typeof window === 'undefined') return () => {}
  const prefixes = tables.map(t => `idb://${DB_NAME}/${t}/`)
  let timer: ReturnType<typeof setTimeout> | null = null
  const listener = (parts: Record<string, unknown>) => {
    if (!Object.keys(parts).some(k => k === 'all' || prefixes.some(p => k.startsWith(p)))) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; cb() }, delay)
  }
  Dexie.on('storagemutated', listener)
  return () => { Dexie.on('storagemutated').unsubscribe(listener) }
}
