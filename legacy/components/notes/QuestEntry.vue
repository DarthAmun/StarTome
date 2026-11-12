<template>
  <div class="entry" @click="$emit('open')">

    <div class="media">
      <div class="icon-wrap" :style="{ background: statusColor + '18', borderColor: statusColor + '55' }">
        <OhVueIcon name="gi-holy-grail" scale="0.9" :style="{ color: statusColor }" />
      </div>
    </div>

    <div class="body">
      <span class="name">{{ entry.name }}</span>
      <div v-if="hasMeta" class="meta">
        <span v-if="attrs.status" class="status-badge" :style="{ color: statusColor, borderColor: statusColor + '66' }">
          {{ attrs.status }}
        </span>
        <span v-if="attrs.questGiver" class="giver">{{ attrs.questGiver }}</span>
      </div>
    </div>

    <div v-if="deletable" class="entry-actions" @click.stop>
      <button class="entry-act entry-act--del" @click.stop="$emit('delete', entry.id)">
        <OhVueIcon name="md-delete" scale="0.75" />
      </button>
    </div>
  </div>
</template>


<script setup lang="ts">
import type { Entity } from '~/composables/useEntities'
import type { QuestAttributes } from '~/types/entities'
import { QUEST_STATUS_COLORS } from '~/types/entities'

const props = defineProps<{ entry: Entity; deletable?: boolean }>()
defineEmits<{ open: []; delete: [id: number] }>()
const attrs = computed(() => (props.entry.attributes ?? {}) as QuestAttributes)

const statusColor = computed(() => QUEST_STATUS_COLORS[attrs.value.status ?? ''] ?? '#e8924a')

const hasMeta = computed(() => !!(attrs.value.status || attrs.value.questGiver))
</script>


<style scoped>
.media {
  flex-shrink: 0;
  width: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-wrap {
  width: 34px; height: 34px;
  border-radius: 50%;
  border: 1.5px solid;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.2s;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}

.name {
  font-family: var(--font-body);
  font-size: 15px;
  color: var(--ink);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.status-badge {
  font-family: var(--font-head);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 2px;
  border: 1px solid;
  flex-shrink: 0;
}

.giver {
  font-family: var(--font-body);
  font-size: 12px;
  font-style: italic;
  color: var(--ink-ghost);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
}
</style>
