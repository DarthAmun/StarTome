/** Matching image file names to entry names ("goblin_warrior.png" → "Goblin Warrior"). Pure. */

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\.[^.]+$/, '').replace(/[-_./\\]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_x, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] ?? 0 : 1 + Math.min(prev[j - 1] ?? 0, prev[j] ?? 0, curr[j - 1] ?? 0)
    }
    prev = curr
  }
  return prev[b.length] ?? 0
}

/** 0…1 for two normalized names: 1 the same, 0.85 one inside the other, else shared words or spelling distance. */
export function scoreNames(f: string, r: string): number {
  if (!f || !r) return 0
  if (f === r) return 1
  if (r.includes(f) || f.includes(r)) return 0.85
  const fw = f.split(' ')
  const rw = new Set(r.split(' '))
  const overlap = fw.filter(w => rw.has(w)).length
  const wordScore = overlap > 0 ? (2 * overlap) / (fw.length + rw.size) : 0
  const maxLen = Math.max(f.length, r.length)
  return Math.max(wordScore, maxLen > 0 ? 1 - levenshtein(f, r) / maxLen : 0)
}

export interface NameMatch { id: string | null; score: number }

/** A match counts from this score on; below it a file is left for you to place by hand. */
export const MATCH_MIN = 0.6
export const MATCH_SURE = 0.9

/** The best entry for a file name among entries whose names are already normalized. */
export function bestMatch(fileName: string, entries: { id: string; norm: string }[]): NameMatch {
  const f = normalizeName(fileName)
  let id: string | null = null, score = 0
  for (const e of entries) {
    const s = scoreNames(f, e.norm)
    if (s > score) { score = s; id = e.id; if (s === 1) break }
  }
  return score >= MATCH_MIN ? { id, score } : { id: null, score }
}
