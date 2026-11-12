/**
 * Hand-off from the Import & Export page to a specialised importer: the page
 * detects what a file is, parks it here and routes to the importer, which takes
 * it on mount. Held in memory only; a reload drops it.
 */
import { shallowRef } from 'vue'

export interface PendingImport { file?: File; text?: string; label: string }

const pending = shallowRef<PendingImport | null>(null)

export function setPendingImport(p: PendingImport) {
  pending.value = p
}

/** The parked file, once: taking it clears it. */
export function takePendingImport(): PendingImport | null {
  const p = pending.value
  pending.value = null
  return p
}
