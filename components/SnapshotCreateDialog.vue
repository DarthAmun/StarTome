<template>
  <AppDialog v-if="open" class="snap-dialog" title="Record Historical State" @close="close">

        <div class="pv-dialog-content">

          <!-- Label (required) -->
          <div style="margin-bottom:16px">
            <label class="f-label">Label *</label>
            <input
              ref="labelInput"
              v-model="label"
              class="f-input-box"
              placeholder="Before the ascension…"
              @keyup.enter="submit"
              autofocus
            />
            <p class="f-hint">
              A short name for this moment in history.
            </p>
          </div>

          <!-- Note (optional) -->
          <div style="margin-bottom:16px">
            <label class="f-label">Note <span class="f-optional">optional</span></label>
            <textarea
              v-model="note"
              class="f-input-box"
              rows="2"
              placeholder="What changed, or why this moment matters…"
              style="resize:vertical"
            />
          </div>

          <!-- Link to event (optional) -->
          <div v-if="availableEvents.length > 0">
            <label class="f-label">
              Link to Event <span class="f-optional">optional</span>
            </label>
            <select v-model="selectedEventId" class="f-input-box">
              <option :value="null">— none —</option>
              <option
                v-for="ev in availableEvents"
                :key="ev.id"
                :value="ev.id"
              >{{ ev.name }}</option>
            </select>
            <p class="f-hint">
              Connects this historical state to a campaign event.
            </p>
          </div>

        </div>

        <div class="pv-dialog-footer">
          <button class="ghost-btn" @click="close">Cancel</button>
          <button
            class="seal-btn"
            :disabled="!label.trim()"
            @click="submit"
          >
            Record State
          </button>
        </div>
    </AppDialog>
</template>

<script setup lang="ts">
import { useEntities } from '~/composables/useEntities'

const props = defineProps<{
  open: boolean
  entityId: number
  campaignId: number
}>()

const emit = defineEmits<{
  close: []
  created: [snapshotId: number]
}>()

const store = useEntities()

const label = ref('')
const note = ref('')
const selectedEventId = ref<number | null>(null)
const labelInput = ref<HTMLInputElement | null>(null)

// Load events from this campaign to offer as link options
const availableEvents = computed(() =>
  (store.byType['event'] ?? [])
    .filter(e => e.campaignId === props.campaignId)
    .sort((a, b) => a.name.localeCompare(b.name))
)

watch(() => props.open, (val) => {
  if (val) {
    label.value = ''
    note.value = ''
    selectedEventId.value = null
    nextTick(() => labelInput.value?.focus())
  }
})

async function submit() {
  if (!label.value.trim()) return
  const selectedEvent = selectedEventId.value
    ? availableEvents.value.find(e => e.id === selectedEventId.value)
    : null

  const snap = await store.createSnapshot(
    props.entityId,
    label.value.trim(),
    note.value.trim(),
    selectedEvent?.id ?? null,
    selectedEvent?.name ?? null,
  )
  emit('created', snap.id)
  close()
}

function close() {
  emit('close')
}
</script>

<style scoped>
.snap-dialog { width: 480px; max-width: 94vw; }
.f-hint {
  font-family: var(--font-ui);
  font-size: 10px;
  color: var(--ink-ghost);
  margin-top: 4px;
}
.f-optional {
  font-family: var(--font-ui);
  font-size: 9px;
  color: var(--ink-ghost);
  font-weight: 400;
  margin-left: 4px;
  text-transform: lowercase;
  letter-spacing: 0;
}
</style>
