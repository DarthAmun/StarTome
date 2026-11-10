<template>
  <AppDialog :open="open" class="fnd" :title="`Field notes: ${creature.name}`" @close="emit('close')">
    <div class="pv-dialog-content">
      <p class="fnd-hint">
        The four lines of a monster page, as sentences without numbers. Copy the line the player just filled and paste it to them.
      </p>
      <section v-for="n in notes" :key="n.line" class="fnd-card">
        <header class="fnd-card-head">
          <span class="fnd-card-title">{{ n.label }}</span>
          <label v-if="n.line === 'abilities'" class="fnd-toggle" title="Also list its Strikes and offensive actions as the stat block prints them, numbers included (for the Chimerist's Mimicry)">
            <input v-model="statBlockText" type="checkbox" /> Stat block text
          </label>
          <button class="ghost-btn fnd-copy" @click="copy(n.line, n.text)">{{ copied === n.line ? 'Copied' : 'Copy' }}</button>
        </header>
        <p class="fnd-text">{{ n.text }}</p>
      </section>
    </div>
    <div class="pv-dialog-footer">
      <button class="ghost-btn" @click="emit('close')">Close</button>
      <button class="seal-btn" @click="copy('all', fieldNotesText(creature.name, notes))">{{ copied === 'all' ? 'Copied' : 'Copy all' }}</button>
    </div>
  </AppDialog>
</template>

<script setup lang="ts">
/** GM-only: a creature's stat block as the four lines of a Monstrumologist page, to copy to a player. */
import { reportError } from '~/composables/useNotices'
import { fieldNotes, fieldNotesText, type FieldLine } from '~/rules/fieldNotes'
import type { Creature } from '~/types/rules'

const props = defineProps<{ open: boolean; creature: Creature }>()
const emit = defineEmits<{ close: [] }>()

const statBlockText = ref(false)
const notes = computed(() => fieldNotes(props.creature, { statBlockText: statBlockText.value }))

const copied = ref<FieldLine | 'all' | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
async function copy(which: FieldLine | 'all', text: string) {
  try {
    // The selection copy runs first, while the click still counts as a user gesture: some browsers
    // (and embedded views) refuse the Clipboard API, and after that refusal the gesture is gone.
    if (!copyWithSelection(text)) await navigator.clipboard.writeText(text)
    copied.value = which
    clearTimeout(timer)
    timer = setTimeout(() => { copied.value = null }, 1500)
  } catch (e) {
    reportError('Copying the field notes', e)
  }
}

/** Copies through a hidden text box; inside the dialog so its focus trap doesn't steal the selection. */
function copyWithSelection(text: string): boolean {
  const box = document.createElement('textarea')
  box.value = text
  box.setAttribute('readonly', '')
  box.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
  const host = document.querySelector('.fnd') ?? document.body
  host.appendChild(box)
  box.select()
  try { return document.execCommand('copy') } finally { box.remove() }
}
</script>

<style scoped>
.fnd { width: min(620px, calc(100vw - 32px)); }
.fnd-hint { margin: 0 0 12px; color: var(--text3); font-size: 12.5px; }
.fnd-card { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; background: var(--surface); }
.fnd-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.fnd-card-title { flex: 1; font-family: var(--fh); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); }
.fnd-toggle { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text2); cursor: pointer; }
.fnd-copy { padding: 2px 10px; font-size: 12px; }
.fnd-text { margin: 0; white-space: pre-line; font-size: 13.5px; line-height: 1.55; user-select: text; }
</style>
