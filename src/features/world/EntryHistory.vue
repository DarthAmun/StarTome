<script setup lang="ts">
/** History: recorded states of an entry. Record one, look at one, put one back. */
import { ref } from 'vue'
import { RotateCcw, Trash2 } from 'lucide-vue-next'
import { versions } from '@/data/entries'
import { confirmDialog, notify } from '@/ui/dialogs'
import { renderMarkdown } from '@/ui/markdown'
import { useLive } from '@/ui/useLive'

const props = defineProps<{ entryId: string }>()
const list = useLive(() => versions.of(props.entryId), [], [() => props.entryId])
const label = ref('')
const note = ref('')
const open = ref<string | null>(null)

async function record() {
  await versions.record(props.entryId, label.value, note.value)
  label.value = ''; note.value = ''
}
async function restore(id: string, name: string) {
  if (!await confirmDialog({ title: `Restore “${name}”?`, body: 'The entry goes back to this state. How it is now is recorded first, so you can return to it.', confirmLabel: 'Restore' })) return
  await versions.restore(id)
  notify('Restored. The state before is in the history.', 'ok')
}
async function remove(id: string, name: string) {
  if (await confirmDialog({ title: `Delete “${name}”?`, body: 'This recorded state is removed for good.', confirmLabel: 'Delete', danger: true })) await versions.remove(id)
}
</script>

<template>
  <div class="history">
    <form class="record" @submit.prevent="record">
      <input v-model="label" class="input" placeholder="Name this moment: Before the ascension…" aria-label="Label" />
      <input v-model="note" class="input" placeholder="Why (optional)" aria-label="Note" />
      <button class="btn">Record now</button>
    </form>
    <p v-if="!list.length" class="faint">No recorded states yet.</p>
    <div v-for="v in [...list].reverse()" :key="v.id" class="state">
      <div class="head">
        <button class="name" @click="open = open === v.id ? null : v.id">{{ v.label }}</button>
        <span class="faint">{{ v.createdAt.slice(0, 10) }}{{ v.note ? ` · ${v.note}` : '' }}</span>
        <span class="grow" />
        <button class="btn btn-ghost btn-icon" title="Restore this state" @click="restore(v.id, v.label)"><RotateCcw :size="14" /></button>
        <button class="btn btn-ghost btn-icon" title="Delete this state" @click="remove(v.id, v.label)"><Trash2 :size="14" /></button>
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown -->
      <div v-if="open === v.id" class="prose body"><p class="faint">{{ v.name }}</p><div v-html="renderMarkdown(v.body)" /></div>
    </div>
  </div>
</template>

<style scoped>
.history { padding: .9rem 1rem; background: var(--bg-sunken); border: var(--frame); border-radius: var(--radius); margin-bottom: 1rem; }
.record { display: grid; grid-template-columns: 1.2fr 1fr auto; gap: .5rem; margin-bottom: .7rem; }
.state { border-top: var(--frame); padding: .35rem 0; }
.head { display: flex; align-items: center; gap: .7rem; }
.name { background: none; border: 0; color: var(--accent); padding: 0; font-weight: 600; }
.grow { flex: 1; }
.body { padding: .5rem 0 .2rem 1rem; border-left: 2px solid var(--line-strong); margin: .3rem 0; }
</style>
