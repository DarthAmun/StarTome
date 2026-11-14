/** The Desk's widgets: what kinds there are, their sizes, and the layouts kept with the campaign. */
import { newId } from '@/domain/ids'
import type { EntryType } from '@/domain/schema'

export const TOOL_KINDS = ['scratchpad', 'encounter-link', 'conditions-grid', 'dc-table', 'timer', 'rules-lookup', 'rules-entry', 'npc-generator', 'weather'] as const
export type ToolKind = (typeof TOOL_KINDS)[number]
export const ENTRY_KINDS: EntryType[] = ['session', 'npc', 'location', 'faction', 'quest', 'event', 'note', 'rumor', 'random-table']
export type WidgetKind = ToolKind | EntryType

export interface DeskWidget {
  id: string
  kind: WidgetKind
  entryId?: string | null
  rulesId?: string
  encounterId?: string | null
  x: number
  y: number
  width: number
  height: number
  config?: Record<string, unknown>
}
export interface DeskPreset { name: string; widgets: DeskWidget[] }

export const TOOL_LABEL: Record<ToolKind, string> = {
  scratchpad: 'Scratchpad', 'encounter-link': 'Encounters', 'conditions-grid': 'Conditions', 'dc-table': 'DCs', timer: 'Timer',
  'rules-lookup': 'Compendium lookup', 'rules-entry': 'Compendium entry', 'npc-generator': 'NPC generator', weather: 'Weather',
}
/** Tools that make sense once on a board. */
export const SINGLETONS: ToolKind[] = ['scratchpad', 'encounter-link', 'conditions-grid', 'dc-table', 'timer', 'rules-lookup', 'npc-generator', 'weather']
const SIZES: Partial<Record<WidgetKind, [number, number]>> = {
  scratchpad: [600, 168], 'encounter-link': [384, 240], 'conditions-grid': [576, 240], 'dc-table': [432, 264], timer: [336, 192], 'rules-lookup': [432, 336],
  'rules-entry': [456, 480], 'npc-generator': [432, 264], weather: [336, 216], session: [600, 264], location: [480, 264], note: [480, 240], 'random-table': [432, 264],
}
export const SNAP = 24
export const snap = (v: number) => Math.round(v / SNAP) * SNAP
export const isTool = (k: string): k is ToolKind => (TOOL_KINDS as readonly string[]).includes(k)

/** Layouts read back from the workspace (also those imported from v0.42): anything that is not a widget is dropped. */
export function readWidgets(raw: unknown): DeskWidget[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((w): w is DeskWidget => !!w && typeof w === 'object' && typeof (w as DeskWidget).kind === 'string' && (isTool((w as DeskWidget).kind) || ENTRY_KINDS.includes((w as DeskWidget).kind as EntryType)))
    .map(w => ({ ...w, id: typeof w.id === 'string' ? w.id : newId(), x: Number(w.x) || 0, y: Number(w.y) || 0, width: Math.max(168, Number(w.width) || 384), height: Math.max(96, Number(w.height) || 192) }))
}
export function readPresets(raw: unknown): DeskPreset[] {
  return Array.isArray(raw) ? raw.filter(p => p && typeof p.name === 'string').map(p => ({ name: String(p.name), widgets: readWidgets(p.widgets) })) : []
}

/** A free place for a new widget: the first spot, row by row, that overlaps nothing. */
export function freeSpot(widgets: DeskWidget[], width: number, height: number): { x: number; y: number } {
  const hits = (x: number, y: number) => widgets.some(w => x < w.x + w.width + SNAP && x + width + SNAP > w.x && y < w.y + w.height + SNAP && y + height + SNAP > w.y)
  for (let y = 0; y < 4800; y += SNAP * 2) for (let x = 0; x <= 1440; x += SNAP * 2) if (!hits(x, y)) return { x, y }
  return { x: 0, y: Math.max(0, ...widgets.map(w => w.y + w.height)) + SNAP }
}

export function newWidget(kind: WidgetKind, widgets: DeskWidget[], extra: Partial<DeskWidget> = {}): DeskWidget {
  const [width, height] = SIZES[kind] ?? [384, 192]
  return { id: newId(), kind, ...freeSpot(widgets, width, height), width, height, ...extra }
}

/** A starting board: what a GM reaches for at the table. */
export function defaultLayout(): DeskWidget[] {
  const out: DeskWidget[] = []
  for (const k of ['scratchpad', 'encounter-link', 'dc-table', 'conditions-grid', 'timer', 'rules-lookup'] as ToolKind[]) out.push(newWidget(k, out))
  return out
}

/** Packs the widgets into rows, widest first, without changing their sizes. */
export function tidy(widgets: DeskWidget[]): DeskWidget[] {
  const out: DeskWidget[] = []
  for (const w of [...widgets].sort((a, b) => b.height - a.height || b.width - a.width)) out.push({ ...w, ...freeSpot(out, w.width, w.height) })
  return out
}
