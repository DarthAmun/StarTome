/**
 * Parses a JSON column. Rows still store many fields as JSON strings (a
 * leftover of DM's Tome's SQLite days); a missing or corrupt value gives the
 * fallback instead of throwing, so one bad row never breaks a whole list.
 * Already-parsed values (objects, arrays) pass through.
 */
export function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback
  if (typeof raw !== 'string') return raw as T
  try {
    const v = JSON.parse(raw)
    return v === null || v === undefined ? fallback : v as T
  } catch {
    return fallback
  }
}
