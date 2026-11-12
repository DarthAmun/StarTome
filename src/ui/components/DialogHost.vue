<script setup lang="ts">
/** Shows the confirm dialog and the notices; mounted once in the shell. */
import { nextTick, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { answerConfirm, dialogs, dismissNotice, notices } from '@/ui/dialogs'

const el = ref<HTMLDialogElement | null>(null)
watch(() => dialogs.confirm, async (req) => {
  await nextTick()
  if (req) el.value?.showModal()
  else el.value?.close()
})
</script>

<template>
  <dialog ref="el" class="confirm" @cancel.prevent="answerConfirm(false)" @click.self="answerConfirm(false)">
    <form v-if="dialogs.confirm" method="dialog" class="confirm-box" @submit.prevent="answerConfirm(true)">
      <h2>{{ dialogs.confirm.title }}</h2>
      <p class="dim">{{ dialogs.confirm.body }}</p>
      <div class="confirm-actions">
        <button type="button" class="btn" @click="answerConfirm(false)">Cancel</button>
        <button type="submit" class="btn" :class="dialogs.confirm.danger ? 'btn-danger' : 'btn-primary'" autofocus>{{ dialogs.confirm.confirmLabel }}</button>
      </div>
    </form>
  </dialog>
  <div class="notices" role="status">
    <div v-for="n in notices.list" :key="n.id" class="notice" :class="n.kind">
      <span>{{ n.text }}</span>
      <button class="btn btn-ghost btn-icon" aria-label="Dismiss" @click="dismissNotice(n.id)"><X :size="14" /></button>
    </div>
  </div>
</template>

<style scoped>
.confirm { padding: 0; border: var(--frame); border-color: var(--line-strong); border-radius: var(--radius); background: var(--bg-raised); color: var(--text); box-shadow: var(--shadow); max-width: 460px; }
.confirm::backdrop { background: rgb(0 0 0 / .55); }
.confirm-box { padding: 1.4rem 1.5rem 1.2rem; }
.confirm-box h2 { margin-bottom: .6rem; }
.confirm-actions { display: flex; justify-content: flex-end; gap: .6rem; margin-top: 1.2rem; }
.notices { position: fixed; right: 1rem; bottom: calc(var(--tray-h) + 1rem); z-index: 60; display: flex; flex-direction: column; gap: .5rem; max-width: 420px; }
.notice { display: flex; align-items: start; gap: .6rem; padding: .6rem .6rem .6rem .9rem; background: var(--bg-raised); border: var(--frame); border-left: 3px solid var(--accent); border-radius: var(--radius); box-shadow: var(--shadow); }
.notice.ok { border-left-color: var(--ok); }
.notice.error { border-left-color: var(--danger); }
.notice span { flex: 1; }
</style>
