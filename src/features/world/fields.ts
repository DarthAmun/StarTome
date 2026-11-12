/** The fields each entry type has, as the form shows them. One list drives every type's form. */
import type { EntryType } from '@/domain/schema'

export type Field =
  | { key: string; label: string; kind: 'text'; placeholder?: string; wide?: boolean }
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
    { key: 'ancestry', label: 'Ancestry', kind: 'text', placeholder: 'Human, Vesk…' },
    { key: 'class', label: 'Class / role', kind: 'text', placeholder: 'Fighter, Merchant…' },
    { key: 'class2', label: 'Second class', kind: 'text', placeholder: 'Dual-class only' },
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
