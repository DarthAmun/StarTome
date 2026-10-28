<template>
  <Teleport to="body">
    <Transition name="cond-panel-slide">
      <div v-if="open" class="cond-panel-wrap" @keydown.esc.capture.stop="$emit('close')">
        <!-- Backdrop: click outside to close -->
        <div class="cond-panel-backdrop" @click="$emit('close')" />

        <div class="cond-panel">
          <div class="cond-panel-header">
            <span class="cond-panel-title">
              {{ conditionName }}
              <span v-if="value !== null && value !== undefined" class="cond-panel-value"> {{ value }}</span>
            </span>
            <button class="cond-panel-close" @click="$emit('close')">✕</button>
          </div>

          <div v-if="loading" class="cond-panel-loading">
            <OhVueIcon name="md-autorenew" scale="1.2" class="spin" />
          </div>

          <div v-else-if="record && entityType" class="cond-panel-entity">
            <EntityLayout
              :entity-type="entityType"
              :data="record.data"
              mode="view"
              :system-id="systemId ?? undefined"
              :accent-color="entityType.color"
            />
          </div>

          <div v-else-if="builtin" class="cond-panel-notfound">
            <OhVueIcon :name="builtin.icon" scale="2.5" class="cond-panel-notfound-icon" :style="{ color: builtin.color }" />
            <p class="cond-panel-notfound-text">{{ builtin.desc }}</p>
            <p class="cond-panel-notfound-hint">Quick reminder only. Full rules text arrives with the compendium sync.</p>
          </div>

          <div v-else class="cond-panel-notfound">
            <OhVueIcon name="gi-poison" scale="2.5" class="cond-panel-notfound-icon" />
            <p class="cond-panel-notfound-text">No details found for<br><strong>{{ conditionName }}</strong></p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { getDb, parseRecordData } from '~/composables/useDb'
import { useSystems } from '~/composables/useSystems'
import { conditionInfo } from '~/composables/useConditions'
import type { GameId } from '~/types/game'

const props = defineProps<{
  conditionName: string
  systemId: number | null
  game?: GameId
  value?: number | null
  open: boolean
}>()

defineEmits<{ close: [] }>()

const systemsStore = useSystems()
const loading = ref(false)
const record = ref<{ name: string; data: Record<string, any> } | null>(null)
const entityType = ref<any | null>(null)
const builtin = computed(() => {
  const info = conditionInfo(props.conditionName)
  return info && info.games.includes(props.game ?? 'pf2e') ? info : null
})

async function loadCondition() {
  if (!props.conditionName || !props.systemId) { record.value = null; entityType.value = null; return }
  loading.value = true
  try {
    const db = getDb()
    const lower = props.conditionName.toLowerCase()
    const rows = await db.records
      .where('systemId').equals(props.systemId)
      .filter(r => r.entityTypeId === 'condition' && r.name.toLowerCase() === lower)
      .first()
    if (!rows) { record.value = null; entityType.value = null; return }
    if (!systemsStore.getSystem(props.systemId)) await systemsStore.loadAll()
    const sys = systemsStore.getSystem(props.systemId)
    entityType.value = sys?.entityTypes?.find((e: any) => e.id === 'condition') ?? null
    record.value = {
      name: rows.name,
      data: parseRecordData(rows.data),
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.open, props.conditionName, props.systemId] as const,
  ([open]) => { if (open) loadCondition() },
  { immediate: true }
)
</script>

<style scoped>
.cond-panel-wrap {
  position: fixed; inset: 0; z-index: 410;
  display: flex; justify-content: flex-end;
}

.cond-panel-backdrop {
  position: absolute; inset: 0;
}

.cond-panel {
  position: relative; z-index: 1;
  width: 340px; height: 100%;
  background: var(--surface-solid);
  border-left: 1px solid var(--border-hi);
  box-shadow: var(--sh-lg);
  display: flex; flex-direction: column;
  overflow-y: auto;
  color: var(--text);
}

.cond-panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--surface-hi);
}

.cond-panel-title {
  font-family: var(--fh, serif);
  font-size: 15px; font-weight: 600;
  color: var(--accent-l);
}

.cond-panel-value {
  font-size: 13px; font-weight: 400;
  color: var(--text3); margin-left: 2px;
}

.cond-panel-close {
  background: none; border: none; cursor: pointer;
  font-size: 14px; color: var(--text3);
  padding: 2px 6px; border-radius: 4px; line-height: 1; transition: all 0.12s;
}
.cond-panel-close:hover { background: var(--surface-hi); color: var(--text); }

.cond-panel-loading {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--text3);
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.cond-panel-entity { padding: 10px; }

.cond-panel-notfound {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; padding: 32px 24px; text-align: center;
}
.cond-panel-notfound-icon { opacity: 0.20; color: var(--danger); }
.cond-panel-notfound-text {
  font-size: 14px; color: var(--text);
  margin: 0; line-height: 1.5;
}
.cond-panel-notfound-hint {
  font-size: 12px; color: var(--text3);
  margin: 0; line-height: 1.5;
}

/* Slide transition */
.cond-panel-slide-enter-active { transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1); }
.cond-panel-slide-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.cond-panel-slide-enter-from,
.cond-panel-slide-leave-to { opacity: 0; transform: translateX(100%); }
.cond-panel-slide-enter-to,
.cond-panel-slide-leave-from { opacity: 1; transform: translateX(0); }
</style>
