<template>
  <div class="mm-page" :class="{ 'mm-dropping': dropping }" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
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
              class="mm-tool" :class="{ active: tool === t.id && !placing }" :title="t.hint"
              @click="setTool(t.id)"
            >{{ t.label }}</button>
          </div>
          <p class="mm-hint">
            <template v-if="placing">Click the map to place {{ placing.name }}. Shift places it off the grid; Esc stops.</template>
            <template v-else>{{ TOOLS.find(t => t.id === tool)?.hint }}<template v-if="tool !== 'select'"> Right-click picks a tile.</template></template>
          </p>
        </section>

        <section v-if="selected" class="mm-section">
          <span class="mm-label">Selected asset</span>
          <div class="mm-seg">
            <button :class="{ active: selected.layer === 'floor' }" title="On the floor, under walls' shadows" @click="patchSelected({ layer: 'floor' })">Floor</button>
            <button :class="{ active: selected.layer === 'object' }" title="On top of everything" @click="patchSelected({ layer: 'object' })">Objects</button>
          </div>
          <div class="mm-fields">
            <label>W <input type="number" :value="selected.w" :min="PROP_MIN_SIZE" step="0.25" @change="patchSize('w', $event)" /></label>
            <label>H <input type="number" :value="selected.h" :min="PROP_MIN_SIZE" step="0.25" @change="patchSize('h', $event)" /></label>
            <label>° <input type="number" :value="selected.rotation" step="15" @change="patchRotation($event)" /></label>
          </div>
          <div class="mm-actions">
            <button class="mm-btn" title="Rotate 90° (R)" @click="rotateSelected(90)">Rotate 90°</button>
            <button class="mm-btn" title="Mirror (F)" @click="patchSelected({ flip: !selected.flip })">Flip</button>
            <button class="mm-btn" title="Bring forward (])" @click="restack(1)">Forward</button>
            <button class="mm-btn" title="Send backward ([)" @click="restack(-1)">Backward</button>
            <button class="mm-btn" title="Duplicate (Ctrl+D)" @click="duplicateSelected">Duplicate</button>
            <button class="mm-btn mm-danger" title="Remove (Delete)" @click="removeSelected">Remove</button>
          </div>
        </section>

        <section class="mm-section">
          <div class="mm-label-row">
            <span class="mm-label">Assets</span>
            <span v-if="importing" class="mm-progress">Importing {{ importDone }}/{{ importTotal }}…</span>
            <span v-else class="mm-import">
              <button class="mm-btn mm-small" title="Import image files" @click="importFiles">Files</button>
              <button class="mm-btn mm-small" title="Import a folder with all its subfolders" @click="importFolder">Folder</button>
            </span>
          </div>
          <template v-if="assets.length">
            <div class="mm-filter">
              <select v-if="folders.length" v-model="folderFilter" class="mm-input" title="Show one folder">
                <option :value="null">All folders ({{ assets.length }})</option>
                <option v-if="assets.some(a => !a.folder)" value="">Loose files</option>
                <option v-for="f in folders" :key="f" :value="f">{{ f }}</option>
              </select>
              <input v-model="assetQuery" class="mm-input" type="search" placeholder="Search assets" />
            </div>
            <button v-if="folderFilter" class="mm-btn mm-small mm-danger mm-folder-del" @click="deleteFolder">
              Remove this folder ({{ shownAssets.length }})
            </button>
          </template>
          <div v-if="shownAssets.length" class="mm-assets">
            <div
              v-for="a in shownAssets" :key="a.id"
              class="mm-asset" :class="{ active: placing?.id === a.id }" :title="`${a.name}: click, then click the map`"
              @click="startPlacing(a)"
            >
              <img v-if="assetUrls[a.image]" :src="assetUrls[a.image]" :alt="a.name" />
              <span>{{ a.name }}</span>
              <button class="mm-asset-del" title="Remove from the library (placed copies stay)" @click.stop="deleteAsset(a)">×</button>
            </div>
          </div>
          <p v-else-if="assets.length" class="mm-hint">No assets match.</p>
          <p v-else class="mm-hint">
            Import PNG, WebP or SVG images with transparent backgrounds: furniture, trees, rugs, statues.
            Pick single files or a whole folder, or drop them on the page. Subfolders become folders here.
          </p>
        </section>

        <section class="mm-section">
          <span class="mm-label">Tile</span>
          <div class="mm-tiles">
            <button
              v-for="t in TILES" :key="t.id"
              class="mm-tile" :class="{ active: tileId === t.id }" :title="t.label"
              @click="pickTile(t.id)"
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
          on the encounter stay; walls made here are replaced. Assets don't block sight.
        </p>
      </aside>

      <div ref="scrollEl" class="mm-canvas-wrap">
        <canvas
          ref="canvasEl"
          class="mm-canvas"
          :class="{ 'mm-canvas--select': tool === 'select' && !placing }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @pointerleave="hover = null; pointer = null; scheduleDraw()"
          @contextmenu.prevent
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getDb, dbApi, type DbMapAsset } from '~/composables/useDb'
import { notify, reportError } from '~/composables/useNotices'
import {
  TILES, MIN_SIZE, MAX_SIZE, EXPORT_CELL_PX, PROP_MIN_SIZE, blankMap, clampSize, floodFill, fromPropFrame, getTile, mapWalls,
  paintCells, paintRoom, propAt, readBattleMap, rectCells, resizeMap, restackProp, snap, tileByChar, tileChar, toPropFrame, updateProp,
  type BattleMap, type MapProp, type TileId,
} from '~/rules/battlemap'
import { resolveImage } from '~/rules/images'
import { battleMapPng, drawBattleMap, drawProp } from '~/utils/battlemapDraw'
import { droppedImageFiles, fileToAssetImage, pickImageFiles, pickImageFolder } from '~/utils/image'
import { assetFolder, assetFolders, assetKey, assetName, filterAssets, type AssetSource } from '~/rules/mapAssets'

type Tool = 'select' | 'brush' | 'rect' | 'room' | 'fill'
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'brush', label: 'Brush', hint: 'Click or drag to paint squares.' },
  { id: 'rect', label: 'Rectangle', hint: 'Drag to fill a rectangle.' },
  { id: 'room', label: 'Room', hint: 'Drag for a room: the tile inside, walls around it.' },
  { id: 'fill', label: 'Fill', hint: 'Click to fill an area of the same tile.' },
  { id: 'select', label: 'Select', hint: 'Click an asset to select it, drag to move it. Drag the corner to resize, the top handle to rotate. Hold Shift for no snapping (and free stretching).' },
]
const UNDO_LIMIT = 100
/** Largest side of a newly placed asset, in squares. */
const PLACE_MAX = 6
/** Handle radius in screen pixels, and how far the rotate handle sits above the asset. */
const HANDLE_PX = 7
const ROTATE_GAP_PX = 22

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
/** The map before the brush stroke or asset drag in progress: either is one undo step. */
let strokeStart: BattleMap | null = null

// ── Assets ──────────────────────────────────────────────────────────────────
const assets = ref<DbMapAsset[]>([])
const assetUrls = ref<Record<string, string>>({})
const importing = ref(false)
const importDone = ref(0)
const importTotal = ref(0)
const dropping = ref(false)
/** Library filter: null = all folders, '' = loose files. */
const folderFilter = ref<string | null>(null)
const assetQuery = ref('')
const folders = computed(() => assetFolders(assets.value))
const shownAssets = computed(() => filterAssets(assets.value, folderFilter.value, assetQuery.value))
/** The library asset the next click places. */
const placing = shallowRef<DbMapAsset | null>(null)
const selectedId = ref<string | null>(null)
const selected = computed(() => map.value?.props?.find(p => p.id === selectedId.value) ?? null)
/** Pointer position in squares, for the placing preview. */
const pointer = ref<{ x: number; y: number } | null>(null)
let propDrag: { kind: 'move' | 'resize' | 'rotate'; prop: MapProp; dx: number; dy: number } | null = null

/** Loaded images of props and assets, by image ref. */
const images = new Map<string, HTMLImageElement>()
const loading = new Map<string, Promise<void>>()

function loadImage(ref: string): Promise<void> {
  let p = loading.get(ref)
  if (!p) {
    p = resolveImage(ref).then(async url => {
      if (!url) return
      assetUrls.value = { ...assetUrls.value, [ref]: url }
      const img = new Image()
      img.src = url
      await img.decode()
      images.set(ref, img)
      scheduleDraw()
    }).catch(() => {})
    loading.set(ref, p)
  }
  return p
}

async function loadAssets() {
  assets.value = await dbApi.mapAssets.list()
  for (const a of assets.value) loadImage(a.image)
}

async function importFiles() {
  const files = await pickImageFiles()
  await importSources(files.map(file => ({ file, path: file.name })))
}

async function importFolder() {
  const sources = await pickImageFolder()
  if (!sources.length) return notify('No PNG, WebP, SVG, JPEG or GIF images in that folder.', 'info')
  await importSources(sources)
}

/** Adds the images to the library; ones already there (same folder and name) are skipped. */
async function importSources(sources: AssetSource[]) {
  if (!sources.length || importing.value) return
  const known = new Set(assets.value.map(a => assetKey(a.folder, a.name)))
  importing.value = true
  importDone.value = 0
  importTotal.value = sources.length
  let failed = 0
  let skipped = 0
  for (const { file, path } of sources) {
    const name = assetName(file.name)
    const folder = assetFolder(path)
    const key = assetKey(folder, name)
    if (known.has(key)) {
      skipped++
    } else {
      try {
        const { blob, width, height } = await fileToAssetImage(file)
        await dbApi.mapAssets.add(name, blob, width, height, folder || undefined)
        known.add(key)
      } catch {
        failed++
      }
    }
    importDone.value++
  }
  importing.value = false
  await loadAssets()
  // Show what came in: the folder, when it was one
  const top = new Set(sources.map(s => assetFolder(s.path).split(' / ')[0]))
  if (top.size === 1) {
    const only = [...top][0]
    folderFilter.value = only || (folders.value.length ? '' : null)
  }
  assetQuery.value = ''
  const notes = [
    skipped && `${skipped} already in the library were skipped`,
    failed && `${failed} could not be read as images`,
  ].filter(Boolean)
  if (notes.length) notify(`Imported ${sources.length - skipped - failed} of ${sources.length}: ${notes.join(', ')}.`, failed ? 'warning' : 'info')
}

async function deleteFolder() {
  const list = shownAssets.value
  if (!list.length) return
  if (!window.confirm(`Remove ${list.length} assets in "${folderFilter.value || 'Loose files'}" from the library? Copies already placed on maps stay.`)) return
  await dbApi.mapAssets.deleteMany(list.map(a => a.id!))
  if (placing.value && list.some(a => a.id === placing.value!.id)) placing.value = null
  folderFilter.value = null
  assetQuery.value = ''
  await loadAssets()
}

function hasFiles(e: DragEvent) {
  return !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
}
function onDragOver(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'copy'
  dropping.value = true
}
function onDragLeave(e: DragEvent) {
  // Leaving for a child element fires too; only the page's own edge counts
  if (!e.relatedTarget || !(e.currentTarget as Node).contains(e.relatedTarget as Node)) dropping.value = false
}
async function onDrop(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  dropping.value = false
  const sources = await droppedImageFiles(e.dataTransfer!)
  if (!sources.length) return notify('No PNG, WebP, SVG, JPEG or GIF images were dropped.', 'info')
  await importSources(sources)
}

async function deleteAsset(a: DbMapAsset) {
  if (!window.confirm(`Remove "${a.name}" from the asset library? Copies already placed on maps stay.`)) return
  await dbApi.mapAssets.delete(a.id!)
  if (placing.value?.id === a.id) placing.value = null
  await loadAssets()
}

function startPlacing(a: DbMapAsset) {
  placing.value = placing.value?.id === a.id ? null : a
  selectedId.value = null
  scheduleDraw()
}

/** A new prop of the asset centred on a point: its short side one square, its long side at most PLACE_MAX. */
function newProp(a: DbMapAsset, x: number, y: number): MapProp {
  const aspect = a.px_width / a.px_height
  let w = aspect >= 1 ? aspect : 1
  let h = aspect >= 1 ? 1 : 1 / aspect
  const over = Math.max(w, h) / PLACE_MAX
  if (over > 1) { w /= over; h /= over }
  return { id: crypto.randomUUID(), image: a.image, x, y, w: round2(w), h: round2(h), rotation: 0, layer: 'object' }
}

function round2(v: number) {
  return Math.round(v * 100) / 100
}

function setTool(t: Tool) {
  tool.value = t
  placing.value = null
  if (t !== 'select') selectedId.value = null
  scheduleDraw()
}

function pickTile(id: TileId) {
  tileId.value = id
  if (tool.value === 'select' || placing.value) setTool('brush')
}

function patchSelected(patch: Partial<MapProp>) {
  const p = selected.value
  if (!p || !map.value) return
  commit(updateProp(map.value, p.id, { ...p, ...patch }))
}

function patchSize(key: 'w' | 'h', e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) patchSelected({ [key]: Math.max(PROP_MIN_SIZE, round2(v)) })
}

function patchRotation(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) patchSelected({ rotation: ((v % 360) + 360) % 360 })
}

function rotateSelected(deg: number) {
  if (selected.value) patchSelected({ rotation: (((selected.value.rotation + deg) % 360) + 360) % 360 })
}

function restack(step: 1 | -1) {
  if (selected.value && map.value) commit(restackProp(map.value, selected.value.id, step))
}

function duplicateSelected() {
  const p = selected.value
  if (!p || !map.value) return
  const copy = { ...p, id: crypto.randomUUID(), x: p.x + 0.5, y: p.y + 0.5 }
  commit({ ...map.value, props: [...(map.value.props ?? []), copy] })
  selectedId.value = copy.id
}

function removeSelected() {
  if (selected.value && map.value) commit(updateProp(map.value, selected.value.id, null))
  selectedId.value = null
}

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
  for (const p of map.value.props ?? []) loadImage(p.image)
  loadAssets()
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
  drawBattleMap(ctx, previewMap() ?? m, px, { grid: true, images })
  if (placing.value && pointer.value) {
    ctx.globalAlpha = 0.6
    drawProp(ctx, newProp(placing.value, pointer.value.x, pointer.value.y), px, images)
    ctx.globalAlpha = 1
  } else if (selected.value) {
    drawSelection(ctx, selected.value, px)
  } else if (hover.value && tool.value !== 'select') {
    const [c, r] = hover.value
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 2
    ctx.strokeRect(c * px + 1, r * px + 1, px - 2, px - 2)
  }
}

/** Outline of the selected prop with its resize (corner) and rotate (top) handles. */
function drawSelection(ctx: CanvasRenderingContext2D, p: MapProp, px: number) {
  ctx.save()
  ctx.translate(p.x * px, p.y * px)
  ctx.rotate((p.rotation * Math.PI) / 180)
  const hw = (p.w / 2) * px
  const hh = (p.h / 2) * px
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 4])
  ctx.strokeRect(-hw, -hh, hw * 2, hh * 2)
  ctx.setLineDash([])
  ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(0, -hh - ROTATE_GAP_PX); ctx.stroke()
  for (const [x, y] of [[hw, hh], [0, -hh - ROTATE_GAP_PX]]) {
    ctx.beginPath(); ctx.arc(x, y, HANDLE_PX - 1, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'; ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke()
  }
  ctx.restore()
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
function sameMap(a: BattleMap, b: BattleMap) {
  return a.cols === b.cols && a.rows === b.rows && a.tiles === b.tiles
    && JSON.stringify(a.props ?? []) === JSON.stringify(b.props ?? [])
}

function commit(next: BattleMap) {
  if (!map.value || sameMap(next, map.value)) return
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
  selectedId.value = null
  commit(blankMap(map.value.cols, map.value.rows, 'void'))
}

/** The pointer in squares (fractional), relative to the map's top-left. */
function pointAt(e: PointerEvent): { x: number; y: number } {
  const box = canvasEl.value!.getBoundingClientRect()
  return { x: (e.clientX - box.left) / zoom.value, y: (e.clientY - box.top) / zoom.value }
}

function cellAt(e: PointerEvent): [number, number] | null {
  const m = map.value
  if (!m) return null
  const { x, y } = pointAt(e)
  const c = Math.floor(x)
  const r = Math.floor(y)
  return c >= 0 && r >= 0 && c < m.cols && r < m.rows ? [c, r] : null
}

/** Which handle of the selected prop a point (squares) is on. */
function handleAt(p: MapProp, x: number, y: number): 'resize' | 'rotate' | null {
  const local = toPropFrame(p, x, y)
  const r = HANDLE_PX / zoom.value
  const near = (hx: number, hy: number) => Math.hypot(local.x - hx, local.y - hy) <= r
  if (near(p.w / 2, p.h / 2)) return 'resize'
  if (near(0, -p.h / 2 - ROTATE_GAP_PX / zoom.value)) return 'rotate'
  return null
}

function onPointerDown(e: PointerEvent) {
  const m = map.value
  if (!m) return
  const pt = pointAt(e)
  if (placing.value) {
    if (e.button !== 0) { placing.value = null; scheduleDraw(); return }
    const x = e.shiftKey ? pt.x : snap(pt.x, 0.5)
    const y = e.shiftKey ? pt.y : snap(pt.y, 0.5)
    const prop = newProp(placing.value, round2(x), round2(y))
    commit({ ...m, props: [...(m.props ?? []), prop] })
    selectedId.value = prop.id
    placing.value = null
    tool.value = 'select'
    scheduleDraw()
    return
  }
  if (tool.value === 'select') {
    if (e.button !== 0) return
    const sel = selected.value
    const handle = sel ? handleAt(sel, pt.x, pt.y) : null
    const hit = handle ? sel : propAt(m, pt.x, pt.y)
    selectedId.value = hit?.id ?? null
    if (hit) {
      canvasEl.value?.setPointerCapture(e.pointerId)
      strokeStart = m
      propDrag = { kind: handle ?? 'move', prop: hit, dx: pt.x - hit.x, dy: pt.y - hit.y }
    }
    scheduleDraw()
    return
  }
  const cell = cellAt(e)
  if (!cell) return
  if (e.button === 2) {
    tileId.value = tileByChar(getTile(m, cell[0], cell[1])).id
    return
  }
  if (e.button !== 0) return
  canvasEl.value?.setPointerCapture(e.pointerId)
  hover.value = cell
  if (tool.value === 'fill') commit(floodFill(m, cell[0], cell[1], tileChar(tileId.value)))
  else if (tool.value === 'brush') {
    strokeStart = m
    map.value = paintCells(m, [cell], tileChar(tileId.value))
  } else dragStart = cell
  scheduleDraw()
}

/** The dragged prop for the pointer at (x, y); Shift turns snapping off. */
function draggedProp(d: NonNullable<typeof propDrag>, x: number, y: number, free: boolean): MapProp {
  const p = d.prop
  if (d.kind === 'move') {
    const nx = x - d.dx
    const ny = y - d.dy
    return { ...p, x: round2(free ? nx : snap(nx, 0.5)), y: round2(free ? ny : snap(ny, 0.5)) }
  }
  if (d.kind === 'rotate') {
    const deg = (Math.atan2(y - p.y, x - p.x) * 180) / Math.PI + 90
    const rot = free ? Math.round(deg) : snap(deg, 15)
    return { ...p, rotation: ((rot % 360) + 360) % 360 }
  }
  // Resize about the centre; the aspect stays unless Shift is held
  const local = toPropFrame(p, x, y)
  let w = Math.abs(local.x) * 2
  let h = Math.abs(local.y) * 2
  if (free) {
    w = snap(w, 0.25)
    h = snap(h, 0.25)
  } else {
    const scale = Math.max(w / p.w, h / p.h)
    const big = Math.max(p.w, p.h) * scale
    const k = Math.max(0.5, snap(big, 0.5)) / Math.max(p.w, p.h)
    w = p.w * k
    h = p.h * k
  }
  return { ...p, w: round2(Math.max(PROP_MIN_SIZE, w)), h: round2(Math.max(PROP_MIN_SIZE, h)) }
}

function onPointerMove(e: PointerEvent) {
  const pt = pointAt(e)
  if (placing.value) {
    pointer.value = { x: e.shiftKey ? pt.x : snap(pt.x, 0.5), y: e.shiftKey ? pt.y : snap(pt.y, 0.5) }
    scheduleDraw()
    return
  }
  if (propDrag && strokeStart) {
    map.value = updateProp(strokeStart, propDrag.prop.id, draggedProp(propDrag, pt.x, pt.y, e.shiftKey))
    scheduleDraw()
    return
  }
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
  propDrag = null
  scheduleDraw()
}

function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return
  const key = e.key.toLowerCase()
  if (e.ctrlKey || e.metaKey) {
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
    else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
    else if (key === 'd' && selected.value) { e.preventDefault(); duplicateSelected() }
    return
  }
  if (key === 'escape') {
    placing.value = null
    selectedId.value = null
    scheduleDraw()
    return
  }
  const p = selected.value
  if (!p) return
  const step = e.shiftKey ? 0.1 : 0.5
  const nudge: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }
  if (nudge[key]) {
    e.preventDefault()
    patchSelected({ x: round2(p.x + nudge[key][0]), y: round2(p.y + nudge[key][1]) })
  } else if (key === 'delete' || key === 'backspace') { e.preventDefault(); removeSelected() }
  else if (key === 'r') rotateSelected(e.shiftKey ? -90 : 90)
  else if (key === 'f') patchSelected({ flip: !p.flip })
  else if (key === ']') restack(1)
  else if (key === '[') restack(-1)
}

// ── Saving ──────────────────────────────────────────────────────────────────
async function save() {
  if (!map.value) return
  saving.value = true
  try {
    await Promise.all((map.value.props ?? []).map(p => loadImage(p.image)))
    const missing = (map.value.props ?? []).filter(p => !images.has(p.image)).length
    const png = await battleMapPng(map.value, EXPORT_CELL_PX, images)
    const walls = makeWalls.value ? mapWalls(map.value) : null
    await dbApi.encounters.applyBattleMap(encounterId, map.value, png, walls)
    dirty.value = false
    notify(walls ? `Map saved with ${walls.length} walls and doors; FOV is on.` : 'Map saved.')
    if (missing) notify(`${missing} placed assets have no image any more and were left out.`, 'warning')
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
.mm-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.mm-label-row .mm-label { margin-bottom: 0; }
.mm-small { padding: 3px 8px; font-size: 11px; }
.mm-danger:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); }
.mm-import { display: flex; gap: 4px; }
.mm-progress { font-size: 11px; color: var(--ink-faded); }
.mm-filter {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}
.mm-input {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid var(--border-hi);
  border-radius: var(--r);
  background: var(--surface-solid);
  color: var(--ink);
  font-size: 12px;
}
.mm-folder-del { width: 100%; margin-bottom: 6px; }
.mm-page.mm-dropping { outline: 3px dashed var(--accent); outline-offset: -3px; }
.mm-assets {
  max-height: 360px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.mm-asset {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
  cursor: pointer;
  min-width: 0;
}
.mm-asset.active { border-color: var(--accent); background: var(--accent-bg); }
.mm-asset img {
  width: 100%;
  height: 48px;
  object-fit: contain;
}
.mm-asset span {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 10px;
  color: var(--ink-faded);
}
.mm-asset-del {
  position: absolute;
  top: 1px;
  right: 2px;
  display: none;
  border: none;
  background: none;
  color: var(--ink-faded);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.mm-asset:hover .mm-asset-del { display: block; }
.mm-asset-del:hover { color: var(--danger); }
.mm-seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--border-hi);
  border-radius: var(--r);
  overflow: hidden;
}
.mm-seg button {
  padding: 5px;
  border: none;
  background: var(--surface);
  color: var(--ink-faded);
  font-family: var(--font-ui);
  font-size: 12px;
  cursor: pointer;
}
.mm-seg button.active { background: var(--accent-bg); color: var(--ink); }
.mm-fields {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin: 8px 0;
}
.mm-fields label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--ink-faded);
}
.mm-fields input {
  width: 100%;
  min-width: 0;
  padding: 3px 4px;
  border: 1px solid var(--border-hi);
  border-radius: var(--r);
  background: var(--surface-solid);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 11px;
}
.mm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.mm-actions .mm-btn { justify-content: center; }

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
.mm-canvas--select { cursor: default; }
</style>
