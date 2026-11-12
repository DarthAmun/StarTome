<template>
  <div class="rue-root">
    <EditorHeader v-if="entity" :entity="entity" @delete="onDelete" @rename="onRename">
      <template #actions>
        <button class="hdr-btn" :class="{ active: showAttributes }" @click="showAttributes = !showAttributes">
          <OhVueIcon name="md-editnote" scale="0.8" />
          <span>Details</span>
        </button>
      </template>
    </EditorHeader>

    <div v-if="showAttributes && entity" class="rue-attrs">
      <div class="rue-row">
        <span class="rue-label">Status</span>
        <div class="rue-status-btns">
          <button
            v-for="s in STATUSES"
            :key="s.value"
            :class="['rue-status-btn', { active: hasStatus(s.value) }]"
            :style="hasStatus(s.value) ? { '--sc': s.color } : {}"
            @click="toggleStatus(s.value)"
          >{{ s.label }}</button>
        </div>
      </div>
      <div class="rue-row">
        <span class="rue-label">Source</span>
        <input class="rue-text-input" type="text" :value="attrs.source ?? ''" placeholder="Who told the players this?" @input="setSource(($event.target as HTMLInputElement).value)" />
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
    >
      <template #below-content>
        <LinkBar
          :entity-id="props.entityId"
          :campaign-id="props.campaignId"
          entity-type="rumor"
          @navigate="(t, n) => $emit('navigate', t, n)"
        />
      </template>
    </MarkdownEditor>
  </div>
</template>

<script setup lang="ts">
import { useEntities } from '~/composables/useEntities'
import type { RumorAttributes } from '~/types/entities'
import { RUMOR_STATUS_COLORS } from '~/types/entities'

const props = defineProps<{ entityId: number; campaignId: number }>()
const emit = defineEmits<{ navigate: [type: string, name: string]; deleted: [] }>()

const store = useEntities()
const entity = computed(() => store.entities.find(e => e.id === props.entityId) ?? store.currentEntity)
const attrs = computed(() => (entity.value?.attributes ?? {}) as RumorAttributes)

const STATUSES = [
  { value: 'unheard',  label: 'Unheard'  },
  { value: 'heard',    label: 'Heard'    },
  { value: 'revealed', label: 'Revealed' },
  { value: 'false',    label: 'False'    },
].map(s => ({ ...s, color: RUMOR_STATUS_COLORS[s.value] ?? 'var(--text3)' }))

const showAttributes = ref(true)
const draftContent = ref('')

watch(() => props.entityId, async (id) => {
  await store.loadEntity(id)
  draftContent.value = entity.value?.content ?? ''
}, { immediate: true })

function hasStatus(s: string): boolean {
  return (attrs.value.statuses ?? []).includes(s)
}

function toggleStatus(s: string) {
  const current = attrs.value.statuses ?? []
  const next = current.includes(s) ? current.filter(x => x !== s) : [...current, s]
  store.updateEntity(props.entityId, { attributes: { ...attrs.value, statuses: next.length ? next : undefined } })
}

function setSource(s: string) {
  store.updateEntity(props.entityId, { attributes: { ...attrs.value, source: s || undefined } })
}

function onContentUpdate(value: string) {
  store.updateEntity(props.entityId, { content: value })
}

async function onRename(name: string) {
  await store.updateEntity(props.entityId, { name })
}

async function onDelete() {
  await store.deleteEntity(props.entityId)
  emit('deleted')
}
</script>

<style scoped>
.rue-root { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }

.rue-attrs {
  flex-shrink: 0;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rue-row { display: flex; align-items: center; gap: 10px; }
.rue-label { font-size: 11px; font-weight: 600; color: var(--text3); font-family: var(--fm); text-transform: uppercase; letter-spacing: 0.06em; width: 52px; flex-shrink: 0; }

.rue-status-btns { display: flex; gap: 4px; }
.rue-status-btn {
  padding: 3px 10px; border-radius: 5px; font-size: 11px; font-weight: 600;
  border: 1px solid var(--border); background: var(--bg); color: var(--text2);
  cursor: pointer; transition: all 0.1s;
}
.rue-status-btn:hover { border-color: var(--border-hi); color: var(--text); }
.rue-status-btn.active {
  background: color-mix(in oklch, var(--sc, var(--accent)) 12%, transparent);
  border-color: color-mix(in oklch, var(--sc, var(--accent)) 40%, transparent);
  color: var(--sc, var(--accent-l));
}

.rue-text-input {
  flex: 1; padding: 4px 8px; border-radius: 5px;
  background: var(--bg); border: 1px solid var(--border);
  font-size: 12.5px; color: var(--text);
}
.rue-text-input:focus { outline: none; border-color: var(--border-hi); }
.rue-text-input::placeholder { color: var(--text3); }
</style>
