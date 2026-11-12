<script setup lang="ts">
/** GM only: a creature as the four lines of a monster page, sentences without numbers, to copy to a player. */
import { computed, nextTick, ref, watch } from 'vue'
import { fieldNotes, fieldNotesText } from '@/domain/rules/fieldNotes'
import type { Creature } from '@/domain/rules/types'
import { reportError } from '@/ui/dialogs'

const props = defineProps<{ open: boolean; creature: Creature }>()
const emit = defineEmits<{ close: [] }>()

const el = ref<HTMLDialogElement | null>(null)
watch(() => props.open, async (open) => { await nextTick(); if (open) el.value?.showModal(); else el.value?.close() }, { immediate: true })

const statBlockText = ref(false)
const notes = computed(() => fieldNotes(props.creature, { statBlockText: statBlockText.value }))
const copied = ref<string | null>(null)

async function copy(which: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = which
    setTimeout(() => { if (copied.value === which) copied.value = null }, 1500)
  } catch (err) { reportError('Copying the field notes', err) }
}
</script>

<template>
  <dialog ref="el" class="notes" @close="emit('close')" @click.self="emit('close')">
    <div class="box">
      <h2>Field notes: {{ creature.name }}</h2>
      <p class="dim">The four lines of a monster page, as sentences without numbers. Copy the line the player just filled and paste it to them.</p>
      <section v-for="n in notes" :key="n.line" class="card">
        <header>
          <span class="eyebrow">{{ n.label }}</span>
          <label v-if="n.line === 'abilities'" class="faint" title="Also list its Strikes and offensive actions as the stat block prints them, numbers included"><input v-model="statBlockText" type="checkbox" /> Stat block text</label>
          <button class="btn" @click="copy(n.line, n.text)">{{ copied === n.line ? 'Copied' : 'Copy' }}</button>
        </header>
        <p>{{ n.text }}</p>
      </section>
      <footer>
        <button class="btn" @click="emit('close')">Close</button>
        <button class="btn btn-primary" @click="copy('all', fieldNotesText(creature.name, notes))">{{ copied === 'all' ? 'Copied' : 'Copy all' }}</button>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.notes { width: min(640px, 92vw); padding: 0; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--bg-raised); color: var(--text); box-shadow: var(--shadow); }
.notes::backdrop { background: rgb(0 0 0 / .5); }
.box { padding: 1.2rem 1.4rem; display: flex; flex-direction: column; gap: .7rem; }
.card { border: var(--frame); border-radius: var(--radius); padding: .6rem .8rem; background: var(--bg-sunken); }
.card header { display: flex; align-items: center; gap: .8rem; margin-bottom: .3rem; }
.card header .eyebrow { flex: 1; }
.card p { margin: 0; white-space: pre-wrap; user-select: text; }
footer { display: flex; justify-content: flex-end; gap: .5rem; }
</style>
