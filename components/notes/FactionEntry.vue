<template>
  <div class="entry" @click="$emit('open')">

    <div class="media">
      <img v-if="attrs.imageSource" :src="imageSrc(attrs.imageSource) ?? undefined" class="logo" />
      <div v-else class="icon-wrap">
        <OhVueIcon name="gi-american-shield" scale="0.9" style="color: #e05555" />
      </div>
    </div>

    <div class="body">
      <div class="name-row">
        <span class="name">{{ entry.name }}</span>
        <span v-if="attrs.isSecret" class="secret-badge">secret</span>
      </div>
      <div v-if="hasMeta" class="meta">
        <span v-if="attrs.factionType" class="type-badge">{{ attrs.factionType }}</span>
        <span v-if="attrs.size" class="dim">{{ attrs.size }}</span>
        <span v-if="attrs.headquartersName" class="dim sep">@ {{ attrs.headquartersName }}</span>
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
import type { FactionAttributes } from '~/types/entities'

const props = defineProps<{ entry: Entity; deletable?: boolean }>()
defineEmits<{ open: []; delete: [id: number] }>()
const attrs = computed(() => (props.entry.attributes ?? {}) as FactionAttributes)
const hasMeta = computed(() => !!(attrs.value.factionType || attrs.value.size || attrs.value.headquartersName))
</script>


<style scoped>
.media {
  flex-shrink: 0;
  width: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo {
  width: 36px; height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid rgba(224, 85, 85, 0.35);
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

.icon-wrap {
  width: 34px; height: 34px;
  border-radius: 50%;
  background: rgba(224, 85, 85, 0.08);
  border: 1.5px solid rgba(224, 85, 85, 0.25);
  display: flex; align-items: center; justify-content: center;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}

.name-row {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}

.name {
  font-family: var(--font-body);
  font-size: 15px;
  color: var(--ink);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.secret-badge {
  font-family: var(--font-head);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 2px;
  border: 1px solid rgba(184, 134, 11, 0.5);
  color: var(--gold);
  opacity: 0.75;
  flex-shrink: 0;
}

.meta {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
}

.type-badge {
  font-family: var(--font-head);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 2px;
  border: 1px solid rgba(224, 85, 85, 0.4);
  color: #e05555;
  flex-shrink: 0;
}

.dim {
  font-family: var(--font-head);
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--ink-ghost);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
}

.sep { flex-shrink: 2; }
</style>
