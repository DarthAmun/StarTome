<script setup lang="ts">
/** A modal dialog with a title, a body and a row of buttons. Closes on Escape and on a click beside it. */
import { nextTick, onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'

defineProps<{ title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const el = ref<HTMLDialogElement | null>(null)
onMounted(async () => { await nextTick(); el.value?.showModal() })
</script>

<template>
  <dialog ref="el" class="app-dialog" :class="{ wide }" @close="emit('close')" @click.self="emit('close')">
    <header><h2>{{ title }}</h2><button class="btn btn-ghost btn-icon" aria-label="Close" @click="emit('close')"><X :size="16" /></button></header>
    <div class="body"><slot /></div>
    <footer v-if="$slots.footer"><slot name="footer" /></footer>
  </dialog>
</template>

<style scoped>
.app-dialog { width: min(560px, 94vw); max-height: 90vh; padding: 0; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--bg-raised); color: var(--text); box-shadow: var(--shadow); }
.app-dialog.wide { width: min(860px, 94vw); }
.app-dialog[open] { display: flex; flex-direction: column; }
.app-dialog::backdrop { background: rgb(0 0 0 / .5); }
header, footer { display: flex; align-items: center; gap: .5rem; padding: .7rem 1rem; }
header { border-bottom: var(--frame); } header h2 { flex: 1; }
footer { border-top: var(--frame); justify-content: flex-end; }
.body { overflow: auto; padding: .9rem 1rem; display: flex; flex-direction: column; gap: .6rem; }
</style>
