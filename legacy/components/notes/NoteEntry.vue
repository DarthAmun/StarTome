<template>
  <div class="entry" @click="$emit('open')">

    <div class="media">
      <div class="icon-wrap">
        <OhVueIcon :name="icon" scale="0.9" style="color: #6b9fe8" />
      </div>
    </div>

    <div class="body">
      <span class="name">{{ entry.name }}</span>
      <div v-if="attrs.tags?.length" class="meta">
        <span v-for="tag in (attrs.tags as string[]).slice(0, 4)" :key="tag" class="tag">{{ tag }}</span>
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
import type { NoteAttributes } from '~/types/entities'

const props = defineProps<{ entry: Entity; deletable?: boolean }>()
defineEmits<{ open: []; delete: [id: number] }>()
const attrs = computed(() => (props.entry.attributes ?? {}) as NoteAttributes)
const icon = computed(() => attrs.value.icon ?? 'gi-scroll-unfurled')
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
  background: rgba(107, 159, 232, 0.08);
  border: 1.5px solid rgba(107, 159, 232, 0.25);
  display: flex; align-items: center; justify-content: center;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
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
  gap: 4px;
  flex-wrap: nowrap;
  overflow: hidden;
}

.tag {
  font-family: var(--font-head);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 2px;
  background: rgba(107, 159, 232, 0.1);
  border: 1px solid rgba(107, 159, 232, 0.3);
  color: #6b9fe8;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
