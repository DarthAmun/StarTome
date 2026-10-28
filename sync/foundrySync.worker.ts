/// <reference lib="webworker" />
/**
 * Runs the Foundry sync off the main thread: unzipping ~35 MB and converting
 * ~30k documents would otherwise freeze the UI. Talks to useFoundrySync().
 */
import { openReleaseZip, runFoundrySync } from './foundrySync'

export type SyncWorkerRequest =
  | { type: 'inspect'; file: Blob }
  | { type: 'run'; file: Blob; packs: string[]; force?: boolean }

self.onmessage = async (e: MessageEvent<SyncWorkerRequest>) => {
  const msg = e.data
  try {
    const source = await openReleaseZip(msg.file)
    if (msg.type === 'inspect') {
      self.postMessage({ type: 'info', info: { game: source.game, version: source.version, packs: source.packs } })
      return
    }
    const report = await runFoundrySync(source, {
      packs: msg.packs,
      force: msg.force,
      onProgress: progress => self.postMessage({ type: 'progress', progress }),
    })
    self.postMessage({ type: 'done', report })
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message ?? String(err) })
  }
}
