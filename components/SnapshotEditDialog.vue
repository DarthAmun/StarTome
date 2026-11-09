<template>
  <AppDialog v-if="open && snapshot" class="snap-dialog" title="Edit Historical State" @close="close">

        <div class="pv-dialog-content">
          <div style="margin-bottom:16px">
            <label class="f-label">Label *</label>
            <input
              ref="labelInput"
              v-model="draftLabel"
              class="f-input-box"
              @keyup.enter="save"
            />
          </div>
          <div style="margin-bottom:16px">
            <label class="f-label">Note <span class="f-optional">optional</span></label>
            <textarea
              v-model="draftNote"
              class="f-input-box"
              rows="2"
              style="resize:vertical"
            />
          </div>
          <div v-if="availableEvents.length > 0">
            <label class="f-label">Linked Event <span class="f-optional">optional</span></label>
            <select v-model="draftEventId" class="f-input-box">
              <option :value="null">— none —</option>
              <option
                v-for="ev in availableEvents"
                :key="ev.id"
                :value="ev.id"
              >{{ ev.name }}</option>
            </select>
          </div>
        </div>

        <div class="pv-dialog-footer">
          <button class="ghost-btn ghost-btn--danger" @click="confirmDelete">
            <OhVueIcon name="md-delete" scale="0.8" />
            Delete
          </button>
          <div style="flex:1" />
          <button class="ghost-btn" @click="close">Cancel</button>
          <button
            class="seal-btn"
            :disabled="!draftLabel.trim()"
            @click="save"
          >
            Save
          </button>
        </div>
    </AppDialog>
</template>

<script setup lang="ts">
import { useEntities } from '~/composables/useEntities'
import type { EntitySnapshot } from '~/composables/useEntities'

const props = defineProps<{
  open: boolean
  snapshot: EntitySnapshot | null
  campaignId: number
}>()

const emit = defineEmits<{
  close: []
  deleted: [id: number]
  saved: []
}>()

const store = useEntities()

const draftLabel = ref('')
const draftNote = ref('')
const draftEventId = ref<number | null>(null)
const labelInput = ref<HTMLInputElement | null>(null)

const availableEvents = computed(() =>
  (store.byType['event'] ?? [])
    .filter(e => e.campaignId === props.campaignId)
    .sort((a, b) => a.name.localeCompare(b.name))
)

watch(() => props.snapshot, (snap) => {
  if (snap) {
    draftLabel.value = snap.label
    draftNote.value = snap.note
    draftEventId.value = snap.eventId
    nextTick(() => labelInput.value?.focus())
  }
})

async function save() {
  if (!props.snapshot || !draftLabel.value.trim()) return
  const selectedEvent = draftEventId.value
    ? availableEvents.value.find(e => e.id === draftEventId.value)
    : null
  await store.updateSnapshot(props.snapshot.id, {
    label: draftLabel.value.trim(),
    note: draftNote.value.trim(),
    eventId: selectedEvent?.id ?? null,
    eventName: selectedEvent?.name ?? null,
  })
  emit('saved')
  close()
}

async function confirmDelete() {
  if (!props.snapshot) return
  if (!confirm(`Delete the snapshot "${props.snapshot.label}"? This cannot be undone.`)) return
  const id = props.snapshot.id
  await store.deleteSnapshot(id)
  emit('deleted', id)
  close()
}

function close() { emit('close') }
</script>

<style scoped>
.snap-dialog { width: 480px; max-width: 94vw; }
.f-optional {
  font-family: var(--font-ui); font-size: 9px; color: var(--ink-ghost);
  font-weight: 400; margin-left: 4px; text-transform: lowercase; letter-spacing: 0;
}
.ghost-btn--danger { color: var(--blood); border-color: var(--blood); }
.ghost-btn--danger:hover { background: rgba(139,26,26,0.08); }
</style>
