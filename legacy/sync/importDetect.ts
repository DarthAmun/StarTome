/**
 * What a dropped file or pasted text is, so the Import & Export page can hand it
 * to the right importer. Pure: reads the text it is given, no database.
 */
import { readHomebrewText } from '~/rules/homebrew'
import { CAMPAIGN_TABLES } from '~/sync/backup'

export type ImportTarget =
  | { kind: 'legacy' }                         // DM's Tome export → DM's Tome import
  | { kind: 'backup'; payload: any }           // StarTome backup / campaign / tokens file → import dialog
  | { kind: 'homebrew' }                       // compendium entries (HOMEBREW_FORMAT.md) → homebrew import
  | { kind: 'playbuddy'; name: string }        // a Play Buddy share file (PLAYBUDDY_API.md §9) → a campaign's party
  | { kind: 'unknown'; error: string }

/** ZIP files start with "PK": a Foundry json-assets.zip goes to the compendium sync. */
export function isZip(name: string, head?: Uint8Array): boolean {
  if (head && head.length >= 2) return head[0] === 0x50 && head[1] === 0x4b
  return /\.zip$/i.test(name)
}

/** What a parsed JSON object is, when it's one of StarTome's own files (else null). */
export function detectObject(raw: unknown): ImportTarget | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, any>
  // DM's Tome writes version 1 with campaigns; StarTome writes version 2
  if (o.version === 1 && Array.isArray(o.campaigns)) return { kind: 'legacy' }
  if (o.format === 'playbuddy-share') return { kind: 'playbuddy', name: o.status?.basic?.name ?? 'a character' }
  const hasData = [...CAMPAIGN_TABLES, 'rulesOverlays'].some(k => Array.isArray(o[k]) && o[k].length)
  if (hasData) return { kind: 'backup', payload: o }
  return null
}

export function detectImport(text: string): ImportTarget {
  // A ```json block pasted from a chat counts as its content
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)```/)
  let raw: any
  try { raw = JSON.parse((fenced ? fenced[1] : text).trim()) } catch { raw = undefined }

  const own = detectObject(raw)
  if (own) return own

  // Anything else that holds compendium entries (an export with only `rules`, a list, one entry, a ```json block)
  const read = readHomebrewText(text)
  if (!('error' in read) && read.entries.length) return { kind: 'homebrew' }
  if (raw === undefined && 'error' in read) return { kind: 'unknown', error: 'This is not JSON, and no ```json block was found in it.' }
  return { kind: 'unknown', error: "StarTome doesn't recognise this file: it has no campaigns, tokens or compendium entries." }
}
