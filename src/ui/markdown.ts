/**
 * Markdown → safe HTML, with StarTome's additions: `{{type: Name}}` references
 * become clickable chips and `> [!hidden]` callouts are marked GM-only.
 * (The editor and the inline widgets arrive with the World phase.)
 */
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { ENTRY_TYPE_INFO, isEntryType } from './entryTypes'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

const REF = /\{\{([\w-]+):\s*([^@|}\n]+?)\s*(?:@\s*([^|}\n]+?)\s*)?(?:\|\s*([^}]*))?\}\}/g
const ALIASES: Record<string, string> = { table: 'random-table' }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface RenderOptions {
  /** Says whether a reference has a target, so missing ones can be drawn as such. */
  resolves?: (type: string, name: string) => boolean
}

export function renderMarkdown(source: string, opts: RenderOptions = {}): string {
  // References are swapped for placeholders so markdown doesn't touch them, then put back as chips
  const refs: string[] = []
  const text = source.replace(REF, (_all, rawType: string, name: string) => {
    const type = ALIASES[rawType.toLowerCase()] ?? rawType.toLowerCase()
    const color = isEntryType(type) ? ENTRY_TYPE_INFO[type].color : 'var(--accent)'
    const missing = opts.resolves && !opts.resolves(type, name.trim()) ? ' unresolved' : ''
    refs.push(`<a class="ref${missing}" data-ref-type="${esc(type)}" data-ref-name="${esc(name.trim())}" style="--ref-color:${color}">${esc(name.trim())}</a>`)
    return `\u0001${refs.length - 1}\u0002`
  })
  let html = md.render(text)
  html = html.replace(/\u0001(\d+)\u0002/g, (_m, i: string) => refs[Number(i)] ?? '')
  html = html.replace(/<blockquote>\s*<p>\[!hidden\]\s*([^<\n]*)(?:<br>)?/gi, (_m, title: string) => `<blockquote class="gm-only"><p>${title ? `<strong>${title}</strong><br>` : ''}`)
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-ref-type', 'data-ref-name', 'style'] })
}

/** The first plain words of a markdown text, for lists and previews. */
export function excerpt(source: string, max = 160): string {
  const plain = source
    .replace(/^\s*>\s*\[!hidden\][\s\S]*?(?=\n[^>]|\n\n|$)/gim, '')
    .replace(REF, (_a, _t, name: string) => name.trim())
    .replace(/[#*_`>~-]+/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim()
  return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain
}
