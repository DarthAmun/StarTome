<script setup lang="ts">
/** The GM's map: feeds the open encounter to the engine and the engine's input back into the encounter. */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { newId } from '@/domain/ids'
import { healthState } from '@/domain/rules/conditions'
import { isDoorWall } from '@/domain/rules/walls'
import { wallsOf } from '@/data/encounters'
import { imageUrlOf } from '@/ui/imageUrl'
import { areaCells } from './areasLive'
import { MapEngine } from './engine/engine'
import type { Cell } from './engine/types'
import { areas, live, mapTokens, moveToken, saveMap } from './live'
import { mapSquares, pingPlayers } from './playerSync'
import { hexNumber, sightFor, toSceneTokens } from './scene'
import { areaClick, areaDraft, tools } from './tools'

const emit = defineEmits<{ context: [hit: { tokenId: string | null; wallId: string | null; areaId: string | null; cell: Cell }, x: number, y: number] }>()
const host = ref<HTMLElement | null>(null)
let engine: MapEngine | null = null
let observer: ResizeObserver | null = null
const undoWalls: string[] = []

function setWalls(walls: ReturnType<typeof wallsOf>) { saveMap({ walls }, true) }

function paintFog(keys: string[], hide: boolean) {
  if (!live.map) return
  const fog = { ...live.map.fog }
  const all = fog._allHidden === 'hidden'
  for (const k of keys) {
    // After "cover all" a revealed square is the exception; otherwise a hidden one is
    if (hide) { if (all) delete fog[k]; else fog[k] = 'hidden' }
    else if (all) fog[k] = 'revealed'
    else delete fog[k]
  }
  saveMap({ fog })
}

function refreshSight() {
  if (!engine || !live.encounter || !live.map) return
  const size = engine.size
  mapSquares.value = size ? { w: size.cols, h: size.rows } : undefined
  engine.setFov(sightFor(live.encounter.fovEnabled, live.fovMode, mapTokens(), live.activeId, wallsOf(live.map), mapSquares.value, true))
}

async function refreshTokens() {
  const list = await toSceneTokens(mapTokens().map(t => ({
    id: t.id, name: t.name, image: t.shown, x: t.x, y: t.y, size: t.size, visible: t.visible, dead: t.dead, party: t.playerToken || t.ally,
    hp: t.hp, health: null as ReturnType<typeof healthState> | null, conditions: t.conditions, timers: t.timers.map(x => x.remaining), elevation: t.elevation,
  })))
  engine?.setTokens(list, live.encounter?.status === 'active' ? live.activeId : null)
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
    onWallDone: (points, kind) => { if (live.map) { const id = newId(); undoWalls.push(id); setWalls([...wallsOf(live.map), { id, points, kind, open: false, generated: false }]) } },
    onDoorToggle: (id) => { if (live.map) setWalls(wallsOf(live.map).map(w => (w.id === id && isDoorWall(w.kind) ? { ...w, open: !w.open } : w))) },
    onPing: pingPlayers,
    areaDraft, onAreaClick: areaClick,
    onViewport: v => saveMap({ viewport: v }),
  })
  await e.init()
  engine = e
  observer = new ResizeObserver(() => e.resize())
  observer.observe(host.value)

  watch(() => live.encounter?.map, async (map) => {
    await e.setMap(await imageUrlOf(map, true))
    const v = live.map?.viewport
    if (v && (v.x || v.y || v.scale !== 1)) e.setViewport(v)
    else e.fit()
    refreshSight()
  }, { immediate: true })
  watch(() => live.encounter?.grid, (g) => { if (g) { e.setGrid(g); refreshSight() } }, { immediate: true, deep: true })
  watch(() => live.map?.fog, fog => e.setFog(fog ?? {}), { immediate: true })
  watch(() => live.map?.walls, (walls) => { e.setWalls(walls ?? []); refreshSight() }, { immediate: true })
  watch(() => [areas(), mapTokens().map(t => [t.id, t.x, t.y, t.size])], () => e.setAreas(areas().map(a => ({ id: a.id, cells: [...areaCells(a)], color: hexNumber(a.color) }))), { immediate: true, deep: true })
  watch(() => [live.tokens, live.activeId, live.encounter?.status], () => { void refreshTokens(); refreshSight() }, { immediate: true, deep: true })
  watch(() => [live.fovMode, live.encounter?.fovEnabled], refreshSight)
  watch(() => tools.tool, () => e.toolChanged())
})

onBeforeUnmount(() => { observer?.disconnect(); engine?.destroy(); engine = null })

/** Ctrl+Z while drawing walls takes back the last wall drawn here. */
function undoWall(): boolean {
  const id = undoWalls.pop()
  if (!id || !live.map) return false
  setWalls(wallsOf(live.map).filter(w => w.id !== id))
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
