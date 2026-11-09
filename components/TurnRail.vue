<template>
  <div
    class="turn-rail"
    :class="`turn-rail--${position}`"
    :style="{ '--u': unit + 'px' }"
  >
    <span class="turn-rail-round">
      <template v-if="vertical">ROUND<br><b>{{ roundNumber }}</b></template>
      <template v-else>ROUND {{ roundNumber }}</template>
    </span>

    <div
      v-for="token in windowedTokens"
      :key="token.id"
      class="turn-rail-entry"
      :class="{
        'turn-rail-entry--active': token.id === activeTurnTokenId,
        'turn-rail-entry--dead': token.isDead,
        'turn-rail-entry--mystery': token.isMystery,
      }"
    >
      <div
        class="turn-rail-token"
        :style="{ borderColor: borderColor(token) }"
        :title="showNames ? token.label || token.name : undefined"
      >
        <img
          v-if="token.imageSource"
          :src="token.imageSource"
          class="turn-rail-portrait"
          :style="{ filter: token.isDead ? 'grayscale(1)' : 'none' }"
        />
        <span v-else class="turn-rail-initial">{{ (token.label || token.name).charAt(0) }}</span>
      </div>
      <span v-if="vertical && showNames" class="turn-rail-name">{{ token.isMystery ? 'Unknown' : token.label || token.name }}</span>
    </div>

    <!-- overflow indicator -->
    <span v-if="tokens.length > windowSize" class="turn-rail-overflow">
      +{{ tokens.length - windowSize }}
    </span>
  </div>
</template>

<script setup lang="ts">
import type { TurnOrderEntry, TurnRailPosition, TurnRailSize } from '~/stores/encounter'

const props = withDefaults(defineProps<{
  tokens: TurnOrderEntry[]
  activeTurnTokenId: number | null
  roundNumber: number
  position?: TurnRailPosition
  size?: TurnRailSize
  showNames?: boolean
}>(), {
  position: 'top',
  size: 'medium',
  showNames: true,
})

const GOLD  = '#ffd700'
const ALLY  = '#1a8070'
const ENEMY = '#c0392b'
const DEAD  = '#8b2030'

const SIZE_FACTOR: Record<TurnRailSize, number> = { small: 0.75, medium: 1, large: 1.35 }

const vertical = computed(() => props.position !== 'top')

// Portrait size follows the screen so the rail stays legible on large displays
const { width: viewportW, height: viewportH } = useWindowSize({ initialWidth: 1280, initialHeight: 800 })

const unit = computed(() => {
  const base = Math.min(96, Math.max(28, Math.min(viewportW.value, viewportH.value) * 0.05))
  return Math.round(base * SIZE_FACTOR[props.size])
})

// How many portraits fit: horizontal rail caps at 9; side docks fill ~85% of the height
const windowSize = computed(() => {
  if (!vertical.value) return 9
  const perEntry = unit.value * 1.3
  return Math.max(3, Math.floor((viewportH.value * 0.85 - unit.value * 1.6) / perEntry))
})

function borderColor(token: TurnOrderEntry): string {
  if (token.id === props.activeTurnTokenId) return GOLD
  if (token.isDead) return DEAD
  return token.isPlayerToken ? ALLY : ENEMY
}

const windowedTokens = computed<TurnOrderEntry[]>(() => {
  const all = props.tokens
  const n = all.length
  const activeIdx = all.findIndex(t => t.id === props.activeTurnTokenId)
  const center = activeIdx >= 0 ? activeIdx : 0

  // Side docks read top-down: the active token, then who's up next
  if (vertical.value) {
    return Array.from({ length: Math.min(n, windowSize.value) }, (_, i) => all[(center + i) % n])
  }

  if (n <= windowSize.value) return all
  const half = Math.floor(windowSize.value / 2)
  return Array.from({ length: windowSize.value }, (_, i) => all[(center - half + i + n) % n])
})
</script>

<style scoped>
.turn-rail {
  --u: 32px;
  position: absolute;
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 0.26);
  padding: calc(var(--u) * 0.22) calc(var(--u) * 0.45);
  background: rgba(13, 13, 28, 0.92);
  border: 1px solid #2a2a44;
  border-radius: calc(var(--u) * 0.8);
  z-index: 100;
  pointer-events: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  white-space: nowrap;
}

.turn-rail--top {
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
}

.turn-rail--left,
.turn-rail--right {
  top: 50%;
  transform: translateY(-50%);
  flex-direction: column;
  align-items: stretch;
  padding: calc(var(--u) * 0.4) calc(var(--u) * 0.3);
  border-radius: calc(var(--u) * 0.45);
  max-width: calc(var(--u) * 5.5);
}
.turn-rail--left { left: 12px; }
.turn-rail--right { right: 12px; }

.turn-rail-round {
  font-family: system-ui, sans-serif;
  font-size: calc(var(--u) * 0.32);
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #8a8ab0;
  flex-shrink: 0;
  margin-right: calc(var(--u) * 0.08);
  text-align: center;
  line-height: 1.15;
}
.turn-rail-round b {
  font-size: calc(var(--u) * 0.55);
  color: #c8c6e4;
}
.turn-rail--left .turn-rail-round,
.turn-rail--right .turn-rail-round {
  margin: 0 0 calc(var(--u) * 0.15);
}

.turn-rail-entry {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 0.3);
  min-width: 0;
  transition: opacity 0.2s;
}
.turn-rail--right .turn-rail-entry { flex-direction: row-reverse; }

.turn-rail-entry--dead { opacity: 0.45; }

/* Hidden combatant shown anonymously */
.turn-rail-entry--mystery .turn-rail-token { border-style: dashed; }
.turn-rail-entry--mystery .turn-rail-initial { color: #8a8ab0; }
.turn-rail-entry--mystery .turn-rail-name { font-style: italic; }

.turn-rail-token {
  width: var(--u);
  height: var(--u);
  border-radius: 50%;
  border: calc(var(--u) * 0.07 + 0.5px) solid transparent;
  box-sizing: border-box;
  overflow: hidden;
  flex-shrink: 0;
  background: #101024;
  transition: box-shadow 0.15s, transform 0.2s;
}

.turn-rail-entry--active .turn-rail-token {
  transform: scale(1.18);
  box-shadow: 0 0 calc(var(--u) * 0.35) rgba(255, 215, 0, 0.5);
}
.turn-rail--left .turn-rail-entry--active,
.turn-rail--right .turn-rail-entry--active {
  margin-bottom: calc(var(--u) * 0.12);
}

.turn-rail-portrait {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.turn-rail-initial {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Cinzel', serif;
  font-size: calc(var(--u) * 0.42);
  color: #c8c6e4;
}

.turn-rail-name {
  font-family: system-ui, sans-serif;
  font-size: calc(var(--u) * 0.36);
  color: #a8a6c8;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.turn-rail-entry--active .turn-rail-name {
  color: #ffd700;
  font-weight: 700;
  font-size: calc(var(--u) * 0.42);
}

.turn-rail-overflow {
  font-family: system-ui, sans-serif;
  font-size: calc(var(--u) * 0.32);
  font-weight: 700;
  color: #8a8ab0;
  flex-shrink: 0;
  text-align: center;
}
</style>
