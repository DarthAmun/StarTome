<template>
  <div class="mm-page">
    <header class="mm-toolbar">
      <NuxtLink :to="`/encounter/${encounterId}`" class="mm-btn">
        <OhVueIcon name="md-arrowback" scale="0.75" /> Encounter
      </NuxtLink>
      <span class="mm-title">Map Maker<span v-if="encounterName"> · {{ encounterName }}</span></span>
      <div class="mm-gap" />
      <button class="mm-btn" :disabled="!undoStack.length" title="Undo (Ctrl+Z)" @click="undo">Undo</button>
      <button class="mm-btn" :disabled="!redoStack.length" title="Redo (Ctrl+Y)" @click="redo">Redo</button>
      <label class="mm-check" title="Make line-of-sight walls and doors from the wall and door tiles">
        <input v-model="makeWalls" type="checkbox" /> Make walls
      </label>
      <Button size="small" class="mm-save" :loading="saving" :disabled="!map" @click="save">
        <OhVueIcon name="md-check" scale="0.8" /> Use as encounter map
      </Button>
    </header>

    <div class="mm-body">
      <aside class="mm-side">
        <section class="mm-section">
          <span class="mm-label">Tool</span>
          <div class="mm-tools">
            <button
              v-for="t in TOOLS" :key="t.id"
              class="mm-tool" :class="{ active: tool === t.id }" :title="t.hint"
              @click="tool = t.id"
            >{{ t.label }}</button>
          </div>
          <p class="mm-hint">{{ TOOLS.find(t => t.id === tool)?.hint }} Right-click picks a tile.</p>
        </section>

        <section class="mm-section">
          <span class="mm-label">Tile</span>
          <div class="mm-tiles">
            <button
              v-for="t in TILES" :key="t.id"
              class="mm-tile" :class="{ active: tileId === t.id }" :title="t.label"
              @click="tileId = t.id"
            >
              <canvas :ref="el => swatchRefs[t.id] = el as HTMLCanvasElement | null" width="28" height="28" class="mm-swatch" />
              <span>{{ t.label }}</span>
            </button>
          </div>
        </section>

        <section class="mm-section">
          <span class="mm-label">Size (squares)</span>
          <div class="mm-size">
            <input v-model.number="sizeCols" type="number" :min="MIN_SIZE" :max="MAX_SIZE" aria-label="Columns" />
            <span>×</span>
            <input v-model.number="sizeRows" type="number" :min="MIN_SIZE" :max="MAX_SIZE" aria-label="Rows" />
            <button class="mm-btn" :disabled="!map || (sizeCols === map.cols && sizeRows === map.rows)" @click="applySize">Resize</button>
          </div>
          <button class="mm-btn mm-wide" @click="clearMap">Start over</button>
        </section>

        <section class="mm-section">
          <span class="mm-label">Zoom</span>
          <input v-model.number="zoom" type="range" min="12" max="72" step="2" class="mm-range" />
        </section>

        <p class="mm-hint mm-foot">
          Saving draws the map at {{ EXPORT_CELL_PX }} px per square and sets the encounter's grid to match.
          With Make walls, FOV is turned on for the encounter. Walls you drew by hand
          on the encounter stay; walls made here are replaced.
        </p>
      </aside>

      <div ref="scrollEl" class="mm-canvas-wrap">
        <canvas
          ref="canvasEl"
          class="mm-canvas"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @pointerleave="hover = null; scheduleDraw()"
          @contextmenu.prevent
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getDb, dbApi } from '~/composables/useDb'
import { notify, reportError } from '~/composables/useNotices'
import {
  TILES, MIN_SIZE, MAX_SIZE, EXPORT_CELL_PX, blankMap, clampSize, floodFill, getTile, mapWalls,
  paintCells, paintRoom, readBattleMap, rectCells, resizeMap, tileByChar, tileChar,
  type BattleMap, type TileId,
} from '~/rules/battlemap'
import { battleMapPng, drawBattleMap } from '~/utils/battlemapDraw'

type Tool = 'brush' | 'rect' | 'room' | 'fill'
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'brush', label: 'Brush', hint: 'Click or drag to paint squares.' },
  { id: 'rect', label: 'Rectangle', hint: 'Drag to fill a rectangle.' },
  { id: 'room', label: 'Room', hint: 'Drag for a room: the tile inside, walls around it.' },
  { id: 'fill', label: 'Fill', hint: 'Click to fill an area of the same tile.' },
]
const UNDO_LIMIT = 100

const route = useRoute()
const encounterId = Number(route.params.id)
const encounterName = ref('')

const map = shallowRef<BattleMap | null>(null)
const tool = ref<Tool>('room')
const tileId = ref<TileId>('stone')
const zoom = ref(36)
const makeWalls = ref(true)
const saving = ref(false)
const dirty = ref(false)
const sizeCols = ref(24)
const sizeRows = ref(18)

const undoStack = shallowRef<BattleMap[]>([])
const redoStack = shallowRef<BattleMap[]>([])

const canvasEl = ref<HTMLCanvasElement | null>(null)
const scrollEl = ref<HTMLDivElement | null>(null)
const swatchRefs: Partial<Record<TileId, HTMLCanvasElement | null>> = {}

/** Hovered cell, and the drag start for the rectangle and room tools. */
const hover = ref<[number, number] | null>(null)
let dragStart: [number, number] | null = null
/** The map before the brush stroke in progress: a stroke is one undo step. */
let strokeStart: BattleMap | null = null

onMounted(async () => {
  const enc = await getDb().encounters.get(encounterId)
  if (!enc) {
    notify('That encounter no longer exists.', 'warning')
    return navigateTo('/')
  }
  encounterName.value = enc.name
  map.value = readBattleMap(enc.battlemap) ?? blankMap(24, 18, 'void')
  sizeCols.value = map.value.cols
  sizeRows.value = map.value.rows
  drawSwatches()
  scheduleDraw()
  window.addEventListener('keydown', onKey)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('Leave the map maker? Changes since you last used the map are lost.')) return false
})

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) e.preventDefault()
}

watch(zoom, () => scheduleDraw())

// ── Drawing ─────────────────────────────────────────────────────────────────
let frame = 0
function scheduleDraw() {
  if (frame) return
  frame = requestAnimationFrame(() => { frame = 0; draw() })
}

function draw() {
  const canvas = canvasEl.value
  const m = map.value
  if (!canvas || !m) return
  const px = zoom.value
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(m.cols * px * dpr)
  canvas.height = Math.round(m.rows * px * dpr)
  canvas.style.width = `${m.cols * px}px`
  canvas.style.height = `${m.rows * px}px`
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawBattleMap(ctx, previewMap() ?? m, px, { grid: true })
  if (hover.value) {
    const [c, r] = hover.value
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 2
    ctx.strokeRect(c * px + 1, r * px + 1, px - 2, px - 2)
  }
}

/** The map with the rectangle or room being dragged, for the canvas only. */
function previewMap(): BattleMap | null {
  if (!dragStart || !hover.value || !map.value) return null
  return applyShape(map.value, dragStart, hover.value)
}

function applyShape(m: BattleMap, [c1, r1]: [number, number], [c2, r2]: [number, number]): BattleMap {
  const ch = tileChar(tileId.value)
  return tool.value === 'room' ? paintRoom(m, c1, r1, c2, r2, ch) : paintCells(m, rectCells(c1, r1, c2, r2), ch)
}

function drawSwatches() {
  for (const t of TILES) {
    const el = swatchRefs[t.id]
    if (!el) continue
    // The tile in the middle of a 3×3 map, so the door sits between walls
    const sample: BattleMap = { cols: 3, rows: 3, tiles: t.id === 'door' ? 'sss#+#sss' : tileChar(t.id).repeat(9) }
    const ctx = el.getContext('2d')!
    ctx.save()
    ctx.translate(-28, -28)
    drawBattleMap(ctx, sample, 28)
    ctx.restore()
  }
}

// ── Editing ─────────────────────────────────────────────────────────────────
function commit(next: BattleMap) {
  if (!map.value || (next.tiles === map.value.tiles && next.cols === map.value.cols)) return
  undoStack.value = [...undoStack.value.slice(-(UNDO_LIMIT - 1)), map.value]
  redoStack.value = []
  map.value = next
  dirty.value = true
  scheduleDraw()
}

function undo() {
  const prev = undoStack.value.at(-1)
  if (!prev || !map.value) return
  redoStack.value = [...redoStack.value, map.value]
  undoStack.value = undoStack.value.slice(0, -1)
  setMap(prev)
}

function redo() {
  const next = redoStack.value.at(-1)
  if (!next || !map.value) return
  undoStack.value = [...undoStack.value, map.value]
  redoStack.value = redoStack.value.slice(0, -1)
  setMap(next)
}

function setMap(m: BattleMap) {
  map.value = m
  sizeCols.value = m.cols
  sizeRows.value = m.rows
  dirty.value = true
  scheduleDraw()
}

function applySize() {
  if (!map.value) return
  sizeCols.value = clampSize(sizeCols.value)
  sizeRows.value = clampSize(sizeRows.value)
  commit(resizeMap(map.value, sizeCols.value, sizeRows.value))
}

function clearMap() {
  if (!map.value) return
  commit(blankMap(map.value.cols, map.value.rows, 'void'))
}

function cellAt(e: PointerEvent): [number, number] | null {
  const m = map.value
  if (!m) return null
  const box = canvasEl.value!.getBoundingClientRect()
  const c = Math.floor((e.clientX - box.left) / zoom.value)
  const r = Math.floor((e.clientY - box.top) / zoom.value)
  return c >= 0 && r >= 0 && c < m.cols && r < m.rows ? [c, r] : null
}

function onPointerDown(e: PointerEvent) {
  const cell = cellAt(e)
  if (!cell || !map.value) return
  if (e.button === 2) {
    tileId.value = tileByChar(getTile(map.value, cell[0], cell[1])).id
    return
  }
  if (e.button !== 0) return
  canvasEl.value?.setPointerCapture(e.pointerId)
  hover.value = cell
  if (tool.value === 'fill') commit(floodFill(map.value, cell[0], cell[1], tileChar(tileId.value)))
  else if (tool.value === 'brush') {
    strokeStart = map.value
    map.value = paintCells(map.value, [cell], tileChar(tileId.value))
  } else dragStart = cell
  scheduleDraw()
}

function onPointerMove(e: PointerEvent) {
  const cell = cellAt(e)
  if (cell?.[0] === hover.value?.[0] && cell?.[1] === hover.value?.[1]) return
  if (cell) hover.value = cell
  if (strokeStart && cell && map.value) {
    map.value = paintCells(map.value, [cell], tileChar(tileId.value))
  }
  scheduleDraw()
}

function onPointerUp() {
  if (dragStart && hover.value && map.value) commit(applyShape(map.value, dragStart, hover.value))
  if (strokeStart && map.value) {
    const painted = map.value
    map.value = strokeStart
    commit(painted)
  }
  dragStart = null
  strokeStart = null
  scheduleDraw()
}

function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return
  if (!(e.ctrlKey || e.metaKey)) return
  const key = e.key.toLowerCase()
  if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
  else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
}

// ── Saving ──────────────────────────────────────────────────────────────────
async function save() {
  if (!map.value) return
  saving.value = true
  try {
    const png = await battleMapPng(map.value, EXPORT_CELL_PX)
    const walls = makeWalls.value ? mapWalls(map.value) : null
    await dbApi.encounters.applyBattleMap(encounterId, map.value, png, walls)
    dirty.value = false
    notify(walls ? `Map saved with ${walls.length} walls and doors; FOV is on.` : 'Map saved.')
  } catch (err) {
    reportError('Saving the map', err)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.mm-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
}
.mm-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  height: 52px;
  flex-shrink: 0;
  background: var(--parch-dark);
  border-bottom: 1px solid var(--parch-line);
}
.mm-title {
  font-family: var(--font-head);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mm-gap { flex: 1; }
.mm-save { white-space: nowrap; flex-shrink: 0; }
.mm-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--border-hi);
  border-radius: var(--r);
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
}
.mm-btn:hover:not(:disabled) { border-color: var(--accent); }
.mm-btn:disabled { opacity: 0.4; cursor: default; }
.mm-wide { width: 100%; justify-content: center; margin-top: 8px; }
.mm-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ink-faded);
  cursor: pointer;
}

.mm-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.mm-side {
  width: 250px;
  flex-shrink: 0;
  overflow-y: auto;
  background: var(--parch);
  border-right: 1px solid var(--parch-line);
}
.mm-section {
  padding: 12px 14px;
  border-bottom: 1px dashed var(--parch-line);
}
.mm-label {
  display: block;
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  margin-bottom: 8px;
}
.mm-hint {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--ink-faded);
}
.mm-foot { padding: 0 14px 14px; }
.mm-tools {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.mm-tool, .mm-tile {
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 12px;
  cursor: pointer;
}
.mm-tool { padding: 6px 4px; }
.mm-tool.active, .mm-tile.active {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.mm-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
}
.mm-tile {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 3px 5px;
  font-size: 11px;
  text-align: left;
}
.mm-tile span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mm-swatch {
  width: 28px;
  height: 28px;
  border-radius: 3px;
  flex-shrink: 0;
}
.mm-size {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-faded);
}
.mm-size input {
  width: 52px;
  padding: 4px 6px;
  border: 1px solid var(--border-hi);
  border-radius: var(--r);
  background: var(--surface-solid);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
}
.mm-range { width: 100%; accent-color: var(--accent); }

.mm-canvas-wrap {
  flex: 1;
  overflow: auto;
  padding: 24px;
  background: var(--leather);
}
.mm-canvas {
  display: block;
  margin: auto;
  box-shadow: var(--sh-md);
  cursor: crosshair;
  touch-action: none;
}
</style>
