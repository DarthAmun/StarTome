/**
 * Main-thread side of the Foundry compendium sync: inspects a dropped release
 * ZIP, runs the sync in a Web Worker, exposes progress and the final report,
 * and checks GitHub for newer releases.
 */
import { onScopeDispose, ref, shallowRef, toRaw } from 'vue'
import { getDb, type DbSyncState } from '~/composables/useDb'
import { notifyRulesChanged } from '~/composables/useRules'
import type { ReleaseInfo, SyncProgress, SyncReport } from '~/sync/foundrySync'
import type { GameId } from '~/types/game'

/** Where the app looks for the latest release; the raw manifest is CORS-readable. */
const MANIFEST: Record<GameId, string> = {
  pf2e: 'https://raw.githubusercontent.com/foundryvtt/pf2e/v14-dev/system.pf2e.json',
  sf2e: 'https://raw.githubusercontent.com/foundryvtt/pf2e/v14-dev/system.sf2e.json',
}
export const RELEASES_PAGE = 'https://github.com/foundryvtt/pf2e/releases'

export interface LatestRelease { version: string; zipUrl: string }

function createWorker() {
  return new Worker(new URL('../sync/foundrySync.worker.ts', import.meta.url), { type: 'module' })
}

export function useFoundrySync() {
  const info = shallowRef<ReleaseInfo | null>(null)
  const progress = shallowRef<SyncProgress | null>(null)
  const report = shallowRef<SyncReport | null>(null)
  const error = ref<string | null>(null)
  const busy = ref<'inspect' | 'run' | null>(null)

  // One worker from "inspect" to the end of "run", so the ZIP is opened once
  let worker: Worker | null = null
  function release() { worker?.terminate(); worker = null }
  onScopeDispose(release)

  function call<T>(message: { type: string; [key: string]: unknown }, onProgress?: (p: SyncProgress) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const w = (worker ??= createWorker())
      w.onmessage = (e: MessageEvent) => {
        const m = e.data
        if (m.type === 'progress') { onProgress?.(m.progress); return }
        if (m.type !== 'info') release()
        if (m.type === 'error') reject(new Error(m.message))
        else resolve(m.type === 'info' ? m.info : m.report)
      }
      w.onerror = (e) => { release(); reject(new Error(e.message || 'The sync worker crashed.')) }
      w.postMessage(message)
    })
  }

  async function inspect(file: File) {
    error.value = null
    report.value = null
    info.value = null
    busy.value = 'inspect'
    try {
      info.value = await call<ReleaseInfo>({ type: 'inspect', file: toRaw(file) })
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      busy.value = null
    }
  }

  async function run(file: File, packs: string[], force = false) {
    error.value = null
    report.value = null
    progress.value = null
    busy.value = 'run'
    // Ask the browser not to evict a compendium that took minutes to build
    try { await navigator.storage?.persist?.() } catch {}
    try {
      // Plain array: Vue's reactive proxies cannot cross postMessage
      report.value = await call<SyncReport>({ type: 'run', file: toRaw(file), packs: [...packs], force }, p => { progress.value = p })
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      busy.value = null
      notifyRulesChanged()
    }
  }

  return { info, progress, report, error, busy, inspect, run }
}

export async function loadSyncStates(): Promise<Partial<Record<GameId, DbSyncState>>> {
  const rows = await getDb().syncState.toArray()
  return Object.fromEntries(rows.map(r => [r.game, r]))
}

/** Latest released version per game, from the system manifest on GitHub. */
export async function fetchLatestRelease(game: GameId): Promise<LatestRelease> {
  const res = await fetch(MANIFEST[game], { cache: 'no-store' })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const manifest = await res.json()
  const version = String(manifest.version)
  const download = String(manifest.download ?? '')
  const zipUrl = download.endsWith('/system.zip')
    ? download.replace(/system\.zip$/, 'json-assets.zip')
    : `${RELEASES_PAGE}/download/${game}-${version}/json-assets.zip`
  return { version, zipUrl }
}

/** -1 / 0 / 1 for dotted version strings ("8.6.1" vs "8.10.0"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}
