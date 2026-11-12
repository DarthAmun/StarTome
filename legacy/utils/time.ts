export function fmtSeconds(s: number): string {
  if (!isFinite(s) || s < 0) return '—'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
