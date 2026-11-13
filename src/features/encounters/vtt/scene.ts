/** From the open encounter to what the map engine draws: tokens with loadable pictures, areas as squares, sight. */
import { conditionInfo, getConditionColor, type HealthState } from '@/domain/rules/conditions'
import { visibilityPolygon, wallsToSegments, type Point, type Wall } from '@/domain/rules/walls'
import type { ImageRef } from '@/domain/schema'
import { imageUrlOf } from '@/ui/imageUrl'
import type { FovView, SceneToken } from './engine/types'

export const hexNumber = (hex: string): number => parseInt(hex.replace('#', ''), 16) || 0x7a8fa6
export const conditionColor = (c: { name: string; color?: string }): string => c.color ?? conditionInfo(c.name)?.color ?? getConditionColor(c.name)

export interface SceneSource {
  id: string
  name: string
  image: ImageRef | null
  x: number
  y: number
  size: number
  visible: boolean
  dead: boolean
  party: boolean
  hp: { current: number | null; max: number | null; temp: number } | null
  health: HealthState | null
  conditions: { name: string; color?: string; hidden?: boolean }[]
  timers: number[]
  elevation: number | null
}

/** Pictures are stored blobs: each becomes a URL the engine can load (made once per image). */
export async function toSceneTokens(list: SceneSource[]): Promise<SceneToken[]> {
  const urls = await Promise.all(list.map(t => imageUrlOf(t.image)))
  return list.map((t, i) => ({
    id: t.id, name: t.name, image: urls[i] ?? null, x: t.x, y: t.y, size: t.size, visible: t.visible, dead: t.dead, party: t.party,
    hp: t.hp && t.hp.max && t.hp.current !== null ? t.hp.current / t.hp.max : null, temp: t.hp?.max ? t.hp.temp / t.hp.max : 0,
    health: t.health, conditions: t.conditions.map(c => ({ color: hexNumber(conditionColor(c)), hidden: !!c.hidden })), timers: t.timers, elevation: t.elevation,
  }))
}

interface Seer { id: string; x: number; y: number; size: number; visionRange: number | null; playerToken: boolean }

const sightOf = (t: Seer, walls: Wall[], map: { w: number; h: number } | undefined): Point[] =>
  visibilityPolygon({ x: t.x + t.size / 2, y: t.y + t.size / 2 }, wallsToSegments(walls), t.visionRange ?? Infinity, map)

/**
 * What sight shows. "gm": nothing is darkened, the GM gets the acting token's
 * sight as an outline. "active": only what the acting token sees. "group":
 * what the players' tokens see together.
 */
export function sightFor(enabled: boolean, mode: 'gm' | 'active' | 'group', tokens: Seer[], activeId: string | null, walls: Wall[], map: { w: number; h: number } | undefined, gm: boolean): FovView {
  if (!enabled) return { lit: [], outlines: [] }
  const active = tokens.find(t => t.id === activeId)
  const outline = active ? [sightOf(active, walls, map)] : []
  if (mode === 'gm') return { lit: [], outlines: gm ? outline : [] }
  const seers = mode === 'active' ? (active ? [active] : []) : tokens.filter(t => t.playerToken)
  return { lit: seers.map(t => sightOf(t, walls, map)), outlines: mode === 'group' && active?.playerToken ? outline : [] }
}
