/**
 * The map maker's editing state: the map with undo and redo, the view (pan and
 * zoom), the tool in hand, and what the pointer does with it. Drawn on a plain
 * 2D canvas; the encounter gets the result as an image.
 */
import { computed, ref, shallowRef, type Ref } from 'vue'
import { newId } from '@/domain/ids'
import {
  PROP_MIN_SIZE, blankMap, clampSize, floodFill, getTile, paintCells, paintRoom, propAt, rectCells, resizeMap, restackProp, snap, tileByChar, tileChar, toPropFrame, updateProp,
  type BattleMap, type MapProp, type TileId,
} from '@/domain/rules/battlemap'
import type { MapAsset } from '@/domain/schema'
import { drawBattleMap, drawProp } from './draw'

export type Tool = 'select' | 'pan' | 'brush' | 'rect' | 'room' | 'fill'
const ZOOM_MIN = 6, ZOOM_MAX = 140, UNDO_LIMIT = 100, PLACE_MAX = 6, HANDLE_PX = 7, ROTATE_GAP_PX = 22
export const ZOOM_BASE = 40
const round2 = (v: number) => Math.round(v * 100) / 100
const turn = (deg: number) => ((deg % 360) + 360) % 360

export function useMapEditor(canvasEl: Ref<HTMLCanvasElement | null>, images: Map<string, HTMLImageElement>) {
  const map = shallowRef<BattleMap | null>(null)
  const tool = ref<Tool>('room')
  const tileId = ref<TileId>('stone')
  const zoom = ref(36)
  const dirty = ref(false)
  const undoStack = shallowRef<BattleMap[]>([])
  const redoStack = shallowRef<BattleMap[]>([])
  const placing = shallowRef<MapAsset | null>(null)
  const selectedId = ref<string | null>(null)
  const selected = computed(() => map.value?.props?.find(p => p.id === selectedId.value) ?? null)
  const panning = ref(false)
  const spaceDown = ref(false)

  const view = { x: 24, y: 24, w: 0, h: 0 }
  let panDrag: { sx: number; sy: number; vx: number; vy: number } | null = null
  let hover: [number, number] | null = null
  let dragStart: [number, number] | null = null
  /** The map before the brush stroke or asset drag in progress: either is one undo step. */
  let strokeStart: BattleMap | null = null
  let pointer: { x: number; y: number } | null = null
  let propDrag: { kind: 'move' | 'resize' | 'rotate'; prop: MapProp; dx: number; dy: number } | null = null
  let frame = 0

  // ── View ──
  function clampView() {
    const m = map.value
    if (!m) return
    const w = m.cols * zoom.value, h = m.rows * zoom.value, keepX = Math.min(80, w), keepY = Math.min(80, h)
    view.x = Math.min(view.w - keepX, Math.max(keepX - w, view.x))
    view.y = Math.min(view.h - keepY, Math.max(keepY - h, view.y))
  }
  function zoomAt(next: number, cx: number, cy: number) {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)), k = z / zoom.value
    view.x = cx - (cx - view.x) * k
    view.y = cy - (cy - view.y) * k
    zoom.value = z
    clampView()
    schedule()
  }
  const zoomBy = (factor: number) => zoomAt(zoom.value * factor, view.w / 2, view.h / 2)
  function fit() {
    const m = map.value
    if (!m || !view.w) return
    zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min((view.w - 64) / m.cols, (view.h - 64) / m.rows)))
    view.x = (view.w - m.cols * zoom.value) / 2
    view.y = (view.h - m.rows * zoom.value) / 2
    schedule()
  }
  function resized(w: number, h: number) { view.w = w; view.h = h; clampView(); schedule() }
  function wheel(e: WheelEvent) {
    const box = canvasEl.value?.getBoundingClientRect()
    if (!box) return
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
    zoomAt(zoom.value * Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - box.left, e.clientY - box.top)
  }

  // ── Drawing ──
  function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw() }) }

  function shape(m: BattleMap, [c1, r1]: [number, number], [c2, r2]: [number, number]): BattleMap {
    const ch = tileChar(tileId.value)
    return tool.value === 'room' ? paintRoom(m, c1, r1, c2, r2, ch) : paintCells(m, rectCells(c1, r1, c2, r2), ch)
  }

  /** A new prop of the asset centred on a point: its short side one square, its long side at most PLACE_MAX. */
  function newProp(a: MapAsset, x: number, y: number): MapProp {
    const aspect = a.pxWidth / Math.max(1, a.pxHeight)
    let w = aspect >= 1 ? aspect : 1, h = aspect >= 1 ? 1 : 1 / aspect
    const over = Math.max(w, h) / PLACE_MAX
    if (over > 1) { w /= over; h /= over }
    return { id: newId(), image: `img:${a.imageId}`, x, y, w: round2(w), h: round2(h), rotation: 0, layer: 'object' }
  }

  function draw() {
    const canvas = canvasEl.value, m = map.value, ctx = canvas?.getContext('2d')
    if (!canvas || !m || !ctx) return
    const px = zoom.value, dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(view.w * dpr)), h = Math.max(1, Math.round(view.h * dpr))
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.setTransform(dpr, 0, 0, dpr, view.x * dpr, view.y * dpr)
    ctx.save()
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, m.cols * px, m.rows * px)
    ctx.beginPath()
    ctx.rect(0, 0, m.cols * px, m.rows * px)
    ctx.clip()
    drawBattleMap(ctx, dragStart && hover ? shape(m, dragStart, hover) : m, px, { grid: true, images, marks: true })
    ctx.restore()
    if (placing.value && pointer) {
      ctx.globalAlpha = 0.6
      drawProp(ctx, newProp(placing.value, pointer.x, pointer.y), px, images)
      ctx.globalAlpha = 1
    } else if (selected.value) drawSelection(ctx, selected.value, px)
    else if (hover && tool.value !== 'select' && tool.value !== 'pan') {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 2
      ctx.strokeRect(hover[0] * px + 1, hover[1] * px + 1, px - 2, px - 2)
    }
  }

  /** Outline of the selected prop with its resize (corner) and rotate (top) handles. */
  function drawSelection(ctx: CanvasRenderingContext2D, p: MapProp, px: number) {
    ctx.save()
    ctx.translate(p.x * px, p.y * px)
    ctx.rotate((p.rotation * Math.PI) / 180)
    const hw = (p.w / 2) * px, hh = (p.h / 2) * px
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    ctx.strokeRect(-hw, -hh, hw * 2, hh * 2)
    ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(0, -hh - ROTATE_GAP_PX); ctx.stroke()
    for (const [x, y] of [[hw, hh], [0, -hh - ROTATE_GAP_PX]] as const) {
      ctx.beginPath(); ctx.arc(x, y, HANDLE_PX - 1, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'; ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke()
    }
    ctx.restore()
  }

  // ── Editing ──
  const same = (a: BattleMap, b: BattleMap) => a.cols === b.cols && a.rows === b.rows && a.tiles === b.tiles && JSON.stringify(a.props ?? []) === JSON.stringify(b.props ?? [])
  function commit(next: BattleMap) {
    if (!map.value || same(next, map.value)) return
    undoStack.value = [...undoStack.value.slice(-(UNDO_LIMIT - 1)), map.value]
    redoStack.value = []
    map.value = next
    dirty.value = true
    schedule()
  }
  function step(from: typeof undoStack, to: typeof undoStack) {
    const next = from.value.at(-1)
    if (!next || !map.value) return
    to.value = [...to.value, map.value]
    from.value = from.value.slice(0, -1)
    map.value = next
    dirty.value = true
    schedule()
  }
  const undo = () => step(undoStack, redoStack)
  const redo = () => step(redoStack, undoStack)
  function load(m: BattleMap) { map.value = m; undoStack.value = []; redoStack.value = []; dirty.value = false; schedule() }
  function resize(cols: number, rows: number) { if (map.value) commit(resizeMap(map.value, clampSize(cols), clampSize(rows))) }
  function clear() { if (map.value) { selectedId.value = null; commit(blankMap(map.value.cols, map.value.rows, 'void')) } }

  function setTool(t: Tool) { tool.value = t; placing.value = null; if (t !== 'select' && t !== 'pan') selectedId.value = null; schedule() }
  function pickTile(id: TileId) { tileId.value = id; if (tool.value === 'select' || tool.value === 'pan' || placing.value) setTool('brush') }
  function startPlacing(a: MapAsset) { placing.value = placing.value?.id === a.id ? null : a; selectedId.value = null; schedule() }

  function patchSelected(patch: Partial<MapProp>) { const p = selected.value; if (p && map.value) commit(updateProp(map.value, p.id, { ...p, ...patch })) }
  const rotateSelected = (deg: number) => { if (selected.value) patchSelected({ rotation: turn(selected.value.rotation + deg) }) }
  const restack = (by: 1 | -1) => { if (selected.value && map.value) commit(restackProp(map.value, selected.value.id, by)) }
  function duplicateSelected() {
    const p = selected.value
    if (!p || !map.value) return
    const copy = { ...p, id: newId(), x: p.x + 0.5, y: p.y + 0.5 }
    commit({ ...map.value, props: [...(map.value.props ?? []), copy] })
    selectedId.value = copy.id
  }
  function removeSelected() { if (selected.value && map.value) commit(updateProp(map.value, selected.value.id, null)); selectedId.value = null }

  // ── Pointer ──
  function pointAt(e: PointerEvent) {
    const box = canvasEl.value?.getBoundingClientRect()
    return { x: (e.clientX - (box?.left ?? 0) - view.x) / zoom.value, y: (e.clientY - (box?.top ?? 0) - view.y) / zoom.value }
  }
  function cellAt(e: PointerEvent): [number, number] | null {
    const m = map.value, { x, y } = pointAt(e), c = Math.floor(x), r = Math.floor(y)
    return m && c >= 0 && r >= 0 && c < m.cols && r < m.rows ? [c, r] : null
  }
  function handleAt(p: MapProp, x: number, y: number): 'resize' | 'rotate' | null {
    const local = toPropFrame(p, x, y), r = HANDLE_PX / zoom.value
    if (Math.hypot(local.x - p.w / 2, local.y - p.h / 2) <= r) return 'resize'
    return Math.hypot(local.x, local.y + p.h / 2 + ROTATE_GAP_PX / zoom.value) <= r ? 'rotate' : null
  }
  function startPan(e: PointerEvent) { panDrag = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; panning.value = true; canvasEl.value?.setPointerCapture(e.pointerId) }

  function down(e: PointerEvent) {
    const m = map.value
    if (!m) return
    if (e.button === 1 || (e.button === 0 && (e.altKey || spaceDown.value || (tool.value === 'pan' && !placing.value)))) { e.preventDefault(); startPan(e); return }
    const pt = pointAt(e)
    if (placing.value) {
      if (e.button !== 0) { placing.value = null; schedule(); return }
      const prop = newProp(placing.value, round2(e.shiftKey ? pt.x : snap(pt.x, 0.5)), round2(e.shiftKey ? pt.y : snap(pt.y, 0.5)))
      commit({ ...m, props: [...(m.props ?? []), prop] })
      selectedId.value = prop.id
      placing.value = null
      tool.value = 'select'
      return
    }
    if (tool.value === 'select') {
      if (e.button !== 0) return
      const sel = selected.value, handle = sel ? handleAt(sel, pt.x, pt.y) : null, hit = handle ? sel : propAt(m, pt.x, pt.y)
      selectedId.value = hit?.id ?? null
      if (hit) { canvasEl.value?.setPointerCapture(e.pointerId); strokeStart = m; propDrag = { kind: handle ?? 'move', prop: hit, dx: pt.x - hit.x, dy: pt.y - hit.y } }
      else startPan(e)
      schedule()
      return
    }
    const cell = cellAt(e)
    if (!cell) return
    // Right-click picks the tile under the pointer
    if (e.button === 2) { tileId.value = tileByChar(getTile(m, cell[0], cell[1])).id; return }
    if (e.button !== 0) return
    canvasEl.value?.setPointerCapture(e.pointerId)
    hover = cell
    if (tool.value === 'fill') commit(floodFill(m, cell[0], cell[1], tileChar(tileId.value)))
    else if (tool.value === 'brush') { strokeStart = m; map.value = paintCells(m, [cell], tileChar(tileId.value)) }
    else dragStart = cell
    schedule()
  }

  /** The dragged prop for the pointer at (x, y); Shift turns snapping off. */
  function dragged(d: NonNullable<typeof propDrag>, x: number, y: number, free: boolean): MapProp {
    const p = d.prop
    if (d.kind === 'move') return { ...p, x: round2(free ? x - d.dx : snap(x - d.dx, 0.5)), y: round2(free ? y - d.dy : snap(y - d.dy, 0.5)) }
    if (d.kind === 'rotate') { const deg = (Math.atan2(y - p.y, x - p.x) * 180) / Math.PI + 90; return { ...p, rotation: turn(free ? Math.round(deg) : snap(deg, 15)) } }
    // Resize about the centre; the aspect stays unless Shift is held
    const local = toPropFrame(p, x, y)
    let w = Math.abs(local.x) * 2, h = Math.abs(local.y) * 2
    if (free) { w = snap(w, 0.25); h = snap(h, 0.25) }
    else { const k = Math.max(0.5, snap(Math.max(p.w, p.h) * Math.max(w / p.w, h / p.h), 0.5)) / Math.max(p.w, p.h); w = p.w * k; h = p.h * k }
    return { ...p, w: round2(Math.max(PROP_MIN_SIZE, w)), h: round2(Math.max(PROP_MIN_SIZE, h)) }
  }

  function move(e: PointerEvent) {
    if (panDrag) { view.x = panDrag.vx + e.clientX - panDrag.sx; view.y = panDrag.vy + e.clientY - panDrag.sy; clampView(); schedule(); return }
    const pt = pointAt(e)
    if (placing.value) { pointer = { x: e.shiftKey ? pt.x : snap(pt.x, 0.5), y: e.shiftKey ? pt.y : snap(pt.y, 0.5) }; schedule(); return }
    if (propDrag && strokeStart) { map.value = updateProp(strokeStart, propDrag.prop.id, dragged(propDrag, pt.x, pt.y, e.shiftKey)); schedule(); return }
    const cell = cellAt(e)
    if (cell?.[0] === hover?.[0] && cell?.[1] === hover?.[1]) return
    if (cell) hover = cell
    if (strokeStart && cell && map.value) map.value = paintCells(map.value, [cell], tileChar(tileId.value))
    schedule()
  }

  function up() {
    if (panDrag) { panDrag = null; panning.value = false; return }
    if (dragStart && hover && map.value) commit(shape(map.value, dragStart, hover))
    if (strokeStart && map.value) { const painted = map.value; map.value = strokeStart; commit(painted) }
    dragStart = null
    strokeStart = null
    propDrag = null
    schedule()
  }

  return {
    map, tool, tileId, zoom, dirty, undoStack, redoStack, placing, selectedId, selected, panning, spaceDown,
    schedule, fit, zoomBy, resized, wheel, load, commit, undo, redo, resize, clear, setTool, pickTile, startPlacing,
    patchSelected, rotateSelected, restack, duplicateSelected, removeSelected, down, move, up,
  }
}
