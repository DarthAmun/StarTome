<template>
  <BaseEdge
    :id="id"
    :path="path[0]"
    :label-x="path[1]"
    :label-y="path[2]"
    :label="label"
    :label-style="labelStyle"
    :label-bg-style="labelBgStyle"
    :label-show-bg="labelShowBg"
    :style="style"
    :marker-end="markerEnd"
    :interaction-width="20"
  />
</template>

<script setup lang="ts">
/**
 * A board edge that runs between the sides of the two panels that face each
 * other, worked out from where the panels are now (also while one is being
 * dragged). The handle a connection was drawn from doesn't matter: it's only
 * where the drag started.
 */
import { BaseEdge, Position, getSmoothStepPath, getStraightPath, type EdgeProps, type GraphNode } from '@vue-flow/core'
import { computed } from 'vue'

// Vue Flow hands every edge field over as attributes; BaseEdge draws several elements
defineOptions({ inheritAttrs: false })

const props = defineProps<EdgeProps<{ kind?: string }>>()

interface Box { x: number; y: number; w: number; h: number }
const box = (n: GraphNode): Box => ({ x: n.computedPosition.x, y: n.computedPosition.y, w: n.dimensions.width, h: n.dimensions.height })

/** The facing sides: left/right when the panels are further apart across than up/down, else top/bottom */
function sides(a: Box, b: Box): { sp: Position; tp: Position; sx: number; sy: number; tx: number; ty: number } {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2)
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2)
  const gapX = Math.abs(dx) - (a.w + b.w) / 2
  const gapY = Math.abs(dy) - (a.h + b.h) / 2
  if (gapX >= gapY) {
    const right = dx >= 0
    return {
      sp: right ? Position.Right : Position.Left, tp: right ? Position.Left : Position.Right,
      sx: right ? a.x + a.w : a.x, sy: a.y + a.h / 2,
      tx: right ? b.x : b.x + b.w, ty: b.y + b.h / 2,
    }
  }
  const down = dy >= 0
  return {
    sp: down ? Position.Bottom : Position.Top, tp: down ? Position.Top : Position.Bottom,
    sx: a.x + a.w / 2, sy: down ? a.y + a.h : a.y,
    tx: b.x + b.w / 2, ty: down ? b.y : b.y + b.h,
  }
}

const path = computed(() => {
  const s = sides(box(props.sourceNode), box(props.targetNode))
  const pos = { sourceX: s.sx, sourceY: s.sy, targetX: s.tx, targetY: s.ty }
  return props.data?.kind === 'attach'
    ? getStraightPath(pos)
    : getSmoothStepPath({ ...pos, sourcePosition: s.sp, targetPosition: s.tp })
})
</script>
