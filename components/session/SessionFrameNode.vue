<template>
    <NodeToolbar :is-visible="selected" :position="Position.Top">
        <div class="sf-toolbar">
            <button class="sf-btn" @click="data.onOpen()"><OhVueIcon name="md-edit" scale="0.7" /> Edit</button>
            <button
                v-for="c in FRAME_COLORS"
                :key="c"
                class="sf-swatch"
                :class="{ 'sf-swatch--on': c === color }"
                :style="{ background: c }"
                @click="data.onColor(c)"
            />
            <button class="sf-btn sf-btn--danger" title="Delete frame (its panels stay)" @click="data.onDelete()">
                <OhVueIcon name="md-delete" scale="0.7" />
            </button>
        </div>
    </NodeToolbar>
    <div class="sf-frame" :style="{ '--frame': color }">
        <div class="sf-title">{{ data.panel.title || 'Group' }}</div>
        <div v-if="selected" class="sf-resize nodrag" title="Resize" @pointerdown.stop.prevent="startResize" />
    </div>
</template>

<script setup lang="ts">
import { Position } from '@vue-flow/core'
import { NodeToolbar } from '@vue-flow/node-toolbar'
import { useVueFlow } from '@vue-flow/core'
import type { SessionPanel } from '~/composables/useSessionBoard'

const FRAME_COLORS = ['#5fc98a', '#4ab8e8', '#b87de8', '#e8924a', '#e05555', '#e8c44a', '#8fa3b8']

const props = defineProps<{
    selected?: boolean
    data: {
        panel: SessionPanel
        onOpen: () => void
        onColor: (c: string) => void
        onResize: (w: number, h: number, done: boolean) => void
        onDelete: () => void
    }
}>()

const color = computed(() => (props.data.panel.attrs.color as string) || '#5fc98a')

const { viewport } = useVueFlow()

/** Corner drag: the size follows the pointer, scaled by the zoom; saved on release. */
function startResize(e: PointerEvent) {
    const startX = e.clientX, startY = e.clientY
    const w0 = props.data.panel.w ?? 520, h0 = props.data.panel.h ?? 320
    let w = w0, h = h0
    const move = (ev: PointerEvent) => {
        const z = viewport.value.zoom || 1
        w = Math.max(200, Math.round(w0 + (ev.clientX - startX) / z))
        h = Math.max(140, Math.round(h0 + (ev.clientY - startY) / z))
        props.data.onResize(w, h, false)
    }
    const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        props.data.onResize(w, h, true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
}
</script>

<style scoped>
.sf-frame {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: var(--r3);
    border: 1.5px dashed color-mix(in oklch, var(--frame) 55%, transparent);
    background: color-mix(in oklch, var(--frame) 6%, transparent);
}
.sf-title {
    position: absolute;
    top: 8px;
    left: 12px;
    font-family: var(--fh);
    font-size: 15px;
    font-weight: 600;
    color: var(--frame);
    letter-spacing: 0.03em;
    cursor: grab;
}
.sf-resize {
    position: absolute; right: -2px; bottom: -2px; width: 16px; height: 16px; cursor: nwse-resize;
    border-right: 3px solid var(--frame); border-bottom: 3px solid var(--frame); border-bottom-right-radius: var(--r3);
}
.sf-toolbar {
    display: flex; align-items: center; gap: 4px; padding: 3px 5px;
    background: var(--surface-hi); border: 1px solid var(--border-hi); border-radius: var(--r1);
}
.sf-btn {
    display: flex; align-items: center; gap: 4px; padding: 3px 7px; border-radius: 4px;
    font-size: 11px; color: var(--text2); background: transparent; border: none; cursor: pointer;
}
.sf-btn:hover { background: var(--bg2); color: var(--text); }
.sf-btn--danger:hover { color: var(--danger); background: var(--danger-bg); }
.sf-swatch { width: 14px; height: 14px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
.sf-swatch--on { border-color: var(--text); }
</style>
