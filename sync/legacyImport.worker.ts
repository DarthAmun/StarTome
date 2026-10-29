/// <reference lib="webworker" />
/**
 * Runs the DM's Tome import off the main thread (exports run to ~250 MB). It
 * lives from "open" to "import", holding the parsed export while the user
 * reads the summary. Talks to useLegacyImport().
 */
import { applyLegacy, readLegacyDb, readLegacyFile, summarizeLegacy, type LegacyBundle } from './legacyImport'

export type LegacyWorkerRequest =
  | { type: 'open'; file?: Blob; browserDb?: boolean }
  | { type: 'apply' }

let bundle: LegacyBundle | null = null

self.onmessage = async (e: MessageEvent<LegacyWorkerRequest>) => {
  const msg = e.data
  const onProgress = (progress: unknown) => self.postMessage({ type: 'progress', progress })
  try {
    if (msg.type === 'open') {
      onProgress({ phase: 'read' })
      bundle = msg.file ? await readLegacyFile(msg.file) : await readLegacyDb()
      self.postMessage({ type: 'summary', summary: await summarizeLegacy(bundle) })
      return
    }
    if (!bundle) throw new Error('Open a DM\'s Tome export first.')
    const report = await applyLegacy(bundle, { onProgress })
    // One import per opened bundle: a second apply would duplicate the campaigns
    bundle = null
    self.postMessage({ type: 'done', report })
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message ?? String(err) })
  }
}
