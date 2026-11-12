<template>
  <div class="wwt-body">

    <!-- Config panel -->
    <div v-if="showConfig" class="wwt-config">
      <div class="wwt-config-head">
        <span class="wwt-config-title">Weather Conditions</span>
        <button class="wwt-config-done" @click="showConfig = false">Done</button>
      </div>

      <div class="wwt-cond-list">
        <div v-for="(cond, i) in localConditions" :key="i" class="wwt-cond-row">
          <input v-model="cond.name" class="wwt-cond-name" placeholder="Condition name" @change="save" />
          <input v-model="cond.description" class="wwt-cond-desc" placeholder="Description (optional)" @change="save" />
          <button class="wwt-cond-del" @click="removeCondition(i)" title="Remove">✕</button>
        </div>
        <div v-if="!localConditions.length" class="wwt-config-empty">No conditions yet — add one below.</div>
      </div>

      <div class="wwt-add-row">
        <input v-model="newCondName" class="wwt-cond-name" placeholder="New condition…" @keyup.enter="addCondition" />
        <button class="wwt-add-btn" @click="addCondition">+ Add</button>
      </div>
    </div>

    <!-- Display panel -->
    <template v-else>
      <div class="wwt-current" :class="{ 'wwt-current--empty': !currentCondition }">
        <div class="wwt-icon">{{ currentIcon }}</div>
        <div class="wwt-name">{{ currentCondition?.name ?? 'No weather set' }}</div>
        <div v-if="currentCondition?.description" class="wwt-desc">{{ currentCondition.description }}</div>
      </div>

      <div class="wwt-actions">
        <button class="wwt-btn" :disabled="!localConditions.length" @click="roll" title="Pick a random condition">🎲 Roll</button>
        <div class="wwt-sep" />
        <div class="wwt-pick-label">Pick:</div>
        <div class="wwt-pick-list">
          <button
            v-for="cond in localConditions"
            :key="cond.name"
            class="wwt-pick-btn"
            :class="{ 'wwt-pick-btn--active': config.current === cond.name }"
            @click="setCurrent(cond.name)"
          >{{ cond.name }}</button>
          <span v-if="!localConditions.length" class="wwt-no-conds">Configure conditions →</span>
        </div>
      </div>

      <button class="wwt-cfg-btn" @click="showConfig = true" title="Configure conditions">⚙ Conditions</button>
    </template>

  </div>
</template>

<script setup lang="ts">
interface WeatherCondition {
  name: string
  description?: string
}

interface WeatherConfig {
  conditions: WeatherCondition[]
  current: string | null
}

const props = defineProps<{ config: Record<string, any> }>()
const emit = defineEmits<{ 'update:config': [config: WeatherConfig] }>()

const showConfig = ref(false)
const newCondName = ref('')

const localConditions = computed({
  get: () => (props.config.conditions ?? []) as WeatherCondition[],
  set: (v: WeatherCondition[]) => emit('update:config', { ...typedConfig.value, conditions: v }),
})

const typedConfig = computed((): WeatherConfig => ({
  conditions: (props.config.conditions ?? []) as WeatherCondition[],
  current: (props.config.current ?? null) as string | null,
}))

const currentCondition = computed(() =>
  localConditions.value.find(c => c.name === typedConfig.value.current) ?? null
)

const WEATHER_ICONS = ['⛅', '🌤', '🌧', '❄', '🌩', '🌫', '🔥', '🌬', '☀', '🌪']
const currentIcon = computed(() => {
  if (!currentCondition.value) return '🌡'
  const n = currentCondition.value.name.length % WEATHER_ICONS.length
  return WEATHER_ICONS[n]
})

function roll() {
  const conds = localConditions.value
  if (!conds.length) return
  const picked = conds[Math.floor(Math.random() * conds.length)]
  emit('update:config', { ...typedConfig.value, current: picked.name })
}

function setCurrent(name: string) {
  emit('update:config', { ...typedConfig.value, current: name })
}

function addCondition() {
  const name = newCondName.value.trim()
  if (!name) return
  const updated = [...localConditions.value, { name }]
  emit('update:config', { ...typedConfig.value, conditions: updated })
  newCondName.value = ''
}

function removeCondition(i: number) {
  const updated = localConditions.value.filter((_, idx) => idx !== i)
  const current = typedConfig.value.current
  const stillExists = updated.some(c => c.name === current)
  emit('update:config', { ...typedConfig.value, conditions: updated, current: stillExists ? current : null })
}

function save() {
  emit('update:config', { ...typedConfig.value, conditions: [...localConditions.value] })
}
</script>

<style scoped>
.wwt-body {
  flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
  position: relative;
}

/* ── Display ── */
.wwt-current {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 4px;
  padding: 10px 12px;
  text-align: center;
}
.wwt-current--empty { opacity: 0.45; }
.wwt-icon { font-size: 32px; line-height: 1; }
.wwt-name { font-size: 14px; font-weight: 700; color: var(--text); }
.wwt-desc { font-size: 11px; color: var(--text2); line-height: 1.4; }

.wwt-actions {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 6px 10px; border-top: 1px solid var(--border); flex-shrink: 0;
}
.wwt-btn {
  padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 600;
  border: 1px solid var(--border); background: var(--bg); color: var(--text2);
  cursor: pointer; flex-shrink: 0; transition: all 0.1s;
}
.wwt-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-l); }
.wwt-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.wwt-sep { width: 1px; height: 16px; background: var(--border); flex-shrink: 0; }
.wwt-pick-label { font-size: 10px; color: var(--text3); flex-shrink: 0; font-family: var(--fm); letter-spacing: 0.08em; text-transform: uppercase; }
.wwt-pick-list { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; min-width: 0; }
.wwt-pick-btn {
  padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600;
  border: 1px solid var(--border); background: var(--bg); color: var(--text2);
  cursor: pointer; transition: all 0.1s; white-space: nowrap;
}
.wwt-pick-btn:hover { border-color: var(--accent); color: var(--accent-l); }
.wwt-pick-btn--active { background: var(--accent-bg); border-color: var(--accent); color: var(--accent-l); }
.wwt-no-conds { font-size: 10px; color: var(--text3); font-style: italic; }

.wwt-cfg-btn {
  position: absolute; bottom: 6px; right: 6px;
  padding: 2px 6px; border-radius: 4px; font-size: 9px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text3);
  cursor: pointer; opacity: 0; transition: opacity 0.15s;
}
.wwt-body:hover .wwt-cfg-btn { opacity: 1; }
.wwt-cfg-btn:hover { color: var(--accent-l); border-color: var(--accent); }

/* ── Config panel ── */
.wwt-config {
  flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
}
.wwt-config-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.wwt-config-title { font-size: 11px; font-weight: 700; color: var(--text2); font-family: var(--fm); letter-spacing: 0.06em; text-transform: uppercase; }
.wwt-config-done { padding: 2px 8px; border-radius: 4px; font-size: 11px; border: 1px solid var(--accent); background: var(--accent-bg); color: var(--accent-l); cursor: pointer; font-weight: 600; }

.wwt-cond-list { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; }
.wwt-cond-row { display: flex; gap: 4px; align-items: center; }
.wwt-cond-name { flex: 0 0 120px; font-size: 11px; padding: 3px 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg); color: var(--text); }
.wwt-cond-desc { flex: 1; font-size: 11px; padding: 3px 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg); color: var(--text2); }
.wwt-cond-del { padding: 3px 6px; border-radius: 4px; font-size: 10px; border: 1px solid transparent; background: none; color: var(--text3); cursor: pointer; }
.wwt-cond-del:hover { border-color: var(--danger); color: var(--danger); }
.wwt-config-empty { font-size: 11px; color: var(--text3); font-style: italic; padding: 8px 4px; }

.wwt-add-row { display: flex; gap: 4px; padding: 6px 8px; border-top: 1px solid var(--border); flex-shrink: 0; }
.wwt-add-btn { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; border: 1px solid var(--border); background: var(--bg); color: var(--text2); cursor: pointer; white-space: nowrap; }
.wwt-add-btn:hover { border-color: var(--accent); color: var(--accent-l); }
</style>
