import { useEntities } from '~/composables/useEntities'
import type { Entity } from '~/composables/useEntities'
import type { EntityType } from '~/types/entities'
import {
  ENTITY_TYPE_CONFIG, normalizePolygon,
  QUEST_STATUS_COLORS, SESSION_MODE_COLORS, RUMOR_STATUS_COLORS, EVENT_SIGNIFICANCE_COLORS,
} from '~/types/entities'
import { ENTITY_REGEX } from '~/composables/useEntityParser'
import { useFormatters } from '~/composables/useFormatters'
import { cap as capRaw } from '~/composables/useNameGenerator'
import { lsKey } from '~/utils/appNamespace'

// ═══════════════════════════════════════════════════════════════════════════
// Entity browsing — one shared query per entity type, read by both the
// overview (gallery / compact / table) and the list column, so opening an
// entry keeps the list filtered to what was being browsed.
// ═══════════════════════════════════════════════════════════════════════════

export type ChipKind = 'good' | 'bad' | 'mute' | 'info' | 'warn' | 'ghost'
export type MediaKind = 'portrait' | 'banner' | 'emblem' | 'swatch' | 'band'
export type Density = 'gallery' | 'compact' | 'table'
export type ArchiveMode = 'show' | 'dim' | 'hide'

/** Everything derived from an entity that the overview renders. */
export interface BrowseItem {
  entity: Entity
  id: number
  name: string
  initial: string
  meta: string
  chip: string
  chipKind: ChipKind
  chipColor: string | null    // app-wide status colour, when the type has one
  badge: string
  image: string | null
  swatch: string | null
  polygon: string | null      // SVG points for regions (viewBox 0 0 160 90)
  bandText: string
  icon: string
  archived: boolean
  favorite: boolean
  progress: { done: number; total: number } | null
  sub: string                 // default secondary text (e.g. "seen S12")
  peekFacts: Array<{ k: string; v: string }>
  values: Record<string, string | string[]>   // group / filter / column values
  hay: string
  updatedAt: string
  createdAt: string
}

type Built = Omit<BrowseItem, 'entity' | 'id' | 'name' | 'initial' | 'favorite' | 'hay' | 'updatedAt' | 'createdAt' | 'icon' | 'chipColor'>
  & { icon?: string; chipColor?: string | null }

interface FieldDef { key: string; label: string; align?: 'right'; weight?: number }

interface TypeDef {
  media: MediaKind
  aspect: string
  cardMin: number
  creatable: boolean
  archive: string | null      // label for the archived state ("Dead"), null = type has none
  archiveGlyph?: string       // marker shown on archived cards
  statusLabel: string
  groups: FieldDef[]
  defGroup: string
  filters: FieldDef[]
  cols: FieldDef[]
  views?: Array<{ path: string; label: string }>   // extra pages, relative to the campaign root
  order?: Record<string, string[]>
  defSort?: string
  defDir?: 1 | -1
  build: (e: Entity, ctx: BuildCtx) => Built
}

interface Relations { factions: string[]; locations: string[]; lastSession: number | null; members: number }
interface BuildCtx {
  rel: Relations
  nameById: Map<number, string>
  regionsByLocation: Map<number, number>
}

const cap = (s: string) => s ? capRaw(s) : s
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v)).trim()
const F = (k: string, v: unknown) => ({ k, v: str(v) || '—' })
const { formatDate } = useFormatters()
const collator = new Intl.Collator(undefined, { numeric: true })

function statusKind(s: string): ChipKind {
  const l = s.toLowerCase()
  if (/friend|ally|allied/.test(l)) return 'good'
  if (/hostile|enemy/.test(l)) return 'bad'
  if (/neutral/.test(l)) return 'mute'
  return 'ghost'
}

/** Counts markdown task-list items — used as quest objectives. */
function taskProgress(content: string) {
  const all = content.match(/^\s*[-*] \[[ xX]\]/gm)
  if (!all?.length) return null
  const done = content.match(/^\s*[-*] \[[xX]\]/gm)?.length ?? 0
  return { done, total: all.length }
}

export function plainExcerpt(md: string, max = 240): string {
  const text = md
    .replace(/\[![\w-]+\]/g, '')                 // callout markers
    .replace(ENTITY_REGEX, '$2')                 // {{type: name @ snap | meta}} → name
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/[*_`>#~|]/g, '')
    .replace(/^\s*[-+]\s+(\[[ xX]\]\s*)?/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? text.slice(0, max).replace(/\s\S*$/, '') + '…' : text
}

/** Comparator honouring a preferred value order, then natural sort. */
function byOrder(order?: string[]) {
  const rank = (v: string) => { const i = order?.indexOf(v) ?? -1; return i < 0 ? Infinity : i }
  return (a: string, b: string) => (rank(a) - rank(b)) || collator.compare(a, b)
}

// ── Per-type definitions ────────────────────────────────────────────────────
export const BROWSE_TYPES: Record<EntityType, TypeDef> = {
  npc: {
    media: 'portrait', aspect: '4 / 5', cardMin: 164, creatable: true, archive: 'Dead', archiveGlyph: '☠', statusLabel: 'Status',
    groups: [{ key: 'status', label: 'Status' }, { key: 'race', label: 'Race' }, { key: 'role', label: 'Class / Role' }, { key: 'faction', label: 'Faction' }, { key: 'location', label: 'Location' }, { key: 'kind', label: 'PC / NPC' }],
    defGroup: 'none',
    filters: [{ key: 'status', label: 'Status' }, { key: 'race', label: 'Race' }, { key: 'role', label: 'Class' }, { key: 'level', label: 'Level' }, { key: 'faction', label: 'Faction' }, { key: 'location', label: 'Location' }],
    cols: [{ key: 'title', label: 'Title', weight: 1.3 }, { key: 'race', label: 'Race', weight: .8 }, { key: 'role', label: 'Class', weight: .8 }, { key: 'faction', label: 'Faction', weight: 1.2 }, { key: 'location', label: 'Location', weight: 1.1 }, { key: 'level', label: 'Lv', weight: .35, align: 'right' }],
    order: { status: ['Friendly', 'Neutral', 'Unknown', 'Hostile'], kind: ['Player Character', 'NPC'] },
    build(e, { rel }) {
      const a = e.attributes as any
      const status = cap(str(a.status)) || 'Unknown'
      const dead = a.isAlive === false
      const level = str(a.level)
      return {
        meta: [a.title, a.race, a.role].map(str).filter(Boolean).join(' · '),
        chip: dead ? 'Dead' : status, chipKind: dead ? 'mute' : statusKind(status),
        badge: level ? `Lv ${level}` : '', image: a.portraitSource || null, swatch: null, polygon: null, bandText: '',
        archived: dead, progress: null,
        sub: rel.lastSession != null ? `seen S${rel.lastSession}` : '',
        peekFacts: [F('Faction', rel.factions.join(', ')), F('Location', rel.locations.join(', ')), F('Last seen', rel.lastSession != null ? `Session ${rel.lastSession}` : 'Not yet met')],
        values: {
          status, race: str(a.race), role: str(a.role), level, title: str(a.title),
          faction: rel.factions, location: rel.locations,
          kind: a.isPlayerCharacter ? 'Player Character' : 'NPC',
        },
      }
    },
  },
  location: {
    media: 'banner', aspect: '16 / 10', cardMin: 236, creatable: true, archive: 'Destroyed', statusLabel: 'Discovery',
    groups: [{ key: 'type', label: 'Type' }, { key: 'status', label: 'Discovery' }],
    defGroup: 'type',
    filters: [{ key: 'type', label: 'Type' }, { key: 'status', label: 'Discovery' }],
    cols: [{ key: 'type', label: 'Type', weight: .8 }, { key: 'pins', label: 'Map pins', weight: .6, align: 'right' }, { key: 'regions', label: 'Regions', weight: .6, align: 'right' }],
    order: { status: ['Discovered', 'Undiscovered', 'Destroyed'], type: ['City', 'Building', 'Dungeon', 'Wilderness', 'Region', 'Other'] },
    build(e, { regionsByLocation }) {
      const a = e.attributes as any
      const type = cap(str(a.locationType))
      const status = cap(str(a.status))
      const pins = Array.isArray(a.mapPins) ? a.mapPins.length : 0
      const regions = regionsByLocation.get(e.id) ?? 0
      return {
        meta: [type, a.imageSource ? 'has map' : ''].filter(Boolean).join(' · '),
        chip: status || 'Unknown', chipKind: status === 'Discovered' ? 'good' : status === 'Destroyed' ? 'bad' : 'ghost',
        badge: '', image: a.logoSource || a.imageSource || null, swatch: null, polygon: null, bandText: '',
        archived: a.status === 'destroyed', progress: null,
        sub: pins ? `${pins} pin${pins === 1 ? '' : 's'}` : type,
        peekFacts: [F('Type', type), F('Map pins', pins), F('Regions', regions)],
        values: { type, status, pins: String(pins), regions: String(regions) },
      }
    },
  },
  faction: {
    media: 'emblem', aspect: '4 / 3', cardMin: 190, creatable: true, archive: null, statusLabel: 'Type',
    groups: [{ key: 'type', label: 'Type' }, { key: 'size', label: 'Size' }, { key: 'secret', label: 'Visibility' }],
    defGroup: 'none',
    filters: [{ key: 'type', label: 'Type' }, { key: 'size', label: 'Size' }, { key: 'secret', label: 'Visibility' }],
    cols: [{ key: 'size', label: 'Size', weight: .7 }, { key: 'hq', label: 'Headquarters', weight: 1.2 }, { key: 'members', label: 'Members', weight: .6, align: 'right' }],
    order: { size: ['Small', 'Medium', 'Large', 'Massive'], secret: ['Public', 'Secret'] },
    build(e, { rel }) {
      const a = e.attributes as any
      const type = cap(str(a.factionType))
      const size = cap(str(a.size))
      return {
        meta: [size, a.headquartersName ? `@ ${a.headquartersName}` : ''].filter(Boolean).join(' · '),
        chip: type || 'Faction', chipKind: 'mute',
        badge: a.isSecret ? 'Secret' : '', image: a.imageSource || null, swatch: null, polygon: null, bandText: '',
        archived: false, progress: null,
        sub: rel.members ? `${rel.members} member${rel.members === 1 ? '' : 's'}` : '',
        peekFacts: [F('Headquarters', a.headquartersName), F('Size', size), F('Members', rel.members)],
        values: { type, size, hq: str(a.headquartersName), members: String(rel.members), secret: a.isSecret ? 'Secret' : 'Public' },
      }
    },
  },
  quest: {
    media: 'band', aspect: '', cardMin: 236, creatable: true, archive: 'Closed', statusLabel: 'Status',
    groups: [{ key: 'status', label: 'Status' }, { key: 'giver', label: 'Quest giver' }],
    defGroup: 'status',
    filters: [{ key: 'status', label: 'Status' }, { key: 'giver', label: 'Given by' }],
    cols: [{ key: 'giver', label: 'Given by', weight: 1.2 }, { key: 'reward', label: 'Reward', weight: .8 }, { key: 'progress', label: 'Objectives', weight: .5, align: 'right' }],
    order: { status: ['Active', 'Dormant', 'Completed', 'Failed'] },
    build(e) {
      const a = e.attributes as any
      const raw = str(a.status) || 'active'
      const status = cap(raw)
      const giver = str(a.questGiver)
      const progress = taskProgress(e.content)
      const objectives = progress ? `${progress.done} of ${progress.total}` : ''
      return {
        meta: giver ? `Given by ${giver}` : 'No quest giver',
        chip: status, chipKind: 'mute', chipColor: QUEST_STATUS_COLORS[raw],
        badge: '', image: null, swatch: null, polygon: null,
        bandText: a.reward ? `REWARD · ${str(a.reward).toUpperCase()}` : status.toUpperCase(),
        archived: raw === 'completed' || raw === 'failed', progress,
        sub: progress ? `${progress.done}/${progress.total} objectives` : '',
        peekFacts: [F('Given by', giver), F('Reward', a.reward), F('Objectives', objectives)],
        values: { status, giver, reward: str(a.reward), progress: progress ? `${progress.done}/${progress.total}` : '' },
      }
    },
  },
  event: {
    media: 'band', aspect: '', cardMin: 236, creatable: true, archive: null, statusLabel: 'Significance',
    groups: [{ key: 'significance', label: 'Significance' }, { key: 'location', label: 'Location' }],
    defGroup: 'none',
    filters: [{ key: 'significance', label: 'Significance' }, { key: 'location', label: 'Location' }],
    cols: [{ key: 'date', label: 'Date', weight: .8 }, { key: 'location', label: 'Location', weight: 1.2 }],
    views: [{ path: 'events/timeline', label: 'Timeline' }],
    order: { significance: ['Critical', 'Major', 'Minor'] },
    build(e) {
      const a = e.attributes as any
      const raw = str(a.significance)
      const sig = cap(raw)
      return {
        meta: [a.date, a.location ? `@ ${a.location}` : ''].map(str).filter(Boolean).join(' · '),
        chip: sig || 'Event', chipKind: 'mute', chipColor: EVENT_SIGNIFICANCE_COLORS[raw],
        badge: '', image: null, swatch: null, polygon: null, bandText: str(a.date).toUpperCase() || 'UNDATED',
        archived: false, progress: null, sub: str(a.location),
        peekFacts: [F('Date', a.date), F('Location', a.location)],
        values: { significance: sig, location: str(a.location), date: str(a.date) },
      }
    },
  },
  session: {
    media: 'band', aspect: '', cardMin: 236, creatable: true, archive: null, statusLabel: 'Mode',
    groups: [{ key: 'mode', label: 'Mode' }],
    defGroup: 'none',
    filters: [{ key: 'mode', label: 'Mode' }],
    cols: [{ key: 'number', label: '#', weight: .3, align: 'right' }, { key: 'date', label: 'Date', weight: .8 }],
    views: [{ path: 'sessions/log', label: 'Session Log' }],
    order: { mode: ['Running', 'Planning', 'Finished'] },
    defSort: 'number', defDir: -1,
    build(e) {
      const a = e.attributes as any
      const raw = str(a.mode) || 'planning'
      const mode = cap(raw)
      const n = str(a.sessionNumber)
      const date = str(a.date)
      return {
        meta: formatDate(date) || 'No date',
        chip: mode, chipKind: 'mute', chipColor: SESSION_MODE_COLORS[raw],
        badge: n ? `#${n}` : '', image: null, swatch: null, polygon: null, bandText: n ? `SESSION ${n}` : 'SESSION',
        archived: false, progress: null, sub: '',
        peekFacts: [F('Session', n), F('Date', formatDate(date))],
        values: { mode, number: n, date },
      }
    },
  },
  note: {
    media: 'band', aspect: '', cardMin: 220, creatable: true, archive: null, statusLabel: 'Tag',
    groups: [{ key: 'tag', label: 'First tag' }],
    defGroup: 'none',
    filters: [{ key: 'tags', label: 'Tags' }],
    cols: [{ key: 'tagList', label: 'Tags', weight: 1.6 }],
    build(e) {
      const a = e.attributes as any
      const tags: string[] = Array.isArray(a.tags) ? a.tags.map(str).filter(Boolean) : []
      return {
        meta: tags.length ? tags.map(t => `#${t}`).join(' ') : 'Untagged',
        chip: tags[0] ?? 'Note', chipKind: tags.length ? 'info' : 'ghost',
        badge: '', image: null, swatch: null, polygon: null, bandText: tags.length ? `${tags.length} TAG${tags.length === 1 ? '' : 'S'}` : 'NOTE',
        icon: a.icon || undefined,
        archived: false, progress: taskProgress(e.content), sub: '',
        peekFacts: [F('Tags', tags.join(', '))],
        values: { tags, tag: tags[0] ?? '', tagList: tags.join(', ') },
      }
    },
  },
  'random-table': {
    media: 'band', aspect: '', cardMin: 220, creatable: true, archive: null, statusLabel: 'Die',
    groups: [{ key: 'die', label: 'Die' }],
    defGroup: 'none',
    filters: [{ key: 'die', label: 'Die' }, { key: 'tags', label: 'Tags' }],
    cols: [{ key: 'rows', label: 'Rows', weight: .5, align: 'right' }, { key: 'tagList', label: 'Tags', weight: 1.4 }],
    order: { die: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] },
    build(e) {
      const a = e.attributes as any
      const rows = Array.isArray(a.rows) ? a.rows.length : 0
      const tags: string[] = Array.isArray(a.tags) ? a.tags.map(str).filter(Boolean) : []
      const die = str(a.die) || 'd20'
      return {
        meta: `${rows} row${rows === 1 ? '' : 's'}${tags.length ? ' · ' + tags.join(', ') : ''}`,
        chip: die, chipKind: 'warn',
        badge: '', image: null, swatch: null, polygon: null, bandText: `ROLL ${die.toUpperCase()}`,
        archived: false, progress: null, sub: '',
        peekFacts: [F('Die', die), F('Rows', rows)],
        values: { die, rows: String(rows), tags, tagList: tags.join(', ') },
      }
    },
  },
  rumor: {
    media: 'band', aspect: '', cardMin: 220, creatable: true, archive: 'False', statusLabel: 'Status',
    groups: [{ key: 'status', label: 'Status' }, { key: 'source', label: 'Source' }],
    defGroup: 'none',
    filters: [{ key: 'statuses', label: 'Status' }, { key: 'source', label: 'Source' }, { key: 'tags', label: 'Tags' }],
    cols: [{ key: 'source', label: 'Source', weight: 1.2 }, { key: 'tagList', label: 'Tags', weight: 1 }],
    order: { status: ['Unheard', 'Heard', 'Revealed', 'False'], statuses: ['unheard', 'heard', 'revealed', 'false'] },
    build(e) {
      const a = e.attributes as any
      const statuses: string[] = Array.isArray(a.statuses) ? a.statuses.map(str).filter(Boolean) : []
      const latest = statuses[statuses.length - 1] ?? 'unheard'
      const tags: string[] = Array.isArray(a.tags) ? a.tags.map(str).filter(Boolean) : []
      return {
        meta: a.source ? `From ${a.source}` : 'Unknown source',
        chip: cap(latest), chipKind: 'ghost', chipColor: RUMOR_STATUS_COLORS[latest],
        badge: '', image: null, swatch: null, polygon: null, bandText: statuses.map(s => s.toUpperCase()).join(' · ') || 'UNHEARD',
        archived: statuses.includes('false'), progress: null, sub: '',
        peekFacts: [F('Source', a.source), F('Tags', tags.join(', '))],
        values: { statuses, status: cap(latest), source: str(a.source), tags, tagList: tags.join(', ') },
      }
    },
  },
  region: {
    media: 'swatch', aspect: '16 / 9', cardMin: 220, creatable: false, archive: null, statusLabel: 'Map',
    groups: [{ key: 'map', label: 'Map' }],
    defGroup: 'none',
    filters: [{ key: 'map', label: 'Map' }],
    cols: [{ key: 'map', label: 'Map', weight: 1.2 }, { key: 'vertices', label: 'Vertices', weight: .5, align: 'right' }],
    views: [{ path: 'map', label: 'World Map' }],
    build(e, { nameById }) {
      const a = e.attributes as any
      const parent = a.locationEntityId ? nameById.get(a.locationEntityId) ?? 'Unknown map' : 'World Map'
      const pts = Array.isArray(a.polygon) ? a.polygon : []
      const poly = pts.length > 2 ? normalizePolygon(pts, 160, 90, 10).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') : null
      return {
        meta: `On ${parent}`,
        chip: parent, chipKind: 'mute',
        badge: '', image: null, swatch: a.color || ENTITY_TYPE_CONFIG.region.color, polygon: poly, bandText: '',
        archived: false, progress: null, sub: '',
        peekFacts: [F('Map', parent), F('Vertices', pts.length)],
        values: { map: parent, vertices: String(pts.length) },
      }
    },
  },
}

// ── Relations (links, map pins, session mentions) — NPC / faction only ──────
const EMPTY_REL: Relations = { factions: [], locations: [], lastSession: null, members: 0 }

function buildRelations(store: ReturnType<typeof useEntities>) {
  const byId = new Map<number, Entity>(store.entities.map(e => [e.id, e]))
  const byTypeName = new Map<string, Entity>(store.entities.map(e => [`${e.type}:${e.name.toLowerCase()}`, e]))
  const rel = new Map<number, Relations>()
  const get = (id: number) => {
    let r = rel.get(id)
    if (!r) { r = { factions: [], locations: [], lastSession: null, members: 0 }; rel.set(id, r) }
    return r
  }
  const addUnique = (arr: string[], v: string) => { if (!arr.includes(v)) arr.push(v) }

  for (const l of store.links) {
    const src = byId.get(l.sourceId)
    const tgt = byTypeName.get(`${l.targetType}:${l.targetName.toLowerCase()}`)
    if (!src || !tgt) continue
    // NPC ↔ faction / location, whichever side mentions the other
    for (const [a, b] of [[src, tgt], [tgt, src]] as const) {
      if (a.type !== 'npc') continue
      if (b.type === 'faction') addUnique(get(a.id).factions, b.name)
      if (b.type === 'location') addUnique(get(a.id).locations, b.name)
    }
    if (src.type === 'session') {
      const n = parseInt(String((src.attributes as any).sessionNumber ?? ''), 10)
      if (Number.isFinite(n)) {
        const r = get(tgt.id)
        r.lastSession = Math.max(r.lastSession ?? n, n)
      }
    }
  }
  // Locations whose map carries a pin for the NPC
  for (const loc of store.byType.location ?? []) {
    for (const pin of ((loc.attributes as any).mapPins ?? []) as Array<{ entityId: number }>) {
      const target = byId.get(pin.entityId)
      if (target?.type === 'npc') addUnique(get(target.id).locations, loc.name)
    }
  }
  // Faction member counts
  const factionIds = new Map((store.byType.faction ?? []).map(e => [e.name, e.id]))
  for (const r of rel.values()) {
    for (const f of r.factions) {
      const fid = factionIds.get(f)
      if (fid) get(fid).members++
    }
  }
  return rel
}

// ── Shared state + derived data, one instance per type ──────────────────────
interface Prefs {
  density: Density
  groupBy: string
  sort: string
  dir: 1 | -1
  archiveMode: ArchiveMode
  listCollapsed: boolean
  collapsedGroups: string[]
}

interface BrowseState extends Prefs {
  query: string
  filters: Record<string, string[]>
  focusSearchTick: number
}

const PREFS_KEY = (t: string) => lsKey(`overview.${t}`)

function loadPrefs(type: EntityType): Prefs {
  const d = BROWSE_TYPES[type]
  const base: Prefs = {
    density: 'gallery', groupBy: d.defGroup, sort: d.defSort ?? 'name', dir: d.defDir ?? 1,
    archiveMode: 'dim', listCollapsed: true, collapsedGroups: [],
  }
  if (!import.meta.client) return base
  try {
    const raw = localStorage.getItem(PREFS_KEY(type))
    return raw ? { ...base, ...JSON.parse(raw) } : base
  } catch { return base }
}

function createBrowse(type: EntityType) {
  const store = useEntities()
  const def = BROWSE_TYPES[type]
  const state = reactive({ ...loadPrefs(type), query: '', filters: {}, focusSearchTick: 0 }) as BrowseState

  watch(() => [state.density, state.groupBy, state.sort, state.dir, state.archiveMode, state.listCollapsed, state.collapsedGroups.join('|')], () => {
    try {
      const { density, groupBy, sort, dir, archiveMode, listCollapsed, collapsedGroups } = state
      localStorage.setItem(PREFS_KEY(type), JSON.stringify({ density, groupBy, sort, dir, archiveMode, listCollapsed, collapsedGroups }))
    } catch { /* storage unavailable — prefs just won't persist */ }
  })

  // Only NPCs and factions show link-derived data
  const relations = computed(() => type === 'npc' || type === 'faction' ? buildRelations(store) : new Map<number, Relations>())
  const nameById = computed(() => type === 'region' ? new Map(store.entities.map(e => [e.id, e.name])) : new Map<number, string>())
  const regionsByLocation = computed(() => {
    const m = new Map<number, number>()
    if (type === 'location') {
      for (const r of store.byType.region ?? []) {
        const loc = (r.attributes as any).locationEntityId
        if (loc) m.set(loc, (m.get(loc) ?? 0) + 1)
      }
    }
    return m
  })

  const allItems = computed<BrowseItem[]>(() => (store.byType[type] ?? []).map(e => {
    const b = def.build(e, { rel: relations.value.get(e.id) ?? EMPTY_REL, nameById: nameById.value, regionsByLocation: regionsByLocation.value })
    return {
      ...b,
      icon: b.icon ?? ENTITY_TYPE_CONFIG[type].defaultIcon,
      chipColor: b.chipColor ?? null,
      entity: e, id: e.id, name: e.name,
      initial: (e.name.replace(/^the\s+/i, '')[0] ?? '?').toUpperCase(),
      favorite: e.isFavorite,
      hay: `${e.name} ${b.meta} ${b.chip} ${Object.values(b.values).flat().join(' ')}`.toLowerCase(),
      updatedAt: e.updatedAt, createdAt: e.createdAt,
    }
  }))

  const itemById = computed(() => new Map(allItems.value.map(i => [i.id, i])))

  const valuesOf = (it: BrowseItem, key: string): string[] => {
    const v = it.values[key]
    return (Array.isArray(v) ? v : [v]).filter(x => x !== undefined && x !== null && x !== '')
  }

  const activeFilterKeys = computed(() => Object.keys(state.filters).filter(k => state.filters[k]?.length))
  const isFiltered = computed(() => !!state.query.trim() || activeFilterKeys.value.length > 0)

  function passes(it: BrowseItem, skipKey?: string) {
    return activeFilterKeys.value.every(k => k === skipKey || valuesOf(it, k).some(v => state.filters[k].includes(v)))
  }

  /** Search + filters applied, archive mode NOT applied (used for counts). */
  const matched = computed(() => {
    const q = state.query.trim().toLowerCase()
    return allItems.value.filter(it => (!q || it.hay.includes(q)) && passes(it))
  })

  const archivedCount = computed(() => matched.value.filter(i => i.archived).length)

  /** Sort key per item, computed once per sort instead of per comparison. */
  function sortKey(it: BrowseItem): string {
    switch (state.sort) {
      case 'name': return it.name
      case 'updated': return it.updatedAt
      case 'created': return it.createdAt
      case 'status': return it.chip
      default: return valuesOf(it, state.sort).join(', ')
    }
  }

  /** Final ordered list shared by overview and list column. */
  const items = computed(() => {
    const base = state.archiveMode === 'hide' ? matched.value.filter(i => !i.archived) : matched.value
    // "Recent" sorts put the newest first when ascending
    const recent = state.sort === 'updated' || state.sort === 'created'
    const dir = state.dir * (recent ? -1 : 1)
    return base
      .map(it => ({ it, k: sortKey(it) }))
      .sort((a, b) => {
        if (!a.k !== !b.k) return a.k ? -1 : 1   // blanks last
        return dir * (collator.compare(a.k, b.k) || collator.compare(a.it.name, b.it.name))
      })
      .map(x => x.it)
  })

  const favorites = computed(() => allItems.value.filter(i => i.favorite).sort((a, b) => collator.compare(a.name, b.name)))

  /** Every value a filter key takes, independent of the current filters. */
  const allValues = computed(() => {
    const out: Record<string, string[]> = {}
    for (const f of def.filters) {
      const set = new Set<string>()
      for (const it of allItems.value) valuesOf(it, f.key).forEach(v => set.add(v))
      out[f.key] = [...set].sort(byOrder(def.order?.[f.key]))
    }
    return out
  })

  /** Pill options for a filter key, with counts that respect the other filters. */
  function filterOptions(key: string) {
    const q = state.query.trim().toLowerCase()
    const counts = new Map<string, number>()
    for (const it of allItems.value) {
      if ((q && !it.hay.includes(q)) || !passes(it, key) || (state.archiveMode === 'hide' && it.archived)) continue
      for (const v of valuesOf(it, key)) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    const sel = state.filters[key] ?? []
    return (allValues.value[key] ?? []).map(v => ({ value: v, count: counts.get(v) ?? 0, selected: sel.includes(v) }))
  }

  function toggleFilter(key: string, value: string) {
    const cur = state.filters[key] ?? []
    state.filters = { ...state.filters, [key]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value] }
  }

  function clearAll() {
    state.query = ''
    state.filters = {}
  }

  const activeChips = computed(() => {
    const chips: Array<{ label: string; remove: () => void }> = []
    if (state.query.trim()) chips.push({ label: `“${state.query.trim()}”`, remove: () => { state.query = '' } })
    for (const k of activeFilterKeys.value) {
      const label = def.filters.find(f => f.key === k)?.label ?? k
      for (const v of state.filters[k]) chips.push({ label: `${label}: ${v}`, remove: () => toggleFilter(k, v) })
    }
    return chips
  })

  /** Group key for an item under the current groupBy ('' = ungrouped). */
  function groupKeyOf(it: BrowseItem): string {
    return valuesOf(it, state.groupBy)[0] ?? ''
  }

  function groupOrder(keys: string[]): string[] {
    const cmp = byOrder(def.order?.[state.groupBy])
    return keys.sort((a, b) => (!a !== !b ? (a ? -1 : 1) : cmp(a, b)))   // "None" last
  }

  async function toggleFavorite(id: number) {
    const e = itemById.value.get(id)?.entity
    if (e) await store.setFavorite(id, !e.isFavorite)
  }

  return {
    def, state,
    allItems, itemById, items, favorites, archivedCount, isFiltered,
    filterOptions, toggleFilter, clearAll, activeChips, activeFilterKeys,
    groupKeyOf, groupOrder, valuesOf, toggleFavorite,
  }
}

type Browse = ReturnType<typeof createBrowse>
const browses = new Map<EntityType, Browse>()
// Detached scope: shared state and its watchers outlive whichever component used them first
const scope = effectScope(true)

export function useEntityBrowse(type: EntityType): Browse {
  let b = browses.get(type)
  if (!b) {
    b = scope.run(() => createBrowse(type))!
    browses.set(type, b)
  }
  return b
}
