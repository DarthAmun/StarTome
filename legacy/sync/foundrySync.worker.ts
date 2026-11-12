/// <reference lib="webworker" />
/**
 * Runs the Foundry sync off the main thread: unzipping ~35 MB and converting
 * ~30k documents would otherwise freeze the UI. Talks to useFoundrySync().
 */
import { openReleaseZip, runFoundrySync, type FoundrySource } from './foundrySync'

export type SyncWorkerRequest =
  | { type: 'inspect'; file: Blob }
  | { type: 'run'; file: Blob; packs: string[]; force?: boolean }

// The ZIP opened by "inspect" is reused by "run" on the same file (PERF-06)
let opened: { key: string; source: Promise<FoundrySource> } | null = null
function open(file: Blob) {
  const key = file instanceof File ? `${file.name}:${file.size}:${file.lastModified}` : `blob:${file.size}`
  if (opened?.key !== key) opened = { key, source: openReleaseZip(file) }
  return opened.source
}

self.onmessage = async (e: MessageEvent<SyncWorkerRequest>) => {
  const msg = e.data
  try {
    const source = await open(msg.file)
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
