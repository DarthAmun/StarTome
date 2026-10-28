export type WidgetKind =
  | 'session' | 'npc' | 'location' | 'faction' | 'quest' | 'event' | 'note'
  | 'encounter-link' | 'conditions-grid' | 'scratchpad' | 'rules-entry'
  | 'timer' | 'rules-lookup' | 'random-table' | 'rumor' | 'npc-generator'
  | 'weather'

export interface DmWidget {
  id: string
  kind: WidgetKind
  entityId?: number
  rulesId?: string             // compendium entry shown by a 'rules-entry' widget
  encounterId?: number | null
  x: number
  y: number
  width: number
  height: number
  config?: Record<string, any>
}

/** Widget kinds that may only appear once on the board */
export const SINGLETONS: WidgetKind[] = [
  'encounter-link', 'conditions-grid', 'scratchpad', 'timer', 'rules-lookup', 'npc-generator', 'weather',
]

/** Default pixel [width, height] for each widget kind */
export const DEFAULT_SIZES: Record<WidgetKind, [number, number]> = {
  weather:           [384,  240],
  session:           [1200, 240],
  npc:               [576,  120],
  location:          [576,  240],
  faction:           [576,  120],
  quest:             [576,  120],
  event:             [576,  120],
  note:              [576,  240],
  'encounter-link':  [576,  240],
  'conditions-grid': [576,  240],
  scratchpad:        [1200, 120],
  'rules-entry':     [576,  360],
  timer:             [576,  240],
  'rules-lookup':    [768,  360],
  'random-table':    [576,  240],
  rumor:             [576,  120],
  'npc-generator':   [576,  360],
}

/** Labels for non-entity widget kinds (entity kinds fall through to ENTITY_TYPE_CONFIG.label) */
export const WIDGET_LABELS: Partial<Record<WidgetKind, string>> = {
  weather: 'Weather',
  'encounter-link':  'Encounter',
  'conditions-grid': 'Conditions',
  scratchpad:        'Notes',
  'rules-entry':     'Compendium',
  timer:             'Timer',
  'rules-lookup':    'Rules',
  'npc-generator':   'NPC Gen',
}

/** Colors for non-entity widget kinds (entity kinds fall through to ENTITY_TYPE_CONFIG.color) */
export const WIDGET_COLORS: Partial<Record<WidgetKind, string>> = {
  weather: 'oklch(72% 0.14 215)',
  'encounter-link':  'oklch(72% 0.20 295)',
  'conditions-grid': 'oklch(72% 0.20 22)',
  scratchpad:        'oklch(76% 0.10 215)',
  'rules-entry':     'oklch(76% 0.14 85)',
  timer:             'oklch(72% 0.18 200)',
  'rules-lookup':    'oklch(72% 0.16 260)',
  'npc-generator':   'oklch(76% 0.18 80)',
}
