/**
 * Names of grid squares, as on printed maps: letters for columns (A … Z, AA,
 * AB …), numbers for rows from 1. Column 0, row 0 is "A1". And how a grid looks.
 * Pure.
 */

/** 0 → "A", 25 → "Z", 26 → "AA", 701 → "ZZ", 702 → "AAA"; "" for a negative column. */
export function columnName(col: number): string {
  if (col < 0 || !Number.isFinite(col)) return ''
  let n = Math.floor(col) + 1, out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** "A1" for column 0, row 0; "" outside the grid (negative squares). */
export function cellName(col: number, row: number): string {
  if (col < 0 || row < 0) return ''
  return `${columnName(col)}${Math.floor(row) + 1}`
}

/**
 * How a map's grid looks, in the GM's and the players' window: its colour and
 * strength, a stronger line every 5 squares, square names along the edges
 * (rulers), and the square each token stands on beside its name.
 */
export interface GridLook {
  /** "#rrggbb". */
  color: string
  /** 0–1. */
  alpha: number
  /** A stronger line every 5 squares, like graph paper. */
  major: boolean
  /** Column letters along the top, row numbers down the left. */
  rulers: boolean
  /** "Goblin · D5" under each token. */
  tokenCells: boolean
}
export const DEFAULT_GRID_LOOK: GridLook = { color: '#eeeeee', alpha: 0.35, major: false, rulers: false, tokenCells: false }

/** "#c0ffee" → 0xc0ffee; the default grid colour for anything else. */
export function colorNumber(hex: string): number {
  return /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0xeeeeee
}

/** Every how many squares to name on a ruler so names `minPx` apart don't crowd: 1, 2, 5, 10, 20 … */
export function rulerStep(cellPx: number, minPx: number): number {
  for (const s of [1, 2, 5, 10, 20, 50, 100]) if (s * cellPx >= minPx) return s
  return 100
}
