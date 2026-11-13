<script setup lang="ts">
/** A panel's contents, edited beside the board: title, text, tags, status, and what its kind links to. */
import { computed } from 'vue'
import { Trash2, X } from 'lucide-vue-next'
import { LOG_TYPES, PANEL_CONFIG } from '@/domain/rules/sessionBoard'
import { ENTRY_TYPES, type SessionPanel } from '@/domain/schema'
import { encounters } from '@/data/encounters'
import { entriesNamed } from '@/data/entries'
import ProseEditor from '@/features/shared/ProseEditor.vue'
import { useLive } from '@/ui/useLive'
import type { Board } from './board'

const props = defineProps<{ panel: SessionPanel; board: Board; attached: string[] }>()
const emit = defineEmits<{ close: []; remove: []; drawer: [] }>()

const p = computed(() => props.panel)
const cfg = computed(() => PANEL_CONFIG[p.value.kind])
const encounterList = useLive(() => encounters.ofCampaign(p.value.campaignId), [], [() => p.value.campaignId])
const entryList = useLive(() => entriesNamed(p.value.campaignId, p.value.kind === 'random-table' ? ['random-table'] : ENTRY_TYPES.filter(t => t !== 'session')), [], [() => p.value.kind])
const set = (patch: Parameters<Board['update']>[1], now = false) => props.board.update(p.value.id, patch, now)
const attr = (patch: Record<string, unknown>) => set({ attrs: { ...p.value.attrs, ...patch } }, true)
function pickEntry(e: Event) {
  const hit = entryList.value.find(x => x.id === (e.target as HTMLSelectElement).value)
  set({ title: hit?.name ?? '', attrs: { ...p.value.attrs, entryId: hit?.id ?? null, entryType: hit?.type ?? null } }, true)
}
function pickEncounter(e: Event) {
  const hit = encounterList.value.find(x => x.id === (e.target as HTMLSelectElement).value)
  set({ title: hit?.name ?? '', attrs: { ...p.value.attrs, encounterId: hit?.id ?? null } }, true)
}
</script>

<template>
  <aside class="editor" data-test="panel-editor">
    <header><span class="eyebrow" :style="{ color: cfg.color }">{{ cfg.label }}</span><span class="grow" />
      <button v-if="panel.kind !== 'frame'" class="btn btn-ghost" title="Keep it for another session" @click="emit('drawer')">To the drawer</button>
      <button class="btn btn-ghost btn-icon btn-danger" aria-label="Delete panel" @click="emit('remove')"><Trash2 :size="14" /></button>
      <button class="btn btn-ghost btn-icon" aria-label="Close editor" @click="emit('close')"><X :size="15" /></button>
    </header>
    <label v-if="panel.kind === 'encounter'"><span class="label">Encounter</span>
      <select class="input" :value="panel.attrs.encounterId ?? ''" aria-label="Encounter" @change="pickEncounter"><option value="">None</option><option v-for="e in encounterList" :key="e.id" :value="e.id">{{ e.name }}</option></select>
    </label>
    <label v-else-if="panel.kind === 'entity' || panel.kind === 'random-table'"><span class="label">{{ panel.kind === 'entity' ? 'Entry' : 'Random table' }}</span>
      <select class="input" :value="panel.attrs.entryId ?? ''" aria-label="Entry" @change="pickEntry"><option value="">None</option><option v-for="e in entryList" :key="e.id" :value="e.id">{{ e.name }}{{ panel.kind === 'entity' ? ` · ${e.type}` : '' }}</option></select>
    </label>
    <label v-else><span class="label">Title</span><input class="input" :value="panel.title" aria-label="Panel title" @input="set({ title: ($event.target as HTMLInputElement).value })" /></label>
    <div class="row">
      <label v-if="cfg.statuses"><span class="label">Status</span><select class="input" :value="panel.status ?? ''" @change="board.setStatus(panel, ($event.target as HTMLSelectElement).value)"><option v-for="s in cfg.statuses" :key="s" :value="s">{{ s }}</option></select></label>
      <label v-if="panel.kind === 'log'"><span class="label">What kind</span><select class="input" :value="panel.attrs.logType ?? 'happened'" @change="attr({ logType: ($event.target as HTMLSelectElement).value })"><option v-for="t in LOG_TYPES" :key="t" :value="t">{{ t }}</option></select></label>
      <label v-if="panel.kind === 'reward'"><span class="label">XP each</span><input class="input num" type="number" min="0" :value="panel.attrs.xp ?? ''" aria-label="Reward XP" @change="attr({ xp: Number(($event.target as HTMLInputElement).value) || 0 })" /></label>
      <label v-if="panel.kind === 'frame'"><span class="label">Colour</span><input type="color" :value="panel.attrs.color ?? '#5fc98a'" @change="attr({ color: ($event.target as HTMLInputElement).value })" /></label>
    </div>
    <label v-if="panel.kind === 'log' || panel.kind === 'clue'" class="dim"><input type="checkbox" :checked="!!panel.attrs.playersShouldKnow" @change="attr({ playersShouldKnow: !panel.attrs.playersShouldKnow })" /> Players should know (comes up in the next session's recap)</label>
    <p v-if="attached.length" class="faint">Attached to: {{ attached.join(', ') }}</p>
    <ProseEditor v-if="cfg.hasText" :key="panel.id" class="text" :model-value="panel.body" :campaign-id="panel.campaignId" placeholder="What happens here…" @update:model-value="set({ body: $event })" />
    <label><span class="label">Tags</span><input class="input" :value="panel.tags.join(', ')" placeholder="act-2, travel" @change="set({ tags: ($event.target as HTMLInputElement).value.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean) }, true)" /></label>
  </aside>
</template>

<style scoped>
.editor { display: flex; flex-direction: column; gap: .55rem; padding: .6rem .7rem; overflow: auto; background: var(--bg-raised); border-left: var(--frame); }
header, .row { display: flex; gap: .5rem; align-items: end; } header { align-items: center; } .grow { flex: 1; } .num { width: 6rem; } p { margin: 0; }
.text { flex: 1; min-height: 12rem; }
</style>
