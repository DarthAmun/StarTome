<template>
  <div class="wti-body">
    <div class="wti-tabs">
      <button :class="['wti-tab', { active: mode === 'stopwatch' }]" @click="switchMode('stopwatch')">Stopwatch</button>
      <button :class="['wti-tab', { active: mode === 'countdown' }]" @click="switchMode('countdown')">Countdown</button>
    </div>

    <div :class="['wti-display', { 'wti-display--done': isDone }]">
      {{ displayTime }}
    </div>

    <div v-if="mode === 'countdown' && !running && totalMs === 0" class="wti-setup">
      <input v-model.number="inputMin" type="number" min="0" max="99" class="wti-setup-input" @keydown.enter="toggle" />
      <span class="wti-setup-sep">m</span>
      <input v-model.number="inputSec" type="number" min="0" max="59" class="wti-setup-input" @keydown.enter="toggle" />
      <span class="wti-setup-sep">s</span>
    </div>

    <div class="wti-controls">
      <button class="wti-btn wti-btn--primary" :disabled="!canStart" @click="toggle">
        {{ running ? 'Pause' : 'Start' }}
      </button>
      <button class="wti-btn" @click="reset">Reset</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const mode = ref<'stopwatch' | 'countdown'>('stopwatch')
const running = ref(false)
const elapsed = ref(0)
const totalMs = ref(0)
const inputMin = ref(5)
const inputSec = ref(0)
let startTime = 0
let ticker: ReturnType<typeof setInterval> | null = null

const remaining = computed(() => Math.max(0, totalMs.value - elapsed.value))
const isDone = computed(() => mode.value === 'countdown' && totalMs.value > 0 && remaining.value === 0)

const displayTime = computed(() => {
  const ms = mode.value === 'stopwatch' ? elapsed.value : remaining.value
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
})

const canStart = computed(() => {
  if (mode.value === 'stopwatch') return true
  if (totalMs.value > 0 && !isDone.value) return true
  return (inputMin.value > 0 || inputSec.value > 0)
})

function tick() {
  elapsed.value = Date.now() - startTime
  if (mode.value === 'countdown' && elapsed.value >= totalMs.value) {
    elapsed.value = totalMs.value
    stop()
  }
}

function start() {
  if (mode.value === 'countdown' && totalMs.value === 0) {
    const ms = ((inputMin.value || 0) * 60 + (inputSec.value || 0)) * 1000
    if (ms === 0) return
    totalMs.value = ms
  }
  startTime = Date.now() - elapsed.value
  ticker = setInterval(tick, 100)
  running.value = true
}

function stop() {
  if (ticker) { clearInterval(ticker); ticker = null }
  running.value = false
}

function toggle() {
  running.value ? stop() : start()
}

function reset() {
  stop()
  elapsed.value = 0
  totalMs.value = 0
}

function switchMode(m: typeof mode.value) {
  stop()
  elapsed.value = 0
  totalMs.value = 0
  mode.value = m
}

onUnmounted(() => { if (ticker) clearInterval(ticker) })
</script>

<style scoped>
.wti-body {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px; padding: 10px 12px;
}

.wti-tabs {
  display: flex; gap: 4px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 3px;
}
.wti-tab {
  padding: 3px 12px; border-radius: 5px; font-size: 11px; font-weight: 600;
  color: var(--text3); transition: all 0.12s; cursor: pointer;
  border: none; background: none;
}
.wti-tab.active { background: var(--surface-hi); color: var(--text); }
.wti-tab:hover:not(.active) { color: var(--text2); }

.wti-display {
  font-family: var(--fm, monospace); font-size: 42px; font-weight: 700;
  letter-spacing: 0.04em; color: var(--text); line-height: 1;
  transition: color 0.3s;
}
.wti-display--done {
  color: var(--accent-l);
  animation: wti-pulse 1s ease-in-out infinite;
}
@keyframes wti-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.45; }
}

.wti-setup {
  display: flex; align-items: center; gap: 6px;
}
.wti-setup-input {
  width: 48px; text-align: center;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 4px 6px;
  font-size: 15px; font-family: var(--fm, monospace); font-weight: 600; color: var(--text);
  -moz-appearance: textfield;
}
.wti-setup-input::-webkit-outer-spin-button,
.wti-setup-input::-webkit-inner-spin-button { -webkit-appearance: none; }
.wti-setup-input:focus { outline: none; border-color: var(--border-hi); }
.wti-setup-sep { font-size: 13px; color: var(--text3); font-weight: 600; }

.wti-controls { display: flex; gap: 6px; }
.wti-btn {
  padding: 5px 16px; border-radius: 7px; font-size: 12px; font-weight: 600;
  border: 1px solid var(--border); background: var(--surface); color: var(--text2);
  cursor: pointer; transition: all 0.12s;
}
.wti-btn:hover:not(:disabled) { background: var(--surface-hi); border-color: var(--border-hi); color: var(--text); }
.wti-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.wti-btn--primary {
  background: var(--accent-bg); border-color: color-mix(in oklch, var(--accent) 45%, transparent);
  color: var(--accent-l);
}
.wti-btn--primary:hover:not(:disabled) {
  background: color-mix(in oklch, var(--accent) 15%, transparent);
  border-color: var(--accent);
}
</style>
