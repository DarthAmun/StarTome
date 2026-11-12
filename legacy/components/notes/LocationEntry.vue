<template>
  <div class="entry" @click="$emit('open')">

    <div class="media">
      <img v-if="imgSrc" :src="imgSrc" class="banner" />
      <div v-else class="icon-wrap">
        <OhVueIcon name="gi-castle" scale="0.9" style="color: #a87de8" />
      </div>
    </div>

    <div class="body">
      <span class="name">{{ entry.name }}</span>
      <div v-if="hasMeta" class="meta">
        <span v-if="attrs.locationType" class="type-badge">{{ attrs.locationType }}</span>
        <span v-if="attrs.status" class="status-badge"
          :class="attrs.status === 'undiscovered' ? 'status--undiscovered'
                : attrs.status === 'destroyed'    ? 'status--destroyed' : 'status--discovered'">
          {{ attrs.status }}
        </span>
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
import { imageSrc } from '~/rules/images'
import type { Entity } from '~/composables/useEntities'
import type { LocationAttributes } from '~/types/entities'

const props = defineProps<{ entry: Entity; deletable?: boolean }>()
defineEmits<{ open: []; delete: [id: number] }>()
const attrs = computed(() => (props.entry.attributes ?? {}) as LocationAttributes)
const imgSrc = computed(() => imageSrc(attrs.value.logoSource || attrs.value.imageSource))
const hasMeta = computed(() => !!(attrs.value.locationType || attrs.value.status))
</script>


<style scoped>
.media {
  flex-shrink: 0;
  width: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.banner {
  width: 60px; height: 36px;
  border-radius: 3px;
  object-fit: cover;
  border: 1.5px solid rgba(168, 125, 232, 0.3);
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

.icon-wrap {
  width: 42px; height: 36px;
  border-radius: 3px;
  background: rgba(168, 125, 232, 0.1);
  border: 1.5px solid rgba(168, 125, 232, 0.25);
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
  gap: 5px;
}

.type-badge {
  font-family: var(--font-head);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(168, 125, 232, 0.9);
  padding: 1px 5px;
  border-radius: 2px;
  border: 1px solid rgba(168, 125, 232, 0.35);
  flex-shrink: 0;
}

.status-badge {
  font-family: var(--font-head);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 2px;
  border: 1px solid currentColor;
  flex-shrink: 0;
}
.status--discovered   { color: #7cc44e; }
.status--undiscovered { color: var(--ink-ghost); }
.status--destroyed    { color: var(--blood); }
</style>
