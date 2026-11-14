<script setup lang="ts">
/** One panel on the session board: its kind, title, status and text, and what its kind can do (run an encounter, roll a table, award a reward). */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Handle, Position } from '@vue-flow/core'
import { Eye, Pencil } from 'lucide-vue-next'
import { encounterOutcome, LOG_TYPE_COLORS, PANEL_CONFIG, rollOnTable, type LogType } from '@/domain/rules/sessionBoard'
import type { EntryOf, SessionPanel } from '@/domain/schema'
import { entries } from '@/data/repo'
import { addLog, encounterBrief } from '@/data/sessions'
import ProseText from '@/features/shared/ProseText.vue'
import { notify } from '@/ui/dialogs'
import { xpPrompt } from '@/ui/partyPrompts'
import { useLive } from '@/ui/useLive'
import { peek } from '@/ui/workbench'
import type { Board } from './board'

export interface PanelNodeData { panel: SessionPanel; session: EntryOf<'session'>; board: Board; selected: boolean; onEdit: () => void }
const props = defineProps<{ data: PanelNodeData }>()
const router = useRouter()

const p = computed(() => props.data.panel)
const cfg = computed(() => PANEL_CONFIG[p.value.kind])
const color = computed(() => (p.value.kind === 'log' ? LOG_TYPE_COLORS[(p.value.attrs.logType as LogType) ?? 'happened'] ?? cfg.value.color : cfg.value.color))
const encounterId = computed(() => (typeof p.value.attrs.encounterId === 'string' ? p.value.attrs.encounterId : null))
const entryId = computed(() => (typeof p.value.attrs.entryId === 'string' ? p.value.attrs.entryId : null))
const encounter = useLive(async () => (encounterId.value ? encounterBrief(encounterId.value) : null), null, [encounterId])
const entry = useLive(async () => (entryId.value ? (await entries.get(entryId.value)) ?? null : null), null, [entryId])
const title = computed(() => encounter.value?.name ?? entry.value?.name ?? p.value.title)

function cycle() {
  const list = cfg.value.statuses
  if (list) props.data.board.setStatus(p.value, list[(list.indexOf(p.value.status ?? '') + 1) % list.length] ?? list[0] ?? '')
}
function run() {
  if (!encounterId.value) return
  props.data.board.select(p.value.id)
  props.data.board.touch(p.value)
  void router.push({ name: 'encounter', params: { campaignId: p.value.campaignId, encounterId: encounterId.value } })
}
async function logOutcome() {
  if (!encounter.value) return
  await addLog(props.data.session, encounterOutcome(encounter.value.outcome), { attachTo: p.value })
  props.data.board.update(p.value.id, { attrs: { ...p.value.attrs, outcomeLogged: true } }, true)
}
function roll() {
  const t = entry.value
  if (t?.type !== 'random-table') return
  const r = rollOnTable(t.data)
  props.data.board.update(p.value.id, { attrs: { ...p.value.attrs, lastResult: `${r.roll}: ${r.result}` } }, true)
}
async function logResult() {
  await addLog(props.data.session, `Rolled on {{random-table: ${title.value}}}: ${String(p.value.attrs.lastResult ?? '')}`, { attachTo: p.value })
  props.data.board.markLogged(p.value)
}
function award() {
  const xp = Number(p.value.attrs.xp) || 0
  if (!xp) { notify('Give the reward an XP amount first (edit the panel).'); return }
  xpPrompt.value = { campaignId: p.value.campaignId, refType: null, refId: null, reason: p.value.title || 'Reward', amount: xp }
  props.data.board.setStatus(p.value, 'awarded')
}

const SIDE_HANDLES: [string, 'source' | 'target', Position][] = [
  ['s-top', 'source', Position.Top], ['s-left', 'source', Position.Left], ['s-right', 'source', Position.Right],
  ['t-bottom', 'target', Position.Bottom], ['t-left', 'target', Position.Left], ['t-right', 'target', Position.Right],
]
</script>

<template>
  <div class="panel-node" :class="[p.kind, { sel: data.selected, faded: p.status === 'skipped' }]" :style="{ '--k': color, width: `${cfg.width}px` }" :data-panel="title || cfg.label" @click="data.board.select(p.id)" @dblclick.stop="data.onEdit()">
    <Handle id="t-top" type="target" :position="Position.Top" />
    <!-- Where a connection may also arrive or leave: it takes the sides nearest to each other. Only the two dots above are for drawing one. -->
    <Handle v-for="[id, type, pos] in SIDE_HANDLES" :id="id" :key="id" :type="type" :position="pos" :connectable="false" class="side" />
    <header>
      <span class="kind">{{ p.kind === 'log' ? (p.attrs.logType ?? 'log') : cfg.label }}</span>
      <Eye v-if="p.attrs.playersShouldKnow" :size="12" class="know" aria-label="Players should know" />
      <span class="grow" />
      <button v-if="cfg.statuses" class="status" :class="p.status ?? ''" title="Click to change" @click.stop="cycle">{{ p.status }}</button>
      <button class="edit" aria-label="Edit panel" @click.stop="data.onEdit()"><Pencil :size="12" /></button>
    </header>
    <h4 v-if="title" :class="{ link: entryId }" @click="entryId && peek({ kind: 'entry', id: entryId })">{{ title }}</h4>
    <ProseText v-if="p.body" class="body" :text="p.body" :campaign-id="p.campaignId" />
    <div v-if="p.kind === 'encounter'" class="acts">
      <template v-if="encounter">
        <span class="chip">{{ encounter.status }}</span>
        <button class="btn" @click.stop="run">{{ encounter.status === 'resolved' ? 'Open' : 'Run' }}</button>
        <button v-if="encounter.status === 'resolved' && !p.attrs.outcomeLogged" class="btn" @click.stop="logOutcome">Log it</button>
      </template>
      <span v-else class="faint">Pick an encounter (edit).</span>
    </div>
    <div v-else-if="p.kind === 'random-table'" class="acts">
      <button class="btn" :disabled="entry?.type !== 'random-table'" @click.stop="roll">Roll</button>
      <span v-if="p.attrs.lastResult" class="result">{{ p.attrs.lastResult }}</span>
      <button v-if="p.attrs.lastResult" class="btn btn-ghost" @click.stop="logResult">Log</button>
    </div>
    <div v-else-if="p.kind === 'reward'" class="acts">
      <span v-if="p.attrs.xp" class="num">{{ p.attrs.xp }} XP</span>
      <button v-if="p.status !== 'awarded'" class="btn" @click.stop="award">Award</button>
    </div>
    <div v-if="p.tags.length" class="tags"><span v-for="t in p.tags" :key="t">#{{ t }}</span></div>
    <Handle id="s-bottom" type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.panel-node :deep(.vue-flow__handle.side) { opacity: 0; pointer-events: none; }
.panel-node { background: var(--bg-raised); border: 1px solid color-mix(in srgb, var(--k) 55%, var(--line)); border-top: 3px solid var(--k); border-radius: var(--radius); padding: .4rem .55rem .5rem; box-shadow: var(--shadow); cursor: grab; }
.panel-node.sel { outline: 2px solid var(--accent); outline-offset: 1px; } .panel-node.faded { opacity: .55; }
header { display: flex; align-items: center; gap: .3rem; } .grow { flex: 1; }
.kind { font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; color: var(--k); } .know { color: var(--accent-2); }
.status { font-size: .68rem; padding: 0 .4rem; border-radius: 99px; border: 1px solid var(--line-strong); background: none; color: var(--text-dim); }
.status.played, .status.done, .status.revealed, .status.awarded { background: color-mix(in srgb, var(--k) 25%, transparent); color: var(--text); border-color: var(--k); }
.edit { background: none; border: 0; color: var(--text-faint); padding: 0 .1rem; } .edit:hover { color: var(--text); }
h4 { margin: .2rem 0; font-size: .98rem; } h4.link { cursor: pointer; } h4.link:hover { color: var(--accent); }
.body { max-height: 11rem; overflow: hidden; mask-image: linear-gradient(#000 80%, transparent); }
.acts { display: flex; gap: .35rem; align-items: center; flex-wrap: wrap; margin-top: .3rem; } .acts .btn { padding: .15em .6em; font-size: .82rem; } .result { font-size: .85rem; }
.tags { display: flex; gap: .3rem; flex-wrap: wrap; font-size: .7rem; color: var(--text-faint); margin-top: .25rem; }
</style>
