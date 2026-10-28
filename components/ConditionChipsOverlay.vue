<template>
  <div class="chips-overlay" aria-hidden="true">
    <template v-for="chip in visibleChips" :key="chip.key">
      <div
        class="condition-chip"
        :class="{ 'condition-chip--left': chip.flipLeft, 'condition-chip--hidden': chip.hidden }"
        :style="{
          left: chip.x + 'px',
          top: chip.y + 'px',
          borderColor: chip.color,
          animationDelay: chip.delay + 'ms',
        }"
      >
        <OhVueIcon :name="chip.icon" :scale="0.7" :style="{ flexShrink: 0, opacity: 0.9, color: chip.color }" />
        <span class="chip-label">{{ chip.label }}</span>
        <span v-if="chip.hidden" class="chip-hidden-mark">◌</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { conditionInfo, getConditionColor, visibleConditions } from '~/composables/useConditions'
import type { TokenCondition } from '~/stores/encounter'

interface Props {
  tokens: Array<{
    id: number
    gridX: number
    gridY: number
    size: number
    conditions: TokenCondition[]
    isDead?: boolean
    playerHealthState?: string
  }>
  isDM: boolean
  hoveredTokenId: number | null
  selectedTokenId: number | null
  viewport: { x: number; y: number; scale: number }
  gridSize: number
  gridOffsetX: number
  gridOffsetY: number
}

const props = defineProps<Props>()

interface ChipData {
  key: string
  x: number
  y: number
  color: string
  icon: string
  label: string
  flipLeft: boolean
  hidden: boolean
  delay: number
}

const visibleChips = computed<ChipData[]>(() => {
  const tokenId = props.hoveredTokenId ?? props.selectedTokenId
  if (!tokenId) return []

  // Require "full" zoom tier (screenCell >= 54)
  const screenCell = props.gridSize * props.viewport.scale
  if (screenCell < 54) return []

  const token = props.tokens.find(t => t.id === tokenId)
  if (!token || token.isDead) return []

  const conds = visibleConditions(token.conditions ?? [], props.isDM)
  if (!conds.length) return []

  const n = conds.length
  const seg = 360 / n
  const gap = n > 1 ? 10 : 0

  // Token world-space center
  const pixelSize = props.gridSize * token.size
  const R = pixelSize / 2
  const worldCX = props.gridOffsetX + token.gridX * props.gridSize + R
  const worldCY = props.gridOffsetY + token.gridY * props.gridSize + R
  const ringR = R + 4

  // Project world center to screen
  const screenCX = worldCX * props.viewport.scale + props.viewport.x
  const screenCY = worldCY * props.viewport.scale + props.viewport.y

  return conds.map((cond, i) => {
    const midDeg = i * seg + seg / 2
    const midRad = (midDeg - 90) * Math.PI / 180
    // Chip anchor at (ringR + 12) world units from center, projected to screen
    const anchorDist = (ringR + 12) * props.viewport.scale
    const ax = screenCX + anchorDist * Math.cos(midRad)
    const ay = screenCY + anchorDist * Math.sin(midRad)

    const flipLeft = midDeg > 180

    const cat = conditionInfo(cond.name)
    const icon = cond.icon ?? cat?.icon ?? 'gi-circle'
    const color = cond.color ?? getConditionColor(cond.name)
    const label = cond.value !== null ? `${cond.name} ${cond.value}` : cond.name

    return {
      key: `${tokenId}-${cond.name}-${i}`,
      x: ax,
      y: ay,
      color,
      icon,
      label,
      flipLeft,
      hidden: !!cond.hidden,
      delay: i * 25,
    }
  })
})
</script>

<style scoped>
.chips-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
}

.condition-chip {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(10, 10, 25, 0.94);
  border: 1px solid transparent;
  border-radius: 9px;
  padding: 2px 7px 2px 4px;
  white-space: nowrap;
  pointer-events: none;
  transform: translate(0, -50%);
  transform-origin: left center;
  animation: chip-fade-in 140ms ease-out both;
}

.condition-chip--left {
  transform: translate(-100%, -50%);
  transform-origin: right center;
}

.condition-chip--hidden {
  border-style: dashed !important;
  opacity: 0.8;
}

.chip-label {
  font-family: system-ui, sans-serif;
  font-size: 9.5px;
  font-weight: 700;
  color: #e8e6f8;
  line-height: 1;
}

.chip-hidden-mark {
  font-size: 9px;
  color: #6b6b9a;
  margin-left: 2px;
}

@keyframes chip-fade-in {
  from {
    opacity: 0;
    translate: 0 -2px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}
</style>
