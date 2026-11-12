<template>
  <div class="entry" @click="$emit('open')">
    <div class="media">
      <div class="icon-wrap">
        <OhVueIcon name="gi-speaker" scale="0.9" style="color: #c86fa8" />
      </div>
    </div>

    <div class="body">
      <span class="name">{{ entry.name }}</span>
      <div v-if="attrs.source" class="meta">
        <span class="source">{{ attrs.source }}</span>
      </div>
    </div>

    <span v-for="s in attrs.statuses ?? []" :key="s" class="status-badge" :style="badgeStyle(s)">{{ s }}</span>

    <div v-if="deletable" class="entry-actions" @click.stop>
      <button class="entry-act entry-act--del" @click.stop="$emit('delete', entry.id)">
        <OhVueIcon name="md-delete" scale="0.75" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Entity } from '~/composables/useEntities'
import type { RumorAttributes } from '~/types/entities'
import { RUMOR_STATUS_COLORS } from '~/types/entities'

const props = defineProps<{ entry: Entity; deletable?: boolean }>()
defineEmits<{ open: []; delete: [id: number] }>()
const attrs = computed(() => (props.entry.attributes ?? {}) as RumorAttributes)

function badgeStyle(s: string) {
  const c = RUMOR_STATUS_COLORS[s] ?? 'var(--text3)'
  return {
    color: c,
    borderColor: `color-mix(in oklch, ${c} 40%, transparent)`,
    background:  `color-mix(in oklch, ${c} 10%, transparent)`,
  }
}
</script>

<style scoped>
.media { flex-shrink: 0; width: 42px; display: flex; align-items: center; justify-content: center; }
.icon-wrap {
  width: 34px; height: 34px; border-radius: 50%;
  background: rgba(200, 111, 168, 0.08);
  border: 1.5px solid rgba(200, 111, 168, 0.25);
  display: flex; align-items: center; justify-content: center;
}
.body { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
.name { font-family: var(--font-body); font-size: 15px; color: var(--ink); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { display: flex; align-items: center; gap: 4px; }
.source { font-size: 11px; color: var(--text3); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-badge {
  font-size: 9px; font-weight: 600; font-family: var(--fm); text-transform: uppercase;
  letter-spacing: 0.08em; padding: 1px 6px; border-radius: 3px;
  border: 1px solid; flex-shrink: 0;
}
</style>
