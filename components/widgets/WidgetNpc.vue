<template>
  <div class="wn-body">
    <div class="wn-head">
      <div v-if="portraitSrc" class="wn-portrait wn-portrait--img">
        <img :src="portraitSrc" :alt="entity.name" class="wn-portrait-img" />
      </div>
      <div v-else class="wn-portrait" :style="{ background: avatarGrad }">{{ initials }}</div>
      <div class="wn-info">
        <div class="wn-name">{{ entity.name }}</div>
        <div class="wn-sub">{{ subLine }}</div>
      </div>
      <span v-if="status" :class="['wn-status', status === 'alive' ? 'alive' : 'deceased']">{{ status }}</span>
    </div>
    <MarkdownEditor
      :entity-id="entity.id!" :campaign-id="entity.campaignId"
      :content="notes" :show-tab-bar="false" initial-view-mode="mixed"
      class="wn-editor"
      @update:content="saveContent"
    />
  </div>
</template>

<script setup lang="ts">
import { imageSrc } from '~/rules/images'
import type { Entity } from '~/composables/useEntities'
import { useEntities } from '~/composables/useEntities'
import { npcClassLine } from '~/types/entities'

const props = defineProps<{ entity: Entity }>()
const store = useEntities()

function nameHue(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h) % 360
}
const avatarGrad = computed(() => {
  const h1 = nameHue(props.entity.name)
  const h2 = (h1 + 45) % 360
  return `linear-gradient(135deg, hsl(${h1},58%,28%) 0%, hsl(${h2},64%,20%) 100%)`
})
const initials = computed(() =>
  props.entity.name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
)
const attrs = computed(() => props.entity.attributes as any)
const portraitSrc = computed(() => imageSrc(attrs.value?.portraitSource || attrs.value?.imageSource, 'thumb'))
const status = computed(() => attrs.value?.status ?? null)
const subLine = computed(() => {
  const parts = [attrs.value?.race, npcClassLine(attrs.value)].filter(Boolean)
  return parts.join(' · ')
})
const notes = computed(() => props.entity.content ?? '')

function saveContent(value: string) {
  store.updateEntity(props.entity.id!, { content: value })
}
</script>

<style scoped>
.wn-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.wn-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px 0; flex-shrink: 0; margin-bottom: 4px; }
.wn-portrait {
  width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.92);
  box-shadow: var(--sh); overflow: hidden;
}
.wn-portrait--img { background: var(--surface); }
.wn-portrait-img { width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
.wn-info { flex: 1; min-width: 0; }
.wn-name { font-size: 13.5px; font-weight: 600; color: var(--text); line-height: 1.2; margin-bottom: 2px; }
.wn-sub { font-size: 10.5px; color: var(--text3); font-family: var(--fm); }
.wn-status {
  font-size: 9.5px; font-family: var(--fm); font-weight: 600;
  padding: 2px 7px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.06em; flex-shrink: 0;
}
.wn-status.alive { color: var(--success); background: color-mix(in oklch, var(--success) 10%, transparent); border: 1px solid color-mix(in oklch, var(--success) 30%, transparent); }
.wn-status.deceased { color: var(--text3); background: var(--surface); border: 1px solid var(--border); text-decoration: line-through; }
.wn-editor { flex: 1; min-height: 0; }
:deep(.markdown-editor .mixed-pane) { padding: 8px 12px 30px; }
</style>
