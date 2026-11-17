<script setup lang="ts">
/** The GM's map: feeds the open encounter to the engine and the engine's input back into the encounter. */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { newId } from '@/domain/ids'
import { healthState } from '@/domain/rules/conditions'
import { floorBeside, stairsOn } from '@/domain/rules/floors'
import { isDoorWall, type Wall } from '@/domain/rules/walls'
import { imageUrlOf } from '@/ui/imageUrl'
import { areaCells } from './areasLive'
import { MapEngine } from './engine/engine'
import type { Cell } from './engine/types'
import { areasOn, currentFloor, floorWalls, live, moveToken, saveFloor, saveMap, tokensOn } from './live'
import type { Token } from '@/data/encounters'
import { mapSquares, pingPlayers } from './playerSync'
import { hexNumber, sightFor, toSceneTokens } from './scene'
import { info, malfunctioning, markers } from './starshipLive'
import { areaClick, areaDraft, stairClick, tools } from './tools'

const emit = defineEmits<{ context: [hit: { tokenId: string | null; wallId: string | null; areaId: string | null; stairId: string | null; cell: Cell }, x: number, y: number] }>()
const host = ref<HTMLElement | null>(null)
let engine: MapEngine | null = null
let observer: ResizeObserver | null = null
/** Watchers started after the engine is ready are not the component's own: they are stopped by hand. */
const stops: (() => void)[] = []
const undoWalls: string[] = []

function setWalls(walls: Wall[]) { saveFloor({ walls }, true) }

function paintFog(keys: string[], hide: boolean) {
  const floor = currentFloor()
  if (!floor) return
  const fog = { ...floor.fog }
  const all = fog._allHidden === 'hidden'
  for (const k of keys) {
    // After "cover all" a revealed square is the exception; otherwise a hidden one is
    if (hide) { if (all) delete fog[k]; else fog[k] = 'hidden' }
    else if (all) fog[k] = 'revealed'
    else delete fog[k]
  }
  saveFloor({ fog })
}

function refreshSight() {
  if (!engine || !live.encounter || !live.map) return
  const size = engine.size
  mapSquares.value = size ? { w: size.cols, h: size.rows } : undefined
  engine.setFov(sightFor(live.encounter.fovEnabled, live.fovMode, tokensOn(), live.activeId, floorWalls(currentFloor()), mapSquares.value, true))
}

const sceneOf = (list: Token[]) => toSceneTokens(list.map(t => ({
  id: t.id, name: t.name, image: t.shown, x: t.x, y: t.y, size: t.size, visible: t.visible, dead: t.dead, party: t.playerToken || t.ally,
  hp: t.hp, health: null as ReturnType<typeof healthState> | null, conditions: t.conditions, timers: t.timers.map(x => x.remaining), elevation: t.elevation,
})))

async function refreshTokens() {
  const list = await sceneOf(tokensOn())
  engine?.setTokens(list, live.encounter?.status === 'active' ? live.activeId : null)
}

/** The floor below shows faded where this one's map is empty. */
async function refreshBelow() {
  const below = live.encounter && live.map ? floorBeside(live.encounter, live.map, live.floorId, -1) : undefined
  if (!below) { void engine?.setBelow(null); return }
  const [url, tokens] = await Promise.all([imageUrlOf(below.image, true), sceneOf(tokensOn(below.id))])
  void engine?.setBelow({ url, grid: below.grid, tokens })
}

function refreshStairs() {
  engine?.setStairs(live.encounter && live.map ? stairsOn(live.encounter, live.map, live.floorId).map(e => ({ id: e.stairId, x: e.x, y: e.y, dir: e.dir })) : [])
}

onMounted(async () => {
  if (!host.value) return
  const e = new MapEngine(host.value, true, {
    tool: () => tools.tool,
    fogBrush: () => ({ size: tools.fogBrush, hide: tools.fogHide }),
    wallKind: () => tools.wallKind,
    onTokenMoved: moveToken,
    onTokenClick: (id) => { live.selectedId = id },
    onContext: (hit, x, y) => emit('context', hit, x, y),
    onFogPaint: paintFog,
    onWallDone: (points, kind) => { const id = newId(); undoWalls.push(id); setWalls([...floorWalls(currentFloor()), { id, points, kind, open: false, generated: false }]) },
    onDoorToggle: (id) => { setWalls(floorWalls(currentFloor()).map(w => (w.id === id && isDoorWall(w.kind) ? { ...w, open: !w.open } : w))) },
    onStairClick: stairClick,
    onPing: pingPlayers,
    areaDraft, onAreaClick: areaClick,
    onViewport: v => saveMap({ viewport: v }),
  })
  await e.init()
  engine = e
  observer = new ResizeObserver(() => e.resize())
  observer.observe(host.value)

  // The view stays where it is when the floor changes: floors of a map line up
  let first = true
  stops.push(watch(() => currentFloor()?.image, async (map) => {
    await e.setMap(await imageUrlOf(map, true))
    const v = live.map?.viewport
    if (first && v && (v.x || v.y || v.scale !== 1)) e.setViewport(v)
    else if (first || !e.size) e.fit()
    first = false
    refreshSight()
  }, { immediate: true }))
  stops.push(watch(() => currentFloor()?.grid, (g) => { if (g) { e.setGrid(g); refreshSight() } }, { immediate: true, deep: true }))
  stops.push(watch(() => currentFloor()?.fog, fog => e.setFog(fog ?? {}), { immediate: true }))
  stops.push(watch(() => currentFloor()?.walls, (walls) => { e.setWalls(walls ?? []); refreshSight() }, { immediate: true }))
  stops.push(watch(() => [areasOn(), tokensOn().map(t => [t.id, t.x, t.y, t.size])], () => e.setAreas(areasOn().map(a => ({ id: a.id, cells: [...areaCells(a)], color: hexNumber(a.color) }))), { immediate: true, deep: true }))
  stops.push(watch(() => [live.tokens, live.activeId, live.encounter?.status, live.floorId], () => { void refreshTokens(); refreshSight() }, { immediate: true, deep: true }))
  stops.push(watch(() => [live.floorId, live.map?.floors.map(f => [f.id, f.level, f.image]), live.map?.mainFloor, live.encounter?.map, live.tokens], () => { void refreshBelow() }, { immediate: true, deep: true }))
  stops.push(watch(() => [live.floorId, live.map?.stairs, live.map?.floors.length, live.map?.mainFloor.level], refreshStairs, { immediate: true, deep: true }))
  stops.push(watch(() => [live.fovMode, live.encounter?.fovEnabled], refreshSight))
  stops.push(watch(() => tools.tool, () => e.toolChanged()))
  // Station markers stand on the main deck (FLOORS_PLAN.md step 5 gives them a floor)
  stops.push(watch(() => [markers.value, info.value?.malfunctioning, currentFloor()?.main], () => e.setMarkers(currentFloor()?.main === false ? [] : markers.value.map(m => ({ slot: m.slot, x: m.x, y: m.y, off: malfunctioning(m.slot) }))), { immediate: true, deep: true }))
})

onBeforeUnmount(() => { stops.forEach(stop => stop()); observer?.disconnect(); engine?.destroy(); engine = null })

/** Ctrl+Z while drawing walls takes back the last wall drawn here. */
function undoWall(): boolean {
  const id = undoWalls.pop()
  if (!id || !live.map) return false
  setWalls(floorWalls(currentFloor()).filter(w => w.id !== id))
  return true
}

defineExpose({
  cellAt: (x: number, y: number): Cell => engine?.cellAt(x, y) ?? { col: 5, row: 5 },
  fit: () => engine?.fit(),
  centerOn: (col: number, row: number) => engine?.centerOn(col, row),
  undoWall,
})
</script>

<template>
  <div ref="host" class="map" :class="`tool-${tools.tool}`" data-test="encounter-map" />
</template>

<style scoped>
.map { position: absolute; inset: 0; overflow: hidden; background: #0e0e1a; }
.map:not(.tool-select) { cursor: crosshair; }
</style>
