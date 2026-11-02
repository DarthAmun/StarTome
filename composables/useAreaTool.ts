/**
 * The encounter map's area tool (COMBAT_PLAN.md §5): what the next click
 * places and the squares it previews. A burst snaps to a grid intersection;
 * an emanation surrounds the token clicked; a cone or line starts at a token's
 * edge (or the clicked point) and is aimed with a second click, cones in 45°
 * steps.
 */
import { computed, ref } from 'vue'
import { hexColorToNumber } from '~/composables/useConditions'
import type { CanvasArea } from '~/composables/useEncounterCanvas'
import { cellsInArea, edgeOrigin, snapAngle45, type AreaKind, type AreaOverlay, type AreaShape, type AreaToken } from '~/rules/areas'
import { useEncounterStore } from '~/stores/encounter'

type Point = { col: number; row: number }

export function useAreaTool() {
  const store = useEncounterStore()
  const kind = ref<AreaKind>('burst')
  const sizeFt = ref(20)
  const color = ref('#e8a040')

  const tokens = (): AreaToken[] => store.current?.tokens ?? []

  function tokenAt(p: Point): AreaToken | undefined {
    const c = Math.floor(p.col), r = Math.floor(p.row)
    // Topmost first: the last placed wins, as on the canvas
    return [...tokens()].reverse().find(t => c >= t.gridX && c < t.gridX + Math.max(1, t.size) && r >= t.gridY && r < t.gridY + Math.max(1, t.size))
  }

  /** The shape a click at `at` (after a first click at `anchor`) places; null while it needs a first click. */
  function shapeFor(anchor: Point | null, at: Point): AreaShape | null {
    const size = Math.max(5, Math.round((Number(sizeFt.value) || 5) / 5) * 5)
    if (kind.value === 'burst') return { kind: 'burst', originX: Math.round(at.col), originY: Math.round(at.row), sizeFt: size }
    if (kind.value === 'emanation') {
      const t = tokenAt(at)
      return { kind: 'emanation', originX: Math.floor(at.col), originY: Math.floor(at.row), sizeFt: size, attachedTokenId: t?.id ?? null }
    }
    if (!anchor) return null
    const t = tokenAt(anchor)
    const from = t ? { x: t.gridX + Math.max(1, t.size) / 2, y: t.gridY + Math.max(1, t.size) / 2 } : { x: anchor.col, y: anchor.row }
    const raw = (Math.atan2(at.row - from.y, at.col - from.x) * 180) / Math.PI
    const angle = kind.value === 'cone' ? snapAngle45(raw) : Math.round(raw)
    const origin = t ? edgeOrigin(t, angle) : from
    return { kind: kind.value, originX: origin.x, originY: origin.y, sizeFt: size, angle }
  }

  function getAreaDraft(anchor: Point | null, at: Point): CanvasArea | null {
    const shape = shapeFor(anchor, at)
    if (!shape) {
      // Before the first click of a cone or line: mark the square it starts from
      return { id: 'draft', cells: [`${Math.floor(at.col)},${Math.floor(at.row)}`], color: hexColorToNumber(color.value) }
    }
    return { id: 'draft', cells: [...cellsInArea(shape, tokens())], color: hexColorToNumber(color.value) }
  }

  /** True when this click only set the starting point. */
  function onAreaClick(anchor: Point | null, at: Point): boolean {
    const shape = shapeFor(anchor, at)
    if (!shape) return true
    const area: AreaOverlay = { ...shape, id: crypto.randomUUID(), label: `${shape.sizeFt}-foot ${shape.kind}`, color: color.value }
    void store.addArea(area)
    return false
  }

  /** The placed areas as the canvas draws them; emanations follow their token. */
  const canvasAreas = computed<CanvasArea[]>(() => (store.current?.areas ?? []).map(a => ({
    id: a.id, cells: [...store.areaCells(a)], color: hexColorToNumber(a.color),
  })))

  return { kind, sizeFt, color, getAreaDraft, onAreaClick, canvasAreas }
}
