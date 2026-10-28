/**
 * Foundry description HTML → StarTome markdown.
 *
 * Runs inside the sync Web Worker, which has no DOMParser, so the HTML is read
 * with a small tokenizer that only understands the tag set Foundry's PF2e/SF2e
 * packs actually use (p, strong, em, hr, lists, tables, headings, spans).
 *
 * Enrichers are rewritten first:
 *   @UUID[…]{Label}          → {{kind: Name}}   (or the label if the target is not synced)
 *   @Check[reflex|dc:22|basic] → DC 22 basic Reflex
 *   @Damage[6d6[fire]]        → ::dice[6d6] fire
 *   @Template[burst|distance:20] → 20-foot burst
 *   @Localize[KEY]            → the text from the lang files
 *   [[/r 1d4]] [[/act x]]{L}  → ::dice[1d4] / L
 */

export interface TextContext {
  /** Kind and name of a compendium document, by its Foundry UUID. */
  resolveUuid: (uuid: string) => { kind: string; name: string } | null
  /** Text for a lang key, or null. */
  localize: (key: string) => string | null
  /** Called for every enricher that could not be fully converted. */
  onIssue?: (code: string, detail: string) => void
}

// ── Enrichers ──────────────────────────────────────────────────────────────

const SAVE_LABEL: Record<string, string> = { fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' }

/** Reads `[...]` starting at `start` (which points at '['), honouring nested brackets. */
function readBracket(s: string, start: number): { inner: string; end: number } | null {
  if (s[start] !== '[') return null
  let depth = 0
  for (let i = start; i < s.length; i++) {
    if (s[i] === '[') depth++
    else if (s[i] === ']') {
      depth--
      if (depth === 0) return { inner: s.slice(start + 1, i), end: i + 1 }
    }
  }
  return null
}

/** Reads an optional `{label}` right after position `start`. */
function readLabel(s: string, start: number): { label: string | null; end: number } {
  if (s[start] !== '{') return { label: null, end: start }
  let depth = 0
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) return { label: s.slice(start + 1, i), end: i + 1 }
    }
  }
  return { label: null, end: start }
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '[' || ch === '(') depth++
    if (ch === ']' || ch === ')') depth--
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
}

function parseParams(parts: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of parts) {
    const i = p.indexOf(':')
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim()
    else out[p.trim()] = ''
  }
  return out
}

function titleWord(s: string) {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function checkText(inner: string, label: string | null): string {
  if (label) return label
  const [type, ...rest] = inner.split('|')
  const p = parseParams(rest)
  const t = type.trim().toLowerCase()
  const dc = p.dc && /^\d+$/.test(p.dc) ? `DC ${p.dc} ` : ''
  const basic = 'basic' in p ? 'basic ' : ''
  // Like Foundry's own rendering: the surrounding text supplies "save"/"check"
  if (SAVE_LABEL[t]) return `${dc}${basic}${SAVE_LABEL[t]}`
  if (t === 'flat') return `${dc}flat check`
  return `${dc}${titleWord(t)}`
}

/** Makes Foundry roll-data formulas readable: (ceil(@actor.level/2)+2)d4 → (half level+2)d4 */
function readableFormula(f: string): string {
  return f
    .replace(/ceil\(@actor\.level\s*\/\s*2\)/g, 'half level')
    .replace(/floor\(@actor\.level\s*\/\s*2\)/g, 'half level')
    .replace(/@actor\.level/g, 'level')
    .replace(/@item\.(?:level|rank)/g, 'rank')
    .replace(/@actor\.abilities\.(\w+)\.mod/g, (_m, a) => `${a.toUpperCase()} mod`)
    .replace(/@[\w.]+/g, 'X')
}

/** A formula the dice roller can roll: dice expressions only, no Foundry roll data. */
function isRollable(formula: string) {
  return /^[\d\sd+\-*/()kKhHlL]+$/.test(formula) && /\d+d\d+|\bd\d+/.test(formula)
}

function damageText(raw: string, label: string | null, ctx: TextContext): string {
  // "1d6[acid]|options:area-damage" — options after the first top-level | only tune Foundry's roll
  const inner = splitTopLevel(raw, '|')[0]
  const parts = splitTopLevel(inner, ',').map(part => {
    const m = part.trim().match(/^(.*?)\[([^\]]*)\]$/)
    if (!m) return { formula: part.trim(), types: [] as string[] }
    return { formula: m[1].trim(), types: m[2].split(',').map(t => t.trim()).filter(Boolean) }
  })
  const rendered = parts.map(({ formula, types }) => {
    let f = formula
    while (/^\(.*\)$/.test(f) && splitTopLevel(f.slice(1, -1), ',').length === 1 && balanced(f.slice(1, -1))) f = f.slice(1, -1)
    const typeText = types.filter(t => !t.startsWith('@')).map(t => t === 'untyped' ? '' : t).filter(Boolean).join(' ')
    if (types.some(t => t.startsWith('@'))) ctx.onIssue?.('damage-dynamic-type', inner)
    const roll = /^\d+$/.test(f.trim()) ? f.trim()
      : isRollable(f) ? `::dice[${f.replace(/\s+/g, '')}]`
      : (ctx.onIssue?.('damage-formula', f), readableFormula(f))
    return `${roll}${typeText ? ` ${typeText}` : ''}`
  })
  if (label && parts.length === 1 && isRollable(stripParens(parts[0].formula))) return `::button[${label} | ${stripParens(parts[0].formula)}]`
  return rendered.join(' plus ')
}

function stripParens(f: string) {
  let s = f.trim()
  while (/^\(.*\)$/.test(s) && balanced(s.slice(1, -1))) s = s.slice(1, -1)
  return s
}

function balanced(s: string) {
  let d = 0
  for (const ch of s) {
    if (ch === '(') d++
    if (ch === ')') { d--; if (d < 0) return false }
  }
  return d === 0
}

function templateText(inner: string, label: string | null): string {
  if (label) return label
  const parts = inner.split('|')
  const p = parseParams(parts)
  const type = p.type || parts[0].trim()
  const distance = p.distance
  return distance ? `${distance}-foot ${type}` : type
}

function uuidText(uuid: string, label: string | null, ctx: TextContext): string {
  const target = ctx.resolveUuid(uuid.trim())
  if (target) {
    const ref = `{{${target.kind}: ${target.name}}}`
    if (!label || label.toLowerCase() === target.name.toLowerCase()) return ref
    // "Frightened 1" → {{condition: Frightened}} 1; other labels stay plain text
    if (label.toLowerCase().startsWith(target.name.toLowerCase())) return ref + label.slice(target.name.length)
    return label
  }
  if (label) return label
  ctx.onIssue?.('uuid-unresolved', uuid)
  return uuid.split('.').at(-1) ?? uuid
}

function inlineRollText(cmd: string, body: string, label: string | null): string {
  if (cmd === 'act') return label ?? titleWord(body.split(/\s+/)[0] ?? '')
  const formula = body.split('#')[0].trim().split(/\s+/)[0] ?? ''
  if (isRollable(formula)) return label && label !== formula ? `::button[${label} | ${formula}]` : `::dice[${formula}]`
  return label ?? readableFormula(formula)
}

/** Rewrites enrichers and inline rolls into StarTome markdown syntax. */
export function convertEnrichers(text: string, ctx: TextContext, depth = 0): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    // Inline rolls: [[/r 1d4 #note]]{label}
    if (text.startsWith('[[/', i)) {
      const close = text.indexOf(']]', i)
      if (close > 0) {
        const body = text.slice(i + 3, close)
        const sp = body.search(/\s/)
        const cmd = (sp < 0 ? body : body.slice(0, sp)).toLowerCase()
        const rest = sp < 0 ? '' : body.slice(sp + 1)
        const { label, end } = readLabel(text, close + 2)
        out += inlineRollText(cmd, rest, label)
        i = end
        continue
      }
    }
    if (text[i] === '@') {
      const m = text.slice(i).match(/^@(\w+)\[/)
      if (m) {
        const br = readBracket(text, i + m[0].length - 1)
        if (br) {
          const { label, end } = readLabel(text, br.end)
          const kind = m[1]
          let rep: string
          switch (kind) {
            case 'UUID': case 'Compendium': rep = uuidText(br.inner, label, ctx); break
            case 'Check': rep = checkText(br.inner, label); break
            case 'Damage': rep = damageText(br.inner, label, ctx); break
            case 'Template': rep = templateText(br.inner, label); break
            case 'Localize': {
              const t = ctx.localize(br.inner.trim())
              if (t === null) ctx.onIssue?.('localize-missing', br.inner)
              rep = t === null ? (label ?? '') : depth < 3 ? convertEnrichers(t, ctx, depth + 1) : t
              break
            }
            case 'Embed': rep = label ?? uuidText(br.inner.split(/\s+/)[0], null, ctx); break
            default:
              ctx.onIssue?.('enricher-unknown', kind)
              rep = label ?? ''
          }
          out += rep
          i = end
          continue
        }
      }
    }
    out += text[i]
    i++
  }
  return out
}

// ── HTML → markdown ────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', minus: '−', deg: '°', frac12: '½', frac14: '¼', frac34: '¾',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

const GLYPHS: Record<string, string> = {
  '1': '◆', a: '◆', '2': '◆◆', d: '◆◆', '3': '◆◆◆', t: '◆◆◆', r: '↺', f: '◇', '1 – 3': '◆ to ◆◆◆', '1 - 3': '◆ to ◆◆◆',
}

export function glyphFor(code: string): string {
  return GLYPHS[code.trim().toLowerCase()] ?? code.trim()
}

type Token = { type: 'text'; text: string } | { type: 'open' | 'close' | 'void'; tag: string; attrs: string }

function tokenize(html: string): Token[] {
  const tokens: Token[] = []
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|<!--[\s\S]*?-->/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m.index > last) tokens.push({ type: 'text', text: html.slice(last, m.index) })
    last = re.lastIndex
    if (!m[2]) continue // comment
    const tag = m[2].toLowerCase()
    if (m[1]) tokens.push({ type: 'close', tag, attrs: '' })
    else if (m[4] || tag === 'br' || tag === 'hr' || tag === 'img') tokens.push({ type: 'void', tag, attrs: m[3] })
    else tokens.push({ type: 'open', tag, attrs: m[3] })
  }
  if (last < html.length) tokens.push({ type: 'text', text: html.slice(last) })
  return tokens
}

const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'blockquote', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** Converts Foundry's description HTML (enrichers already rewritten) to markdown. */
export function htmlToMarkdown(html: string): string {
  const tokens = tokenize(html)
  const blocks: string[] = []
  let line = ''
  const lists: { ordered: boolean; n: number }[] = []
  let table: string[][] | null = null
  let row: string[] | null = null
  let cell: string | null = null
  let headerRows = 0
  let inHead = false
  let quote = false
  let rowIsHeader = false
  const spanStack: boolean[] = []   // true when the span is an action glyph

  const flush = () => {
    const t = line.replace(/[ \t]+/g, ' ').trim()
    if (t) blocks.push(quote ? t.split('\n').map(l => `> ${l}`).join('\n') : t)
    line = ''
  }
  const write = (s: string) => {
    if (cell !== null) cell += s
    else line += s
  }

  for (const tok of tokens) {
    if (tok.type === 'text') {
      const text = decodeEntities(tok.text).replace(/\s+/g, ' ')
      if (spanStack.at(-1)) write(glyphFor(text))
      else write(text)
      continue
    }
    const { tag } = tok
    if (tok.type === 'void') {
      if (tag === 'br') write(cell !== null ? ' ' : '  \n')
      else if (tag === 'hr') { flush(); blocks.push('---') }
      continue
    }
    const open = tok.type === 'open'
    switch (tag) {
      case 'strong': case 'b': write(open ? B_OPEN : B_CLOSE); break
      case 'em': case 'i': write(open ? I_OPEN : I_CLOSE); break
      case 's': case 'del': write('~~'); break
      case 'code': write('`'); break
      case 'span': {
        if (open) spanStack.push(/action-glyph/.test(tok.attrs))
        else spanStack.pop()
        break
      }
      case 'ul': case 'ol':
        if (open) { flush(); lists.push({ ordered: tag === 'ol', n: 0 }) }
        else { flush(); lists.pop() }
        break
      case 'li':
        if (open) {
          flush()
          const l = lists.at(-1)
          if (l) l.n++
          line = `${'  '.repeat(Math.max(0, lists.length - 1))}${l?.ordered ? `${l.n}.` : '-'} `
        } else flush()
        break
      case 'table':
        if (open) { flush(); table = []; headerRows = 0 }
        else if (table) {
          if (table.length) {
            const cols = Math.max(...table.map(r => r.length))
            const pad = (r: string[]) => [...r, ...Array(cols - r.length).fill('')]
            const header = headerRows ? table[0] : Array(cols).fill('')
            const body = headerRows ? table.slice(1) : table
            const rows = [pad(header), Array(cols).fill('---'), ...body.map(pad)]
            blocks.push(rows.map(r => `| ${r.map(c => c.replace(/\|/g, '\\|')).join(' | ')} |`).join('\n'))
          }
          table = null
        }
        break
      case 'thead': inHead = open; break
      case 'tr':
        if (open) row = []
        else if (row && table) { if (inHead || (row.length && table.length === 0 && headerRows === 0 && rowIsHeader)) headerRows++; table.push(row); row = null }
        break
      case 'th': case 'td':
        if (open) { cell = ''; if (tag === 'th' && table && table.length === 0) rowIsHeader = true }
        else if (row && cell !== null) { row.push(cell.replace(/\s+/g, ' ').trim()); cell = null }
        break
      case 'blockquote':
        flush(); quote = open
        break
      default:
        if (/^h[1-6]$/.test(tag)) {
          if (open) { flush(); line = `${'#'.repeat(Math.min(6, Number(tag[1]) + 1))} ` }
          else flush()
        } else if (BLOCK.has(tag)) flush()
    }
    if (tag === 'table' && !open) rowIsHeader = false
  }
  flush()
  return fixEmphasis(blocks.join('\n\n')).trim()
}

// Emphasis is emitted as markers and resolved at the end, so whitespace inside
// <strong>Trigger </strong> moves outside the ** and empty pairs disappear.
const B_OPEN = '\u0001', B_CLOSE = '\u0002', I_OPEN = '\u0003', I_CLOSE = '\u0004'

function fixEmphasis(s: string): string {
  return s
    .replace(/\u0001(\s*)\u0002/g, '$1').replace(/\u0003(\s*)\u0004/g, '$1')
    .replace(/\u0001([ \t]*)/g, '$1**').replace(/([ \t]*)\u0002/g, '**$1')
    .replace(/\u0003([ \t]*)/g, '$1*').replace(/([ \t]*)\u0004/g, '*$1')
}

/** Full pipeline for one description: lang lookup + enrichers, then HTML → markdown. */
export function foundryText(html: string | null | undefined, ctx: TextContext): string {
  if (!html) return ''
  return htmlToMarkdown(convertEnrichers(html, ctx))
}

/** Plain one-line text (for fields like "trigger" or "disable" headers). */
export function foundryInline(html: string | null | undefined, ctx: TextContext): string {
  return foundryText(html, ctx).replace(/\n+/g, ' ').trim()
}
