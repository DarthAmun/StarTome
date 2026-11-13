<script setup lang="ts">
/**
 * The map maker: paint a battle map from tiles, place assets from your
 * library on it, and use it as the encounter's map. "Make walls" derives the
 * sight-blocking walls and doors from the tiles.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { ArrowLeft, FlipHorizontal, Redo2, RotateCw, Trash2, Undo2 } from 'lucide-vue-next'
import { EXPORT_CELL_PX, MAX_SIZE, MIN_SIZE, PROP_MIN_SIZE, TILES, blankMap, mapWalls, readBattleMap, tileChar, type BattleMap, type TileId } from '@/domain/rules/battlemap'
import { applyBattleMap, encounters } from '@/data/encounters'
import { images as imageRepo } from '@/data/repo'
import { storeImage } from '@/services/images'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import AssetLibrary from './AssetLibrary.vue'
import { battleMapPng, drawBattleMap } from './draw'
import { useMapEditor, ZOOM_BASE, type Tool } from './editor'

const props = defineProps<{ campaignId: string; encounterId: string }>()
const router = useRouter()

const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'select', label: 'Select', key: 'v', hint: 'Click an asset to select it, drag to move it; the corner resizes, the top handle rotates; Shift turns snapping off. Drag empty space to pan.' },
  { id: 'pan', label: 'Pan', key: 'h', hint: 'Drag to move the view (also: middle button, Alt-drag, Space-drag).' },
  { id: 'brush', label: 'Brush', key: 'b', hint: 'Click or drag to paint squares. Right-click picks a tile.' },
  { id: 'rect', label: 'Rectangle', key: 'm', hint: 'Drag to fill a rectangle.' },
  { id: 'room', label: 'Room', key: 'w', hint: 'Drag for a room: the tile inside, walls around it.' },
  { id: 'fill', label: 'Fill', key: 'g', hint: 'Click to fill an area of the same tile.' },
]

const canvasEl = ref<HTMLCanvasElement | null>(null)
const viewEl = ref<HTMLElement | null>(null)
/** Loaded images of placed assets, by image ref ("img:<id>"). */
const loaded = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<void>>()
const ed = useMapEditor(canvasEl, loaded)
const { map, tool, tileId, zoom, dirty, undoStack, redoStack, placing, selected, panning, spaceDown } = ed

const name = ref('')
const found = ref<boolean | null>(null)
const makeWalls = ref(true)
const saving = ref(false)
const cols = ref(24), rows = ref(18)
const swatches: Partial<Record<TileId, HTMLCanvasElement>> = {}
let observer: ResizeObserver | null = null
const hint = computed(() => (placing.value ? `Click to place “${placing.value.name}”; Shift places it off the grid; Esc stops.` : TOOLS.find(t => t.id === tool.value)?.hint ?? ''))

function loadImage(ref: string): Promise<void> {
  let p = pending.get(ref)
  if (!p) {
    p = (async () => {
      const row = await imageRepo.get(ref.replace(/^img:/, ''))
      if (!row) return
      const img = new Image()
      img.src = URL.createObjectURL(row.blob)
      await img.decode()
      loaded.set(ref, img)
      ed.schedule()
    })().catch(() => {})
    pending.set(ref, p)
  }
  return p
}
watch(() => map.value?.props, (list) => { for (const p of list ?? []) void loadImage(p.image) })
watch(placing, (a) => { if (a) void loadImage(`img:${a.imageId}`) })
watch(map, (m) => { if (m) { cols.value = m.cols; rows.value = m.rows } })

function drawSwatches() {
  for (const t of TILES) {
    const ctx = swatches[t.id]?.getContext('2d')
    if (!ctx) continue
    // The tile in the middle of a 3×3 map, so a door sits between walls
    const opening = t.id === 'door' || t.id === 'window' || t.id === 'secret'
    const sample: BattleMap = { cols: 3, rows: 3, tiles: opening ? `sss#${tileChar(t.id)}#sss` : tileChar(t.id).repeat(9) }
    ctx.save()
    ctx.translate(-28, -28)
    drawBattleMap(ctx, sample, 28, { marks: true })
    ctx.restore()
  }
}

onMounted(async () => {
  const enc = await encounters.get(props.encounterId)
  found.value = !!enc
  if (!enc) return
  name.value = enc.name
  ed.load(readBattleMap((await encounters.map(enc.id)).battlemap) ?? blankMap(24, 18, 'void'))
  await nextTick()
  drawSwatches()
  if (viewEl.value) {
    const el = viewEl.value
    observer = new ResizeObserver(() => ed.resized(el.clientWidth, el.clientHeight))
    observer.observe(el)
    ed.resized(el.clientWidth, el.clientHeight)
    ed.fit()
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('beforeunload', onUnload)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('beforeunload', onUnload)
})
onBeforeRouteLeave(async () => !dirty.value || confirmDialog({ title: 'Leave the map maker?', body: 'Changes since you last used the map are lost.', confirmLabel: 'Leave', danger: true }))
const onUnload = (e: BeforeUnloadEvent) => { if (dirty.value) e.preventDefault() }
const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') spaceDown.value = false }

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || document.querySelector('dialog[open]')) return
  const key = e.key.toLowerCase()
  if (key === ' ') { e.preventDefault(); spaceDown.value = true; return }
  if (e.ctrlKey || e.metaKey) {
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); ed.undo() }
    else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); ed.redo() }
    else if (key === 'd' && selected.value) { e.preventDefault(); ed.duplicateSelected() }
    return
  }
  if (key === 'escape') { placing.value = null; ed.selectedId.value = null; ed.schedule(); return }
  if (e.altKey) return
  if (key === '0') { ed.fit(); return }
  if (key === '+' || key === '=') { ed.zoomBy(1.25); return }
  if (key === '-') { ed.zoomBy(0.8); return }
  const t = TOOLS.find(x => x.key === key)
  if (t) { ed.setTool(t.id); return }
  const p = selected.value
  if (!p) return
  const by = e.shiftKey ? 0.1 : 0.5
  const nudge: Record<string, [number, number]> = { arrowleft: [-by, 0], arrowright: [by, 0], arrowup: [0, -by], arrowdown: [0, by] }
  const n = nudge[key]
  if (n) { e.preventDefault(); ed.patchSelected({ x: Math.round((p.x + n[0]) * 100) / 100, y: Math.round((p.y + n[1]) * 100) / 100 }) }
  else if (key === 'delete' || key === 'backspace') { e.preventDefault(); ed.removeSelected() }
  else if (key === 'r') ed.rotateSelected(e.shiftKey ? -90 : 90)
  else if (key === 'f') ed.patchSelected({ flip: !p.flip })
  else if (key === ']') ed.restack(1)
  else if (key === '[') ed.restack(-1)
}

const num = (e: Event) => Number((e.target as HTMLInputElement).value)
function size(key: 'w' | 'h', e: Event) { if (Number.isFinite(num(e))) ed.patchSelected({ [key]: Math.max(PROP_MIN_SIZE, Math.round(num(e) * 100) / 100) }) }
async function startOver() {
  if (await confirmDialog({ title: 'Start over?', body: 'Every square becomes empty and placed assets are removed. Undo brings it back.', confirmLabel: 'Start over', danger: true })) ed.clear()
}

async function save() {
  const m = map.value
  if (!m) return
  saving.value = true
  try {
    await Promise.all((m.props ?? []).map(p => loadImage(p.image)))
    const missing = (m.props ?? []).filter(p => !loaded.has(p.image)).length
    const image = await storeImage(await battleMapPng(m, EXPORT_CELL_PX, loaded), { keepOriginal: true })
    const walls = makeWalls.value ? mapWalls(m).map(w => ({ points: w.points, kind: w.coverType })) : null
    await applyBattleMap(props.encounterId, JSON.parse(JSON.stringify(m)) as Record<string, unknown>, image, EXPORT_CELL_PX, walls)
    dirty.value = false
    notify(walls ? `Map saved with ${walls.length} walls and doors; sight is on.` : 'Map saved.', 'ok')
    if (missing) notify(`${missing} placed assets have no image any more and were left out.`)
    await router.push({ name: 'encounter', params: { campaignId: props.campaignId, encounterId: props.encounterId } })
  } catch (err) { reportError('Saving the map', err) } finally { saving.value = false }
}
</script>

<template>
  <div v-if="found" class="mm">
    <header class="top">
      <button class="btn btn-ghost btn-icon" title="Back to the encounter" @click="router.push({ name: 'encounter', params: { campaignId, encounterId } })"><ArrowLeft :size="16" /></button>
      <h2>Map maker <span class="faint">· {{ name }}</span></h2>
      <div class="seg" role="toolbar" aria-label="Tools"><button v-for="t in TOOLS" :key="t.id" :class="{ on: tool === t.id && !placing }" :title="`${t.label} (${t.key.toUpperCase()}): ${t.hint}`" :data-tool="t.id" @click="ed.setTool(t.id)">{{ t.label }}</button></div>
      <button class="btn btn-icon" title="Undo (Ctrl+Z)" :disabled="!undoStack.length" data-test="mm-undo" @click="ed.undo()"><Undo2 :size="15" /></button>
      <button class="btn btn-icon" title="Redo (Ctrl+Y)" :disabled="!redoStack.length" @click="ed.redo()"><Redo2 :size="15" /></button>
      <span class="grow" />
      <label class="faint">Size <input v-model.number="cols" type="number" :min="MIN_SIZE" :max="MAX_SIZE" class="input num" aria-label="Columns" @change="ed.resize(cols, rows)" /> × <input v-model.number="rows" type="number" :min="MIN_SIZE" :max="MAX_SIZE" class="input num" aria-label="Rows" @change="ed.resize(cols, rows)" /></label>
      <button class="btn" @click="startOver">Start over</button>
      <button class="btn btn-icon" title="Zoom out (−)" @click="ed.zoomBy(0.8)">−</button>
      <button class="btn" title="Fit (0)" @click="ed.fit()">{{ Math.round((zoom / ZOOM_BASE) * 100) }}%</button>
      <button class="btn btn-icon" title="Zoom in (+)" @click="ed.zoomBy(1.25)">+</button>
      <label class="dim" title="Walls along solid tiles and doors across door tiles; replaces the walls made the last time, keeps the ones you drew"><input v-model="makeWalls" type="checkbox" /> Make walls</label>
      <button class="btn btn-primary" :disabled="saving" data-test="mm-save" @click="save">{{ saving ? 'Saving…' : 'Use as encounter map' }}</button>
    </header>

    <aside class="tiles">
      <span class="eyebrow">Tiles</span>
      <button v-for="t in TILES" :key="t.id" class="tile" :class="{ on: tileId === t.id && tool !== 'select' && tool !== 'pan' && !placing }" :title="t.label" :data-tile="t.id" @click="ed.pickTile(t.id)">
        <canvas :ref="el => { if (el) swatches[t.id] = el as HTMLCanvasElement }" width="28" height="28" /><span>{{ t.label.replace(/ \(.*/, '') }}</span>
      </button>
    </aside>

    <div ref="viewEl" class="view" :class="{ grabbing: panning, grab: spaceDown || (tool === 'pan' && !placing), plain: tool === 'select' && !placing }">
      <canvas ref="canvasEl" data-test="mm-canvas" @pointerdown="ed.down" @pointermove="ed.move" @pointerup="ed.up" @pointercancel="ed.up" @wheel.prevent="ed.wheel" @contextmenu.prevent />
      <p class="hint">{{ hint }}</p>
      <div v-if="selected" class="sel panel" data-test="mm-selected">
        <label>W <input class="input num" type="number" step="0.5" :value="selected.w" @change="size('w', $event)" /></label>
        <label>H <input class="input num" type="number" step="0.5" :value="selected.h" @change="size('h', $event)" /></label>
        <label>° <input class="input num" type="number" step="15" :value="selected.rotation" @change="ed.patchSelected({ rotation: ((num($event) % 360) + 360) % 360 })" /></label>
        <button class="btn btn-icon" title="Rotate (R)" @click="ed.rotateSelected(90)"><RotateCw :size="14" /></button>
        <button class="btn btn-icon" title="Mirror (F)" @click="ed.patchSelected({ flip: !selected.flip })"><FlipHorizontal :size="14" /></button>
        <select class="input layer" :value="selected.layer" title="Floor lies under the walls' shadows; objects stand on top" @change="ed.patchSelected({ layer: ($event.target as HTMLSelectElement).value as 'floor' })"><option value="floor">Floor</option><option value="object">Object</option></select>
        <button class="btn" title="Forward (])" @click="ed.restack(1)">Forward</button>
        <button class="btn" title="Backward ([)" @click="ed.restack(-1)">Backward</button>
        <button class="btn" title="Duplicate (Ctrl+D)" @click="ed.duplicateSelected()">Duplicate</button>
        <button class="btn btn-icon btn-danger" title="Delete" @click="ed.removeSelected()"><Trash2 :size="14" /></button>
      </div>
    </div>

    <AssetLibrary class="assets" :placing-id="placing?.id ?? null" @place="ed.startPlacing($event)" @gone="ids => { if (placing && ids.includes(placing.id)) placing = null }" />
  </div>
  <p v-else-if="found === false" class="empty">This encounter is gone. <RouterLink :to="{ name: 'encounters', params: { campaignId } }">All encounters</RouterLink></p>
</template>

<style scoped>
.mm { height: 100%; display: grid; grid-template-columns: 150px minmax(0, 1fr) 280px; grid-template-rows: auto minmax(0, 1fr); }
.top { grid-column: 1 / -1; display: flex; align-items: center; gap: .45rem; padding: .4rem .7rem; border-bottom: var(--frame); background: var(--bg-raised); flex-wrap: wrap; }
.grow { flex: 1; } .num { width: 4.2rem; display: inline-block; padding: .2em .4em; }
.seg { display: flex; border: var(--frame); border-radius: var(--radius); overflow: hidden; } .seg button { background: none; border: 0; padding: .3rem .6rem; color: var(--text-dim); }
.seg button.on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.tiles { overflow: auto; padding: .5rem; display: flex; flex-direction: column; gap: 2px; border-right: var(--frame); background: var(--bg-raised); }
.tile { display: flex; align-items: center; gap: .45rem; background: none; border: 1px solid transparent; border-radius: var(--radius); padding: 2px 4px; font-size: .8rem; text-align: left; color: var(--text-dim); }
.tile:hover { background: var(--bg-hover); } .tile.on { border-color: var(--accent); color: var(--text); } .tile canvas { border-radius: 3px; flex: none; }
.view { position: relative; overflow: hidden; background: #15151f; cursor: crosshair; } .view.plain { cursor: default; } .view.grab { cursor: grab; } .view.grabbing { cursor: grabbing; }
.view canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
.hint { position: absolute; left: .7rem; bottom: .5rem; margin: 0; font-size: .8rem; color: #b9b7c9; background: rgb(10 10 22 / .7); padding: .15rem .5rem; border-radius: var(--radius); pointer-events: none; max-width: 70%; }
.sel { position: absolute; top: .6rem; left: 50%; transform: translateX(-50%); display: flex; gap: .35rem; align-items: center; padding: .3rem .5rem; flex-wrap: wrap; } .layer { width: auto; padding: .2em .4em; }
.assets { border-left: var(--frame); }
</style>
