<template>
  <div class="wds-body">
    <!-- Search row -->
    <button class="wds-search" @click="openSearch">
      <OhVueIcon name="fa-search" scale="0.75" class="wds-search-icon" />
      <span class="wds-search-label">Global Search</span>
      <span class="wds-search-hint">{{ isMac ? '⌘K' : 'Ctrl+K' }}</span>
    </button>

    <!-- Dice grid -->
    <div class="wds-dice-grid">
      <button
        v-for="d in DICE"
        :key="d"
        class="wds-die"
        @click="rollDie(d)"
      >
        <span class="wds-die-face">{{ DIE_FACE[d] }}</span>
        <span class="wds-die-label">d{{ d }}</span>
      </button>
    </div>

    <!-- Roll log -->
    <div v-if="log.length" class="wds-log">
      <div v-for="(r, i) in log" :key="i" class="wds-log-row">
        <span class="wds-log-die">{{ r.die }}</span>
        <span :class="['wds-log-val', r.isMax ? 'crit' : r.isMin ? 'fail' : '']">{{ r.val }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useGlobalSearch } from '~/composables/useGlobalSearch'

const { open } = useGlobalSearch()
const isMac = import.meta.client && navigator.platform.includes('Mac')

const DICE = [4, 6, 8, 10, 12, 20] as const
const DIE_FACE: Record<number, string> = { 4: '▲', 6: '■', 8: '◆', 10: '◈', 12: '⬡', 20: '◇' }

interface LogEntry { die: string; val: number; isMax: boolean; isMin: boolean }
const log = ref<LogEntry[]>([])

function rollDie(sides: number) {
  const val = Math.floor(Math.random() * sides) + 1
  log.value = [{ die: `d${sides}`, val, isMax: val === sides, isMin: val === 1 }, ...log.value].slice(0, 6)
}

function openSearch() {
  open.value = true
}
</script>

<style scoped>
.wds-body { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; overflow-y: auto; flex: 1; }

.wds-search {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: 7px; width: 100%;
  background: oklch(100% 0 0/0.04); border: 1px solid oklch(100% 0 0/0.09);
  text-align: left; cursor: pointer; transition: all 0.12s;
}
.wds-search:hover { background: oklch(100% 0 0/0.08); border-color: oklch(100% 0 0/0.15); }
.wds-search-icon { color: oklch(48% 0.014 280); flex-shrink: 0; }
.wds-search-label { flex: 1; font-size: 12px; color: oklch(62% 0.014 280); }
.wds-search-hint { font-family: var(--fm); font-size: 9.5px; color: oklch(42% 0.014 280); flex-shrink: 0; }

.wds-dice-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}
.wds-die {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; padding: 6px 2px; border-radius: 7px; cursor: pointer;
  background: oklch(100% 0 0/0.03); border: 1px solid oklch(100% 0 0/0.08);
  transition: all 0.12s;
}
.wds-die:hover { background: oklch(58% 0.24 295/0.10); border-color: oklch(58% 0.24 295/0.30); color: oklch(78% 0.14 295); }
.wds-die-face { font-size: 14px; line-height: 1; }
.wds-die-label { font-size: 9px; font-family: var(--fm); color: oklch(50% 0.014 280); }
.wds-die:hover .wds-die-label { color: oklch(78% 0.14 295); }

.wds-log { display: flex; flex-direction: column; gap: 2px; max-height: 80px; overflow-y: auto; }
.wds-log-row { display: flex; justify-content: space-between; align-items: baseline; padding: 1px 4px; }
.wds-log-die { font-family: var(--fm); font-size: 10.5px; color: oklch(55% 0.014 280); }
.wds-log-val { font-family: var(--fm); font-size: 11px; font-weight: 700; color: oklch(85% 0.012 280); }
.wds-log-val.crit { color: oklch(80% 0.16 75); }
.wds-log-val.fail { color: oklch(62% 0.22 22); }
</style>
