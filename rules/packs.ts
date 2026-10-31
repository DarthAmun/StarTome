/**
 * Homebrew packs: your own entries grouped by `publication.title` ("Homebrew:
 * Conduit"). An entry without one is in no pack. A pack exports as a homebrew
 * file (HOMEBREW_FORMAT.md) that imports again with no fixes.
 * Pure: callers load the entries (useRules: rulesUserEntries).
 */
import { OWNED_BY_APP } from '~/rules/homebrew'
import type { RulesEntity } from '~/types/rules'

/** Filter value for entries in no pack. */
export const NO_PACK = ''

export function packOf(e: Pick<RulesEntity, 'publication'>): string {
  return e.publication?.title.trim() ?? NO_PACK
}

export interface PackSummary { title: string; count: number }

/** Packs by name, "no pack" last. */
export function summarizePacks(entries: RulesEntity[]): PackSummary[] {
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(packOf(e), (counts.get(packOf(e)) ?? 0) + 1)
  return [...counts.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => (a.title === NO_PACK ? 1 : b.title === NO_PACK ? -1 : a.title.localeCompare(b.title)))
}

/** Put an entry into a pack (an empty title takes it out). */
export function withPack<T extends RulesEntity>(e: T, title: string): T {
  const t = title.trim()
  const { publication: _, ...rest } = e
  return (t ? { ...rest, publication: { title: t, remaster: e.publication?.remaster ?? true } } : rest) as T
}

/** An entry as it goes into a homebrew file: no images or app bookkeeping. */
export function homebrewFileEntry(e: RulesEntity): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(e)) if (!OWNED_BY_APP.has(k) && v !== undefined) out[k] = v
  return { ...out, origin: 'user', sourceRefs: [] }
}

export function homebrewFile(entries: RulesEntity[], app: string, exportedAt: string) {
  return {
    version: 2, app, type: 'homebrew', exportedAt,
    rules: [...entries].sort((a, b) => a.kind.localeCompare(b.kind) || a.sortName.localeCompare(b.sortName)).map(homebrewFileEntry),
  }
}
