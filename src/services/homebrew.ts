/**
 * Homebrew in and out: checks a file's entries against the compendium, writes
 * the ones you picked, and exports, renames or deletes packs of your own entries.
 */
import type { GameId } from '@/domain/game'
import { nowIso } from '@/domain/ids'
import { newRulesId } from '@/domain/rules/factory'
import { checkHomebrewEntry, planHomebrewImport, type HomebrewRow } from '@/domain/rules/homebrew'
import { homebrewFile, withPack } from '@/domain/rules/packs'
import type { RulesEntity } from '@/domain/rules/types'
import { rulesDeleteMany, rulesForImport, rulesPutMany, rulesUserEntries } from '@/data/rules'

/** Every raw entry checked and matched against what is stored: new, an update, or not importable. */
export async function planHomebrew(raw: unknown[], game: GameId | 'both', pack: string): Promise<HomebrewRow[]> {
  const ts = nowIso()
  const checks = raw.map((r, i) => checkHomebrewEntry(r, i, { now: ts, game, newId: newRulesId }))
  // Entries that name no pack go into the chosen one
  for (const c of checks) if (c.entry && !c.entry.publication && pack.trim()) c.entry = withPack(c.entry, pack)
  const ok = checks.flatMap(c => (c.entry ? [c.entry] : []))
  const { byId, sameName } = await rulesForImport(ok)
  return planHomebrewImport(checks, byId, sameName, newRulesId)
}

export async function applyHomebrew(rows: HomebrewRow[], picked: Set<number>): Promise<RulesEntity[]> {
  const entries = rows.flatMap(r => (picked.has(r.index) && r.entry ? [r.entry] : []))
  await rulesPutMany(entries)
  return entries
}

/** The chosen packs as one homebrew file that imports again without fixes. */
export async function exportPacks(packs: string[], appVersion: string): Promise<{ blob: Blob; name: string; count: number }> {
  const entries = await rulesUserEntries(packs)
  const file = homebrewFile(entries, `StarTome ${appVersion}`, nowIso())
  const slug = (packs.length === 1 ? packs[0] || 'no-pack' : 'homebrew').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'homebrew'
  return { blob: new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), name: `startome-${slug}.json`, count: entries.length }
}

export async function renamePack(from: string, to: string): Promise<number> {
  const entries = await rulesUserEntries([from])
  await rulesPutMany(entries.map(e => ({ ...withPack(e, to), updatedAt: nowIso() })))
  return entries.length
}

export async function deletePack(title: string): Promise<number> {
  return rulesDeleteMany((await rulesUserEntries([title])).map(e => e.id))
}
