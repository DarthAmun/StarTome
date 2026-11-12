<template>
  <div ref="host" class="cme" :class="{ 'cme--fill': fill, 'cme--single': singleLine }" />
</template>

<script setup lang="ts">
/**
 * A Markdown text editor (CodeMirror 6) in place of a textarea: undo that
 * covers toolbar inserts, Markdown and `{{type: name}}` highlighting, Enter
 * continuing lists, Tab / Shift+Tab indenting, Ctrl+B / Ctrl+I, spellcheck,
 * and `{{` link completion from the caller's `complete`.
 *
 * - v-model is the text; outside changes replace the document.
 * - `fill`: takes its parent's height and scrolls; else it grows with the text.
 * - Escape (with no completion open) emits `escape`; leaving emits `blur`.
 * - `singleLine`: a one-line field (it still wraps on screen): no line
 *   breaks (pasted ones become spaces), Enter leaves it, the UI font.
 * - Exposes focus(), insert(before, after) (wraps the selection) and view.
 */
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { Compartment, EditorSelection, EditorState, Prec, type Extension } from '@codemirror/state'
import {
  Decoration, EditorView, keymap, MatchDecorator, placeholder as placeholderExt, tooltips, ViewPlugin, type DecorationSet, type ViewUpdate,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from '@codemirror/commands'
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { markdown, markdownKeymap } from '@codemirror/lang-markdown'
import {
  autocompletion, completionKeymap, completionStatus, type Completion, type CompletionContext, type CompletionResult,
} from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'

export interface EditorCompletion { label: string; detail?: string; apply: string; color?: string }
export interface EditorCompletions { from: number; items: EditorCompletion[] }
/** Sync when it can be: the list then appears with the keystroke instead of a beat later */
export type CompleteFn = (before: string) => EditorCompletions | null | Promise<EditorCompletions | null>

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  readonly?: boolean
  autofocus?: boolean
  fill?: boolean
  singleLine?: boolean
  complete?: CompleteFn
}>(), { placeholder: '', readonly: false, autofocus: false, fill: false, singleLine: false })
const emit = defineEmits<{ 'update:modelValue': [text: string]; blur: []; escape: [] }>()

const host = shallowRef<HTMLDivElement | null>(null)
const view = shallowRef<EditorView | null>(null)
const editable = new Compartment()

// ── Look: our tokens, so both themes follow ─────────────────────────────────
const theme = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'transparent', fontSize: '.95rem' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.75' },
  '.cm-content': { caretColor: 'var(--accent)', padding: '0' },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--accent-soft)' },
  '.cm-placeholder': { color: 'var(--text-faint)' },
  '.cm-ref': { color: 'var(--accent)', backgroundColor: 'var(--accent-soft)', borderRadius: '3px' },
  // The completion list (in body, see tooltips()): CodeMirror's own theme would win over plain CSS
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--bg-raised)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)', overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-ui)', maxHeight: '260px', minWidth: '240px', padding: '4px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: 'var(--radius)',
    color: 'var(--text)', fontSize: '12.5px', lineHeight: '1.4',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent-soft)', color: 'var(--text)' },
  '.cm-completionLabel': { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis' },
  '.cm-completionDetail': {
    marginLeft: 'auto', fontStyle: 'normal', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-faint)',
  },
})

const markdownStyle = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontSize: '1.25em', color: 'var(--text)' },
  { tag: t.heading2, fontWeight: '700', fontSize: '1.12em', color: 'var(--text)' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '700', color: 'var(--text)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--accent)' },
  { tag: t.monospace, color: 'var(--accent)' },
  { tag: t.quote, color: 'var(--text-dim)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--text-faint)' },
  { tag: t.list, color: 'var(--text-dim)' },
])

// `{{type: name}}` and `{{type: name | entry}}` links stand out
const refMatcher = new MatchDecorator({ regexp: /\{\{[^{}\n]+\}\}/g, decoration: Decoration.mark({ class: 'cm-ref' }) })
const refHighlight = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(v: EditorView) { this.decorations = refMatcher.createDeco(v) }
  update(u: ViewUpdate) { this.decorations = refMatcher.updateDeco(u, this.decorations) }
}, { decorations: v => v.decorations })

// ── Editing commands ────────────────────────────────────────────────────────
function wrap(v: EditorView, before: string, after: string): boolean {
  if (v.state.readOnly) return false
  v.dispatch(v.state.changeByRange(range => {
    const text = v.state.sliceDoc(range.from, range.to)
    return {
      changes: { from: range.from, to: range.to, insert: before + text + after },
      range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length),
    }
  }), { scrollIntoView: true, userEvent: 'input' })
  return true
}

// ── Link completion: the caller decides what an open `{{` offers ────────────
function completionSource(ctx: CompletionContext): CompletionResult | null | Promise<CompletionResult | null> {
  if (!props.complete) return null
  const line = ctx.state.doc.lineAt(ctx.pos)
  const found = props.complete(ctx.state.sliceDoc(line.from, ctx.pos))
  return found instanceof Promise ? found.then(f => toResult(ctx, line.from, f)) : toResult(ctx, line.from, found)
}

function toResult(ctx: CompletionContext, lineFrom: number, found: EditorCompletions | null): CompletionResult | null {
  if (!found || ctx.aborted) return null
  // A link typed inside a toolbar-made `{{type: }}`: replace its closing braces too
  const closes = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2) === '}}'
  return {
    from: lineFrom + found.from,
    to: closes ? ctx.pos + 2 : ctx.pos,
    // Already filtered and ranked by the caller
    filter: false,
    options: found.items.map((item): Completion => ({
      label: item.label, detail: item.detail, apply: item.apply,
      type: item.color ? `ref-${item.color}` : undefined,
    })),
  }
}

/** A coloured dot per entry type, the colour carried in the option's type */
const dot = {
  render(completion: Completion) {
    const color = completion.type?.startsWith('ref-') ? completion.type.slice(4) : null
    if (!color) return null
    const el = document.createElement('span')
    el.className = 'cme-dot'
    el.style.background = color
    return el
  },
  position: 20,
}

/** One-line fields: line breaks become spaces, Enter (with no list open) leaves the field */
function singleLineExtensions(): Extension[] {
  return [
    EditorState.transactionFilter.of(tr => {
      if (!tr.docChanged || tr.newDoc.lines === 1) return tr
      const text = tr.newDoc.toString().replace(/\s*\n\s*/g, ' ')
      return [{ changes: { from: 0, to: tr.startState.doc.length, insert: text }, selection: { anchor: Math.min(tr.newSelection.main.head, text.length) } }]
    }),
    Prec.highest(keymap.of([{
      key: 'Enter',
      run: v => { if (completionStatus(v.state) === 'active') return false; v.contentDOM.blur(); return true },
    }])),
  ]
}

function extensions(): Extension[] {
  return [
    ...(props.singleLine ? singleLineExtensions() : []),
    history(),
    markdown(),
    syntaxHighlighting(markdownStyle),
    refHighlight,
    EditorView.lineWrapping,
    indentUnit.of('\t'),
    EditorState.tabSize.of(4),
    placeholderExt(props.placeholder),
    EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'on', autocapitalize: 'sentences' }),
    editable.of([EditorView.editable.of(!props.readonly), EditorState.readOnly.of(props.readonly)]),
    // In body: a panel's overflow or a transformed board can't clip or shift the list
    tooltips({ parent: document.body }),
    autocompletion({ override: [completionSource], activateOnTyping: true, icons: false, addToOptions: [dot], closeOnBlur: true }),
    keymap.of([
      { key: 'Mod-b', run: v => wrap(v, '**', '**') },
      { key: 'Mod-i', run: v => wrap(v, '*', '*') },
      ...completionKeymap,
      ...markdownKeymap,
      { key: 'Tab', run: indentMore, shift: indentLess },
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    // Escape leaves the editor (a mixed-mode block) unless it closes a completion first;
    // ahead of every keymap, which would otherwise take it
    Prec.highest(EditorView.domEventHandlers({
      keydown(e, v) {
        // Only a list on screen ("active") keeps Escape; a query still running ("pending") doesn't
        if (e.key !== 'Escape' || completionStatus(v.state) === 'active') return false
        emit('escape')
        return true
      },
    })),
    EditorView.updateListener.of(u => {
      if (u.docChanged) emit('update:modelValue', u.state.doc.toString())
      if (u.focusChanged && !u.view.hasFocus) emit('blur')
    }),
    theme,
  ]
}

onMounted(() => {
  view.value = new EditorView({
    parent: host.value!,
    state: EditorState.create({ doc: props.modelValue ?? '', extensions: extensions() }),
  })
  if (props.autofocus) focus(true)
})

onBeforeUnmount(() => view.value?.destroy())

// Outside changes (a ticked task in the preview, another block, a reset) replace the text
watch(() => props.modelValue, (text) => {
  const v = view.value
  if (!v || text === v.state.doc.toString()) return
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text ?? '' } })
})

watch(() => props.readonly, (ro) => {
  view.value?.dispatch({ effects: editable.reconfigure([EditorView.editable.of(!ro), EditorState.readOnly.of(ro)]) })
})

/** Focus, with the cursor at the end when `toEnd` */
function focus(toEnd = false) {
  const v = view.value
  if (!v) return
  v.focus()
  if (toEnd) v.dispatch({ selection: { anchor: v.state.doc.length }, scrollIntoView: true })
}

/** Wraps the selection in before/after (or inserts both at the cursor), as one undo step */
function insert(before: string, after = '') {
  const v = view.value
  if (!v) return
  wrap(v, before, after)
  v.focus()
}

defineExpose({ focus, insert, view })
</script>

<style>
.cme { min-height: 30px; }
.cme--fill { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.cme--fill .cm-editor { flex: 1; min-height: 0; }
.cme--fill .cm-scroller { overflow-y: auto; }
.cme.cme--single .cm-scroller { font-family: inherit; line-height: 1.5; }

/* The completion list sits in body: above dialogs */
.cm-tooltip.cm-tooltip-autocomplete { z-index: 1000; }
.cme-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
</style>
