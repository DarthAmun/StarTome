/**
 * Shared date formatters. Replaces 5+ inline formatDate duplicates.
 */
export function useFormatters() {
  function formatDate(dt: string | undefined | null): string {
    if (!dt) return ''
    return new Date(dt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  function formatDateShort(dt: string | undefined | null): string {
    if (!dt) return ''
    const d = new Date(dt)
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
    if (diff === 0) return 'today'
    if (diff === 1) return 'yesterday'
    if (diff < 7) return `${diff}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  /** "today", "3d ago", "2w ago", "5mo ago", "2y ago" — for ages of any length. */
  function formatRelative(dt: string | undefined | null): string {
    if (!dt) return ''
    const d = Math.floor((Date.now() - new Date(dt).getTime()) / 86400000)
    if (!Number.isFinite(d)) return ''
    if (d < 1) return 'today'
    if (d < 7) return `${d}d ago`
    if (d < 60) return `${Math.round(d / 7)}w ago`
    if (d < 730) return `${Math.round(d / 30)}mo ago`
    return `${Math.round(d / 365)}y ago`
  }

  return { formatDate, formatDateShort, formatRelative }
}
