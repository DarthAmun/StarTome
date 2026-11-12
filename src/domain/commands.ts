/** What a line typed into the command bar asks for, when it is a command and not a search. Pure. */
import { ENTRY_TYPES, type EntryType } from './schema'

export type Command =
  | { kind: 'new'; type: EntryType; name: string }
  | { kind: 'roll'; expr: string }
  | { kind: 'rename'; name: string }
  | { kind: 'append'; text: string }
  | { kind: 'delete' }
  | { kind: 'favorite' }
  | { kind: 'mode'; mode: 'light' | 'dark' }

const TYPE_WORDS: Record<string, EntryType> = {
  npc: 'npc', character: 'npc', location: 'location', place: 'location', faction: 'faction', guild: 'faction', quest: 'quest', mission: 'quest',
  event: 'event', note: 'note', rumor: 'rumor', rumour: 'rumor', table: 'random-table', 'random-table': 'random-table', region: 'region',
}

export function parseCommand(input: string): Command | null {
  const text = input.trim().replace(/^>\s*/, '')
  const [first = '', ...rest] = text.split(/\s+/)
  const verb = first.toLowerCase()
  const tail = text.slice(first.length).trim()
  if (verb === 'new' || verb === 'add') {
    const type = TYPE_WORDS[(rest[0] ?? '').toLowerCase()]
    return type && ENTRY_TYPES.includes(type) ? { kind: 'new', type, name: tail.slice((rest[0] ?? '').length).trim() } : null
  }
  if (verb === 'roll') return tail ? { kind: 'roll', expr: tail } : null
  if (/^\d*d\d+/i.test(text) && !/[a-ce-z]{2}/i.test(text)) return { kind: 'roll', expr: text }
  if (verb === 'rename') return tail ? { kind: 'rename', name: tail } : null
  if (verb === 'append') return tail ? { kind: 'append', text: tail } : null
  if (verb === 'delete' && !tail) return { kind: 'delete' }
  if ((verb === 'favourite' || verb === 'favorite' || verb === 'star') && !tail) return { kind: 'favorite' }
  if ((verb === 'light' || verb === 'dark') && !tail) return { kind: 'mode', mode: verb }
  return null
}
