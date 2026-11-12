export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[-_./\\]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const m = a.length, n = b.length
  const prev = Array.from({ length: n + 1 }, (_, i) => i)
  const curr = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1])
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
}

/** Score two already-normalized strings. Use this in hot loops to avoid re-normalizing. */
export function scoreNormalized(f: string, r: string): number {
  if (!f || !r) return 0
  if (f === r) return 1.0
  if (r.includes(f) || f.includes(r)) return 0.85
  const fw = f.split(' ')
  const rwSet = new Set(r.split(' '))
  const overlap = fw.filter(w => rwSet.has(w)).length
  const wordScore = overlap > 0 ? (2 * overlap) / (fw.length + rwSet.size) : 0
  const maxLen = Math.max(f.length, r.length)
  const levScore = maxLen > 0 ? 1 - levenshtein(f, r) / maxLen : 0
  return Math.max(wordScore, levScore)
}

export function scorePair(rawFile: string, rawRecord: string): number {
  return scoreNormalized(normalize(rawFile), normalize(rawRecord))
}
