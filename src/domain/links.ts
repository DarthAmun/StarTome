/**
 * References in text: `{{npc: Name}}`, `{{creature: Name}}`, `{{npc: Name | entry}}`.
 * Text names its targets (you and Claude write it); the `links` collection
 * holds what each name resolved to, and a rename rewrites the text.
 */
import { ENTRY_TYPES, type EntryType } from '@/domain/schema'

/** Groups: 1 type, 2 name, 3 historical state (after @), 4 options (after |). */
export const REF_PATTERN = /\{\{([\w-]+):\s*([^@|}\n]+?)\s*(?:@\s*([^|}\n]+?)\s*)?(?:\|\s*([^}]*))?\}\}/g

const ALIASES: Record<string, string> = { table: 'random-table' }

export function canonicalType(raw: string): string {
  const lower = raw.toLowerCase()
  return ALIASES[lower] ?? lower
}

export function isEntryTypeName(type: string): type is EntryType {
  return (ENTRY_TYPES as readonly string[]).includes(type)
}

export interface TextRef { type: string; name: string; meta: Record<string, string> }

function parseMeta(raw: string | undefined): Record<string, string> {
  const meta: Record<string, string> = {}
  for (const pair of (raw ?? '').split(',')) {
    const part = pair.trim()
    if (!part) continue
    const at = part.search(/[=:]/)
    if (at === -1) meta[part] = '1'
    else meta[part.slice(0, at).trim()] = part.slice(at + 1).trim()
  }
  return meta
}

/** Every reference in a text, once per type and name. `roll` is a dice roll, not a reference. */
export function extractRefs(text: string): TextRef[] {
  const seen = new Map<string, TextRef>()
  for (const m of text.matchAll(REF_PATTERN)) {
    const type = canonicalType(m[1] ?? ''), name = (m[2] ?? '').trim()
    if (!name || type === 'roll') continue
    const key = `${type}|${name.toLowerCase()}`
    if (!seen.has(key)) seen.set(key, { type, name, meta: parseMeta(m[4]) })
  }
  return [...seen.values()]
}

/** The text with every reference to `oldName` of `type` pointing at `newName` instead. */
export function renameRefs(text: string, type: string, oldName: string, newName: string): string {
  const wanted = oldName.trim().toLowerCase()
  return text.replace(REF_PATTERN, (all, rawType: string, name: string) => {
    if (canonicalType(rawType) !== type || name.trim().toLowerCase() !== wanted) return all
    // Only the name changes: spacing, the @state and the |options stay as written
    const at = all.indexOf(name, all.indexOf(':') + 1)
    return at === -1 ? all : all.slice(0, at) + newName + all.slice(at + name.length)
  })
}

/** A name no other entry of the type has: "New NPC", "New NPC 2" … */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map(n => n.trim().toLowerCase()))
  if (!used.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}
