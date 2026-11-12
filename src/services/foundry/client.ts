/**
 * Main-thread side of the Foundry compendium sync: inspects a dropped release
 * zip and runs the sync in a worker (unzipping about 35 MB and converting
 * about 30,000 documents would freeze the screen), and asks GitHub which
 * release is the latest.
 */
import type { GameId } from '@/domain/game'
import { notifyRulesChanged } from '@/data/rules'
import type { ReleaseInfo, SyncProgress, SyncReport } from './sync'

/** Where the latest release is looked up; the raw manifest can be read across origins. */
const MANIFEST: Record<GameId, string> = {
  pf2e: 'https://raw.githubusercontent.com/foundryvtt/pf2e/v14-dev/system.pf2e.json',
  sf2e: 'https://raw.githubusercontent.com/foundryvtt/pf2e/v14-dev/system.sf2e.json',
}
export const RELEASES_PAGE = 'https://github.com/foundryvtt/pf2e/releases'

export interface LatestRelease { version: string; zipUrl: string }

type Reply = { type: 'info'; info: ReleaseInfo } | { type: 'progress'; progress: SyncProgress } | { type: 'done'; report: SyncReport } | { type: 'error'; message: string }

/** One worker from "inspect" to the end of "run", so the zip is opened once. */
export class FoundrySyncClient {
  private worker: Worker | null = null

  private call<T>(message: Record<string, unknown>, onProgress?: (p: SyncProgress) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const w = (this.worker ??= new Worker(new URL('./sync.worker.ts', import.meta.url), { type: 'module' }))
      w.onmessage = (e: MessageEvent<Reply>) => {
        const m = e.data
        if (m.type === 'progress') { onProgress?.(m.progress); return }
        if (m.type !== 'info') this.release()
        if (m.type === 'error') reject(new Error(m.message))
        else resolve((m.type === 'info' ? m.info : m.report) as T)
      }
      w.onerror = (e) => { this.release(); reject(new Error(e.message || 'The sync worker crashed.')) }
      w.postMessage(message)
    })
  }

  inspect(file: File): Promise<ReleaseInfo> {
    return this.call<ReleaseInfo>({ type: 'inspect', file })
  }

  async run(file: File, packs: string[], force: boolean, onProgress: (p: SyncProgress) => void): Promise<SyncReport> {
    try { return await this.call<SyncReport>({ type: 'run', file, packs: [...packs], force }, onProgress) }
    finally { notifyRulesChanged() }
  }

  release(): void {
    this.worker?.terminate()
    this.worker = null
  }
}

/** Latest released version of a game, from the system manifest on GitHub. */
export async function fetchLatestRelease(game: GameId): Promise<LatestRelease> {
  const res = await fetch(MANIFEST[game], { cache: 'no-store' })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const manifest = await res.json() as { version?: unknown; download?: unknown }
  const version = String(manifest.version)
  const download = String(manifest.download ?? '')
  const zipUrl = download.endsWith('/system.zip') ? download.replace(/system\.zip$/, 'json-assets.zip') : `${RELEASES_PAGE}/download/${game}-${version}/json-assets.zip`
  return { version, zipUrl }
}

/** -1 / 0 / 1 for dotted version strings ("8.6.1" against "8.10.0"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0), pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}
