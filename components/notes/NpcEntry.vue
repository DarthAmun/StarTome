<template>
  <div class="entry" @click="$emit('open')">

    <div class="media">
      <img v-if="attrs.portraitSource" :src="attrs.portraitSource" class="portrait" />
      <div v-else class="icon-wrap">
        <OhVueIcon name="gi-person" scale="0.9" style="color: #7cc44e" />
      </div>
    </div>

    <div class="body">
      <div class="name-row">
        <span class="name" :class="{ dead: attrs.isAlive === false }">{{ entry.name }}</span>
        <span v-if="attrs.isAlive === false" class="skull">☠</span>
        <span v-if="attrs.level" class="level-badge">Lv&thinsp;{{ attrs.level }}</span>
      </div>
      <div v-if="hasMeta" class="meta">
        <span v-if="attrs.title" class="meta-primary">{{ attrs.title }}</span>
        <span v-if="attrs.title && (attrs.race || classLine)" class="sep">·</span>
        <span v-if="attrs.race" class="meta-dim">{{ attrs.race }}</span>
        <span v-if="attrs.race && classLine" class="sep">·</span>
        <span v-if="classLine" class="meta-dim">{{ classLine }}</span>
        <span v-if="attrs.status" class="status-badge"
          :class="attrs.status?.toLowerCase() === 'hostile' ? 'status-badge--hostile'
                : attrs.status?.toLowerCase() === 'friendly' ? 'status-badge--friendly' : ''">
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
import type { Entity } from '~/composables/useEntities'
import { npcClassLine, type NpcAttributes } from '~/types/entities'

const props = defineProps<{ entry: Entity; deletable?: boolean }>()
defineEmits<{ open: []; delete: [id: number] }>()
const attrs = computed(() => (props.entry.attributes ?? {}) as NpcAttributes)
const classLine = computed(() => npcClassLine(attrs.value))
const hasMeta = computed(() => {
  const a = attrs.value
  return !!(a.title || a.race || classLine.value || a.status)
})
</script>


<style scoped>
.media {
  flex-shrink: 0;
  width: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.portrait {
  width: 36px; height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid rgba(124, 196, 78, 0.35);
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

.icon-wrap {
  width: 34px; height: 34px;
  border-radius: 50%;
  background: rgba(124, 196, 78, 0.1);
  border: 1.5px solid rgba(124, 196, 78, 0.25);
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
  gap: 6px;
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

.name.dead {
  text-decoration: line-through;
  opacity: 0.5;
}

.skull {
  font-size: 11px;
  color: var(--blood);
  flex-shrink: 0;
}

.level-badge {
  font-family: var(--font-head);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 2px;
  border: 1px solid rgba(124, 196, 78, 0.5);
  color: #7cc44e;
  flex-shrink: 0;
}

.meta {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}

.meta-primary {
  font-family: var(--font-body);
  font-size: 12px;
  font-style: italic;
  color: var(--ink-faded);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
}

.meta-dim {
  font-family: var(--font-head);
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--ink-ghost);
  white-space: nowrap;
  flex-shrink: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sep {
  color: var(--ink-ghost);
  font-size: 9px;
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
  color: var(--ink-ghost);
  flex-shrink: 0;
  white-space: nowrap;
}
.status-badge--friendly { color: #7cc44e; }
.status-badge--hostile  { color: var(--blood); }
</style>
