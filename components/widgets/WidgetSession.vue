<template>
  <div class="ws-root">
    <div class="ws-tabs">
      <button :class="['ws-tab', { active: tab === 'notes' }]" @click="tab = 'notes'">Session Notes</button>
      <button :class="['ws-tab', { active: tab === 'prep' }]" @click="tab = 'prep'">Prep / Script</button>
    </div>
    <div class="ws-body">
      <div class="ws-meta">
        <span v-if="session.sessionNumber" class="ws-tag">Session {{ session.sessionNumber }}</span>
        <span v-if="session.date" class="ws-tag">{{ session.date }}</span>
        <span v-if="session.mode" :class="['ws-tag', `ws-tag--${session.mode}`]">{{ session.mode }}</span>
      </div>
      <MarkdownEditor v-if="tab === 'notes'"
        :entity-id="entity.id!" :campaign-id="entity.campaignId"
        :content="notesContent" :show-tab-bar="false" initial-view-mode="mixed"
        class="ws-editor"
        @update:content="saveNotes"
      />
      <MarkdownEditor v-else
        :entity-id="entity.id!" :campaign-id="entity.campaignId"
        :content="prepContent" :show-tab-bar="false" initial-view-mode="mixed"
        class="ws-editor"
        @update:content="savePrep"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Entity } from '~/composables/useEntities'
import { useEntities } from '~/composables/useEntities'
import type { SessionAttributes } from '~/types/entities'

const props = defineProps<{ entity: Entity }>()
// Sessions have a mode (planning/running/finished), not a status
const session = computed(() => (props.entity.attributes ?? {}) as SessionAttributes)
const store = useEntities()
const tab = ref<'notes' | 'prep'>('notes')

const notesContent = computed(() => {
  const attrs = props.entity.attributes as any
  return attrs?.notesContent ?? props.entity.content ?? ''
})

const prepContent = computed(() => {
  const attrs = props.entity.attributes as any
  return attrs?.scriptContent ?? ''
})

function saveNotes(value: string) {
  const attrs = props.entity.attributes as any
  store.updateEntity(props.entity.id!, { attributes: { ...attrs, notesContent: value } })
}

function savePrep(value: string) {
  const attrs = props.entity.attributes as any
  store.updateEntity(props.entity.id!, { attributes: { ...attrs, scriptContent: value } })
}
</script>

<style scoped>
.ws-root { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }

.ws-tabs {
  display: flex; flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface-hi);
}
.ws-tab {
  flex: 1; padding: 5px 8px;
  font-size: 10px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--text3); background: transparent; border: none; cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: color 0.12s, border-color 0.12s;
}
.ws-tab:hover { color: var(--text2); }
.ws-tab.active { color: var(--accent-l); border-bottom-color: var(--accent); }

.ws-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }

.ws-meta { display: flex; flex-wrap: wrap; gap: 5px; padding: 10px 12px 0; flex-shrink: 0; }
.ws-editor { flex: 1; min-height: 0; }
:deep(.markdown-editor .mixed-pane) { padding: 8px 12px 30px; }
.ws-tag {
  font-size: 9.5px; font-family: var(--fm); font-weight: 500;
  padding: 2px 7px; border-radius: 99px;
  background: var(--surface-hi); border: 1px solid var(--border);
  color: var(--text2); text-transform: uppercase; letter-spacing: 0.05em;
}
.ws-tag--planning { color: oklch(78% 0.16 75); border-color: oklch(78% 0.16 75/0.35); background: oklch(78% 0.16 75/0.08); }
.ws-tag--finished { color: var(--success); border-color: color-mix(in oklch, var(--success) 30%, transparent); background: color-mix(in oklch, var(--success) 8%, transparent); }
.ws-tag--active,
.ws-tag--running  { color: var(--accent); border-color: var(--accent-bg); background: var(--accent-bg); }

</style>
