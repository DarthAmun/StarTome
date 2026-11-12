/**
 * Shared pieces of the legacy conversion (services/v042/convert.ts): reading
 * v0.42's loosely typed rows, the old-id → new-id maps, images and the report.
 */
import type { IdSource } from '@/domain/ids'
import type { CollectionName, ImageRef } from '@/domain/schema'

export type Row = Record<string, unknown>

/** A v0.42 backup or campaign file (`version: 2`), or the same rows read from its database. */
export interface LegacyPayload {
  version?: number
  app?: string
  type?: string
  exportedAt?: string
  images?: { id: string; mime?: string; data?: string }[]
  localState?: Record<string, string>
  [table: string]: unknown
}

/** An image that sat in a row as a data URL; the caller turns `dataUrl` into a blob. */
export interface InlineImage { id: string; dataUrl: string }

export interface TableReport { read: number; converted: number; dropped: number }

export interface LegacyReport {
  tables: Record<string, TableReport>
  /** Rows that were repaired or left out, and why. */
  notes: string[]
}

export const LEGACY_TABLES = [
  'campaigns', 'entities', 'tokens', 'mapAssets', 'encounters', 'encounterTokens', 'encounterWalls', 'entityLinks',
  'entitySnapshots', 'entityConnections', 'graphLayouts', 'characters', 'levelUps', 'xpAwards', 'treasureAwards',
  'inventory', 'purses', 'starships', 'sessionPanels', 'soundTracks', 'soundPlaylists', 'rules', 'rulesOverlays', 'syncState',
] as const
export type LegacyTable = (typeof LEGACY_TABLES)[number]

export type IdMap = Map<number, string>

export interface Ctx {
  ids: IdSource
  now: string
  payload: LegacyPayload
  map: Record<'camp' | 'ent' | 'tok' | 'enc' | 'encTok' | 'chr' | 'inv' | 'ship' | 'track' | 'list' | 'xp' | 'lvl' | 'treasure' | 'graph' | 'asset', IdMap>
  /** Session panel uid → new id. */
  panel: Map<string, string>
  /** Old entity id → its type and campaign. */
  entType: Map<number, string>
  entCampaign: Map<number, number>
  out: Partial<Record<CollectionName, unknown[]>>
  inline: InlineImage[]
  /** Image-store ids some converted row points at. */
  imageIds: Set<string>
  report: LegacyReport
}

// ── Reading loose values ───────────────────────────────────────────────────

/** A structured column: v0.42 rows hold values, older rows and DM's Tome files JSON text. */
export function parsed(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const t = v.trim()
  if (!t || (t[0] !== '{' && t[0] !== '[')) return v
  try { return JSON.parse(t) } catch { return v }
}

export function obj(v: unknown): Row {
  const p = parsed(v)
  return p && typeof p === 'object' && !Array.isArray(p) ? p as Row : {}
}

export function arr(v: unknown): unknown[] {
  const p = parsed(v)
  return Array.isArray(p) ? p : []
}

export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback
}

export function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = num(v, Number.NaN)
  return Number.isNaN(n) ? null : n
}

/** v0.42 mixes 0|1 and real booleans. */
export function bool(v: unknown, fallback = false): boolean {
  if (v === undefined || v === null) return fallback
  return v === true || v === 1 || v === '1' || v === 'true'
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v as T : null
}

export function rowsOf(ctx: Ctx, table: LegacyTable): Row[] {
  const list = ctx.payload[table]
  return Array.isArray(list) ? list.filter((r): r is Row => !!r && typeof r === 'object') : []
}

// ── Ids, images, report ────────────────────────────────────────────────────

export function mapped(m: IdMap, oldId: unknown): string | null {
  const n = numOrNull(oldId)
  return n === null ? null : m.get(n) ?? null
}

/** Gives every row of a table its new id up front, so any row can point at any other. */
export function allocate(ctx: Ctx, table: LegacyTable, m: IdMap): void {
  for (const r of rowsOf(ctx, table)) {
    const id = numOrNull(r.id)
    if (id !== null && !m.has(id)) m.set(id, ctx.ids())
  }
}

const IMG_REF = /^img:(.+)$/

/** `img:<id>`, a web address or (old rows) a data URL → an image reference. */
export function imageRef(ctx: Ctx, v: unknown): ImageRef | null {
  if (typeof v !== 'string' || !v) return null
  const m = IMG_REF.exec(v)
  if (m?.[1]) { ctx.imageIds.add(m[1]); return { imageId: m[1] } }
  if (v.startsWith('data:')) {
    const id = ctx.ids()
    ctx.inline.push({ id, dataUrl: v })
    ctx.imageIds.add(id)
    return { imageId: id }
  }
  return { url: v }
}

/** Notes `img:<id>` strings anywhere inside a value that is carried over as it is (battle maps, rules). */
export function noteImageIds(ctx: Ctx, value: unknown): void {
  if (typeof value === 'string') {
    const m = IMG_REF.exec(value)
    if (m?.[1]) ctx.imageIds.add(m[1])
  } else if (Array.isArray(value)) {
    for (const v of value) noteImageIds(ctx, v)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) noteImageIds(ctx, v)
  }
}

export function push(ctx: Ctx, collection: CollectionName, row: unknown): void {
  (ctx.out[collection] ??= []).push(row)
}

export function tally(ctx: Ctx, table: string): TableReport {
  return (ctx.report.tables[table] ??= { read: 0, converted: 0, dropped: 0 })
}

export function dropped(ctx: Ctx, table: string, row: Row, why: string): void {
  tally(ctx, table).dropped++
  ctx.report.notes.push(`${table} #${str(row.id, '?')}${row.name ? ` “${str(row.name)}”` : ''}: left out, ${why}`)
}

export function note(ctx: Ctx, text: string): void {
  ctx.report.notes.push(text)
}

export function iso(v: unknown, fallback: string): string {
  return typeof v === 'string' && v ? v : fallback
}
