<template>
  <div class="st">
    <div class="st-row" :style="{ gridTemplateColumns: `repeat(${zones}, minmax(64px, 1fr))` }">
      <div v-for="z in zones" :key="z - 1" class="st-zone"
        :class="{ 'st-zone--area': highlight.includes(z - 1), 'st-zone--range': range.includes(z - 1), 'st-zone--rear': rear.includes(z - 1) }"
        @click="emit('zone', z - 1)" @dragover.prevent @drop.prevent="onDrop(z - 1)">
        <div class="st-zone-num">{{ z }}</div>
        <div v-for="t in byZone(z - 1)" :key="t.id" class="st-ship" :class="[`st-ship--${t.side}`, { 'st-ship--sel': t.id === selectedId, 'st-ship--turn': t.id === turnId, 'st-ship--hidden': t.hidden }]"
          :draggable="draggable" :title="titleOf(t)" @dragstart="dragId = t.id" @click.stop="emit('select', t.id)">
          <span class="st-head">{{ t.heading === -1 ? '◀' : '' }}</span>
          <span class="st-name">{{ t.name }}</span>
          <span class="st-head">{{ t.heading === -1 ? '' : '▶' }}</span>
          <span v-if="t.hpMax != null" class="st-bars">
            <span class="st-bar st-bar--sp" :style="{ width: pct(t.sp, t.spMax) }" />
            <span class="st-bar st-bar--hp" :style="{ width: pct(t.hp, t.hpMax) }" />
          </span>
          <span v-else-if="t.health" class="st-health">{{ t.health }}</span>
          <span v-for="c in t.conditions ?? []" :key="c" class="st-cond">{{ c }}</span>
        </div>
      </div>
    </div>
    <div v-if="border != null" class="st-borders" :style="{ gridTemplateColumns: `repeat(${zones}, minmax(64px, 1fr))` }">
      <span v-for="z in zones" :key="z" class="st-border-cell">
        <button v-if="z < zones" class="st-border-btn" :class="{ active: border === z }" title="Burst: the border it starts from" @click="emit('border', z)">┃</button>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/** The sensor map's row of zones with the ships in them (GM panel and player view). */
import { ref } from 'vue'

export interface TrackToken {
  id: number
  name: string
  zone: number
  heading: 1 | -1
  side: 'party' | 'ally' | 'enemy' | 'hazard'
  hp?: number | null
  hpMax?: number | null
  sp?: number | null
  spMax?: number | null
  /** Player view: a health word instead of numbers. */
  health?: string | null
  conditions?: string[]
  hidden?: boolean
}

const props = withDefaults(defineProps<{
  zones: number
  tokens: TrackToken[]
  selectedId?: number | null
  turnId?: number | null
  highlight?: number[]
  range?: number[]
  rear?: number[]
  border?: number | null
  draggable?: boolean
}>(), { selectedId: null, turnId: null, highlight: () => [], range: () => [], rear: () => [], border: null, draggable: false })
const emit = defineEmits<{ select: [id: number]; move: [id: number, zone: number]; zone: [zone: number]; border: [border: number] }>()

const dragId = ref<number | null>(null)
function onDrop(zone: number) {
  if (dragId.value != null) emit('move', dragId.value, zone)
  dragId.value = null
}
const byZone = (z: number) => props.tokens.filter(t => t.zone === z)
const pct = (v: number | null | undefined, max: number | null | undefined) => (max ? `${Math.max(0, Math.min(100, ((v ?? 0) / max) * 100))}%` : '0%')
function titleOf(t: TrackToken) {
  const parts = [t.name, t.heading === -1 ? 'facing left' : 'facing right']
  if (t.hpMax != null) parts.push(`HP ${t.hp ?? '?'}/${t.hpMax}`)
  if (t.spMax) parts.push(`SP ${t.sp ?? 0}/${t.spMax}`)
  return parts.join(' · ')
}
</script>

<style scoped>
.st { overflow-x: auto; }
.st-row { display: grid; gap: 4px; min-width: 100%; }
.st-zone { border: 1px solid var(--border); border-radius: 6px; min-height: 96px; padding: 3px; display: flex; flex-direction: column; gap: 3px; background: #0b1220aa; cursor: default; }
.st-zone--range { background: #4ab8e814; }
.st-zone--rear { background: #e0555512; }
.st-zone--area { background: #e8a04033; border-color: #e8a040; }
.st-zone-num { font-size: 10px; color: var(--text3); text-align: center; }
.st-ship { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; border-radius: 4px; padding: 2px 4px; font-size: 11.5px; cursor: pointer; border: 1px solid transparent; }
.st-ship--party { background: #4ab8e833; }
.st-ship--ally { background: #5fc98a33; }
.st-ship--enemy { background: #e0555533; }
.st-ship--hazard { background: #e8924a33; }
.st-ship--sel { border-color: #fff; }
.st-ship--turn { box-shadow: 0 0 0 2px #e8c44a; }
.st-ship--hidden { opacity: 0.5; font-style: italic; }
.st-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-head { font-size: 10px; color: var(--text2); }
.st-bars { flex-basis: 100%; display: flex; flex-direction: column; gap: 1px; }
.st-bar { height: 3px; border-radius: 2px; display: block; }
.st-bar--sp { background: #6bc0e8; }
.st-bar--hp { background: #5fc98a; }
.st-health { flex-basis: 100%; font-size: 10px; color: var(--text3); }
.st-cond { font-size: 9.5px; background: #ffffff1a; border-radius: 3px; padding: 0 3px; }
.st-borders { display: grid; gap: 4px; }
.st-border-cell { display: flex; justify-content: flex-end; margin-right: -9px; }
.st-border-btn { background: none; border: none; color: var(--text3); cursor: pointer; font-size: 11px; padding: 0 2px; }
.st-border-btn.active { color: #e8a040; }
</style>
