<script setup lang="ts">
/** While a session runs: type what happened and press Enter. It lands on the selected panel, or on the board as improvised. */
import { ref } from 'vue'
import { Eye } from 'lucide-vue-next'
import { LOG_TYPES, type LogType } from '@/domain/rules/sessionBoard'
import type { EntryOf, SessionPanel } from '@/domain/schema'
import { addLog } from '@/data/sessions'
import { mentionCompletion } from '@/features/shared/linkCompletion'
import CodeEditor from '@/ui/components/CodeEditor.vue'
import { reportError } from '@/ui/dialogs'

const props = defineProps<{ session: EntryOf<'session'>; target: SessionPanel | null }>()
const emit = defineEmits<{ logged: [target: SessionPanel | null]; clear: [] }>()
const text = ref('')
const type = ref<LogType | ''>('')
const know = ref(false)
const complete = mentionCompletion(() => props.session.campaignId)

async function log() {
  const body = text.value.trim()
  if (!body) return
  const target = props.target && props.target.kind !== 'log' && props.target.kind !== 'frame' ? props.target : null
  // The field empties at once, ready for the next line; a line that could not be logged comes back
  const known = know.value
  text.value = ''
  know.value = false
  try {
    await addLog(props.session, body, { attachTo: target, logType: type.value || undefined, playersShouldKnow: known })
    emit('logged', target)
  } catch (err) { text.value = body; know.value = known; reportError('Logging', err) }
}
</script>

<template>
  <div class="capture" data-test="capture-bar">
    <span v-if="target && target.kind !== 'log' && target.kind !== 'frame'" class="chip on" title="Click to log without a panel" @click="emit('clear')">on: {{ target.title || target.kind }} ×</span>
    <span v-else class="chip">improvised</span>
    <CodeEditor v-model="text" class="input what" single-line submit placeholder="What happened? Enter logs it. @ or {{ links an entry." :complete="complete" label="What happened" data-test="capture-text" @enter="log" />
    <select v-model="type" class="input type" aria-label="Kind of log"><option value="">auto</option><option v-for="t in LOG_TYPES" :key="t" :value="t">{{ t }}</option></select>
    <button class="btn btn-icon" :class="{ 'btn-primary': know }" title="Players should know: comes up in the next recap" @click="know = !know"><Eye :size="15" /></button>
  </div>
</template>

<style scoped>
.capture { display: flex; gap: .4rem; align-items: center; padding: .4rem .7rem; border-top: var(--frame); background: var(--bg-raised); }
.what { flex: 1; min-width: 0; padding-top: .2em; padding-bottom: .2em; }
.chip { white-space: nowrap; } .chip.on { color: var(--accent); border-color: var(--accent); cursor: pointer; } .type { width: auto; }
</style>
