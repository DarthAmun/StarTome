/**
 * Main-thread side of the DM's Tome import: one worker per import that holds
 * the parsed export between the summary and the import (see sync/legacyImport.ts).
 */
import { onScopeDispose, ref, shallowRef, toRaw } from 'vue'
import { invalidateEntities } from '~/composables/useEntities'
import type { LegacyProgress, LegacyReport, LegacySummary } from '~/sync/legacyImport'

export function useLegacyImport() {
  const summary = shallowRef<LegacySummary | null>(null)
  const report = shallowRef<LegacyReport | null>(null)
  const progress = shallowRef<LegacyProgress | null>(null)
  const error = ref<string | null>(null)
  const busy = ref<'open' | 'apply' | null>(null)
  let worker: Worker | null = null
  let pending: { resolve: (m: any) => void; reject: (e: Error) => void } | null = null

  function ensureWorker(): Worker {
    if (worker) return worker
    worker = new Worker(new URL('../sync/legacyImport.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data
      if (m.type === 'progress') { progress.value = m.progress; return }
      const p = pending
      pending = null
      if (m.type === 'error') p?.reject(new Error(m.message))
      else p?.resolve(m)
    }
    worker.onerror = (e) => {
      pending?.reject(new Error(e.message || 'The import worker crashed (the file may be too large for this browser).'))
      pending = null
      dispose()
    }
    return worker
  }

  function call<T>(message: object): Promise<T> {
    return new Promise((resolve, reject) => {
      pending = { resolve, reject }
      ensureWorker().postMessage(message)
    })
  }

  function dispose() {
    worker?.terminate()
    worker = null
  }

  async function open(source: { file: File } | { browserDb: true }) {
    error.value = null
    summary.value = null
    report.value = null
    progress.value = null
    busy.value = 'open'
    dispose()   // a fresh worker per bundle frees the previous one's memory
    try {
      const m = await call<{ summary: LegacySummary }>('file' in source ? { type: 'open', file: toRaw(source.file) } : { type: 'open', browserDb: true })
      summary.value = m.summary
    } catch (e) {
      error.value = (e as Error).message
      dispose()
    } finally {
      busy.value = null
    }
  }

  async function apply() {
    error.value = null
    progress.value = null
    busy.value = 'apply'
    try { await navigator.storage?.persist?.() } catch {}
    try {
      const m = await call<{ report: LegacyReport }>({ type: 'apply' })
      report.value = m.report
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      busy.value = null
      dispose()
      invalidateEntities()
    }
  }

  function reset() {
    dispose()
    summary.value = null
    report.value = null
    progress.value = null
    error.value = null
  }

  onScopeDispose(dispose)

  return { summary, report, progress, error, busy, open, apply, reset }
}
