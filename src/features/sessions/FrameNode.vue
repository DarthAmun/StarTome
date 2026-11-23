<script setup lang="ts">
/** A frame: a titled area that groups panels; panels inside move with it. Drag its corner to resize. */
import { computed, ref, watch } from 'vue'
import type { SessionPanel } from '@/domain/schema'

export interface FrameNodeData { panel: SessionPanel; onEdit: () => void; onResize: (w: number, h: number) => void }
const props = defineProps<{ data: FrameNodeData }>()

/**
 * The size while the corner is dragged, and after release until the saved size
 * comes back. It is state, not a style set by hand: the board re-renders the
 * node whenever its measured size changes, which would put the stored size back.
 */
const sizing = ref<{ w: number; h: number } | null>(null)
const size = computed(() => sizing.value ?? { w: props.data.panel.w ?? 520, h: props.data.panel.h ?? 320 })
let dragging = false
watch(() => [props.data.panel.w, props.data.panel.h], () => { if (!dragging) sizing.value = null })

function grip(e: PointerEvent) {
  e.stopPropagation()
  const el = e.currentTarget as HTMLElement, frame = el.parentElement
  if (!frame) return
  el.setPointerCapture(e.pointerId)
  const sx = e.clientX, sy = e.clientY, { w: w0, h: h0 } = size.value
  // The board may be zoomed: the frame's drawn width against its real one gives the factor
  const zoom = frame.getBoundingClientRect().width / w0 || 1
  dragging = true
  const move = (m: PointerEvent) => { sizing.value = { w: Math.max(200, Math.round(w0 + (m.clientX - sx) / zoom)), h: Math.max(120, Math.round(h0 + (m.clientY - sy) / zoom)) } }
  const up = () => {
    el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up)
    dragging = false
    const { w, h } = size.value
    if (w === (props.data.panel.w ?? 520) && h === (props.data.panel.h ?? 320)) sizing.value = null
    else props.data.onResize(w, h)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
}
</script>

<template>
  <div class="frame" :style="{ width: `${size.w}px`, height: `${size.h}px`, '--k': String(data.panel.attrs.color ?? '#5fc98a') }" :data-frame="data.panel.title" @dblclick.stop="data.onEdit()">
    <span class="title">{{ data.panel.title || 'Group' }}</span>
    <span class="grip nodrag" title="Drag to resize" @pointerdown="grip" />
  </div>
</template>

<style scoped>
.frame { position: relative; border: 1.5px dashed color-mix(in srgb, var(--k) 70%, transparent); border-radius: 8px; background: color-mix(in srgb, var(--k) 6%, transparent); }
.title { position: absolute; top: .3rem; left: .6rem; font-family: var(--font-title); font-size: .85rem; color: var(--k); }
.grip { position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: nwse-resize; border-right: 3px solid var(--k); border-bottom: 3px solid var(--k); border-radius: 0 0 6px 0; }
</style>
