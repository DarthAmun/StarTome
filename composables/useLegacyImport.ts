/**
 * Main-thread side of the DM's Tome legacy import: one worker per import that
 * holds the parsed export between analysis and apply (see sync/legacyImport.ts).
 */
import { onScopeDispose, ref, shallowRef, toRaw } from 'vue'
import { notifyRulesChanged } from '~/composables/useRules'
import { invalidateEntities } from '~/composables/useEntities'
import type { LegacyAnalysis, LegacyProgress, LegacyReport, RecordDecision } from '~/sync/legacyImport'

export function useLegacyImport() {
  const analysis = shallowRef<LegacyAnalysis | null>(null)
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
    analysis.value = null
    report.value = null
    progress.value = null
    busy.value = 'open'
    dispose()   // a fresh worker per bundle frees the previous one's memory
    try {
      const m = await call<{ analysis: LegacyAnalysis }>('file' in source ? { type: 'open', file: toRaw(source.file) } : { type: 'open', browserDb: true })
      analysis.value = m.analysis
    } catch (e) {
      error.value = (e as Error).message
      dispose()
    } finally {
      busy.value = null
    }
  }

  async function apply(decisions: Record<number, RecordDecision>, opts: { lore: boolean }) {
    error.value = null
    progress.value = null
    busy.value = 'apply'
    try { await navigator.storage?.persist?.() } catch {}
    try {
      // Plain objects: Vue's reactive proxies cannot cross postMessage
      const m = await call<{ report: LegacyReport }>({ type: 'apply', decisions: JSON.parse(JSON.stringify(decisions)), lore: opts.lore })
      report.value = m.report
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      busy.value = null
      dispose()
      invalidateEntities()
      notifyRulesChanged()
    }
  }

  function reset() {
    dispose()
    analysis.value = null
    report.value = null
    progress.value = null
    error.value = null
  }

  onScopeDispose(dispose)

  return { analysis, report, progress, error, busy, open, apply, reset }
}
