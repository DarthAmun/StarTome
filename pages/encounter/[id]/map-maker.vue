<template>
  <div class="mm-page" :class="{ 'mm-dropping': dropping }" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <header class="mm-toolbar">
      <NuxtLink :to="`/encounter/${encounterId}`" class="mm-btn" title="Back to the encounter">
        <OhVueIcon name="md-arrowback" scale="0.75" /> <span class="mm-hide-narrow">Encounter</span>
      </NuxtLink>
      <span class="mm-title">Map Maker<span v-if="encounterName" class="mm-hide-narrow"> · {{ encounterName }}</span></span>
      <div class="mm-gap" />
      <div class="mm-group">
        <button class="mm-icon-btn" :disabled="!undoStack.length" title="Undo (Ctrl+Z)" aria-label="Undo" @click="undo">
          <OhVueIcon name="md-undo" scale="0.85" />
        </button>
        <button class="mm-icon-btn" :disabled="!redoStack.length" title="Redo (Ctrl+Y)" aria-label="Redo" @click="redo">
          <OhVueIcon name="md-redo" scale="0.85" />
        </button>
      </div>
      <div ref="mapMenuEl" class="mm-menu-wrap">
        <button class="mm-btn" :class="{ active: mapMenuOpen }" :aria-expanded="mapMenuOpen" @click="mapMenuOpen = !mapMenuOpen">
          <OhVueIcon name="md-gridon" scale="0.75" /> {{ map ? `${map.cols} × ${map.rows}` : 'Map' }}
          <OhVueIcon name="md-arrowdropdown" scale="0.8" />
        </button>
        <div v-if="mapMenuOpen" class="mm-popover" role="dialog" aria-label="Map size">
          <span class="mm-label">Size in squares</span>
          <div class="mm-size">
            <input v-model.number="sizeCols" type="number" :min="MIN_SIZE" :max="MAX_SIZE" aria-label="Columns" @keydown.enter="applySize" />
            <span>×</span>
            <input v-model.number="sizeRows" type="number" :min="MIN_SIZE" :max="MAX_SIZE" aria-label="Rows" @keydown.enter="applySize" />
            <button class="mm-btn" :disabled="!map || (sizeCols === map.cols && sizeRows === map.rows)" @click="applySize">Resize</button>
          </div>
          <p class="mm-hint">Growing adds empty squares on the right and bottom; shrinking cuts them off there.</p>
          <div class="mm-divider" />
          <button class="mm-btn mm-danger mm-wide" @click="clearMap(); mapMenuOpen = false">Start over</button>
          <p class="mm-hint">Clears every tile and asset. Undo brings it back.</p>
        </div>
      </div>
      <button class="mm-btn" :class="{ active: assetsOpen }" title="Asset library" :aria-pressed="assetsOpen" @click="assetsOpen = !assetsOpen">
        <OhVueIcon name="md-photolibrary" scale="0.75" /> <span class="mm-hide-narrow">Assets</span>
      </button>
      <label class="mm-check" title="Make line-of-sight walls and doors from the wall and door tiles, and turn FOV on">
        <input v-model="makeWalls" type="checkbox" /> Make walls
      </label>
      <Button
        size="small" class="mm-save" :loading="saving" :disabled="!map"
        :title="`Draws the map at ${EXPORT_CELL_PX} px per square and sets the encounter's grid to match. Walls you drew by hand on the encounter stay; walls made here are replaced. Assets don't block sight.`"
        @click="save"
      >
        <OhVueIcon name="md-check" scale="0.8" /> Use as encounter map
      </Button>
    </header>

    <div class="mm-body" :class="{ 'mm-drawer-open': assetsOpen }">
      <nav class="mm-rail" aria-label="Tools and tiles">
        <div class="mm-rail-grid">
          <button
            v-for="t in TOOLS" :key="t.id"
            class="mm-rail-btn" :class="{ active: tool === t.id && !placing }"
            :title="`${t.label} (${t.key.toUpperCase()}): ${t.hint}`" :aria-label="t.label"
            @click="setTool(t.id)"
          >
            <OhVueIcon :name="t.icon" scale="0.9" />
          </button>
        </div>
        <div class="mm-rail-sep" />
        <div class="mm-rail-grid">
          <button
            v-for="t in TILES" :key="t.id"
            class="mm-rail-btn mm-rail-tile" :class="{ active: tileId === t.id }" :title="t.label" :aria-label="t.label"
            @click="pickTile(t.id)"
          >
            <canvas :ref="el => swatchRefs[t.id] = el as HTMLCanvasElement | null" width="28" height="28" class="mm-swatch" />
          </button>
        </div>
      </nav>

      <main ref="viewEl" class="mm-view" @wheel.prevent="onWheel">
        <canvas
          ref="canvasEl"
          class="mm-canvas"
          :class="canvasCursor"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @pointerleave="hover = null; pointer = null; scheduleDraw()"
          @contextmenu.prevent
          @auxclick.prevent
        />

        <div v-if="selected" class="mm-float mm-propbar" role="toolbar" aria-label="Selected asset">
          <div class="mm-seg">
            <button :class="{ active: selected.layer === 'floor' }" title="On the floor, under walls' shadows" @click="patchSelected({ layer: 'floor' })">Floor</button>
            <button :class="{ active: selected.layer === 'object' }" title="On top of everything" @click="patchSelected({ layer: 'object' })">Object</button>
          </div>
          <div class="mm-fields">
            <label title="Width in squares">W <input type="number" :value="selected.w" :min="PROP_MIN_SIZE" step="0.25" @change="patchSize('w', $event)" /></label>
            <label title="Height in squares">H <input type="number" :value="selected.h" :min="PROP_MIN_SIZE" step="0.25" @change="patchSize('h', $event)" /></label>
            <label title="Rotation in degrees">° <input type="number" :value="selected.rotation" step="15" @change="patchRotation($event)" /></label>
          </div>
          <div class="mm-group">
            <button class="mm-icon-btn" title="Rotate 90° (R)" aria-label="Rotate 90°" @click="rotateSelected(90)"><OhVueIcon name="md-rotateright" scale="0.8" /></button>
            <button class="mm-icon-btn" title="Mirror (F)" aria-label="Mirror" @click="patchSelected({ flip: !selected.flip })"><OhVueIcon name="md-flip" scale="0.8" /></button>
            <button class="mm-icon-btn" title="Bring forward (])" aria-label="Bring forward" @click="restack(1)"><OhVueIcon name="md-fliptofront" scale="0.8" /></button>
            <button class="mm-icon-btn" title="Send backward ([)" aria-label="Send backward" @click="restack(-1)"><OhVueIcon name="md-fliptoback" scale="0.8" /></button>
            <button class="mm-icon-btn" title="Duplicate (Ctrl+D)" aria-label="Duplicate" @click="duplicateSelected"><OhVueIcon name="md-contentcopy" scale="0.75" /></button>
            <button class="mm-icon-btn mm-danger" title="Remove (Delete)" aria-label="Remove" @click="removeSelected"><OhVueIcon name="md-delete" scale="0.8" /></button>
          </div>
        </div>

        <div class="mm-float mm-bottom">
          <div class="mm-zoom" role="group" aria-label="Zoom">
            <button class="mm-icon-btn" title="Zoom out (-)" aria-label="Zoom out" @click="zoomBy(1 / 1.25)"><OhVueIcon name="md-zoomout" scale="0.8" /></button>
            <button class="mm-zoom-pct" title="Fit the map (0)" @click="fitView">{{ zoomPct }}%</button>
            <button class="mm-icon-btn" title="Zoom in (+)" aria-label="Zoom in" @click="zoomBy(1.25)"><OhVueIcon name="md-zoomin" scale="0.8" /></button>
            <button class="mm-icon-btn" title="Fit the map (0)" aria-label="Fit the map" @click="fitView"><OhVueIcon name="md-fitscreen" scale="0.8" /></button>
          </div>
          <p class="mm-status">
            <template v-if="placing">Click to place <b>{{ placing.name }}</b>. Shift: off the grid. Esc: stop.</template>
            <template v-else>
              <b>{{ TOOLS.find(t => t.id === tool)?.label }}</b>
              <template v-if="tool !== 'select' && tool !== 'pan'"> · {{ TILES.find(t => t.id === tileId)?.label }}</template>
              — {{ TOOLS.find(t => t.id === tool)?.hint }}
              <span class="mm-status-pan">Wheel zooms; middle-drag, Alt-drag or Space-drag pans.</span>
            </template>
          </p>
        </div>
      </main>

      <aside v-if="assetsOpen" class="mm-drawer" aria-label="Asset library">
        <div class="mm-drawer-head">
          <span class="mm-label">Assets<span v-if="assets.length" class="mm-count">{{ assets.length }}</span></span>
          <span v-if="importing" class="mm-progress">Importing {{ importDone }}/{{ importTotal }}…</span>
          <span v-else class="mm-group">
            <button class="mm-btn mm-small" title="Import image files" @click="importFiles"><OhVueIcon name="md-image" scale="0.65" /> Files</button>
            <button class="mm-btn mm-small" title="Import a folder with all its subfolders" @click="importFolder"><OhVueIcon name="md-folder" scale="0.65" /> Folder</button>
          </span>
          <button class="mm-icon-btn" title="Close" aria-label="Close the asset library" @click="assetsOpen = false"><OhVueIcon name="md-close" scale="0.75" /></button>
        </div>
        <div v-if="assets.length" class="mm-filter">
          <select v-if="folders.length" v-model="folderFilter" class="mm-input" title="Show one folder">
            <option :value="null">All folders</option>
            <option v-if="assets.some(a => !a.folder)" value="">Loose files</option>
            <option v-for="f in folders" :key="f" :value="f">{{ f }}</option>
          </select>
          <input v-model="assetQuery" class="mm-input" type="search" placeholder="Search assets" aria-label="Search assets" />
          <div v-if="folderFilter !== null || assetQuery" class="mm-filter-info">
            <span>{{ shownAssets.length }} shown</span>
            <button v-if="folderFilter" class="mm-link mm-danger" @click="deleteFolder">Remove this folder</button>
          </div>
        </div>
        <div class="mm-drawer-body">
          <div v-if="shownAssets.length" class="mm-assets">
            <div
              v-for="a in visibleAssets" :key="a.id"
              class="mm-asset" :class="{ active: placing?.id === a.id }" :title="`${a.name}${a.folder ? ` (${a.folder})` : ''}: click, then click the map`"
              @click="startPlacing(a)"
            >
              <img v-if="assetUrls[a.image]" :src="assetUrls[a.image]" :alt="a.name" decoding="async" />
              <span>{{ a.name }}</span>
              <button class="mm-asset-del" title="Remove from the library (placed copies stay)" aria-label="Remove from the library" @click.stop="deleteAsset(a)">×</button>
            </div>
          </div>
          <button v-if="shownAssets.length > visibleAssets.length" class="mm-btn mm-small mm-wide" @click="assetLimit += LIBRARY_PAGE">
            Show more ({{ shownAssets.length - visibleAssets.length }} left)
          </button>
          <p v-else-if="assets.length && !shownAssets.length" class="mm-hint">No assets match.</p>
          <div v-else-if="!assets.length" class="mm-empty">
            <OhVueIcon name="md-photolibrary" scale="1.6" />
            <p>Import PNG, WebP or SVG images with transparent backgrounds: furniture, trees, rugs, statues.</p>
            <p>Pick single files or a whole folder, or drop them anywhere on the map maker. Subfolders become folders here.</p>
          </div>
        </div>
      </aside>
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
import { imageRefId, isImageRef, resolveImage, resolveThumb } from '~/rules/images'
import { battleMapPng, drawBattleMap, drawProp } from '~/utils/battlemapDraw'
import { droppedImageFiles, fileToAssetImage, pickImageFiles, pickImageFolder } from '~/utils/image'
import { assetFolder, assetFolders, assetKey, assetName, filterAssets, type AssetSource } from '~/rules/mapAssets'

type Tool = 'select' | 'pan' | 'brush' | 'rect' | 'room' | 'fill'
const TOOLS: { id: Tool; label: string; key: string; icon: string; hint: string }[] = [
  { id: 'select', label: 'Select', key: 'v', icon: 'md-nearme', hint: 'Click an asset to select it, drag to move it. Drag the corner to resize, the top handle to rotate; Shift turns snapping off. Drag empty space to pan.' },
  { id: 'pan', label: 'Pan', key: 'h', icon: 'md-pantool', hint: 'Drag to move the view.' },
  { id: 'brush', label: 'Brush', key: 'b', icon: 'md-brush', hint: 'Click or drag to paint squares. Right-click picks a tile.' },
  { id: 'rect', label: 'Rectangle', key: 'm', icon: 'md-cropsquare', hint: 'Drag to fill a rectangle. Right-click picks a tile.' },
  { id: 'room', label: 'Room', key: 'w', icon: 'md-borderouter', hint: 'Drag for a room: the tile inside, walls around it. Right-click picks a tile.' },
  { id: 'fill', label: 'Fill', key: 'g', icon: 'md-formatpaint', hint: 'Click to fill an area of the same tile. Right-click picks a tile.' },
]
/** Zoom in screen pixels per square; 100% is ZOOM_BASE. */
const ZOOM_MIN = 6
const ZOOM_MAX = 140
const ZOOM_BASE = 40
/** How much of the map stays on screen when panning off, in pixels. */
const PAN_KEEP_PX = 80
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
const viewEl = ref<HTMLElement | null>(null)
const mapMenuEl = ref<HTMLElement | null>(null)
const mapMenuOpen = ref(false)
const assetsOpen = ref(readPref('mm-assets-open', 'true') === 'true')
watch(assetsOpen, (v) => { writePref('mm-assets-open', String(v)); nextTick(onViewResize) })

// ── View: pan and zoom ──────────────────────────────────────────────────────
/** Where the map's top-left corner sits in the view, in screen pixels. */
const view = { x: 24, y: 24 }
let viewW = 0
let viewH = 0
let panDrag: { sx: number; sy: number; vx: number; vy: number } | null = null
const panning = ref(false)
const spaceDown = ref(false)
const zoomPct = computed(() => Math.round((zoom.value / ZOOM_BASE) * 100))
const canvasCursor = computed(() => {
  if (panning.value) return 'mm-cursor-grabbing'
  if (spaceDown.value || (tool.value === 'pan' && !placing.value)) return 'mm-cursor-grab'
  if (tool.value === 'select' && !placing.value) return 'mm-cursor-default'
  return ''
})

function readPref(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function writePref(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode: not remembered */ }
}

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

/** Keeps part of the map on screen. */
function clampView() {
  const m = map.value
  if (!m) return
  const w = m.cols * zoom.value
  const h = m.rows * zoom.value
  const keepX = Math.min(PAN_KEEP_PX, w)
  const keepY = Math.min(PAN_KEEP_PX, h)
  view.x = Math.min(viewW - keepX, Math.max(keepX - w, view.x))
  view.y = Math.min(viewH - keepY, Math.max(keepY - h, view.y))
}

/** Zooms keeping the point (cx, cy) of the view, in screen pixels, where it is. */
function zoomAt(next: number, cx: number, cy: number) {
  const z = clampZoom(next)
  const k = z / zoom.value
  view.x = cx - (cx - view.x) * k
  view.y = cy - (cy - view.y) * k
  zoom.value = z
  clampView()
  scheduleDraw()
}

function zoomBy(factor: number) {
  zoomAt(zoom.value * factor, viewW / 2, viewH / 2)
}

function fitView() {
  const m = map.value
  if (!m || !viewW) return
  const pad = 32
  zoom.value = clampZoom(Math.min((viewW - pad * 2) / m.cols, (viewH - pad * 2) / m.rows))
  view.x = (viewW - m.cols * zoom.value) / 2
  view.y = (viewH - m.rows * zoom.value) / 2
  scheduleDraw()
}

function onWheel(e: WheelEvent) {
  const box = viewEl.value!.getBoundingClientRect()
  // Lines (old mice) and pixels (trackpads, pinch) both end up as a smooth factor
  const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
  zoomAt(zoom.value * Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - box.left, e.clientY - box.top)
}

function onViewResize() {
  const el = viewEl.value
  if (!el) return
  viewW = el.clientWidth
  viewH = el.clientHeight
  clampView()
  scheduleDraw()
}

function startPan(e: PointerEvent) {
  panDrag = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
  panning.value = true
  canvasEl.value?.setPointerCapture(e.pointerId)
}

function onDocPointerDown(e: PointerEvent) {
  if (mapMenuOpen.value && !mapMenuEl.value?.contains(e.target as Node)) mapMenuOpen.value = false
}

function onKeyUp(e: KeyboardEvent) {
  if (e.key === ' ') spaceDown.value = false
}
const swatchRefs: Partial<Record<TileId, HTMLCanvasElement | null>> = {}

/** Hovered cell, and the drag start for the rectangle and room tools. */
const hover = ref<[number, number] | null>(null)
let dragStart: [number, number] | null = null
/** The map before the brush stroke or asset drag in progress: either is one undo step. */
let strokeStart: BattleMap | null = null

// ── Assets ──────────────────────────────────────────────────────────────────
const assets = shallowRef<DbMapAsset[]>([])
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
/** Libraries run to thousands of assets: render (and load thumbnails for) a page at a time. */
const LIBRARY_PAGE = 120
const assetLimit = ref(LIBRARY_PAGE)
const visibleAssets = computed(() => shownAssets.value.slice(0, assetLimit.value))
watch([folderFilter, assetQuery], () => { assetLimit.value = LIBRARY_PAGE })
watch(visibleAssets, list => { for (const a of list) loadThumb(a.image) }, { immediate: true })
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

/** A small WebP thumbnail (made once, kept on the image row); the full image is decoded only when placed (loadImage). */
function loadThumb(ref: string) {
  if (ref in assetUrls.value) return
  assetUrls.value[ref] = ''
  const thumb = isImageRef(ref) ? resolveThumb(imageRefId(ref)) : resolveImage(ref)
  thumb.then((url) => { if (url) assetUrls.value[ref] = url }).catch(() => {})
}

async function loadAssets() {
  assets.value = await dbApi.mapAssets.list()
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
  if (placing.value) loadImage(a.image)
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
  if (t !== 'select' && t !== 'pan') selectedId.value = null
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
  await nextTick()
  onViewResize()
  fitView()
  if (viewEl.value) {
    resizeObserver = new ResizeObserver(onViewResize)
    resizeObserver.observe(viewEl.value)
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  document.addEventListener('pointerdown', onDocPointerDown)
  window.addEventListener('beforeunload', onBeforeUnload)
})

let resizeObserver: ResizeObserver | null = null
function onWindowBlur() {
  spaceDown.value = false
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onWindowBlur)
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('Leave the map maker? Changes since you last used the map are lost.')) return false
})

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) e.preventDefault()
}

watch(zoom, () => scheduleDraw())
watch(() => map.value && `${map.value.cols}x${map.value.rows}`, () => { clampView(); scheduleDraw() })

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
  // The canvas covers the view; the map is drawn into it at the pan offset
  const w = Math.max(1, Math.round(viewW * dpr))
  const h = Math.max(1, Math.round(viewH * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.setTransform(dpr, 0, 0, dpr, view.x * dpr, view.y * dpr)
  const mw = m.cols * px
  const mh = m.rows * px
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 6
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, mw, mh)
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, mw, mh)
  ctx.clip()
  drawBattleMap(ctx, previewMap() ?? m, px, { grid: true, images })
  ctx.restore()
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
  return { x: (e.clientX - box.left - view.x) / zoom.value, y: (e.clientY - box.top - view.y) / zoom.value }
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
  if (e.button === 1 || (e.button === 0 && (e.altKey || spaceDown.value || (tool.value === 'pan' && !placing.value)))) {
    e.preventDefault()
    startPan(e)
    return
  }
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
    } else {
      startPan(e)
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
  if (panDrag) {
    view.x = panDrag.vx + e.clientX - panDrag.sx
    view.y = panDrag.vy + e.clientY - panDrag.sy
    clampView()
    scheduleDraw()
    return
  }
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
  if (panDrag) {
    panDrag = null
    panning.value = false
    return
  }
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
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
  const key = e.key.toLowerCase()
  if (key === ' ') {
    // Hold to pan; stops the page scrolling or a focused button clicking
    e.preventDefault()
    spaceDown.value = true
    return
  }
  if (e.ctrlKey || e.metaKey) {
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
    else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
    else if (key === 'd' && selected.value) { e.preventDefault(); duplicateSelected() }
    return
  }
  if (key === 'escape') {
    if (mapMenuOpen.value) { mapMenuOpen.value = false; return }
    placing.value = null
    selectedId.value = null
    scheduleDraw()
    return
  }
  if (e.altKey) return
  if (key === '0') { fitView(); return }
  if (key === '+' || key === '=') { zoomBy(1.25); return }
  if (key === '-') { zoomBy(1 / 1.25); return }
  const t = TOOLS.find(t => t.key === key)
  if (t) { setTool(t.id); return }
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
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
}
.mm-page.mm-dropping::after {
  content: 'Drop images or folders to add them to the asset library';
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  border: 3px dashed var(--accent);
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  color: var(--ink);
  font-size: 14px;
  pointer-events: none;
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.mm-toolbar {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 52px;
  flex-shrink: 0;
  background: var(--parch-dark);
  border-bottom: 1px solid var(--parch-line);
}
.mm-title {
  min-width: 0;
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
.mm-group { display: inline-flex; gap: 2px; flex-shrink: 0; }
.mm-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 5px 10px;
  border: 1px solid var(--border-hi);
  border-radius: var(--r);
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 12px;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
}
.mm-btn:hover:not(:disabled), .mm-icon-btn:hover:not(:disabled) { border-color: var(--accent); }
.mm-btn:disabled, .mm-icon-btn:disabled { opacity: 0.4; cursor: default; }
.mm-btn.active { border-color: var(--accent); background: var(--accent-bg); }
.mm-icon-btn {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--r);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.mm-small { padding: 3px 8px; font-size: 11px; }
.mm-wide { width: 100%; justify-content: center; }
.mm-danger:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); }
.mm-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  font-size: 12px;
  white-space: nowrap;
  color: var(--ink-faded);
  cursor: pointer;
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

/* Map size popover */
.mm-menu-wrap { position: relative; flex-shrink: 0; }
.mm-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 260px;
  padding: 12px 14px;
  border: 1px solid var(--border-hi);
  border-radius: var(--r);
  background: var(--surface-solid);
  box-shadow: var(--sh-md);
}
.mm-divider { height: 1px; margin: 12px 0; background: var(--parch-line); }
.mm-size {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-faded);
}
.mm-size input, .mm-fields input, .mm-input {
  padding: 4px 6px;
  border: 1px solid var(--border-hi);
  border-radius: var(--r);
  background: var(--surface-solid);
  color: var(--ink);
  font-size: 12px;
}
.mm-size input { width: 56px; font-family: var(--font-mono); }

/* ── Body: rail, view, drawer ────────────────────────────────────────────── */
.mm-body {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 0;
}

.mm-rail {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 8px;
  overflow-y: auto;
  scrollbar-width: thin;
  background: var(--parch);
  border-right: 1px solid var(--parch-line);
}
.mm-rail-grid {
  display: grid;
  grid-template-columns: repeat(2, 34px);
  gap: 4px;
}
.mm-rail-sep { height: 1px; background: var(--parch-line); }
.mm-rail-btn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}
.mm-rail-btn:hover { border-color: var(--border-hi); }
.mm-rail-btn.active { border-color: var(--accent); background: var(--accent-bg); box-shadow: 0 0 0 1px var(--accent); }
.mm-rail-tile { padding: 2px; }
.mm-swatch { width: 28px; height: 28px; border-radius: 3px; display: block; }

.mm-view {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: var(--leather);
}
.mm-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
  touch-action: none;
}
.mm-cursor-default { cursor: default; }
.mm-cursor-grab { cursor: grab; }
.mm-cursor-grabbing { cursor: grabbing; }

/* Floating controls over the map */
.mm-float {
  position: absolute;
  z-index: 5;
}
.mm-propbar {
  top: 12px;
  left: 12px;
  right: 12px;
  width: fit-content;
  margin-inline: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--border-hi);
  border-radius: var(--r);
  background: var(--surface-solid);
  box-shadow: var(--sh-md);
}
.mm-seg {
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--border-hi);
  border-radius: var(--r);
  overflow: hidden;
}
.mm-seg button {
  padding: 4px 10px;
  border: none;
  background: var(--surface);
  color: var(--ink-faded);
  font-family: var(--font-ui);
  font-size: 12px;
  cursor: pointer;
}
.mm-seg button.active { background: var(--accent-bg); color: var(--ink); }
.mm-fields { display: inline-flex; gap: 6px; }
.mm-fields label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--ink-faded);
}
.mm-fields input { width: 54px; padding: 3px 4px; font-family: var(--font-mono); font-size: 11px; }

.mm-bottom {
  left: 12px;
  right: 12px;
  bottom: 12px;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
}
.mm-bottom > * { pointer-events: auto; }
.mm-zoom {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 2px;
  border: 1px solid var(--border-hi);
  border-radius: var(--r);
  background: var(--surface-solid);
  box-shadow: var(--sh-md);
}
.mm-zoom-pct {
  min-width: 48px;
  padding: 4px 2px;
  border: none;
  background: none;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
}
.mm-status {
  min-width: 0;
  max-width: 560px;
  margin: 0;
  padding: 5px 10px;
  border-radius: var(--r);
  background: color-mix(in srgb, var(--surface-solid) 88%, transparent);
  font-size: 11px;
  line-height: 1.4;
  color: var(--ink-faded);
}
.mm-status b { color: var(--ink); font-weight: 600; }
.mm-status-pan { display: block; opacity: 0.8; }

/* ── Asset drawer ────────────────────────────────────────────────────────── */
.mm-drawer {
  flex-shrink: 0;
  width: 290px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--parch);
  border-left: 1px solid var(--parch-line);
}
.mm-drawer-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px 8px 14px;
  border-bottom: 1px solid var(--parch-line);
}
.mm-drawer-head .mm-label { flex: 1; margin: 0; }
.mm-count {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--surface);
  font-family: var(--font-mono);
  letter-spacing: 0;
}
.mm-progress { font-size: 11px; color: var(--ink-faded); white-space: nowrap; }
.mm-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--parch-line);
}
.mm-input { width: 100%; }
.mm-filter-info {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ink-faded);
}
.mm-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-faded);
  font-size: 11px;
  text-decoration: underline;
  cursor: pointer;
}
.mm-link.mm-danger:hover { color: var(--danger); }
.mm-drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 14px 72px; /* room for the app's floating buttons */
  scrollbar-width: thin;
}
.mm-drawer-body .mm-wide { margin-top: 8px; }
.mm-assets {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 6px;
}
.mm-asset {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 5px 4px 4px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
  cursor: pointer;
  min-width: 0;
}
.mm-asset:hover { border-color: var(--border-hi); }
.mm-asset.active { border-color: var(--accent); background: var(--accent-bg); }
.mm-asset img {
  width: 100%;
  height: 56px;
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
  right: 3px;
  display: none;
  border: none;
  background: none;
  color: var(--ink-faded);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.mm-asset:hover .mm-asset-del { display: block; }
.mm-asset-del:hover { color: var(--danger); }
.mm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 24px 6px;
  text-align: center;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-faded);
}
.mm-empty p { margin: 0; }

/* ── Narrow screens ──────────────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .mm-hide-narrow { display: none; }
  .mm-status-pan { display: none; }
  /* The drawer floats over the map instead of squeezing it */
  .mm-drawer {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    box-shadow: var(--sh-md);
  }
  /* …so the floating bars keep clear of it */
  .mm-drawer-open .mm-propbar, .mm-drawer-open .mm-bottom { right: 302px; }
  .mm-status { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
@media (max-width: 760px) {
  .mm-check { font-size: 0; gap: 0; }
  .mm-drawer { width: min(290px, 100%); }
  .mm-drawer-open .mm-propbar, .mm-drawer-open .mm-bottom { right: 12px; }
  .mm-status { display: none; }
}
</style>
