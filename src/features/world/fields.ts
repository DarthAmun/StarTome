/** The fields each entry type has, as the form shows them. One list drives every type's form. */
import type { EntryType } from '@/domain/schema'

export type Field =
  | { key: string; label: string; kind: 'text'; placeholder?: string; wide?: boolean; suggest?: 'ancestry' | 'class' }
  | { key: string; label: string; kind: 'select'; options: [value: string, label: string][] }
  | { key: string; label: string; kind: 'check'; on: string }
  | { key: string; label: string; kind: 'image' }
  | { key: string; label: string; kind: 'statuses'; options: [value: string, label: string][] }
  | { key: string; label: string; kind: 'giver' }
  | { key: string; label: string; kind: 'color' }
  | { key: string; label: string; kind: 'icon' }

const opts = (...values: string[]): [string, string][] => values.map(v => [v, v.charAt(0).toUpperCase() + v.slice(1)])

export const FIELDS: Record<EntryType, Field[]> = {
  npc: [
    { key: 'portrait', label: 'Portrait', kind: 'image' },
    { key: 'title', label: 'Title', kind: 'text', placeholder: 'High Priest, General…' },
    { key: 'level', label: 'Level', kind: 'text', placeholder: '5' },
    { key: 'ancestry', label: 'Ancestry', kind: 'text', placeholder: 'Human, Vesk…', suggest: 'ancestry' },
    { key: 'class', label: 'Class / role', kind: 'text', placeholder: 'Fighter, Merchant…', suggest: 'class' },
    { key: 'class2', label: 'Second class', kind: 'text', placeholder: 'Dual-class only', suggest: 'class' },
    { key: 'status', label: 'Status', kind: 'text', placeholder: 'Friendly, at court, imprisoned…', wide: true },
    { key: 'alive', label: 'Vital status', kind: 'check', on: 'Alive' },
  ],
  location: [
    { key: 'banner', label: 'Banner', kind: 'image' },
    { key: 'map', label: 'Map', kind: 'image' },
    { key: 'kind', label: 'Type', kind: 'select', options: opts('city', 'dungeon', 'wilderness', 'building', 'region', 'other') },
    { key: 'status', label: 'Discovery', kind: 'select', options: opts('discovered', 'undiscovered', 'destroyed') },
  ],
  faction: [
    { key: 'image', label: 'Emblem', kind: 'image' },
    { key: 'kind', label: 'Type', kind: 'select', options: opts('criminal', 'religious', 'political', 'mercenary', 'arcane', 'other') },
    { key: 'size', label: 'Size', kind: 'select', options: opts('small', 'medium', 'large', 'massive') },
    { key: 'headquarters', label: 'Headquarters', kind: 'text' },
    { key: 'secret', label: 'Visibility', kind: 'check', on: 'Secret organisation' },
  ],
  quest: [
    { key: 'status', label: 'Status', kind: 'select', options: opts('active', 'dormant', 'completed', 'failed') },
    { key: 'giver', label: 'Given by', kind: 'giver' },
    { key: 'reward', label: 'Reward', kind: 'text', placeholder: 'Gold, items, a favour… shown to players', wide: true },
    { key: 'milestone', label: 'Milestone', kind: 'check', on: 'Completing it levels the party' },
  ],
  event: [
    { key: 'date', label: 'Date', kind: 'text', placeholder: '4724-03-01 (sorted as text)' },
    { key: 'location', label: 'Location', kind: 'text' },
    { key: 'significance', label: 'Significance', kind: 'select', options: opts('minor', 'major', 'critical') },
  ],
  session: [
    { key: 'number', label: 'Number', kind: 'text' },
    { key: 'date', label: 'Date', kind: 'text', placeholder: '2026-11-14' },
    { key: 'mode', label: 'Mode', kind: 'select', options: opts('planning', 'running', 'finished') },
  ],
  note: [{ key: 'icon', label: 'Icon', kind: 'icon' }],
  'random-table': [{ key: 'die', label: 'Die', kind: 'select', options: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map(d => [d, d] as [string, string]) }],
  rumor: [
    { key: 'statuses', label: 'Status', kind: 'statuses', options: opts('unheard', 'heard', 'revealed', 'false') },
    { key: 'source', label: 'Source', kind: 'text', placeholder: 'Who told the players?' },
  ],
  region: [{ key: 'color', label: 'Colour', kind: 'color' }],
}

export interface FieldChange { key: string; label: string; value: string | boolean | string[]; shown: string }

const YES = ['yes', 'y', 'true', 'on', '1'], NO = ['no', 'n', 'false', 'off', '0']

/**
 * What `set <field> <value>` in the command bar means for an entry of this type: the field
 * whose key or label starts the text, and the rest as its value. Null when no field fits or
 * the value is not one the field takes. Pictures, colours, icons and quest givers are not set this way.
 */
export function fieldChange(type: EntryType, text: string): FieldChange | null {
  const lower = text.trim().toLowerCase()
  // "dead" and "alive" are worth a short form
  if (type === 'npc' && (lower === 'dead' || lower === 'alive')) return { key: 'alive', label: 'Vital status', value: lower === 'alive', shown: lower === 'alive' ? 'Alive' : 'Dead' }
  const named = FIELDS[type]
    .flatMap(f => [f.key, f.label].map(n => ({ f, name: n.toLowerCase() })))
    .filter(x => lower === x.name || lower.startsWith(`${x.name} `))
    .sort((a, b) => b.name.length - a.name.length)[0]
  if (!named) return null
  const f = named.f
  const raw = text.trim().slice(named.name.length).trim()
  const value = raw.toLowerCase()
  if (f.kind === 'text') return { key: f.key, label: f.label, value: raw, shown: raw || 'nothing' }
  if (f.kind === 'select') {
    const hit = f.options.find(([v, l]) => v === value || l.toLowerCase() === value) ?? (value ? f.options.find(([v]) => v.startsWith(value)) : undefined)
    return hit ? { key: f.key, label: f.label, value: hit[0], shown: hit[1] } : null
  }
  if (f.kind === 'check') {
    const on = YES.includes(value) || value === f.on.toLowerCase() ? true : NO.includes(value) ? false : null
    return on === null ? null : { key: f.key, label: f.label, value: on, shown: on ? f.on : `not “${f.on}”` }
  }
  if (f.kind === 'statuses') {
    const picked = value.split(/[,\s]+/).filter(Boolean).map(v => f.options.find(([o]) => o === v || o.startsWith(v))?.[0])
    if (!picked.length || picked.some(v => !v)) return null
    const list = [...new Set(picked as string[])]
    return { key: f.key, label: f.label, value: list, shown: list.join(', ') }
  }
  return null
}
