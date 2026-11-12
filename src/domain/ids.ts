/**
 * Ids: every row has a UUID v7 string. They sort by creation time and are
 * unique across devices, so merging a backup never renumbers anything
 * (REWORK_PLAN.md §9). Compendium entries keep their own ids.
 */

export type Id = string

let lastMs = 0
let seq = 0

/** A new UUID v7: 48 bits of time, then a counter and random bits so ids made in one millisecond still sort. */
export function newId(now: number = Date.now(), random: (bytes: Uint8Array<ArrayBuffer>) => void = b => { crypto.getRandomValues(b) }): Id {
  if (now === lastMs) seq = (seq + 1) & 0xfff
  else { lastMs = now; seq = 0 }
  const bytes = new Uint8Array(16)
  random(bytes)
  const ms = BigInt(now)
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn)
  bytes[6] = 0x70 | (seq >> 8)
  bytes[7] = seq & 0xff
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Ids for tests and conversions that must be repeatable: prefix-000001, prefix-000002 … */
export function sequentialIds(prefix = 'id'): () => Id {
  let n = 0
  return () => `${prefix}-${String(++n).padStart(6, '0')}`
}

export type IdSource = () => Id

export function nowIso(): string {
  return new Date().toISOString()
}
