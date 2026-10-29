/**
 * Shared markdown-render pipeline: md.render → optional postProcess →
 * renderEntityRefs → DOMPurify.sanitize. Replaces the near-identical
 * pipeline in NoteEditor.vue and FieldMarkdown.vue.
 *
 * The two call sites differ enough (task lists, callouts, local-file URIs in
 * NoteEditor; bare safe render in FieldMarkdown) that the render function
 * takes an options bag rather than forcing one config on both.
 */
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { renderEntityRefs } from '~/composables/useEntityParser'

export interface RenderMarkdownOptions {
  /** Decorate entity refs with avatar/icon/color. */
  entityLookup?: (type: string, name: string) =>
    | { imageUrl?: string; iconHtml?: string; color?: string }
    | null
  /** Additional entity-ref types to recognize (e.g. system record types). */
  extraTypes?: string[]
  /** Hook to transform HTML after md.render (callouts, task lists, etc.). */
  postProcess?: (html: string) => string
  /** Enable newline-to-<br> and typographer substitutions. */
  rich?: boolean
  /** Whitelist checkbox attrs in the sanitizer (for task-list markers). */
  allowTaskLists?: boolean
  /** Widen the URI regexp so local-file:// image srcs survive. */
  allowLocalFileUris?: boolean
  /** Render {{type: name | entry}} or {{type: name | entry:attrKey}} as inline cards. */
  entryRenderer?: (type: string, name: string, attrKey?: string) => string | null
  /** Render {{type: name @ snapshotLabel}} as historical snapshot cards. */
  snapshotRenderer?: (type: string, name: string, snapshotLabel: string, attrKey?: string) => string | null
}

const mdStrict = new MarkdownIt({ html: false, linkify: true })
const mdRich = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
})

// Rich md also supports ~~strikethrough~~ and ==highlight== inline tokens.
mdRich.inline.ruler.after('backticks', 'strikethrough', (state: any, silent: boolean) => {
  const src = state.src
  const start = state.pos
  if (src.charCodeAt(start) !== 0x7E || src.charCodeAt(start + 1) !== 0x7E) return false
  const end = src.indexOf('~~', start + 2)
  if (end < 0 || end === start + 2) return false
  if (!silent) {
    const max = state.posMax
    state.push('s_open', 's', 1)
    state.pos = start + 2
    state.posMax = end
    state.md.inline.tokenize(state)
    state.push('s_close', 's', -1)
    state.pos = end + 2
    state.posMax = max
  } else {
    state.pos = end + 2
  }
  return true
})
mdRich.inline.ruler.after('backticks', 'highlight_mark', (state: any, silent: boolean) => {
  const src = state.src
  const start = state.pos
  if (src.charCodeAt(start) !== 0x3D || src.charCodeAt(start + 1) !== 0x3D) return false
  const end = src.indexOf('==', start + 2)
  if (end < 0 || end === start + 2) return false
  if (!silent) {
    const max = state.posMax
    state.push('mark_open', 'mark', 1)
    state.pos = start + 2
    state.posMax = end
    state.md.inline.tokenize(state)
    state.push('mark_close', 'mark', -1)
    state.pos = end + 2
    state.posMax = max
  } else {
    state.pos = end + 2
  }
  return true
})

const LOCAL_URI_RE =
  /^(?:(?:https?|local-file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

export function useEntityMarkdown() {
  function renderMarkdown(content: string, options: RenderMarkdownOptions = {}): string {
    if (!content) return ''
    const md = options.rich ? mdRich : mdStrict
    let html = md.render(content)
    if (options.postProcess) html = options.postProcess(html)
    html = renderEntityRefs(html, options.entityLookup, options.extraTypes, options.entryRenderer, options.snapshotRenderer)

    const addAttr = ['data-entity-type', 'data-entity-name', 'style', 'class', 'data-roll', 'data-snapshot-label']
    if (options.allowTaskLists) addAttr.push('type', 'checked', 'disabled')

    const sanitizeCfg: any = { ADD_ATTR: addAttr }
    if (options.allowLocalFileUris) {
      sanitizeCfg.ADD_URI_SAFE_ATTR = ['src']
      sanitizeCfg.ALLOWED_URI_REGEXP = LOCAL_URI_RE
    }
    return String(DOMPurify.sanitize(html, sanitizeCfg))
  }

  function renderInline(text: string, options: Pick<RenderMarkdownOptions, 'entityLookup' | 'extraTypes'> = {}): string {
    if (!text) return ''
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    const html = renderEntityRefs(escaped, options.entityLookup, options.extraTypes)
    return DOMPurify.sanitize(html, { ADD_ATTR: ['data-entity-type', 'data-entity-name', 'style', 'class'] })
  }

  return { renderMarkdown, renderInline }
}
