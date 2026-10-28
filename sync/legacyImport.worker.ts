/// <reference lib="webworker" />
/**
 * Runs the DM's Tome import off the main thread. Unlike the Foundry sync worker
 * it lives for the whole import: the parsed export (~250 MB) and the analysis
 * stay here while the user works through the review list. Talks to useLegacyImport().
 */
import { analyseLegacy, applyLegacy, readLegacyDb, readLegacyFile, type AnalyseResult, type LegacyBundle, type RecordDecision } from './legacyImport'

export type LegacyWorkerRequest =
  | { type: 'open'; file?: Blob; browserDb?: boolean }
  | { type: 'apply'; decisions: Record<number, RecordDecision>; lore: boolean }

let bundle: LegacyBundle | null = null
let analysed: AnalyseResult | null = null

self.onmessage = async (e: MessageEvent<LegacyWorkerRequest>) => {
  const msg = e.data
  const onProgress = (progress: unknown) => self.postMessage({ type: 'progress', progress })
  try {
    if (msg.type === 'open') {
      onProgress({ phase: 'read' })
      bundle = msg.file ? await readLegacyFile(msg.file) : await readLegacyDb()
      analysed = await analyseLegacy(bundle, onProgress)
      self.postMessage({ type: 'analysis', analysis: analysed.analysis })
      return
    }
    if (!bundle || !analysed) throw new Error('Open a DM\'s Tome export first.')
    const report = await applyLegacy(bundle, analysed, { decisions: msg.decisions, lore: msg.lore, onProgress })
    // One import per opened bundle: a second apply would duplicate the campaign
    bundle = null
    analysed = null
    self.postMessage({ type: 'done', report })
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message ?? String(err) })
  }
}
