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
/** Inline widgets: ::dice[2d6+3], ::button[Label | 2d6], ::table[Name], ::choose[a | b], ::clock[Name | 2/6] */
const WIDGET = /::(dice|button|table|choose|clock)\[([^\]\n]*)\]/g

function widgetHtml(kind: string, args: string, clockIndex: number): string {
  const parts = args.split('|').map(p => p.trim())
  const first = parts[0] ?? ''
  if (kind === 'dice') return `<button class="widget" data-widget="dice" data-expr="${esc(first)}" title="Roll ${esc(first)}">⚄ ${esc(first)}</button>`
  if (kind === 'button') return `<button class="widget" data-widget="dice" data-expr="${esc(parts[1] ?? first)}" data-label="${esc(first)}" title="Roll ${esc(parts[1] ?? first)}">⚔ ${esc(first)}</button>`
  if (kind === 'table') return `<button class="widget" data-widget="table" data-table="${esc(first)}" title="Roll on ${esc(first)}">☰ ${esc(first)}</button>`
  if (kind === 'choose') return `<button class="widget" data-widget="choose" data-options="${esc(parts.filter(Boolean).join('|'))}" title="Pick one at random">✦ Pick (${parts.filter(Boolean).length})</button>`
  const [f, t] = (parts[1] ?? '0/4').split('/')
  const total = Math.min(Math.max(1, Number.parseInt(t ?? '4', 10) || 4), 12), filled = Math.min(Math.max(0, Number.parseInt(f ?? '0', 10) || 0), total)
  const pips = Array.from({ length: total }, (_x, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('')
  return `<button class="widget clock" data-widget="clock" data-index="${clockIndex}" title="${esc(first)}: ${filled}/${total}. Click to advance">${esc(first)} <span class="pips">${pips}</span></button>`
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface RenderOptions {
  /** Says whether a reference has a target, so missing ones can be drawn as such. */
  resolves?: (type: string, name: string) => boolean
}

export function renderMarkdown(source: string, opts: RenderOptions = {}): string {
  // References are swapped for placeholders so markdown doesn't touch them, then put back as chips
  const refs: string[] = []
  let clocks = 0
  const hold = (html: string) => { refs.push(html); return `\u0001${refs.length - 1}\u0002` }
  const withWidgets = source.replace(WIDGET, (_all, kind: string, args: string) => hold(widgetHtml(kind, args, kind === 'clock' ? clocks++ : 0)))
  const text = withWidgets.replace(REF, (_all, rawType: string, name: string, _state: string | undefined, options: string | undefined) => {
    const type = ALIASES[rawType.toLowerCase()] ?? rawType.toLowerCase()
    if (type === 'roll') return hold(widgetHtml('dice', name, 0))
    const color = isEntryType(type) ? ENTRY_TYPE_INFO[type].color : 'var(--accent)'
    const missing = opts.resolves && !opts.resolves(type, name.trim()) ? ' unresolved' : ''
    // `| entry` asks for the entry's card instead of a plain link; the editor fills the card in
    const embed = !missing && /(^|,)\s*entry\s*(,|$)/.test(options ?? '') ? ' embed' : ''
    refs.push(`<a class="ref${missing}${embed}" data-ref-type="${esc(type)}" data-ref-name="${esc(name.trim())}" style="--ref-color:${color}">${esc(name.trim())}</a>`)
    return `\u0001${refs.length - 1}\u0002`
  })
  let html = md.render(text)
  html = html.replace(/\u0001(\d+)\u0002/g, (_m, i: string) => refs[Number(i)] ?? '')
  // Task lists: `- [ ]` and `- [x]` become checkboxes that can be ticked in place
  let task = 0
  html = html.replace(/<li>(\s*(?:<p>)?)\[([ xX])\]\s/g, (_m, open: string, mark: string) => `<li class="task">${open}<input type="checkbox" data-task="${task++}"${mark === ' ' ? '' : ' checked'}> `)
  html = html.replace(/<blockquote>\s*<p>\[!hidden\]\s*([^<\n]*)(?:<br>)?/gi, (_m, title: string) => `<blockquote class="gm-only"><p>${title ? `<strong>${title}</strong><br>` : ''}`)
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-ref-type', 'data-ref-name', 'style', 'data-widget', 'data-expr', 'data-label', 'data-table', 'data-options', 'data-index', 'data-task'] })
}

/** The first plain words of a markdown text, for lists and previews. */
export function excerpt(source: string, max = 160): string {
  const plain = source
    .replace(/^\s*>\s*\[!hidden\][\s\S]*?(?=\n[^>]|\n\n|$)/gim, '')
    .replace(REF, (_a, _t, name: string) => name.trim())
    .replace(/[#*_`>~-]+/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim()
  return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain
}
