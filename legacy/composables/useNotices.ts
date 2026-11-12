/**
 * App-wide notices (bottom-right, shown by AppNotices in app.vue). Failed saves
 * and database problems go here instead of only to the console, so an offline
 * write that didn't land is never silent (FORK_PLAN §14 QUAL-02).
 */
import { ref } from 'vue'

export interface Notice {
  id: number
  kind: 'error' | 'warning' | 'info'
  message: string
  /** Optional button, e.g. "Reload". */
  action?: { label: string; run: () => void }
  /** Stays until dismissed. */
  sticky?: boolean
}

const notices = ref<Notice[]>([])
let nextId = 1
const recent = new Map<string, number>()

export function notify(message: string, kind: Notice['kind'] = 'info', extra: Partial<Pick<Notice, 'action' | 'sticky'>> = {}) {
  // The same message twice within a few seconds (a save failing on every keystroke) shows once
  const last = recent.get(message)
  if (last && Date.now() - last < 5000) return
  recent.set(message, Date.now())
  const notice: Notice = { id: nextId++, kind, message, ...extra }
  notices.value = [...notices.value, notice].slice(-5)
  if (!notice.sticky) setTimeout(() => dismiss(notice.id), kind === 'error' ? 10_000 : 5_000)
}

export function dismiss(id: number) {
  notices.value = notices.value.filter(n => n.id !== id)
}

function isQuotaError(err: unknown): boolean {
  const name = (err as { name?: string; inner?: { name?: string } })?.name
  const inner = (err as { inner?: { name?: string } })?.inner?.name
  return name === 'QuotaExceededError' || inner === 'QuotaExceededError'
}

/** Logs an error and tells the user. `what` says what failed, e.g. "Saving the fog". */
export function reportError(what: string, err: unknown) {
  console.error(`[StarTome] ${what}:`, err)
  if (isQuotaError(err)) {
    notify(`${what} failed: the browser's storage for StarTome is full. Export a backup and free space (Settings › Images › Recompress).`, 'error', { sticky: true })
    return
  }
  notify(`${what} failed: ${(err as Error)?.message ?? String(err)}`, 'error')
}

export function useNotices() {
  return { notices, notify, dismiss, reportError }
}
