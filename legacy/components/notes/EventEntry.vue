<template>
  <div class="entry" @click="$emit('open')">

    <div class="media">
      <div class="icon-wrap">
        <div class="sig-dot" :style="{ background: sigColor }" />
        <OhVueIcon name="gi-sands-of-time" scale="0.85" :style="{ color: sigColor }" />
      </div>
    </div>

    <div class="body">
      <span class="name">{{ entry.name }}</span>
      <div v-if="hasMeta" class="meta">
        <span v-if="attrs.significance" class="sig-badge" :style="{ color: sigColor, borderColor: sigColor + '66' }">
          {{ attrs.significance }}
        </span>
        <span v-if="attrs.date" class="ev-date">{{ attrs.date }}</span>
        <span v-if="attrs.location" class="ev-loc">@ {{ attrs.location }}</span>
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
import type { EventAttributes } from '~/types/entities'
import { EVENT_SIGNIFICANCE_COLORS } from '~/types/entities'

const props = defineProps<{ entry: Entity; deletable?: boolean }>()
defineEmits<{ open: []; delete: [id: number] }>()
const attrs = computed(() => (props.entry.attributes ?? {}) as EventAttributes)

const sigColor = computed(() => EVENT_SIGNIFICANCE_COLORS[attrs.value.significance ?? ''] ?? '#4ab8e8')

const hasMeta = computed(() => !!(attrs.value.significance || attrs.value.date || attrs.value.location))
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
  background: rgba(74, 184, 232, 0.08);
  border: 1.5px solid rgba(74, 184, 232, 0.25);
  display: flex; align-items: center; justify-content: center;
  position: relative;
}

.sig-dot {
  position: absolute;
  top: 3px; right: 3px;
  width: 7px; height: 7px;
  border-radius: 50%;
  border: 1.5px solid var(--parch);
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
  gap: 5px;
  overflow: hidden;
}

.sig-badge {
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

.ev-date {
  font-family: 'Cinzel', var(--font-deco);
  font-size: 9px;
  color: var(--ink-faded);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
}

.ev-loc {
  font-family: var(--font-head);
  font-size: 9px;
  color: var(--ink-ghost);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 2;
  font-style: italic;
}
</style>
