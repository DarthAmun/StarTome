<template>
  <div class="wq-body">
    <div class="wq-meta">
      <span v-if="status" :class="['wq-status', status]">
        <span class="wq-dot" />{{ status }}
      </span>
      <span v-if="giver" class="wq-tag">from {{ giver }}</span>
    </div>
    <MarkdownEditor
      :entity-id="entity.id!" :campaign-id="entity.campaignId"
      :content="notes" :show-tab-bar="false" initial-view-mode="mixed"
      class="wq-editor"
      @update:content="saveContent"
    />
  </div>
</template>

<script setup lang="ts">
import type { Entity } from '~/composables/useEntities'
import { useEntities } from '~/composables/useEntities'

const props = defineProps<{ entity: Entity }>()
const store = useEntities()
const attrs = computed(() => props.entity.attributes as any)
const status = computed(() => attrs.value?.status ?? null)
const giver = computed(() => attrs.value?.questGiver ?? null)
const notes = computed(() => props.entity.content ?? '')

function saveContent(value: string) {
  store.updateEntity(props.entity.id!, { content: value })
}
</script>

<style scoped>
.wq-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.wq-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 10px 12px 0; flex-shrink: 0; margin-bottom: 4px; }
.wq-status {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 9.5px; font-family: var(--fm); font-weight: 600;
  padding: 2px 8px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.06em;
}
.wq-status.active { color: oklch(80% 0.16 75); background: oklch(80% 0.16 75/0.10); border: 1px solid oklch(80% 0.16 75/0.35); }
.wq-status.completed { color: var(--success); background: color-mix(in oklch, var(--success) 10%, transparent); border: 1px solid color-mix(in oklch, var(--success) 30%, transparent); }
.wq-status.failed { color: var(--danger); background: var(--danger-bg); border: 1px solid color-mix(in oklch, var(--danger) 30%, transparent); }
.wq-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; box-shadow: 0 0 5px currentColor; }
.wq-tag {
  font-size: 9.5px; font-family: var(--fm); font-weight: 500;
  padding: 2px 7px; border-radius: 99px;
  background: var(--surface-hi); border: 1px solid var(--border);
  color: var(--text2); text-transform: uppercase; letter-spacing: 0.05em;
}
.wq-editor { flex: 1; min-height: 0; }
:deep(.markdown-editor .mixed-pane) { padding: 8px 12px 30px; }
.wq-empty { color: var(--text3); font-style: italic; font-size: 12px; }
</style>
