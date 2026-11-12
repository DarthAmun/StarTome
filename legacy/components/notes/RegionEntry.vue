<template>
  <div class="entry" @click="$emit('open')">
    <div class="media">
      <div class="icon-wrap" :style="{ borderColor: swatch + '55', background: swatch + '18' }">
        <div class="color-swatch" :style="{ background: swatch }" />
      </div>
    </div>

    <div class="body">
      <span class="name">{{ entry.name }}</span>
      <div v-if="parentName" class="meta">
        <OhVueIcon name="gi-castle" scale="0.7" style="color:var(--ink-ghost)" />
        <span class="parent">{{ parentName }}</span>
      </div>
      <div v-else class="meta">
        <span class="parent" style="color:var(--ink-ghost)">World Map</span>
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
import type { RegionAttributes } from '~/types/entities'
import { useEntities } from '~/composables/useEntities'

const props = defineProps<{ entry: Entity; deletable?: boolean }>()
defineEmits<{ open: []; delete: [id: number] }>()

const store = useEntities()
const attrs = computed(() => (props.entry.attributes ?? {}) as RegionAttributes)
const swatch = computed(() => attrs.value.color ?? '#5fc98a')
const parentName = computed(() => {
  const pid = attrs.value.locationEntityId
  if (!pid) return null
  return store.entities.find(e => e.id === pid)?.name ?? null
})
</script>

<style scoped>
.media { flex-shrink: 0; width: 42px; display: flex; align-items: center; justify-content: center; }
.icon-wrap {
  width: 34px; height: 34px; border-radius: 50%;
  border: 1.5px solid;
  display: flex; align-items: center; justify-content: center;
}
.color-swatch {
  width: 18px; height: 18px; border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}
.body { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
.name { font-family: var(--font-body); font-size: 15px; color: var(--ink); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { display: flex; align-items: center; gap: 4px; }
.parent { font-size: 11px; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
