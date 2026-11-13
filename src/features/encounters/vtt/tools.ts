/**
 * The map tools of the GM's window: which one is active and its settings, and
 * the area tool's placement rules. A burst snaps to a grid intersection; an
 * emanation surrounds the token clicked; a cone or line starts at a token's
 * edge (or the clicked point) and is aimed with a second click, cones in 45°
 * steps.
 */
import { reactive } from 'vue'
import { newId } from '@/domain/ids'
import { cellsInArea, edgeOrigin, snapAngle45, type AreaEffect, type AreaKind, type AreaOverlay, type AreaShape } from '@/domain/rules/areas'
import type { AreaSpec } from '@/domain/rules/statRolls'
import type { WallKind } from '@/domain/rules/walls'
import { addArea, asAreaToken, openAreaPrompt } from './areasLive'
import type { Cell, SceneArea, Tool } from './engine/types'
import { mapTokens } from './live'
import { hexNumber } from './scene'

export const tools = reactive({
  tool: 'select' as Tool,
  fogHide: true,
  fogBrush: 1,
  wallKind: 'full' as WallKind,
  areaKind: 'burst' as AreaKind,
  areaFt: 20,
  areaColor: '#e8a040',
  /** An ability being placed from a stat block: its name and effect go onto the next area. */
  pending: null as { label: string; effect: AreaEffect } | null,
})

const tokenAt = (p: Cell) => {
  const c = Math.floor(p.col), r = Math.floor(p.row)
  // Topmost first: the last placed wins, as on the map
  return [...mapTokens()].reverse().find(t => c >= t.x && c < t.x + Math.max(1, t.size) && r >= t.y && r < t.y + Math.max(1, t.size))
}

/** The shape a click at `at` (after a first click at `anchor`) places; null while it needs a first click. */
function shapeFor(anchor: Cell | null, at: Cell): AreaShape | null {
  const size = Math.max(5, Math.round((Number(tools.areaFt) || 5) / 5) * 5)
  if (tools.areaKind === 'burst') return { kind: 'burst', originX: Math.round(at.col), originY: Math.round(at.row), sizeFt: size }
  if (tools.areaKind === 'emanation') return { kind: 'emanation', originX: Math.floor(at.col), originY: Math.floor(at.row), sizeFt: size, attachedTokenId: tokenAt(at)?.id ?? null }
  if (!anchor) return null
  const t = tokenAt(anchor)
  const from = t ? { x: t.x + Math.max(1, t.size) / 2, y: t.y + Math.max(1, t.size) / 2 } : { x: anchor.col, y: anchor.row }
  const raw = (Math.atan2(at.row - from.y, at.col - from.x) * 180) / Math.PI
  const angle = tools.areaKind === 'cone' ? snapAngle45(raw) : Math.round(raw)
  const origin = t ? edgeOrigin(asAreaToken(t), angle) : from
  return { kind: tools.areaKind, originX: origin.x, originY: origin.y, sizeFt: size, angle }
}

export function areaDraft(anchor: Cell | null, at: Cell): SceneArea {
  const shape = shapeFor(anchor, at)
  // Before the first click of a cone or line: the square it starts from
  const cells = shape ? [...cellsInArea(shape, mapTokens().map(asAreaToken))] : [`${Math.floor(at.col)},${Math.floor(at.row)}`]
  return { id: 'draft', cells, color: hexNumber(tools.areaColor) }
}

function commit(shape: AreaShape): void {
  const p = tools.pending
  tools.pending = null
  const area: AreaOverlay = { ...shape, id: newId(), color: tools.areaColor, label: p?.label ?? `${shape.sizeFt}-foot ${shape.kind}`, ...(p ? { effect: p.effect } : {}) }
  addArea(area)
  // An ability's area asks for its saves right away
  if (area.effect) { openAreaPrompt(area.id); tools.tool = 'select' }
}

/** True when this click only set the starting point. */
export function areaClick(anchor: Cell | null, at: Cell): boolean {
  const shape = shapeFor(anchor, at)
  if (!shape) return true
  commit(shape)
  return false
}

/** Starts placing an ability's area. An emanation around the creature using it is placed at once; anything else waits for clicks on the map. */
export function startArea(spec: AreaSpec, sourceTokenId: string | null): void {
  Object.assign(tools, { areaKind: spec.kind, areaFt: spec.sizeFt, pending: { label: spec.label, effect: spec.effect } })
  if (spec.kind === 'emanation' && sourceTokenId) commit({ kind: 'emanation', originX: 0, originY: 0, sizeFt: spec.sizeFt, attachedTokenId: sourceTokenId })
  else tools.tool = 'area'
}
