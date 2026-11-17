<script setup lang="ts">
/**
 * The map maker: paint a battle map from tiles, place assets from your
 * library on it, and use it as the encounter's map. "Make walls" derives the
 * sight-blocking walls and doors from the tiles. Every floor of the map is a
 * tab with its own undo; all floors share one size, the one below shows
 * faintly, and stair tiles become stairs between neighbouring floors.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Component } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { ArrowLeft, Brush, FlipHorizontal, Frame, Hand, MousePointer2, PaintBucket, Redo2, RotateCw, Square, Trash2, Undo2, X } from 'lucide-vue-next'
import { EXPORT_CELL_PX, MAX_SIZE, MIN_SIZE, PROP_MIN_SIZE, ROLE_LABEL, SCIFI_TILES, TILES, blankMap, clampSize, mapWalls, pairStairs, readBattleMap, resizeMap, type BattleMap, type TileDef, type TileId } from '@/domain/rules/battlemap'
import type { MapAsset } from '@/domain/schema'
import { imageUrlOf } from '@/ui/imageUrl'
import { useLive } from '@/ui/useLive'
import { defaultFloorName, floorsOf } from '@/domain/rules/floors'
import { newId } from '@/domain/ids'
import { applyMadeFloors, encounters, mapAssets, type MadeFloor } from '@/data/encounters'
import { images as imageRepo } from '@/data/repo'
import { storeImage } from '@/services/images'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import AssetLibrary from './AssetLibrary.vue'
import { battleMapPng, drawBattleMap } from './draw'
import { useMapEditor, ZOOM_BASE, type BrushKey, type ImageTiles, type Tool } from './editor'
import ImageTileDialog from './ImageTileDialog.vue'

const props = defineProps<{ campaignId: string; encounterId: string }>()
const router = useRouter()

const TOOLS: { id: Tool; label: string; key: string; hint: string; icon: Component }[] = [
  { id: 'select', label: 'Select', key: 'v', hint: 'Click an asset to select it, drag to move it; the corner resizes, the top handle rotates; Shift turns snapping off. Drag empty space to pan.', icon: MousePointer2 },
  { id: 'pan', label: 'Pan', key: 'h', hint: 'Drag to move the view (also: middle button, Alt-drag, Space-drag).', icon: Hand },
  { id: 'brush', label: 'Brush', key: 'b', hint: 'Click or drag to paint squares. Right-click picks a tile.', icon: Brush },
  { id: 'rect', label: 'Rectangle', key: 'm', hint: 'Drag to fill a rectangle.', icon: Square },
  { id: 'room', label: 'Room', key: 'w', hint: 'Drag for a room: the tile inside, walls around it.', icon: Frame },
  { id: 'fill', label: 'Fill', key: 'g', hint: 'Click to fill an area of the same tile.', icon: PaintBucket },
]

const canvasEl = ref<HTMLCanvasElement | null>(null)
const viewEl = ref<HTMLElement | null>(null)
/** Loaded images of placed assets, by image ref ("img:<id>"). */
const loaded = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<void>>()
/** A floor in the map maker, bottom to top. The one being edited lives in the editor until another is shown. */
interface MakerFloor {
  key: string
  /** Its id in the encounter (floorsOf); null for one made here. */
  id: string | null
  name: string
  main: boolean
  /** Its map came from here before (it has tiles); else it may have an uploaded image. */
  hadTiles: boolean
  uploaded: boolean
  /** The map as loaded: unchanged floors with an uploaded image keep it. */
  original: BattleMap | null
  map: BattleMap
  undo: BattleMap[]
  redo: BattleMap[]
}
const stack = shallowRef<MakerFloor[]>([])
const cur = ref(0)
/** Floors of the encounter removed here, gone when the map is saved. */
const removed = ref<string[]>([])
/** Where the levels count from: the ground floor when the map maker opened. */
let groundKey = ''
/** Image tiles from the library (assets with a tile role). */
const tileAssets = useLive(async () => (await mapAssets.list()).filter(a => a.tileRole), [] as MapAsset[])
const tileThumbs = ref<Record<string, string>>({})
watch(tileAssets, (list) => { for (const a of list) if (!(a.imageId in tileThumbs.value)) void imageUrlOf({ imageId: a.imageId }).then((u) => { if (u) tileThumbs.value = { ...tileThumbs.value, [a.imageId]: u } }) }, { immediate: true })
const tileDialog = ref<{ asset: MapAsset | null } | null>(null)
const imageTiles: ImageTiles = {
  tile(key) {
    const a = tileAssets.value.find(x => `asset:${x.id}` === key)
    return a?.tileRole ? { image: `img:${a.imageId}`, role: a.tileRole, label: a.name } : null
  },
  keyOf(t) {
    const a = tileAssets.value.find(x => `img:${x.imageId}` === t.image && x.tileRole === t.role)
    return a ? `asset:${a.id}` : null
  },
}
const ed = useMapEditor(canvasEl, loaded, () => stack.value[cur.value - 1]?.map ?? null, imageTiles)
const fantasy = TILES.filter(t => !SCIFI_TILES.has(t.id)), scifi = TILES.filter(t => SCIFI_TILES.has(t.id))
async function removeTile(a: MapAsset) {
  if (!await confirmDialog({ title: `Remove the tile “${a.name}”?`, body: 'Maps already painted with it keep it.', confirmLabel: 'Remove', danger: true })) return
  await mapAssets.remove([a.id])
  if (tileId.value === `asset:${a.id}`) ed.pickTile('stone')
}
const { map, tool, tileId, zoom, dirty, undoStack, redoStack, placing, selected, panning, spaceDown } = ed

const name = ref('')
const found = ref<boolean | null>(null)
const makeWalls = ref(true)
const saving = ref(false)
const cols = ref(24), rows = ref(18)
const swatches: Partial<Record<TileId, HTMLCanvasElement>> = {}
const brushOn = (key: BrushKey) => tileId.value === key && tool.value !== 'select' && tool.value !== 'pan' && !placing.value
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
/** Pictures a map shows: placed assets and image tiles. */
const imagesOf = (m: BattleMap | null | undefined) => [...(m?.props ?? []).map(p => p.image), ...(m?.customTiles ?? []).map(t => t.image)]
watch(map, (m) => { for (const i of imagesOf(m)) void loadImage(i) })
watch(stack, (list) => { for (const f of list) for (const i of imagesOf(f.map)) void loadImage(i) })
watch(tileAssets, (list) => { for (const a of list) void loadImage(`img:${a.imageId}`) })
watch(placing, (a) => { if (a) void loadImage(`img:${a.imageId}`) })
watch(map, (m) => { if (m) { cols.value = m.cols; rows.value = m.rows } })

function drawSwatches() {
  for (const t of TILES) {
    const ctx = swatches[t.id]?.getContext('2d')
    if (!ctx) continue
    // The tile in the middle of a 3×3 map, so a door sits between walls (hull for a starship's)
    const opening = t.role === 'door' || t.role === 'window' || t.role === 'secret', ship = SCIFI_TILES.has(t.id)
    const sample: BattleMap = { cols: 3, rows: 3, tiles: opening ? (ship ? `SSSW${t.char}WSSS` : `sss#${t.char}#sss`) : t.char.repeat(9) }
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
  const views = floorsOf(enc, await encounters.map(enc.id))
  const maps = views.map(v => readBattleMap(v.battlemap))
  const first = maps.find(m => m) ?? blankMap(24, 18, 'void')
  stack.value = views.map((v, i) => {
    const m = maps[i], fitted = m ? (m.cols === first.cols && m.rows === first.rows ? m : resizeMap(m, first.cols, first.rows)) : blankMap(first.cols, first.rows, 'void')
    return { key: v.id, id: v.id, name: v.name, main: v.main, hadTiles: !!m, uploaded: !m && !!v.image, original: fitted, map: fitted, undo: [], redo: [] }
  })
  cur.value = Math.max(0, views.findIndex(v => v.level === 0))
  groundKey = stack.value[cur.value]!.key
  ed.load(stack.value[cur.value]!.map)
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
  if (key === 'pageup' || key === 'pagedown') { e.preventDefault(); show(cur.value + (key === 'pageup' ? 1 : -1)); return }
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
// ── Floors ──
/** The floors with the one being edited as it is now. */
function synced(): MakerFloor[] {
  const list = [...stack.value], f = list[cur.value]
  if (f && map.value) list[cur.value] = { ...f, map: map.value, undo: undoStack.value, redo: redoStack.value }
  return list
}
function show(i: number) {
  if (i < 0 || i >= stack.value.length || i === cur.value) return
  stack.value = synced()
  cur.value = i
  ed.swap(stack.value[i]!)
}
const levelOf = (i: number) => i - Math.max(0, stack.value.findIndex(f => f.key === groundKey))
function addFloor(top: boolean, copy = false) {
  const list = synced(), here = list[cur.value]!
  const m = copy ? { ...here.map, props: (here.map.props ?? []).map(p => ({ ...p, id: newId() })) } : blankMap(here.map.cols, here.map.rows, 'void')
  const level = top ? levelOf(list.length - 1) + 1 : levelOf(0) - 1
  const f: MakerFloor = { key: newId(), id: null, name: defaultFloorName(level), main: false, hadTiles: false, uploaded: false, original: null, map: m, undo: [], redo: [] }
  stack.value = top ? [...list, f] : [f, ...list]
  cur.value = top ? stack.value.length - 1 : 0
  ed.swap(f)
  dirty.value = true
}
async function removeFloor() {
  const f = stack.value[cur.value]
  if (!f || f.main || stack.value.length < 2) return
  if (f.id && !await confirmDialog({ title: `Remove “${f.name}”?`, body: 'When you use the map, this floor goes from the encounter with its walls, fog and the tokens on it.', confirmLabel: 'Remove floor', danger: true })) return
  if (f.id) removed.value = [...removed.value, f.id]
  const list = synced().filter((_, i) => i !== cur.value)
  stack.value = list
  cur.value = Math.max(0, cur.value - 1)
  ed.swap(list[cur.value]!)
  dirty.value = true
}
function rename(e: Event) {
  const n = (e.target as HTMLInputElement).value.trim()
  if (!n) return
  stack.value = stack.value.map((f, i) => (i === cur.value ? { ...f, name: n } : f))
  dirty.value = true
}
/** One size for every floor: the one shown can undo it, the others too. */
function resizeAll() {
  const c = clampSize(cols.value), r = clampSize(rows.value)
  stack.value = synced().map((f, i) => (i === cur.value || (f.map.cols === c && f.map.rows === r) ? f : { ...f, map: resizeMap(f.map, c, r), undo: [...f.undo, f.map], redo: [] }))
  ed.resize(c, r)
}
const current = computed(() => stack.value[cur.value])

async function startOver() {
  if (await confirmDialog({ title: 'Start over?', body: 'Every square becomes empty and placed assets are removed. Undo brings it back.', confirmLabel: 'Start over', danger: true })) ed.clear()
}

async function save() {
  if (!map.value) return
  saving.value = true
  try {
    const list = synced()
    const all = list.flatMap(f => f.map.props ?? [])
    await Promise.all(list.flatMap(f => imagesOf(f.map)).map(loadImage))
    const missing = all.filter(p => !loaded.has(p.image)).length
    // A floor with an uploaded image keeps it unless it was painted here
    const render = list.map(f => f.id === null || f.hadTiles || f.map !== f.original)
    let wallCount = 0
    const made: MadeFloor[] = await Promise.all(list.map(async (f, i) => {
      if (!render[i]) return { id: f.id, name: f.name, made: null }
      const image = await storeImage(await battleMapPng(f.map, EXPORT_CELL_PX, loaded), { keepOriginal: true })
      const walls = makeWalls.value ? mapWalls(f.map).map(w => ({ points: w.points, kind: w.coverType })) : null
      wallCount += walls?.length ?? 0
      return { id: f.id, name: f.name, made: { battlemap: JSON.parse(JSON.stringify(f.map)) as Record<string, unknown>, image, walls } }
    }))
    const stairs = pairStairs(list.map((f, i) => (render[i] ? f.map : null)))
    await applyMadeFloors(props.encounterId, made, removed.value, EXPORT_CELL_PX, stairs)
    dirty.value = false
    const parts = [list.length > 1 ? `${list.length} floors` : '', makeWalls.value ? `${wallCount} walls and doors` : '', stairs.length ? `${stairs.length} stairs` : ''].filter(Boolean)
    notify(`Map saved${parts.length ? ` with ${parts.join(', ')}` : ''}${makeWalls.value ? '; sight is on' : ''}.`, 'ok')
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
      <div class="seg" role="toolbar" aria-label="Tools"><button v-for="t in TOOLS" :key="t.id" :class="{ on: tool === t.id && !placing }" :title="`${t.label} (${t.key.toUpperCase()}): ${t.hint}`" :data-tool="t.id" :aria-label="t.label" @click="ed.setTool(t.id)"><component :is="t.icon" :size="16" /></button></div>
      <button class="btn btn-icon" title="Undo (Ctrl+Z)" :disabled="!undoStack.length" data-test="mm-undo" @click="ed.undo()"><Undo2 :size="15" /></button>
      <button class="btn btn-icon" title="Redo (Ctrl+Y)" :disabled="!redoStack.length" @click="ed.redo()"><Redo2 :size="15" /></button>
      <span class="grow" />
      <label class="faint">Size <input v-model.number="cols" type="number" :min="MIN_SIZE" :max="MAX_SIZE" class="input num" aria-label="Columns" @change="resizeAll" /> × <input v-model.number="rows" type="number" :min="MIN_SIZE" :max="MAX_SIZE" class="input num" aria-label="Rows" @change="resizeAll" /></label>
      <button class="btn" @click="startOver">Start over</button>
      <button class="btn btn-icon" title="Zoom out (−)" @click="ed.zoomBy(0.8)">−</button>
      <button class="btn" title="Fit (0)" @click="ed.fit()">{{ Math.round((zoom / ZOOM_BASE) * 100) }}%</button>
      <button class="btn btn-icon" title="Zoom in (+)" @click="ed.zoomBy(1.25)">+</button>
      <label class="dim" title="Walls along solid tiles and doors across door tiles; replaces the walls made the last time, keeps the ones you drew"><input v-model="makeWalls" type="checkbox" /> Make walls</label>
      <button class="btn btn-primary" :disabled="saving" data-test="mm-save" @click="save">{{ saving ? 'Saving…' : 'Use as encounter map' }}</button>
    </header>

    <aside class="tiles">
      <template v-for="[group, list] in ([['Tiles', fantasy], ['Starship', scifi]] as [string, TileDef[]][])" :key="group">
        <span class="eyebrow">{{ group }}</span>
        <button v-for="t in list" :key="t.id" class="tile" :class="{ on: brushOn(t.id as TileId) }" :title="t.label" :data-tile="t.id" @click="ed.pickTile(t.id as TileId)">
          <canvas :ref="el => { if (el) swatches[t.id as TileId] = el as HTMLCanvasElement }" width="28" height="28" /><span>{{ t.label.replace(/ \(.*/, '') }}</span>
        </button>
      </template>
      <span class="eyebrow">Image tiles</span>
      <div v-for="a in tileAssets" :key="a.id" class="tile img" :class="{ on: brushOn(`asset:${a.id}`) }" :title="`${a.name} · ${ROLE_LABEL[a.tileRole!]}`" :data-tile="`asset:${a.name}`" role="button" tabindex="0" @click="ed.pickTile(`asset:${a.id}`)" @keydown.enter="ed.pickTile(`asset:${a.id}`)">
        <img v-if="tileThumbs[a.imageId]" :src="tileThumbs[a.imageId]" alt="" /><span>{{ a.name }}</span>
        <button class="del" :aria-label="`Remove the tile ${a.name}`" @click.stop="removeTile(a)"><X :size="11" /></button>
      </div>
      <button class="btn add-tile" data-test="mm-new-tile" title="A tile from an image: floor, wall, door or window" @click="tileDialog = { asset: null }">+ Image tile</button>
    </aside>

    <div ref="viewEl" class="view" :class="{ grabbing: panning, grab: spaceDown || (tool === 'pan' && !placing), plain: tool === 'select' && !placing }">
      <canvas ref="canvasEl" data-test="mm-canvas" @pointerdown="ed.down" @pointermove="ed.move" @pointerup="ed.up" @pointercancel="ed.up" @wheel.prevent="ed.wheel" @contextmenu.prevent />
      <p class="hint">{{ hint }}</p>
      <div class="floors panel" data-test="mm-floors">
        <template v-for="i in [...stack.keys()].reverse()" :key="stack[i]!.key">
          <div v-if="i === cur" class="floor on">
            <input class="input" :value="stack[i]!.name" aria-label="Floor name" @change="rename" @keydown.enter="($event.target as HTMLInputElement).blur()" />
            <button v-if="!stack[i]!.main && stack.length > 1" class="btn btn-ghost btn-icon" title="Remove this floor" data-test="mm-floor-remove" @click="removeFloor"><X :size="13" /></button>
          </div>
          <button v-else class="floor" :data-floor="stack[i]!.name" @click="show(i)">{{ stack[i]!.name }}</button>
        </template>
        <div class="adds">
          <button class="btn" title="An empty floor on top" data-test="mm-floor-add-top" @click="addFloor(true)">+ Above</button>
          <button class="btn" title="An empty floor at the bottom" @click="addFloor(false)">+ Below</button>
          <button class="btn" title="A copy of this floor on top" @click="addFloor(true, true)">Copy up</button>
        </div>
        <p v-if="current?.uploaded && current.map === current.original" class="faint note">This floor has an uploaded image: it stays unless you paint here.</p>
      </div>
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

    <AssetLibrary class="assets" :placing-id="placing?.id ?? null" @place="ed.startPlacing($event)" @gone="ids => { if (placing && ids.includes(placing.id)) placing = null }" @tile="a => (tileDialog = { asset: a })" />
    <ImageTileDialog v-if="tileDialog" :asset="tileDialog.asset" @close="tileDialog = null" @made="a => ed.pickTile(`asset:${a.id}`)" />
  </div>
  <p v-else-if="found === false" class="empty">This encounter is gone. <RouterLink :to="{ name: 'encounters', params: { campaignId } }">All encounters</RouterLink></p>
</template>

<style scoped>
.mm { height: 100%; display: grid; grid-template-columns: 150px minmax(0, 1fr) 280px; grid-template-rows: auto minmax(0, 1fr); }
.top { grid-column: 1 / -1; display: flex; align-items: center; gap: .45rem; padding: .4rem .7rem; border-bottom: var(--frame); background: var(--bg-raised); flex-wrap: wrap; }
.grow { flex: 1; } .num { width: 4.2rem; display: inline-block; padding: .2em .4em; }
.seg { display: flex; border: var(--frame); border-radius: var(--radius); overflow: hidden; } .seg button { background: none; border: 0; padding: .3rem .55rem; color: var(--text-dim); display: flex; align-items: center; }
.seg button.on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.tiles { overflow: auto; padding: .5rem; display: flex; flex-direction: column; gap: 2px; border-right: var(--frame); background: var(--bg-raised); }
.tile { display: flex; align-items: center; gap: .45rem; background: none; border: 1px solid transparent; border-radius: var(--radius); padding: 2px 4px; font-size: .8rem; text-align: left; color: var(--text-dim); }
.tile:hover { background: var(--bg-hover); }
.tiles .eyebrow { margin-top: .4rem; } .tile.img { position: relative; cursor: pointer; } .tile.img img { width: 28px; height: 28px; object-fit: cover; border-radius: 3px; flex: none; }
.tile .del { position: absolute; right: 2px; display: none; background: none; border: 0; color: var(--danger); padding: 0 2px; } .tile.img:hover .del { display: block; }
.add-tile { margin-top: .3rem; font-size: .8rem; } .tile.on { border-color: var(--accent); color: var(--text); } .tile canvas { border-radius: 3px; flex: none; }
.view { position: relative; overflow: hidden; background: #15151f; cursor: crosshair; } .view.plain { cursor: default; } .view.grab { cursor: grab; } .view.grabbing { cursor: grabbing; }
.view canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
.hint { position: absolute; left: .7rem; bottom: .5rem; margin: 0; font-size: .8rem; color: #b9b7c9; background: rgb(10 10 22 / .7); padding: .15rem .5rem; border-radius: var(--radius); pointer-events: none; max-width: 70%; }
.sel { position: absolute; top: .6rem; left: 50%; transform: translateX(-50%); display: flex; gap: .35rem; align-items: center; padding: .3rem .5rem; flex-wrap: wrap; } .layer { width: auto; padding: .2em .4em; }
.assets { border-left: var(--frame); }
.floors { position: absolute; top: .6rem; left: .6rem; display: flex; flex-direction: column; gap: 2px; padding: .3rem; width: 12rem; }
.floor { background: none; border: 1px solid transparent; border-radius: var(--radius); padding: .2rem .45rem; text-align: left; color: var(--text-dim); font-size: .85rem; }
.floor:hover { background: var(--bg-hover); } .floor.on { display: flex; gap: .2rem; align-items: center; border-color: var(--accent); padding: 1px; }
.floor.on .input { padding: .15em .35em; font-size: .85rem; } .adds { display: flex; gap: 2px; flex-wrap: wrap; margin-top: .2rem; } .adds .btn { font-size: .75rem; padding: .15rem .4rem; }
.note { margin: .2rem 0 0; font-size: .74rem; }
</style>
