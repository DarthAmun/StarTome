/**
 * Names of grid squares, as on printed maps: letters for columns (A … Z, AA,
 * AB …), numbers for rows from 1. Column 0, row 0 is "A1". Pure.
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
