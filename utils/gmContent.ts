/**
 * GM-only markdown blocks.
 *
 * The editor's lock toggle wraps a block in a `> [!hidden]` callout. Anything
 * that leaves the GM's view (player-facing exports, handouts, later the quest
 * board and Play Buddy offers) must run the text through stripGmOnly() first —
 * the callout is only *styled* as hidden by the renderer, the text is still there.
 */

const HIDDEN_CALLOUT_RE = /^\s{0,3}>\s?\[!hidden\]/i
const QUOTE_LINE_RE = /^\s{0,3}>/
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/

/** True if the markdown contains at least one GM-only block outside code fences. */
export function hasGmOnly(markdown: string): boolean {
  return stripGmOnly(markdown) !== normalizeNewlines(markdown ?? '')
}

/**
 * Removes every `> [!hidden]` callout: the marker line plus all directly
 * following blockquote lines. Code fences are left untouched. Blank lines
 * left behind are collapsed so removed blocks leave no gap.
 */
export function stripGmOnly(markdown: string): string {
  if (!markdown) return ''
  const lines = normalizeNewlines(markdown).split('\n')
  const out: string[] = []
  let fence: string | null = null
  let inHidden = false
  let removed = false

  for (const line of lines) {
    if (inHidden) {
      if (QUOTE_LINE_RE.test(line)) continue
      inHidden = false
    }
    const fenceMatch = line.match(FENCE_RE)
    if (fenceMatch) {
      const marker = fenceMatch[1][0].repeat(3)
      if (fence === null) fence = marker
      else if (marker === fence) fence = null
      out.push(line)
      continue
    }
    if (fence === null && HIDDEN_CALLOUT_RE.test(line)) {
      inHidden = true
      removed = true
      continue
    }
    out.push(line)
  }

  if (!removed) return lines.join('\n')
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, lines.at(-1) === '' ? '\n' : '')
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, '\n')
}
