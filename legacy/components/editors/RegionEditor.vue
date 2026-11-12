<template>
  <div class="rge-root">
    <EditorHeader v-if="entity" :entity="entity" @delete="onDelete" @rename="onRename">
      <template #actions>
        <button class="hdr-btn" :class="{ active: showAttributes }" @click="showAttributes = !showAttributes">
          <OhVueIcon name="md-editnote" scale="0.8" />
          <span>Details</span>
        </button>
      </template>
    </EditorHeader>

    <div v-if="showAttributes && entity" class="rge-attrs">
      <!-- Polygon mini-preview -->
      <div class="rge-preview-row">
        <span class="rge-label">Shape</span>
        <div class="rge-preview-box">
          <svg v-if="polygonPoints.length >= 3" :viewBox="svgViewBox" width="260" height="160" class="rge-svg">
            <polygon :points="svgPoints" :fill="attrs.color + '55'" :stroke="attrs.color" stroke-width="2" stroke-linejoin="round" />
            <circle
              v-for="(pt, i) in normalizedPoints"
              :key="i"
              :cx="pt.x" :cy="pt.y" r="4"
              :fill="attrs.color"
              opacity="0.8"
            />
          </svg>
          <span v-else class="rge-preview-empty">No polygon drawn yet — use the World Map to draw one</span>
        </div>
        <div class="rge-vertex-count" v-if="polygonPoints.length">{{ polygonPoints.length }} vertices</div>
      </div>

      <!-- Color picker -->
      <div class="rge-row">
        <span class="rge-label">Color</span>
        <div class="rge-color-row">
          <input
            type="color"
            class="rge-color-input"
            :value="attrs.color ?? '#5fc98a'"
            @input="setColor(($event.target as HTMLInputElement).value)"
          />
          <div class="rge-color-swatches">
            <button
              v-for="c in REGION_COLORS"
              :key="c"
              class="rge-swatch"
              :style="{ background: c, outline: attrs.color === c ? `2px solid ${c}` : 'none' }"
              @click="setColor(c)"
            />
          </div>
        </div>
      </div>

      <!-- Parent map -->
      <div class="rge-row">
        <span class="rge-label">Map</span>
        <span class="rge-value">{{ parentName ?? 'World Map' }}</span>
      </div>
    </div>

    <MarkdownEditor
      v-if="entity"
      :entity-id="props.entityId"
      :campaign-id="props.campaignId"
      :content="draftContent"
      show-tab-bar
      @update:content="onContentUpdate"
      @navigate="(t, n) => $emit('navigate', t, n)"
    />
  </div>
</template>

<script setup lang="ts">
import { useEntities } from '~/composables/useEntities'
import type { RegionAttributes } from '~/types/entities'
import { REGION_COLORS, normalizePolygon } from '~/types/entities'

const props = defineProps<{ entityId: number; campaignId: number }>()
const emit = defineEmits<{ navigate: [type: string, name: string]; deleted: [] }>()

const store = useEntities()
const showAttributes = ref(true)
const draftContent = ref('')

const entity = computed(() => store.entities.find(e => e.id === props.entityId) ?? store.currentEntity)
const attrs = computed(() => (entity.value?.attributes ?? {}) as RegionAttributes)
const polygonPoints = computed(() => attrs.value.polygon ?? [])

const parentName = computed(() => {
  const pid = attrs.value.locationEntityId
  if (!pid) return null
  return store.entities.find(e => e.id === pid)?.name ?? null
})

const SVG_W = 260
const SVG_H = 160

const normalizedPoints = computed(() => normalizePolygon(polygonPoints.value, SVG_W, SVG_H))
const svgPoints = computed(() => normalizedPoints.value.map(p => `${p.x},${p.y}`).join(' '))
const svgViewBox = `0 0 ${SVG_W} ${SVG_H}`

watch(() => props.entityId, async (id) => {
  await store.loadEntity(id)
  draftContent.value = entity.value?.content ?? ''
}, { immediate: true })

function onContentUpdate(value: string) {
  store.updateEntity(props.entityId, { content: value })
}

function setColor(color: string) {
  store.updateEntity(props.entityId, { attributes: { ...attrs.value, color } })
}

function onRename(name: string) {
  store.updateEntity(props.entityId, { name })
}

async function onDelete() {
  await store.deleteEntity(props.entityId)
  emit('deleted')
}
</script>

<style scoped>
.rge-root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.rge-attrs {
  flex-shrink: 0;
  padding: 10px 16px 12px;
  border-bottom: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 10px;
}

.rge-preview-row {
  display: flex; flex-direction: column; gap: 6px;
}

.rge-preview-box {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--r2); overflow: hidden;
  height: 160px; display: flex; align-items: center; justify-content: center;
}

.rge-svg { width: 100%; height: 100%; }

.rge-preview-empty {
  font-size: 11px; color: var(--text3); font-style: italic; text-align: center; padding: 12px;
}

.rge-vertex-count {
  font-size: 10px; color: var(--text3); font-family: var(--fm); letter-spacing: 0.06em;
}

.rge-row { display: flex; align-items: center; gap: 10px; }

.rge-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text3); font-family: var(--fm); flex-shrink: 0; width: 52px;
}

.rge-value { font-size: 13px; color: var(--text2); }

.rge-color-row { display: flex; align-items: center; gap: 10px; }

.rge-color-input {
  width: 32px; height: 32px; border-radius: 6px; border: 1px solid var(--border);
  cursor: pointer; padding: 2px; background: none;
}

.rge-color-swatches { display: flex; gap: 6px; flex-wrap: wrap; }

.rge-swatch {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer; transition: transform 0.1s, outline-offset 0.1s;
  outline-offset: 2px;
}
.rge-swatch:hover { transform: scale(1.15); }
</style>
