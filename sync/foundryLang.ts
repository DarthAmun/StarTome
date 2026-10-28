/** Foundry lang files (nested JSON) → lookup for @Localize[PF2E.Some.Key]. */

/** Later files override earlier ones, matching Foundry's load order (en, re-en, action-en, overrides). */
export function buildLocalizer(files: unknown[]): (key: string) => string | null {
  const flat = new Map<string, string>()
  const walk = (node: unknown, prefix: string) => {
    if (typeof node === 'string') { flat.set(prefix, node); return }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, prefix ? `${prefix}.${k}` : k)
    }
  }
  for (const f of files) walk(f, '')
  return key => flat.get(key) ?? null
}

/** Release lang files in the order Foundry loads them. */
export const LANG_ORDER = ['en.json', 're-en.json', 'action-en.json', 'kingmaker-en.json', 'sf2e-overrides-en.json']
