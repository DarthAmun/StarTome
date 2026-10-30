/**
 * Text ⇄ structure for the compendium editor. Each `parseX` accepts what a GM
 * would type ("fire 5, cold iron 10"); each `formatX` produces the text the
 * input shows, so a round trip is stable.
 */
import type { ClassFeatureRef, Resistance, Sense, Spellcasting, Weakness } from '~/types/rules'

/** Splits on commas (or another separator) outside parentheses. */
export function splitList(text: string, sep = ','): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim()).filter(Boolean)
}

export const parseList = (text: string) => splitList(text)
export const formatList = (list: string[] | undefined) => (list ?? []).join(', ')

/** Traits are lower-case slugs: "Versatile P" → "versatile-p". */
export function parseTraits(text: string): string[] {
  return splitList(text).map(t => t.toLowerCase().replace(/\s+/g, '-'))
}

/** "acrobatics +7, stealth 5" → { acrobatics: 7, stealth: 5 } */
export function parseNumberMap(text: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const part of splitList(text)) {
    const m = part.match(/^(.*?)\s*([+−-]?\d+)$/)
    if (!m || !m[1]) continue
    out[m[1].trim().toLowerCase()] = Number(m[2].replace('−', '-'))
  }
  return out
}

export function formatNumberMap(map: Record<string, number> | undefined, signedValues = false): string {
  return Object.entries(map ?? {})
    .map(([k, v]) => `${k} ${signedValues && v >= 0 ? '+' : ''}${v}`)
    .join(', ')
}

/** "fire 5, cold iron 10 (except adamantine)" → [{ type, value, note }] */
export function parseIwr(text: string): (Weakness & Resistance)[] {
  return splitList(text).map(part => {
    const m = part.match(/^(.*?)\s+(\d+)\s*(?:\((.*)\))?$/)
    if (!m) return { type: part, value: 0 }
    const entry: Weakness & Resistance = { type: m[1].trim(), value: Number(m[2]) }
    if (m[3]) {
      const except = m[3].match(/^except\s+(.*)$/i)
      if (except) entry.except = splitList(except[1])
      else entry.note = m[3].trim()
    }
    return entry
  })
}

export function formatIwrList(list: (Weakness | Resistance)[] | undefined): string {
  return (list ?? []).map(w => {
    const extra = 'except' in w && w.except?.length ? ` (except ${w.except.join(', ')})` : w.note ? ` (${w.note})` : ''
    return `${w.type}${w.value ? ` ${w.value}` : ''}${extra}`
  }).join(', ')
}

/** "darkvision, scent (imprecise) 30" → senses */
export function parseSenses(text: string): Sense[] {
  return splitList(text).map(part => {
    const m = part.match(/^(.*?)(?:\s*\((precise|imprecise|vague)\))?(?:\s+(\d+)(?:\s*f(?:ee)?t\.?)?)?$/i)
    if (!m) return { type: part }
    const sense: Sense = { type: m[1].trim().toLowerCase() }
    if (m[2]) sense.acuity = m[2].toLowerCase()
    if (m[3]) sense.range = Number(m[3])
    return sense
  })
}

export function formatSenses(list: Sense[] | undefined): string {
  return (list ?? []).map(s => `${s.type}${s.acuity ? ` (${s.acuity})` : ''}${s.range ? ` ${s.range}` : ''}`).join(', ')
}

/** "25, fly 40, swim 20" → { land: 25, fly: 40, swim: 20 } */
export function parseSpeeds(text: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const part of splitList(text)) {
    const m = part.match(/^(?:([a-z ]+?)\s+)?(\d+)(?:\s*f(?:ee)?t\.?)?$/i)
    if (m) out[(m[1] ?? 'land').trim().toLowerCase()] = Number(m[2])
  }
  return out
}

export function formatSpeeds(speeds: Record<string, number> | undefined): string {
  return Object.entries(speeds ?? {}).map(([k, v]) => k === 'land' ? String(v) : `${k} ${v}`).join(', ')
}

/** "3: fireball, haste; 1: fear (×2)" → spells with ranks. Known spell ids are kept by name. */
export function parseSpellList(text: string, previous: Spellcasting['spells'] = []): Spellcasting['spells'] {
  const byName = new Map(previous.map(s => [s.name.toLowerCase(), s]))
  const out: Spellcasting['spells'] = []
  for (const group of splitList(text, ';')) {
    const m = group.match(/^(cantrips?|\d+)(?:st|nd|rd|th)?\s*:\s*(.*)$/i)
    if (!m) continue
    const rank = /^cantrip/i.test(m[1]) ? 0 : Number(m[1])
    for (const raw of splitList(m[2])) {
      const um = raw.match(/^(.*?)\s*\(×\s*(\d+)\)$/)
      const name = (um ? um[1] : raw).trim()
      const prev = byName.get(name.toLowerCase())
      out.push({ ...(prev?.spellId ? { spellId: prev.spellId } : {}), name, rank, ...(um ? { uses: Number(um[2]) } : {}) })
    }
  }
  return out
}

export function formatSpellList(spells: Spellcasting['spells'] | undefined): string {
  const groups = new Map<number, string[]>()
  for (const s of spells ?? []) {
    const r = s.heightenedTo ?? s.rank
    groups.set(r, [...(groups.get(r) ?? []), s.uses ? `${s.name} (×${s.uses})` : s.name])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([r, names]) => `${r === 0 ? 'cantrips' : r}: ${names.join(', ')}`)
    .join('; ')
}

/** "key: value" lines → facts; values with commas become lists. */
export function parseFacts(text: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([^:]+?)\s*:\s*(.*)$/)
    if (!m || !m[2].trim()) continue
    const list = splitList(m[2])
    out[m[1].trim()] = list.length > 1 ? list : m[2].trim()
  }
  return out
}

export function formatFacts(facts: Record<string, string | number | string[]> | undefined): string {
  return Object.entries(facts ?? {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n')
}

/** Class features, one level per line: "1: Domain, Conduit Spellcasting" */
export function parseFeatures(text: string): ClassFeatureRef[] {
  const out: ClassFeatureRef[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d+)\s*(?:st|nd|rd|th)?\s*:\s*(.*)$/i)
    if (!m) continue
    for (const name of splitList(m[2])) out.push({ level: Number(m[1]), name })
  }
  return out.sort((a, b) => a.level - b.level)
}

export function formatFeatures(features: ClassFeatureRef[] | undefined): string {
  const byLevel = new Map<number, string[]>()
  for (const f of features ?? []) byLevel.set(f.level, [...(byLevel.get(f.level) ?? []), f.name])
  return [...byLevel.entries()].sort(([a], [b]) => a - b).map(([l, names]) => `${l}: ${names.join(', ')}`).join('\n')
}
