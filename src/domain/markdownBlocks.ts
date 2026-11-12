/**
 * Markdown as blocks, for the live editor: a block is what a blank line
 * separates (a paragraph, a list, a quote, a fenced code block as a whole).
 * Plus the small edits rendered text can ask for: tick a task, advance a
 * clock, mark a block GM-only.
 */

const FENCE = /^\s{0,3}(```|~~~)/

export function splitBlocks(text: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false
  const flush = () => { if (current.length) { blocks.push(current.join('\n')); current = [] } }
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (FENCE.test(line)) inFence = !inFence
    if (!inFence && line.trim() === '') flush()
    else current.push(line)
  }
  flush()
  return blocks
}

export function joinBlocks(blocks: string[]): string {
  return blocks.map(b => b.replace(/\n+$/, '')).filter(b => b.trim() !== '').join('\n\n')
}

const HIDDEN = /^\s{0,3}>\s?\[!hidden\]/i

export function isHiddenBlock(block: string): boolean {
  return HIDDEN.test(block)
}

/** Wraps a block in a `> [!hidden]` callout, or takes it out of one. */
export function toggleHiddenBlock(block: string): string {
  const lines = block.split('\n')
  if (isHiddenBlock(block)) {
    const title = (lines[0] ?? '').replace(HIDDEN, '').trim()
    const rest = lines.slice(1).map(l => l.replace(/^\s{0,3}>\s?/, ''))
    return [...(title ? [`**${title}**`] : []), ...rest].join('\n')
  }
  return ['> [!hidden]', ...lines.map(l => `> ${l}`)].join('\n')
}

/** Ticks or unticks the n-th task-list item (0-based) of a text. */
export function toggleTask(text: string, index: number): string {
  let n = -1
  return text.replace(/^(\s*(?:[-*+]|\d+\.)\s+\[)([ xX])(\])/gm, (all, a: string, mark: string, c: string) => (++n === index ? `${a}${mark === ' ' ? 'x' : ' '}${c}` : all))
}

/** Advances the n-th `::clock[Name | 2/6]` by one segment; a full clock starts over. */
export function advanceClock(text: string, index: number): string {
  let n = -1
  return text.replace(/::clock\[([^\]|]*)\|\s*(\d+)\s*\/\s*(\d+)\s*\]/g, (all, name: string, filled: string, total: string) => {
    if (++n !== index) return all
    const t = Math.max(1, Number(total)), f = Number(filled)
    return `::clock[${name.trim()} | ${f >= t ? 0 : f + 1}/${t}]`
  })
}

/** Done and total task-list items, or null when a text has none (a quest's objectives). */
export function taskProgress(text: string): { done: number; total: number } | null {
  const marks = [...text.matchAll(/^\s*(?:[-*+]|\d+\.)\s+\[([ xX])\]/gm)].map(m => m[1])
  return marks.length ? { done: marks.filter(m => m !== ' ').length, total: marks.length } : null
}
