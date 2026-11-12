<script setup lang="ts">
/**
 * The markdown editor. Three modes:
 * - Live: the text as it reads; click a block to edit it in place.
 * - Source: the whole text as one plain document (select all, paste, replace).
 * - Read: nothing editable.
 * Links, dice and tables in rendered text are clickable in every mode; ticking
 * a task or advancing a clock changes the text.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { Bold, EyeOff, Heading2, Italic, List, ListChecks, Printer, Quote } from 'lucide-vue-next'
import { evaluateFormula } from '@/domain/formula'
import { stripGmOnly } from '@/domain/gmContent'
import { isEntryTypeName } from '@/domain/links'
import { advanceClock, isHiddenBlock, joinBlocks, splitBlocks, toggleHiddenBlock, toggleTask } from '@/domain/markdownBlocks'
import { findEntryByName, rulesByName, workspace } from '@/data/repo'
import CodeEditor from '@/ui/components/CodeEditor.vue'
import { notify } from '@/ui/dialogs'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'
import { renderMarkdown } from '@/ui/markdown'
import { peek } from '@/ui/workbench'
import { linkCompletion } from './linkCompletion'

type Mode = 'live' | 'source' | 'read'

const props = withDefaults(defineProps<{ modelValue: string; campaignId: string; resolves?: (type: string, name: string) => boolean; readonly?: boolean; placeholder?: string }>(), { readonly: false, placeholder: 'Write here…' })
const emit = defineEmits<{ 'update:modelValue': [text: string] }>()

const mode = ref<Mode>('live')
void workspace.get<Mode>('', 'editor.mode', 'live').then((m) => { mode.value = m })
function setMode(m: Mode) {
  mode.value = m
  editing.value = null
  void workspace.set('', 'editor.mode', m)
}
const shownMode = computed<Mode>(() => (props.readonly ? 'read' : mode.value))

const complete = linkCompletion(() => props.campaignId)
const blocks = ref<string[]>(splitBlocks(props.modelValue))
const editing = ref<number | null>(null)
const draft = ref('')
/** The code editor on screen (the source view, or the block being edited); set by a function ref, since one sits in a v-for. */
let editor: InstanceType<typeof CodeEditor> | null = null
const setEditor = (el: unknown) => { if (el) editor = el as InstanceType<typeof CodeEditor> }

// The text changed elsewhere (another tab, a restore): show it, unless a block is being typed in
watch(() => props.modelValue, (text) => { if (editing.value === null && text !== joinBlocks(blocks.value)) blocks.value = splitBlocks(text) })

const render = (text: string) => renderMarkdown(text, { resolves: props.resolves })
const rendered = computed(() => blocks.value.map(render))
const whole = computed(() => render(props.modelValue))

function commit(next: string[]) {
  blocks.value = next
  emit('update:modelValue', joinBlocks(next))
}

function edit(i: number) {
  if (shownMode.value !== 'live') return
  finish()
  editing.value = i
  draft.value = blocks.value[i] ?? ''
}

function finish() {
  const i = editing.value
  if (i === null) return
  editing.value = null
  // A block may have grown blank lines (it became several) or been emptied (it is gone)
  const next = [...blocks.value]
  next.splice(i, 1, ...splitBlocks(draft.value))
  commit(next)
}

function onDraft(text: string) {
  draft.value = text
  const i = editing.value
  if (i === null) return
  const next = [...blocks.value]
  next[i] = text
  emit('update:modelValue', joinBlocks(next))
}

async function addBlock() {
  finish()
  blocks.value = [...blocks.value, '']
  editing.value = blocks.value.length - 1
  draft.value = ''
  await nextTick()
}

function toggleHidden(i: number) {
  const next = [...blocks.value]
  next[i] = toggleHiddenBlock(next[i] ?? '')
  commit(next)
}

const tool = (before: string, after = '') => editor?.insert(before, after)

/** Clicks in rendered text: links, dice, tables, pickers, clocks, tasks. Returns true when it handled the click. */
async function onRenderedClick(e: MouseEvent, blockIndex: number | null): Promise<boolean> {
  const target = e.target as HTMLElement
  const change = (fn: (text: string) => string) => {
    if (props.readonly) return
    if (blockIndex === null) emit('update:modelValue', fn(props.modelValue))
    else { const next = [...blocks.value]; next[blockIndex] = fn(next[blockIndex] ?? ''); commit(next) }
  }
  const link = target.closest<HTMLElement>('.ref')
  if (link) {
    e.preventDefault()
    const type = link.dataset.refType ?? '', name = link.dataset.refName ?? ''
    if (isEntryTypeName(type)) {
      const found = await findEntryByName(props.campaignId, type, name)
      if (found) peek({ kind: 'entry', id: found.id })
      else notify(`No ${ENTRY_TYPE_INFO[type].label.toLowerCase()} named “${name}” in this campaign.`)
    } else {
      const rules = await rulesByName(name, type)
      if (rules) peek({ kind: 'rules', id: rules.id })
      else notify(`“${name}” is not in the compendium here yet.`)
    }
    return true
  }
  const widget = target.closest<HTMLElement>('.widget')
  if (widget) {
    e.preventDefault()
    const kind = widget.dataset.widget
    if (kind === 'dice') {
      const expr = widget.dataset.expr ?? 'd20'
      try { notify(`${widget.dataset.label ? `${widget.dataset.label}: ` : ''}${expr} → ${evaluateFormula(expr)}`, 'ok') } catch { notify(`“${expr}” is not a dice expression.`, 'error') }
    } else if (kind === 'choose') {
      const options = (widget.dataset.options ?? '').split('|').filter(Boolean)
      notify(options[Math.floor(Math.random() * options.length)] ?? 'Nothing to pick from', 'ok')
    } else if (kind === 'table') {
      const table = await findEntryByName(props.campaignId, 'random-table', widget.dataset.table ?? '')
      if (table?.type !== 'random-table' || !table.data.rows.length) notify(`No random table named “${widget.dataset.table}” with rows.`, 'error')
      else {
        const roll = evaluateFormula(table.data.die)
        const row = table.data.rows.find(r => roll >= r.min && roll <= r.max)
        notify(`${table.name} (${table.data.die} → ${roll}): ${row?.result ?? 'no row for that number'}`, 'ok', 12000)
      }
    } else if (kind === 'clock') {
      // Clock numbers count within what was rendered: a block in live mode, the whole text otherwise
      change(text => advanceClock(text, Number(widget.dataset.index ?? 0)))
    }
    return true
  }
  if (target instanceof HTMLInputElement && target.dataset.task !== undefined) {
    const n = Number(target.dataset.task)
    change(text => toggleTask(text, n))
    return true
  }
  return !!target.closest('a')
}

async function onBlockClick(e: MouseEvent, i: number) {
  if (!await onRenderedClick(e, i)) edit(i)
}

function print() {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) return
  w.document.write(`<title>StarTome</title><style>body{font:15px/1.6 Georgia,serif;max-width:720px;margin:2rem auto;color:#111}a{color:inherit;text-decoration:none}button{font:inherit;border:1px solid #999;border-radius:3px;background:none}h1,h2,h3{font-family:Georgia,serif}</style>${renderMarkdown(stripGmOnly(props.modelValue))}`)
  w.document.close()
  w.focus()
  w.print()
}

defineExpose({ finish })
</script>

<template>
  <div class="prose-editor">
    <div class="bar no-print">
      <div v-if="!readonly" class="seg" role="radiogroup" aria-label="Editor mode">
        <button v-for="m in (['live', 'source', 'read'] as const)" :key="m" class="seg-btn" :class="{ on: mode === m }" role="radio" :aria-checked="mode === m" @click="setMode(m)">{{ m === 'live' ? 'Live' : m === 'source' ? 'Source' : 'Read' }}</button>
      </div>
      <template v-if="shownMode !== 'read'">
        <button class="btn btn-ghost btn-icon" title="Bold (Ctrl+B)" @mousedown.prevent="tool('**', '**')"><Bold :size="15" /></button>
        <button class="btn btn-ghost btn-icon" title="Italic (Ctrl+I)" @mousedown.prevent="tool('*', '*')"><Italic :size="15" /></button>
        <button class="btn btn-ghost btn-icon" title="Heading" @mousedown.prevent="tool('## ')"><Heading2 :size="15" /></button>
        <button class="btn btn-ghost btn-icon" title="List" @mousedown.prevent="tool('- ')"><List :size="15" /></button>
        <button class="btn btn-ghost btn-icon" title="Task" @mousedown.prevent="tool('- [ ] ')"><ListChecks :size="15" /></button>
        <button class="btn btn-ghost btn-icon" title="Quote" @mousedown.prevent="tool('> ')"><Quote :size="15" /></button>
        <button class="btn btn-ghost insert" title="Link an entry: type {{" @mousedown.prevent="tool('{{', '}}')">{{ '{' + '{' }} link</button>
        <button class="btn btn-ghost insert" title="Dice: ::dice[2d6+3]. Also ::button[Label | 2d6], ::table[Name], ::choose[a | b], ::clock[Name | 0/6]" @mousedown.prevent="tool('::dice[', ']')">::dice</button>
      </template>
      <span class="grow" />
      <button class="btn btn-ghost btn-icon" title="Print or save as PDF (GM-only blocks left out)" @click="print"><Printer :size="15" /></button>
    </div>

    <CodeEditor v-if="shownMode === 'source'" :ref="setEditor" :model-value="modelValue" class="source" :placeholder="placeholder" :complete="complete" @update:model-value="emit('update:modelValue', $event)" />

    <!-- eslint-disable vue/no-v-html -- sanitised by renderMarkdown -->
    <div v-else-if="shownMode === 'read'" class="prose" @click="onRenderedClick($event, null)" v-html="whole" />

    <div v-else class="live">
      <template v-for="(b, i) in blocks" :key="i">
        <div v-if="editing === i" class="block editing">
          <CodeEditor :ref="setEditor" :model-value="draft" autofocus :complete="complete" :placeholder="placeholder" @update:model-value="onDraft" @blur="finish" @escape="finish" />
        </div>
        <div v-else class="block" :class="{ hidden: isHiddenBlock(b) }">
          <div class="prose" @click="onBlockClick($event, i)" v-html="rendered[i]" />
          <button class="gm btn btn-ghost btn-icon no-print" :title="isHiddenBlock(b) ? 'Unmark as GM only' : 'Mark as GM only (hidden from players)'" @click="toggleHidden(i)"><EyeOff :size="13" /></button>
        </div>
      </template>
      <button class="add no-print" @click="addBlock">{{ blocks.length ? '+ paragraph' : placeholder }}</button>
    </div>
  </div>
</template>

<style scoped>
.bar { display: flex; align-items: center; gap: 2px; padding: .25rem 0 .5rem; border-bottom: var(--frame); margin-bottom: .8rem; position: sticky; top: 0; background: var(--bg-raised); z-index: 2; }
.seg { display: flex; border: var(--frame); border-radius: var(--radius); overflow: hidden; margin-right: .6rem; }
.seg-btn { padding: .22rem .7rem; background: none; border: 0; color: var(--text-faint); font-size: .85rem; }
.seg-btn.on { background: var(--accent-soft); color: var(--accent); }
.insert { font-family: var(--font-mono); font-size: .78rem; padding: .3em .5em; }
.grow { flex: 1; }
.source { min-height: 300px; }
.block { position: relative; border-left: 2px solid transparent; padding: 0 1.8rem 0 .7rem; margin-left: -.7rem; border-radius: var(--radius); }
.block:hover { background: color-mix(in srgb, var(--bg-hover) 55%, transparent); }
.block.editing { border-left-color: var(--accent); background: var(--bg-sunken); padding: .4rem .7rem; margin-bottom: .6rem; }
.block .prose { cursor: text; }
.block .prose :deep(> :last-child) { margin-bottom: .7em; }
.gm { position: absolute; top: 0; right: 0; opacity: 0; }
.block:hover .gm, .block.hidden .gm { opacity: .7; }
.block.hidden .gm { color: var(--accent-2); }
.add { display: block; width: 100%; text-align: left; padding: .5rem .7rem; margin-left: -.7rem; background: none; border: 1px dashed transparent; border-radius: var(--radius); color: var(--text-faint); }
.add:hover { border-color: var(--line); color: var(--text-dim); }
</style>
