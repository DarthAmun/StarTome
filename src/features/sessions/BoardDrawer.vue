<script setup lang="ts">
/** The campaign's drawer: panels kept for later, to place on this board; and scenes of other campaigns to copy. */
import { computed, ref } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { PANEL_CONFIG } from '@/domain/rules/sessionBoard'
import type { SessionPanel } from '@/domain/schema'
import { copyToDrawer, deletePanel, sessions } from '@/data/sessions'
import { confirmDialog } from '@/ui/dialogs'
import { excerpt } from '@/ui/markdown'
import { useLive } from '@/ui/useLive'

const props = defineProps<{ campaignId: string; panels: SessionPanel[] }>()
const emit = defineEmits<{ place: [id: string] }>()
const q = ref('')
const elsewhere = ref(false)
const others = useLive(() => (elsewhere.value ? sessions.scenesElsewhere(props.campaignId) : Promise.resolve([])), [], [elsewhere])
const match = (p: SessionPanel) => { const s = q.value.trim().toLowerCase().replace(/^#/, ''); return !s || p.title.toLowerCase().includes(s) || p.body.toLowerCase().includes(s) || p.tags.some(t => t.toLowerCase().includes(s)) }
const shown = computed(() => props.panels.filter(match))
async function remove(p: SessionPanel) {
  if (await confirmDialog({ title: `Delete “${p.title || PANEL_CONFIG[p.kind].label}”?`, body: 'The panel is removed from the drawer for good.', confirmLabel: 'Delete', danger: true })) await deletePanel(p.id)
}
</script>

<template>
  <aside class="drawer" data-test="board-drawer">
    <input v-model="q" class="input" placeholder="Search the drawer (text or #tag)…" aria-label="Search the drawer" />
    <ul>
      <li v-for="p in shown" :key="p.id" :style="{ '--k': PANEL_CONFIG[p.kind].color }" :data-drawer="p.title">
        <span class="kind">{{ PANEL_CONFIG[p.kind].label }}</span><b>{{ p.title || '(untitled)' }}</b>
        <small class="faint">{{ excerpt(p.body, 80) }}</small>
        <span class="acts"><button class="btn" @click="emit('place', p.id)">Place</button><button class="btn btn-ghost btn-icon" :aria-label="`Delete ${p.title}`" @click="remove(p)"><Trash2 :size="13" /></button></span>
      </li>
    </ul>
    <p v-if="!shown.length" class="faint">{{ panels.length ? 'Nothing matches.' : 'Empty. Panels you send here wait for another session.' }}</p>
    <label class="dim"><input v-model="elsewhere" type="checkbox" /> Scenes of other campaigns</label>
    <ul v-if="elsewhere">
      <li v-for="o in others.filter(x => match(x.panel))" :key="o.panel.id" style="--k: #b87de8">
        <span class="kind">{{ o.campaign }}</span><b>{{ o.panel.title || '(untitled)' }}</b>
        <span class="acts"><button class="btn" @click="copyToDrawer(o.panel, campaignId)">Copy here</button></span>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.drawer { display: flex; flex-direction: column; gap: .5rem; padding: .6rem .7rem; overflow: auto; background: var(--bg-raised); border-left: var(--frame); }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .35rem; }
li { display: flex; flex-direction: column; gap: .1rem; padding: .35rem .5rem; border: var(--frame); border-left: 3px solid var(--k); border-radius: var(--radius); }
.kind { font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; color: var(--k); } .acts { display: flex; gap: .3rem; } .acts .btn { padding: .12em .6em; font-size: .82rem; } p { margin: 0; }
</style>
