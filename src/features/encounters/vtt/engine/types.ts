/**
 * What the map engine draws. A scene is plain data: the GM window and the
 * players' window feed the same engine different projections of one encounter.
 * The engine knows nothing of Vue or the database.
 */
import type { HealthState } from '@/domain/rules/conditions'
import type { Point, Wall, WallKind } from '@/domain/rules/walls'

export interface Grid { size: number; offsetX: number; offsetY: number }
export interface Viewport { x: number; y: number; scale: number }
export interface Cell { col: number; row: number }

export interface SceneToken {
  id: string
  name: string
  /** A URL the browser can load, or null for the initial. */
  image: string | null
  x: number
  y: number
  size: number
  visible: boolean
  dead: boolean
  /** On the party's side: teal ring instead of red. */
  party: boolean
  /** HP as a share of the maximum, for the arc; null = not drawn. */
  hp: number | null
  /** Temporary HP as a share of the maximum. */
  temp: number
  /** Shades a wounded enemy in the players' window. */
  health: HealthState | null
  conditions: { color: number; hidden: boolean }[]
  /** Turns left of each timer shown; 0 = it is up. */
  timers: number[]
  elevation: number | null
}

/** An area as drawn: its squares ("col,row") and colour. */
export interface SceneArea { id: string; cells: string[]; color: number }

export type Tool = 'select' | 'fog' | 'measure' | 'area' | 'wall' | 'ping'

export interface EngineHandlers {
  tool(): Tool
  fogBrush?(): { size: number; hide: boolean }
  wallKind?(): WallKind
  onTokenMoved?(id: string, x: number, y: number): void
  onTokenClick?(id: string): void
  /** Right-click: on a token, a wall, an area, or the bare map (all null). Screen position for the menu. */
  onContext?(hit: { tokenId: string | null; wallId: string | null; areaId: string | null; cell: Cell }, clientX: number, clientY: number): void
  onFogPaint?(keys: string[], hide: boolean): void
  onWallDone?(points: Point[], kind: WallKind): void
  onDoorToggle?(wallId: string): void
  onPing?(col: number, row: number, focus: boolean): void
  /** The squares to preview with the pointer at `at` (half squares), after an optional first click at `anchor`. */
  areaDraft?(anchor: Cell | null, at: Cell): SceneArea | null
  /** Area tool click. True when the click set the first point and a second is needed. */
  onAreaClick?(anchor: Cell | null, at: Cell): boolean
  onViewport?(v: Viewport): void
}

export interface FovView {
  /** What can be seen; everything else is darkened. Empty = no darkness. */
  lit: Point[][]
  /** Outlines drawn over the map (the active token's sight). */
  outlines: Point[][]
}

export type { Point, Wall, WallKind }
