<script setup lang="ts">
/** Finishing a session: prep that did not come up goes to the next session, to the drawer, or stays. */
import { ref } from 'vue'
import { finishReviewRows, PANEL_CONFIG, type FinishChoice, type FinishRow } from '@/domain/rules/sessionBoard'
import type { EntryOf, SessionPanel } from '@/domain/schema'
import { encounters } from '@/data/encounters'
import { saveEntry } from '@/data/entries'
import { moveToDrawer, nextSession, patchPanel, sendToSession, sessions } from '@/data/sessions'
import AppDialog from '@/ui/components/AppDialog.vue'
import { notify, reportError } from '@/ui/dialogs'

const props = defineProps<{ session: EntryOf<'session'> }>()
const emit = defineEmits<{ close: []; finished: [] }>()
const LABEL: Record<FinishChoice, string> = { next: 'Next session', drawer: 'Drawer', leave: 'Leave here' }
const rows = ref<FinishRow<SessionPanel>[]>([])
const busy = ref(false)

void (async () => {
  const resolved = new Set((await encounters.ofCampaign(props.session.campaignId)).filter(e => e.status === 'resolved').map(e => e.id))
  rows.value = finishReviewRows(await sessions.panels(props.session.id), id => resolved.has(id))
})()

async function finish() {
  busy.value = true
  try {
    const next = rows.value.filter(r => r.choice === 'next')
    if (next.length) {
      const target = await nextSession(props.session, true)
      if (target) await sendToSession(props.session.id, target, next.map(r => ({ id: r.panel.id, copy: r.copy })), `From ${props.session.name}`)
    }
    for (const r of rows.value) {
      if (r.choice === 'drawer') await moveToDrawer(r.panel.id)
      // A scene that stays and never came up is marked skipped
      else if (r.choice === 'leave' && r.panel.kind === 'scene' && r.panel.status === 'planned') await patchPanel(r.panel.id, { status: 'skipped' })
    }
    await saveEntry(props.session.id, { data: { mode: 'finished' } })
    if (next.length) notify(`${next.length} panel${next.length === 1 ? '' : 's'} carried over to the next session.`, 'ok')
    emit('finished')
    emit('close')
  } catch (err) { reportError('Finishing the session', err) } finally { busy.value = false }
}
</script>

<template>
  <AppDialog :title="`Finish · ${session.name}`" @close="emit('close')">
    <p v-if="rows.length" class="dim">These did not come up. Where should they go?</p>
    <div v-for="r in rows" :key="r.panel.id" class="row">
      <span class="what"><i :style="{ color: PANEL_CONFIG[r.panel.kind].color }">{{ PANEL_CONFIG[r.panel.kind].label }}</i> <b>{{ r.panel.title || '(untitled)' }}</b> <span class="faint">{{ r.reason }}</span></span>
      <select v-model="r.choice" class="input" :aria-label="`Where ${r.panel.title} goes`"><option v-for="c in r.choices" :key="c" :value="c">{{ LABEL[c] }}</option></select>
    </div>
    <p v-if="!rows.length" class="faint">Everything on the board came up. Nothing to carry over.</p>
    <template #footer>
      <button class="btn" @click="emit('close')">Not yet</button>
      <button class="btn btn-primary" :disabled="busy" data-test="confirm-finish" @click="finish">Finish session</button>
    </template>
  </AppDialog>
</template>

<style scoped>
p { margin: 0; } .row { display: flex; gap: .6rem; align-items: center; } .what { flex: 1; min-width: 0; } .what i { font-style: normal; font-size: .72rem; text-transform: uppercase; letter-spacing: .1em; } .row .input { width: auto; }
</style>
