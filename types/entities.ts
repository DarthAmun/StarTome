export type EntityType = 'session' | 'note' | 'npc' | 'location' | 'faction' | 'quest' | 'event' | 'random-table' | 'rumor' | 'region'

// Shape reference — used via EntityAttributes union
export interface NpcAttributes {
  portraitSource?: string
  portraitType?: 'file' | 'url'
  title?: string
  level?: string
  race?: string
  role?: string
  isAlive?: boolean
  isPlayerCharacter?: boolean
  status?: string
}

export interface MapPin {
  entityId: number
  x: number   // 0–1 fraction of image width
  y: number   // 0–1 fraction of image height
  hidden?: boolean  // DM-only: hide this pin from the player view
}

// Shape reference — used via EntityAttributes union
export interface LocationAttributes {
  imageSource?: string       // map image
  imageType?: 'file' | 'url'
  logoSource?: string        // banner/logo image
  logoType?: 'file' | 'url'
  locationType?: 'city' | 'dungeon' | 'wilderness' | 'building' | 'region' | 'other'
  status?: 'discovered' | 'undiscovered' | 'destroyed'
  mapPins?: MapPin[]
}

// Shape reference — used via EntityAttributes union
export interface FactionAttributes {
  imageSource?: string
  imageType?: 'file' | 'url'
  factionType?: 'criminal' | 'religious' | 'political' | 'mercenary' | 'arcane' | 'other'
  size?: 'small' | 'medium' | 'large' | 'massive'
  isSecret?: boolean
  headquartersName?: string
}

// Shape reference — used via EntityAttributes union
export interface QuestAttributes {
  status?: 'active' | 'completed' | 'failed' | 'dormant'
  questGiver?: string
  questGiverId?: number
  questGiverType?: 'npc' | 'faction'
  reward?: string
  /** Completing the quest offers to level up the party (milestone campaigns). */
  milestone?: boolean
}

// Shape reference — used via EntityAttributes union
export interface EventAttributes {
  date?: string
  location?: string
  significance?: 'minor' | 'major' | 'critical'
}

// Shape reference — used via EntityAttributes union
export interface SessionAttributes {
  mode?: 'planning' | 'running' | 'finished'
  sessionNumber?: string
  date?: string
  scriptContent?: string   // the session script / prep
  notesContent?: string    // live notes taken during session
}

// Shape reference — used via EntityAttributes union
export interface NoteAttributes {
  icon?: string
  tags?: string[]
}

export interface RandomTableRow {
  min: number
  max: number
  result: string
}

// Shape reference — used via EntityAttributes union
export interface RandomTableAttributes {
  die?: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100'
  rows?: RandomTableRow[]
  tags?: string[]
}

// Shape reference — used via EntityAttributes union
export interface RumorAttributes {
  statuses?: string[]
  source?: string
  tags?: string[]
}

export interface RegionPolygonPoint { x: number; y: number }

// Shape reference — used via EntityAttributes union
export interface RegionAttributes {
  locationEntityId: number | null   // null = campaign world map
  polygon: RegionPolygonPoint[]
  color: string
}

export const REGION_COLORS = [
  '#5fc98a', '#4ab8e8', '#e8924a', '#e05555', '#b87de8',
  '#e8c44a', '#c86fa8', '#7cc44e', '#a87de8', '#4ae8d5',
] as const

/** Normalize 0–1 fraction polygon points into a fixed SVG viewport with bbox-fitting and padding. */
export function normalizePolygon(
  pts: RegionPolygonPoint[],
  svgW: number,
  svgH: number,
  pad = 12,
): { x: number; y: number }[] {
  if (!pts.length) return []
  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const scale = Math.min((svgW - pad * 2) / (maxX - minX || 1), (svgH - pad * 2) / (maxY - minY || 1))
  return pts.map(p => ({ x: pad + (p.x - minX) * scale, y: pad + (p.y - minY) * scale }))
}

export const RUMOR_STATUS_COLORS: Record<string, string> = {
  unheard:  'var(--text3)',
  heard:    '#6b9fe8',
  revealed: 'var(--success)',
  false:    'var(--danger)',
}

export const SESSION_MODE_COLORS: Record<string, string> = {
  planning: '#6b9fe8',
  running:  '#7cc44e',
  finished: '#b87de8',
}

export const QUEST_STATUS_COLORS: Record<string, string> = {
  active:    '#e8924a',
  completed: '#7cc44e',
  failed:    'var(--blood)',
  dormant:   'var(--ink-ghost)',
}

export const EVENT_SIGNIFICANCE_COLORS: Record<string, string> = {
  critical: 'var(--blood)',
  major:    'var(--gold)',
  minor:    'var(--ink-ghost)',
}

// Shape reference — used via EntityAttributes union
export interface PinnedLocation {
  locationEntityId: number
  locationName: string
  x: number
  y: number
}

export type EntityAttributes = NpcAttributes | LocationAttributes | FactionAttributes | NoteAttributes | QuestAttributes | EventAttributes | SessionAttributes | RandomTableAttributes | RumorAttributes | RegionAttributes

export const ENTITY_TYPE_ROUTE: Record<EntityType, string> = {
  session:        'sessions',
  note:           'notes',
  npc:            'npcs',
  location:       'locations',
  faction:        'factions',
  quest:          'quests',
  event:          'events',
  'random-table': 'random-tables',
  rumor:          'rumors',
  region:         'regions',
}

export const ENTITY_TYPE_CONFIG: Record<EntityType, {
  label: string
  plural: string
  color: string
  defaultIcon: string
}> = {
  session:        { label: 'Session',      plural: 'Sessions',      color: '#b87de8', defaultIcon: 'gi-book-aura' },
  note:           { label: 'Note',         plural: 'Notes',         color: '#6b9fe8', defaultIcon: 'gi-scroll-unfurled' },
  npc:            { label: 'NPC',          plural: 'NPCs',          color: '#7cc44e', defaultIcon: 'gi-person' },
  location:       { label: 'Location',     plural: 'Locations',     color: '#a87de8', defaultIcon: 'gi-castle' },
  faction:        { label: 'Faction',      plural: 'Factions',      color: '#e05555', defaultIcon: 'gi-american-shield' },
  quest:          { label: 'Quest',        plural: 'Quests',        color: '#e8924a', defaultIcon: 'gi-holy-grail' },
  event:          { label: 'Event',        plural: 'Events',        color: '#4ab8e8', defaultIcon: 'gi-sands-of-time' },
  'random-table': { label: 'Random Table', plural: 'Random Tables', color: '#e8c44a', defaultIcon: 'gi-dice-six-faces-six' },
  rumor:          { label: 'Rumor',        plural: 'Rumors',        color: '#c86fa8', defaultIcon: 'gi-speaker' },
  region:         { label: 'Region',       plural: 'Regions',       color: '#5fc98a', defaultIcon: 'gi-forest' },
}

/** Pre-built list from ENTITY_TYPE_CONFIG + ENTITY_TYPE_ROUTE. Import this instead of re-deriving in each component. */
export const ENTITY_TYPE_LIST = (Object.keys(ENTITY_TYPE_CONFIG) as EntityType[]).map(key => ({
  key,
  label:   ENTITY_TYPE_CONFIG[key].plural,
  segment: ENTITY_TYPE_ROUTE[key],
  color:   ENTITY_TYPE_CONFIG[key].color,
  icon:    ENTITY_TYPE_CONFIG[key].defaultIcon,
}))

// Note icon picker — all verified to exist
export const NOTE_ICONS = [
  { name: 'gi-scroll-unfurled', label: 'Scroll' },
  { name: 'gi-book-aura',       label: 'Lore' },
  { name: 'gi-death-note',      label: 'Secret' },
  { name: 'gi-magic-hat',       label: 'Magic' },
  { name: 'gi-house-keys',      label: 'Key' },
  { name: 'gi-sands-of-time',   label: 'Timeline' },
  { name: 'gi-all-seeing-eye',  label: 'Mystery' },
  { name: 'gi-castle',          label: 'Location' },
  { name: 'gi-coins',           label: 'Treasure' },
  { name: 'gi-broadsword',      label: 'Combat' },
]
