<template>
  <div class="wnote-body">
    <div v-if="tags.length" class="wnote-tags">
      <span v-for="t in tags" :key="t" class="wnote-tag">{{ t }}</span>
    </div>
    <MarkdownEditor
      :entity-id="entity.id!" :campaign-id="entity.campaignId"
      :content="notes" :show-tab-bar="false" initial-view-mode="mixed"
      class="wnote-editor"
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
const tags = computed<string[]>(() => attrs.value?.tags ?? [])
const notes = computed(() => props.entity.content ?? '')

function saveContent(value: string) {
  store.updateEntity(props.entity.id!, { content: value })
}
</script>

<style scoped>
.wnote-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.wnote-tags { display: flex; flex-wrap: wrap; gap: 5px; padding: 10px 12px 0; flex-shrink: 0; margin-bottom: 4px; }
.wnote-tag {
  font-size: 9.5px; font-family: var(--fm); font-weight: 500;
  padding: 2px 7px; border-radius: 99px;
  background: var(--surface-hi); border: 1px solid var(--border);
  color: var(--text2); text-transform: uppercase; letter-spacing: 0.05em;
}
.wnote-editor { flex: 1; min-height: 0; }
:deep(.markdown-editor .mixed-pane) { padding: 8px 12px 30px; }
.wnote-empty { color: var(--text3); font-style: italic; font-size: 12px; }
</style>
