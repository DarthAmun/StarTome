<template>
  <div class="entry" @click="$emit('open')">
    <div class="media">
      <div class="icon-wrap">
        <OhVueIcon name="gi-dice-six-faces-six" scale="0.9" style="color: #e8c44a" />
      </div>
    </div>

    <div class="body">
      <span class="name">{{ entry.name }}</span>
      <div class="meta">
        <span v-if="attrs.die" class="tag">{{ attrs.die }}</span>
        <span v-if="rowCount" class="tag tag--dim">{{ rowCount }} row{{ rowCount !== 1 ? 's' : '' }}</span>
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
import type { RandomTableAttributes } from '~/types/entities'

const props = defineProps<{ entry: Entity; deletable?: boolean }>()
defineEmits<{ open: []; delete: [id: number] }>()
const attrs = computed(() => (props.entry.attributes ?? {}) as RandomTableAttributes)
const rowCount = computed(() => attrs.value.rows?.length ?? 0)
</script>

<style scoped>
.media { flex-shrink: 0; width: 42px; display: flex; align-items: center; justify-content: center; }
.icon-wrap {
  width: 34px; height: 34px; border-radius: 50%;
  background: rgba(232, 196, 74, 0.08);
  border: 1.5px solid rgba(232, 196, 74, 0.25);
  display: flex; align-items: center; justify-content: center;
}
.body { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
.name { font-family: var(--font-body); font-size: 15px; color: var(--ink); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; overflow: hidden; }
.tag {
  font-family: var(--font-head); font-size: 8px; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase;
  padding: 1px 5px; border-radius: 2px;
  background: rgba(232, 196, 74, 0.1);
  border: 1px solid rgba(232, 196, 74, 0.3);
  color: #e8c44a; white-space: nowrap; flex-shrink: 0;
}
.tag--dim { background: rgba(128, 128, 128, 0.08); border-color: rgba(128, 128, 128, 0.2); color: var(--text3); }
</style>
