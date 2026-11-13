<script setup lang="ts">
/**
 * The Desk: a free board of widgets for the table. Drag a widget by its bar,
 * resize it at its corner, Shift+click several to move them together. The
 * layout belongs to the campaign and is in the backup; named layouts can be
 * saved and brought back.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ChevronLeft, ChevronRight, Maximize, X } from 'lucide-vue-next'
import { partyLevel } from '@/domain/rules/party'
import type { EntryType } from '@/domain/schema'
import { entriesNamed } from '@/data/entries'
import { partyOf } from '@/data/party'
import { workspace } from '@/data/repo'
import { rulesSearch } from '@/data/rules'
import { confirmDialog } from '@/ui/dialogs'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'
import { useLive } from '@/ui/useLive'
import { campaign, pins } from '@/ui/workbench'
import { defaultLayout, ENTRY_KINDS, isTool, newWidget, readPresets, readWidgets, SINGLETONS, snap, tidy, TOOL_KINDS, TOOL_LABEL, type DeskPreset, type DeskWidget, type WidgetKind } from './desk'
import EntryWidget from './widgets/EntryWidget.vue'
import ToolWidget from './widgets/ToolWidget.vue'

const props = defineProps<{ campaignId: string }>()
const game = computed(() => campaign.value?.game ?? 'pf2e')
const widgets = ref<DeskWidget[]>([])
const presets = ref<DeskPreset[]>([])
const loaded = ref(false)
const density = ref<'compact' | 'cozy' | 'loose'>('cozy')
const view = reactive({ x: 24, y: 24, zoom: 1 })
const picked = ref(new Set<string>())
const paletteOpen = ref(true)
const search = ref('')
const boardEl = ref<HTMLElement | null>(null)

const party = useLive(() => partyOf(props.campaignId), [], [() => props.campaignId])
const level = computed(() => partyLevel(party.value).level)
const allEntries = useLive(() => entriesNamed(props.campaignId, ENTRY_KINDS), [], [() => props.campaignId])
const names = computed(() => new Map(allEntries.value.map(e => [e.id, e.name])))
const found = computed(() => { const q = search.value.trim().toLowerCase(); return (q ? allEntries.value.filter(e => e.name.toLowerCase().includes(q)) : allEntries.value).slice(0, 60) })
const rules = useLive(async () => (search.value.trim().length >= 2 ? rulesSearch(search.value, 8, [game.value]) : []), [], [search])

void (async () => {
  const raw = await workspace.get<unknown>(props.campaignId, 'desk.layout', null)
  widgets.value = raw === null ? defaultLayout() : readWidgets(raw)
  presets.value = readPresets(await workspace.get<unknown>(props.campaignId, 'desk.presets', []))
  const prefs = await workspace.get<{ density?: typeof density.value }>(props.campaignId, 'desk.view', {})
  if (prefs.density) density.value = prefs.density
  loaded.value = true
})()
function save() { if (loaded.value) void workspace.set(props.campaignId, 'desk.layout', JSON.parse(JSON.stringify(widgets.value))) }
const savePresets = () => void workspace.set(props.campaignId, 'desk.presets', JSON.parse(JSON.stringify(presets.value)))
function setDensity(d: typeof density.value) { density.value = d; void workspace.set(props.campaignId, 'desk.view', { density: d }) }

// ── Widgets ──
const has = (k: WidgetKind) => widgets.value.some(w => w.kind === k)
function add(kind: WidgetKind, extra: Partial<DeskWidget> = {}) {
  if (isTool(kind) && (SINGLETONS as string[]).includes(kind) && has(kind)) return
  if (extra.entryId && widgets.value.some(w => w.entryId === extra.entryId)) return
  widgets.value = [...widgets.value, newWidget(kind, widgets.value, extra)]
  save()
}
function remove(id: string) { widgets.value = widgets.value.filter(w => w.id !== id); picked.value.delete(id); save() }
function setConfig(w: DeskWidget, config: Record<string, unknown>) { w.config = config; save() }
const titleOf = (w: DeskWidget) => (isTool(w.kind) ? TOOL_LABEL[w.kind] : names.value.get(w.entryId ?? '') ?? ENTRY_TYPE_INFO[w.kind as EntryType].label)
const colorOf = (w: DeskWidget) => (isTool(w.kind) ? 'var(--accent-2)' : ENTRY_TYPE_INFO[w.kind as EntryType].color)

// ── Moving, resizing, panning ──
type Drag = { kind: 'move'; ids: string[]; start: Map<string, { x: number; y: number }> } | { kind: 'resize'; id: string; w: number; h: number } | { kind: 'pan'; vx: number; vy: number }
let drag: (Drag & { sx: number; sy: number }) | null = null
function down(e: PointerEvent, w: DeskWidget, kind: 'move' | 'resize') {
  if (e.button !== 0) return
  e.stopPropagation()
  if (kind === 'move' && e.shiftKey) { const s = new Set(picked.value); if (s.has(w.id)) s.delete(w.id); else s.add(w.id); picked.value = s; return }
  const ids = picked.value.has(w.id) ? [...picked.value] : [w.id]
  drag = kind === 'resize' ? { kind, id: w.id, w: w.width, h: w.height, sx: e.clientX, sy: e.clientY }
    : { kind, ids, start: new Map(widgets.value.filter(x => ids.includes(x.id)).map(x => [x.id, { x: x.x, y: x.y }])), sx: e.clientX, sy: e.clientY }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up, { once: true })
}
function panDown(e: PointerEvent) {
  if (e.button !== 0 && e.button !== 1) return
  if (!e.shiftKey) picked.value = new Set()
  drag = { kind: 'pan', vx: view.x, vy: view.y, sx: e.clientX, sy: e.clientY }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up, { once: true })
}
function move(e: PointerEvent) {
  const d = drag
  if (!d) return
  const dx = (e.clientX - d.sx) / view.zoom, dy = (e.clientY - d.sy) / view.zoom
  if (d.kind === 'pan') { view.x = d.vx + (e.clientX - d.sx); view.y = d.vy + (e.clientY - d.sy); return }
  for (const w of widgets.value) {
    if (d.kind === 'resize' && w.id === d.id) { w.width = Math.max(168, snap(d.w + dx)); w.height = Math.max(96, snap(d.h + dy)) }
    else if (d.kind === 'move') { const s = d.start.get(w.id); if (s) { w.x = snap(s.x + dx); w.y = snap(s.y + dy) } }
  }
}
function up() { window.removeEventListener('pointermove', move); if (drag && drag.kind !== 'pan') save(); drag = null }
function wheel(e: WheelEvent) {
  const box = boardEl.value?.getBoundingClientRect()
  if (!box) return
  const z = Math.min(2, Math.max(0.3, view.zoom * (e.deltaY < 0 ? 1.1 : 0.9))), k = z / view.zoom, cx = e.clientX - box.left, cy = e.clientY - box.top
  view.x = cx - (cx - view.x) * k
  view.y = cy - (cy - view.y) * k
  view.zoom = z
}
function fit() {
  const el = boardEl.value
  if (!el || !widgets.value.length) { Object.assign(view, { x: 24, y: 24, zoom: 1 }); return }
  const l = Math.min(...widgets.value.map(w => w.x)), t = Math.min(...widgets.value.map(w => w.y))
  const r = Math.max(...widgets.value.map(w => w.x + w.width)), b = Math.max(...widgets.value.map(w => w.y + w.height))
  view.zoom = Math.min(1.2, Math.max(0.3, Math.min((el.clientWidth - 48) / (r - l), (el.clientHeight - 48) / (b - t))))
  view.x = 24 - l * view.zoom
  view.y = 24 - t * view.zoom
}

// ── Layouts ──
async function reset() { if (await confirmDialog({ title: 'Back to the starting layout?', body: 'The widgets on the board are replaced. The scratchpad keeps its text.', confirmLabel: 'Reset' })) { widgets.value = defaultLayout(); save(); fit() } }
async function clear() { if (await confirmDialog({ title: 'Clear the Desk?', body: 'Every widget is taken off. The scratchpad keeps its text.', confirmLabel: 'Clear', danger: true })) { widgets.value = []; save() } }
function suggest() { widgets.value = tidy(widgets.value); save(); fit() }
const presetName = ref('')
function savePreset() { const name = presetName.value.trim(); if (!name) return; presets.value = [...presets.value.filter(p => p.name !== name), { name, widgets: JSON.parse(JSON.stringify(widgets.value)) as DeskWidget[] }]; presetName.value = ''; savePresets() }
function loadPreset(e: Event) { const p = presets.value.find(x => x.name === (e.target as HTMLSelectElement).value); (e.target as HTMLSelectElement).value = ''; if (p) { widgets.value = readWidgets(JSON.parse(JSON.stringify(p.widgets))); save(); fit() } }
function dropPreset(name: string) { presets.value = presets.value.filter(p => p.name !== name); savePresets() }

function drop(e: DragEvent) { const raw = e.dataTransfer?.getData('application/x-startome-desk'); if (raw) { const w = JSON.parse(raw) as { kind: WidgetKind; entryId?: string; rulesId?: string }; add(w.kind, w) } }
const dragStart = (e: DragEvent, w: { kind: WidgetKind; entryId?: string; rulesId?: string }) => e.dataTransfer?.setData('application/x-startome-desk', JSON.stringify(w))
onMounted(() => setTimeout(fit, 150))
onBeforeUnmount(up)
</script>

<template>
  <div class="desk" :class="[density, { closed: !paletteOpen }]">
    <aside class="palette">
      <button class="btn btn-ghost btn-icon fold" :aria-label="paletteOpen ? 'Hide the palette' : 'Show the palette'" @click="paletteOpen = !paletteOpen"><ChevronLeft v-if="paletteOpen" :size="15" /><ChevronRight v-else :size="15" /></button>
      <template v-if="paletteOpen">
        <span class="eyebrow">Tools</span>
        <button v-for="k in TOOL_KINDS.filter(k => k !== 'rules-entry')" :key="k" class="item" :disabled="has(k)" draggable="true" :data-tool="k" title="Double-click or drag onto the board" @dblclick="add(k)" @dragstart="dragStart($event, { kind: k })">{{ TOOL_LABEL[k] }}</button>
        <template v-if="pins.length"><span class="eyebrow">Pinned</span>
          <button v-for="p in pins" :key="p.id" class="item" draggable="true" @dblclick="p.kind === 'entry' ? add(p.type as WidgetKind, { entryId: p.id }) : add('rules-entry', { rulesId: p.id })" @dragstart="dragStart($event, p.kind === 'entry' ? { kind: p.type as WidgetKind, entryId: p.id } : { kind: 'rules-entry', rulesId: p.id })">{{ p.label }}</button>
        </template>
        <span class="eyebrow">Entries and compendium</span>
        <input v-model="search" class="input" placeholder="Search…" aria-label="Search entries and compendium" />
        <button v-for="e in found" :key="e.id" class="item" draggable="true" :style="{ '--k': ENTRY_TYPE_INFO[e.type].color }" :data-entry="e.name" @dblclick="add(e.type, { entryId: e.id })" @dragstart="dragStart($event, { kind: e.type, entryId: e.id })"><i class="dot" />{{ e.name }}</button>
        <button v-for="r in rules" :key="r.id" class="item" draggable="true" @dblclick="add('rules-entry', { rulesId: r.id })" @dragstart="dragStart($event, { kind: 'rules-entry', rulesId: r.id })">{{ r.name }} <span class="faint">{{ r.kind }}</span></button>
      </template>
    </aside>

    <header class="bar">
      <h2>Desk</h2>
      <select class="input" :value="density" aria-label="Density" @change="setDensity(($event.target as HTMLSelectElement).value as 'cozy')"><option value="compact">Compact</option><option value="cozy">Cozy</option><option value="loose">Loose</option></select>
      <button class="btn btn-icon" title="Zoom out" @click="view.zoom = Math.max(0.3, view.zoom / 1.15)">−</button><span class="num faint">{{ Math.round(view.zoom * 100) }}%</span><button class="btn btn-icon" title="Zoom in" @click="view.zoom = Math.min(2, view.zoom * 1.15)">+</button>
      <button class="btn btn-icon" title="Fit" @click="fit"><Maximize :size="15" /></button>
      <span class="grow" />
      <button v-if="picked.size" class="btn" @click="picked = new Set()">Deselect {{ picked.size }}</button>
      <button class="btn" title="Pack the widgets into tidy rows" @click="suggest">Suggest a layout</button>
      <select v-if="presets.length" class="input" aria-label="Load a saved layout" @change="loadPreset"><option value="">Saved layouts…</option><option v-for="p in presets" :key="p.name" :value="p.name">{{ p.name }}</option></select>
      <input v-model="presetName" class="input name" placeholder="Save layout as…" aria-label="Layout name" @keydown.enter="savePreset" />
      <button v-if="presets.some(p => p.name === presetName.trim())" class="btn btn-danger" @click="dropPreset(presetName.trim()); presetName = ''">Delete saved</button>
      <button class="btn" @click="reset">Reset</button><button class="btn" @click="clear">Clear</button>
    </header>

    <div ref="boardEl" class="board" data-test="desk-board" @pointerdown="panDown" @wheel.prevent="wheel" @dragover.prevent @drop.prevent="drop">
      <div class="plane" :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }">
        <section v-for="w in widgets" :key="w.id" class="widget panel" :class="{ picked: picked.has(w.id) }" :style="{ left: `${w.x}px`, top: `${w.y}px`, width: `${w.width}px`, height: `${w.height}px`, '--k': colorOf(w) }" :data-widget="titleOf(w)" @pointerdown.stop>
          <header @pointerdown="down($event, w, 'move')"><span class="t">{{ titleOf(w) }}</span><button class="btn btn-ghost btn-icon" :aria-label="`Remove ${titleOf(w)}`" @pointerdown.stop @click="remove(w.id)"><X :size="13" /></button></header>
          <div class="content">
            <ToolWidget v-if="isTool(w.kind)" :widget="w" :campaign-id="campaignId" :game="game" :party-level="level" @config="setConfig(w, $event)" />
            <EntryWidget v-else-if="w.entryId" :entry-id="w.entryId" />
          </div>
          <span class="grip" title="Drag to resize" @pointerdown="down($event, w, 'resize')" />
        </section>
      </div>
      <p v-if="loaded && !widgets.length" class="empty">An empty Desk. Double-click a tool or an entry on the left to put it here.</p>
    </div>
  </div>
</template>

<style scoped>
.desk { height: 100%; display: grid; grid-template-columns: 230px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); } .desk.closed { grid-template-columns: 40px minmax(0, 1fr); }
.palette { grid-row: 1 / -1; overflow: auto; padding: .5rem; display: flex; flex-direction: column; gap: 2px; border-right: var(--frame); background: var(--bg-raised); } .fold { align-self: flex-end; } .palette .eyebrow { margin: .6rem 0 .2rem; }
.item { display: flex; align-items: center; gap: .4rem; background: none; border: 0; text-align: left; padding: .22rem .4rem; border-radius: var(--radius); cursor: grab; font-size: .9rem; } .item:hover:not(:disabled) { background: var(--bg-hover); } .item:disabled { opacity: .4; cursor: default; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--k); flex: none; }
.bar { display: flex; align-items: center; gap: .45rem; padding: .4rem .7rem; border-bottom: var(--frame); background: var(--bg-raised); flex-wrap: wrap; } .bar .input { width: auto; padding: .25em .5em; } .bar .name { width: 10rem; } .grow { flex: 1; }
.board { position: relative; overflow: hidden; background: var(--bg-sunken); cursor: grab; } .plane { position: absolute; transform-origin: 0 0; }
.widget { position: absolute; display: flex; flex-direction: column; border-top: 3px solid var(--k); box-shadow: var(--shadow); cursor: default; } .widget.picked { outline: 2px solid var(--accent); }
.widget header { display: flex; align-items: center; padding: .15rem .3rem .15rem .6rem; border-bottom: var(--frame); cursor: move; user-select: none; } .t { flex: 1; font-family: var(--font-title); font-size: .82rem; letter-spacing: .06em; color: var(--k); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.content { flex: 1; min-height: 0; overflow: auto; padding: .5rem .6rem; } .compact .content { padding: .25rem .4rem; font-size: .9em; } .loose .content { padding: .8rem 1rem; }
.grip { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; border-right: 2px solid var(--line-strong); border-bottom: 2px solid var(--line-strong); }
.empty { position: absolute; inset: 35% 0 auto; pointer-events: none; }
</style>
