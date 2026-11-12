<template>
  <div class="wru-body">
    <div class="wru-header">
      <span class="wru-title">{{ entity.name }}</span>
      <span v-for="s in attrs.statuses ?? []" :key="s" class="wru-status" :style="statusStyle(s)">{{ s }}</span>
    </div>
    <div v-if="attrs.source" class="wru-source">from {{ attrs.source }}</div>
    <div v-if="entity.content" class="wru-content" v-html="renderedContent" />
    <div v-else class="wru-empty">No content.</div>
  </div>
</template>

<script setup lang="ts">
import type { Entity } from '~/composables/useEntities'
import type { RumorAttributes } from '~/types/entities'
import { RUMOR_STATUS_COLORS } from '~/types/entities'
import { useEntityMarkdown } from '~/composables/useEntityMarkdown'

const props = defineProps<{ entity: Entity }>()

const attrs = computed(() => (props.entity.attributes ?? {}) as RumorAttributes)

function statusStyle(s: string) {
  const c = RUMOR_STATUS_COLORS[s] ?? 'var(--text3)'
  return {
    color: c,
    borderColor: `color-mix(in oklch, ${c} 40%, transparent)`,
    background:  `color-mix(in oklch, ${c} 10%, transparent)`,
  }
}

const { renderMarkdown } = useEntityMarkdown()
const renderedContent = computed(() =>
  renderMarkdown(props.entity.content ?? '', { rich: false })
)
</script>

<style scoped>
.wru-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding: 8px 10px; gap: 6px; }

.wru-header { display: flex; align-items: center; gap: 6px; }
.wru-title { flex: 1; font-size: 12px; font-weight: 700; color: var(--text); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wru-status { font-size: 9px; font-weight: 600; font-family: var(--fm); text-transform: uppercase; letter-spacing: 0.08em; padding: 1px 6px; border-radius: 3px; border: 1px solid; flex-shrink: 0; }

.wru-source { font-size: 10.5px; color: var(--text3); font-style: italic; }

.wru-content { font-size: 11.5px; color: var(--text2); line-height: 1.6; overflow-y: auto; flex: 1; min-height: 0; }
.wru-content :deep(p) { margin: 0 0 0.4em; }
.wru-content :deep(strong) { color: var(--text); }

.wru-empty { font-size: 11px; color: var(--text3); font-style: italic; }
</style>
