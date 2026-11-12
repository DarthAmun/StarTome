<template>
  <Teleport to="body">
    <Transition name="eq-slide">
      <div v-if="open" class="eq-wrap" @keydown.esc.capture.stop="$emit('close')">
        <div class="eq-backdrop" @click="$emit('close')" />

        <div class="eq-panel">
          <div class="eq-header" :style="{ borderLeftColor: entityColor }">
            <div class="eq-header-info">
              <span class="eq-kind">{{ kindLabel }}</span>
              <span class="eq-name">{{ entity?.name ?? name }}</span>
            </div>
            <button class="eq-close" title="Close" @click="$emit('close')">✕</button>
          </div>

          <div v-if="!entity" class="eq-missing">
            <span class="eq-missing-icon">◌</span>
            <span>No entity found for <strong>{{ name }}</strong></span>
          </div>

          <template v-else>
            <WidgetSession     v-if="entity.type === 'session'"                        :entity="entity" class="eq-body" />
            <WidgetNpc         v-else-if="entity.type === 'npc'"                       :entity="entity" class="eq-body" />
            <WidgetLocation    v-else-if="entity.type === 'location'"                  :entity="entity" class="eq-body" />
            <WidgetFaction     v-else-if="entity.type === 'faction'"                   :entity="entity" class="eq-body" />
            <WidgetQuest       v-else-if="entity.type === 'quest'"                     :entity="entity" class="eq-body" />
            <WidgetNote        v-else-if="entity.type === 'note' || entity.type === 'event'" :entity="entity" class="eq-body" />
            <WidgetRandomTable v-else-if="entity.type === 'random-table'"              :entity="entity" class="eq-body" />
            <WidgetRumor       v-else-if="entity.type === 'rumor'"                     :entity="entity" class="eq-body" />
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useEntities } from '~/composables/useEntities'
import { ENTITY_TYPE_CONFIG } from '~/types/entities'
import type { EntityType } from '~/types/entities'

const props = defineProps<{
  type: string
  name: string
  campaignId: number
  open: boolean
}>()

defineEmits<{ close: [] }>()

const store = useEntities()

const entity = computed(() =>
  props.open && props.name
    ? store.findByTypeAndName(props.type, props.name)
    : null
)

const cfg = computed(() => ENTITY_TYPE_CONFIG[props.type as EntityType])
const kindLabel   = computed(() => cfg.value?.label   ?? props.type)
const entityColor = computed(() => cfg.value?.color   ?? 'var(--accent)')
</script>

<style scoped>
.eq-wrap {
  position: fixed; inset: 0; z-index: 450;
  display: flex; justify-content: flex-end;
}
.eq-backdrop { position: absolute; inset: 0; }

.eq-panel {
  position: relative; z-index: 1;
  width: 420px; height: 100%;
  background: var(--surface-solid, var(--surface));
  border-left: 1px solid var(--border-hi);
  box-shadow: var(--sh-lg);
  display: flex; flex-direction: column;
  overflow: hidden;
  color: var(--text);
}

.eq-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px 10px 16px;
  border-bottom: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  flex-shrink: 0;
  background: var(--surface-hi);
  gap: 10px;
}
.eq-header-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.eq-kind {
  font-family: var(--fm); font-size: 9.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.10em; color: var(--text3);
}
.eq-name {
  font-family: var(--fh, serif); font-size: 15px; font-weight: 600;
  color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.eq-close {
  background: none; border: none; cursor: pointer;
  font-size: 14px; color: var(--text3); padding: 3px 7px;
  border-radius: 5px; transition: all 0.12s; flex-shrink: 0;
}
.eq-close:hover { background: var(--surface-hi); color: var(--text); }

.eq-body {
  flex: 1; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column;
}

.eq-missing {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px; padding: 32px 24px; text-align: center;
  font-size: 13px; color: var(--text3);
}
.eq-missing-icon { font-size: 32px; opacity: 0.25; }

/* Slide transition */
.eq-slide-enter-active { transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1); }
.eq-slide-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.eq-slide-enter-from,
.eq-slide-leave-to { opacity: 0; transform: translateX(100%); }
.eq-slide-enter-to,
.eq-slide-leave-from { opacity: 1; transform: translateX(0); }
</style>
