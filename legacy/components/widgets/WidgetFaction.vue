<template>
  <div class="wf-body">
    <div v-if="bannerSrc" class="wf-banner">
      <img :src="bannerSrc" :alt="entity.name" class="wf-banner-img" />
      <div class="wf-banner-name">{{ entity.name }}</div>
    </div>
    <div v-if="fields.length" class="wf-fields">
      <div v-for="f in fields" :key="f.label" class="wf-field">
        <div class="wf-field-label">{{ f.label }}</div>
        <div class="wf-field-val">{{ f.value }}</div>
      </div>
    </div>
    <MarkdownEditor
      :entity-id="entity.id!" :campaign-id="entity.campaignId"
      :content="notes" :show-tab-bar="false" initial-view-mode="mixed"
      class="wf-editor"
      @update:content="saveContent"
    />
  </div>
</template>

<script setup lang="ts">
import { imageSrc } from '~/rules/images'
import type { Entity } from '~/composables/useEntities'
import { useEntities } from '~/composables/useEntities'

const props = defineProps<{ entity: Entity }>()
const store = useEntities()

const attrs = computed(() => props.entity.attributes as any)
const bannerSrc = computed(() => imageSrc(attrs.value?.imageSource, 'thumb'))
const notes = computed(() => props.entity.content ?? '')

function saveContent(value: string) {
  store.updateEntity(props.entity.id!, { content: value })
}
const fields = computed(() => {
  const a = attrs.value ?? {}
  const result: { label: string; value: string }[] = []
  if (a.type || a.factionType) result.push({ label: 'Type', value: a.type ?? a.factionType })
  if (a.alignment) result.push({ label: 'Alignment', value: a.alignment })
  if (a.status) result.push({ label: 'Status', value: a.status })
  return result
})
</script>

<style scoped>
.wf-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }

.wf-banner { position: relative; flex-shrink: 0; height: 72px; overflow: hidden; }
.wf-banner-img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
.wf-banner-name {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding: 16px 10px 6px;
  background: linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%);
  font-size: 13px; font-weight: 700; color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
  line-height: 1.2;
}

.wf-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 5px; padding: 10px 12px 0; flex-shrink: 0; margin-bottom: 4px; }
.wf-field { background: var(--surface); border: 1px solid var(--border); border-radius: 7px; padding: 6px 9px; }
.wf-field-label { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text3); margin-bottom: 2px; font-family: var(--fm); }
.wf-field-val { font-size: 12px; color: var(--text); font-weight: 500; }
.wf-editor { flex: 1; min-height: 0; }
:deep(.markdown-editor .mixed-pane) { padding: 8px 12px 30px; }
.wf-empty { color: var(--text3); font-style: italic; font-size: 12px; }
</style>
