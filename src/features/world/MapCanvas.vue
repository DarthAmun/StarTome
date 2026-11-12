<script setup lang="ts">
/**
 * A location's map with its pins and regions: pan (drag), zoom (wheel), fit.
 * The GM page and the player window both use it; the player sees no hidden
 * pins and cannot change anything.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Entry, EntryOf, MapPin } from '@/domain/schema'
import { entries } from '@/data/repo'
import { maps } from '@/data/maps'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'
import { useImageUrl } from '@/ui/imageUrl'
import { useLive } from '@/ui/useLive'
import EntryThumb from './EntryThumb.vue'

const props = withDefaults(defineProps<{ map: EntryOf<'location'>; player?: boolean; draft?: { x: number; y: number }[]; draftColor?: string }>(), { player: false, draft: () => [], draftColor: '#5fc98a' })
const emit = defineEmits<{ click: [point: { x: number; y: number }]; pin: [pin: MapPin, entry: Entry, event: MouseEvent]; region: [region: EntryOf<'region'>]; finish: [] }>()

const url = useImageUrl(() => props.map.data.map, true)
const pins = useLive(async () => {
  const list = await maps.pins(props.map.id)
  const rows = await Promise.all(list.map(p => entries.get(p.entryId)))
  return list.map((pin, i) => ({ pin, entry: rows[i] })).filter((p): p is { pin: MapPin; entry: Entry } => !!p.entry)
}, [], [() => props.map.id])
const regions = useLive(() => maps.regions(props.map), [], [() => props.map.id])
const shownPins = computed(() => (props.player ? pins.value.filter(p => !p.pin.hidden) : pins.value))

const host = ref<HTMLElement | null>(null)
const size = ref({ w: 0, h: 0 })
const view = ref({ x: 0, y: 0, k: 1 })

function fit() {
  const el = host.value
  if (!el || !size.value.w) return
  const k = Math.min(el.clientWidth / size.value.w, el.clientHeight / size.value.h)
  view.value = { k, x: (el.clientWidth - size.value.w * k) / 2, y: (el.clientHeight - size.value.h * k) / 2 }
}
function onLoad(e: Event) {
  const img = e.target as HTMLImageElement
  size.value = { w: img.naturalWidth, h: img.naturalHeight }
  fit()
}
watch(() => props.map.id, () => { size.value = { w: 0, h: 0 } })

function onWheel(e: WheelEvent) {
  const el = host.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const mx = e.clientX - rect.left, my = e.clientY - rect.top
  const k = Math.min(8, Math.max(0.05, view.value.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
  // Zoom towards the cursor
  view.value = { k, x: mx - (mx - view.value.x) * (k / view.value.k), y: my - (my - view.value.y) * (k / view.value.k) }
}

let drag: { x: number; y: number; moved: boolean } | null = null
function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  drag = { x: e.clientX, y: e.clientY, moved: false }
}
function onMove(e: PointerEvent) {
  if (!drag) return
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return
  drag.moved = true
  view.value = { ...view.value, x: view.value.x + dx, y: view.value.y + dy }
  drag.x = e.clientX; drag.y = e.clientY
}
function onUp(e: PointerEvent) {
  const wasDrag = drag?.moved
  drag = null
  if (wasDrag || e.button !== 0 || !size.value.w) return
  const rect = host.value?.getBoundingClientRect()
  if (!rect) return
  const x = (e.clientX - rect.left - view.value.x) / view.value.k / size.value.w, y = (e.clientY - rect.top - view.value.y) / view.value.k / size.value.h
  if (x >= 0 && x <= 1 && y >= 0 && y <= 1) emit('click', { x, y })
}
onMounted(() => window.addEventListener('resize', fit))
onUnmounted(() => window.removeEventListener('resize', fit))

const points = (poly: { x: number; y: number }[]) => poly.map(p => `${p.x * size.value.w},${p.y * size.value.h}`).join(' ')
const centre = (poly: { x: number; y: number }[]) => ({ x: (poly.reduce((n, p) => n + p.x, 0) / poly.length) * size.value.w, y: (poly.reduce((n, p) => n + p.y, 0) / poly.length) * size.value.h })
defineExpose({ fit })
</script>

<template>
  <div ref="host" class="canvas" @wheel.prevent="onWheel" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointerleave="drag = null" @dblclick="emit('finish')">
    <p v-if="!url" class="empty">{{ player ? 'Waiting for a map…' : 'This location has no map image yet.' }}</p>
    <div v-else class="stage" :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width: `${size.w}px`, height: `${size.h}px` }">
      <img :src="url" alt="" draggable="false" @load="onLoad" />
      <svg v-if="size.w" :width="size.w" :height="size.h" class="overlay">
        <g v-for="r in regions" :key="r.id" class="region" @pointerup.stop="emit('region', r)">
          <polygon :points="points(r.data.polygon)" :fill="`${r.data.color}33`" :stroke="r.data.color" :stroke-width="2 / view.k" />
          <text v-if="r.data.polygon.length" :x="centre(r.data.polygon).x" :y="centre(r.data.polygon).y" :font-size="14 / view.k" :fill="r.data.color" text-anchor="middle" paint-order="stroke" stroke="rgb(0 0 0 / .7)" :stroke-width="3 / view.k">{{ r.name }}</text>
        </g>
        <polyline v-if="draft.length" :points="points(draft)" fill="none" :stroke="draftColor" :stroke-width="2 / view.k" stroke-dasharray="8 5" />
        <circle v-for="(p, i) in draft" :key="i" :cx="p.x * size.w" :cy="p.y * size.h" :r="4 / view.k" :fill="draftColor" />
      </svg>
      <button v-for="p in shownPins" :key="p.pin.id" class="pin" :class="{ hidden: p.pin.hidden }" :title="p.entry.name"
        :style="{ left: `${p.pin.x * 100}%`, top: `${p.pin.y * 100}%`, transform: `translate(-50%, -50%) scale(${1 / view.k})`, '--type': ENTRY_TYPE_INFO[p.entry.type].color }"
        @pointerup.stop="emit('pin', p.pin, p.entry, $event)" @contextmenu.prevent.stop="emit('pin', p.pin, p.entry, $event)">
        <EntryThumb :entry="p.entry" /><span class="pin-name">{{ p.entry.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.canvas { position: relative; height: 100%; overflow: hidden; background: var(--bg-sunken); cursor: grab; touch-action: none; user-select: none; }
.canvas:active { cursor: grabbing; }
.stage { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.stage img { display: block; }
.overlay { position: absolute; inset: 0; }
.region { cursor: pointer; }
.region:hover polygon { fill-opacity: 1.6; }
.pin { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 2px; background: none; border: 0; padding: 0; transform-origin: center; filter: drop-shadow(0 2px 4px rgb(0 0 0 / .6)); }
.pin :deep(.thumb) { background: var(--bg-raised); border-color: var(--type); border-width: 2px; }
.pin.hidden { opacity: .45; }
.pin-name { font-size: .72rem; padding: 0 .4em; background: rgb(0 0 0 / .65); color: #fff; border-radius: 3px; white-space: nowrap; }
</style>
