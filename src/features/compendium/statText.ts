/** Wording shared by the stat block's parts. */
import type { Resistance, Sense, Spell, Spellcasting, Weakness } from '@/domain/rules/types'
import { renderMarkdown } from '@/ui/markdown'

/** Stat-block text: references become links, `::dice[…]` becomes a roll button, `> [!hidden]` a GM-only box. */
export function md(text: string): string {
  return renderMarkdown(text)
}

export function humanize(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  return `${n}${teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

export const zonesText = (n: number) => `${n} zone${n === 1 ? '' : 's'}`

export function formatSense(s: Sense): string {
  return `${s.type}${s.acuity ? ` (${s.acuity})` : ''}${s.range ? ` ${s.range} feet` : ''}`
}

export function formatIwr(w: Weakness | Resistance): string {
  const except = 'except' in w && w.except?.length ? ` (except ${w.except.join(', ')})` : ''
  return `${w.type} ${w.value}${except}${w.note ? ` (${w.note})` : ''}`
}

export function formatDefense(d: NonNullable<Spell['defense']>): string {
  if ('ac' in d) return 'AC'
  return `${d.basic ? 'basic ' : ''}${{ fort: 'Fortitude', ref: 'Reflex', will: 'Will' }[d.save]}`
}

/** A caster's spells by rank, highest first; cantrips last. */
export function spellsByRank(sc: Spellcasting): { label: string; spells: Spellcasting['spells'] }[] {
  const groups = new Map<number, Spellcasting['spells']>()
  for (const s of sc.spells) {
    const r = s.heightenedTo ?? s.rank
    groups.set(r, [...(groups.get(r) ?? []), s])
  }
  return [...groups.entries()].sort(([a], [b]) => b - a).map(([rank, spells]) => ({ label: rank === 0 ? 'Cantrips' : ordinal(rank), spells }))
}
