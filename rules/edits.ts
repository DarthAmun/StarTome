/**
 * Local edits overlay for synced entries.
 *
 * A Foundry entry's rules fields belong to the sync. When the user edits one,
 * the new value is stored in `localEdits` under its dotted path ('hp',
 * 'saves.fort', 'strikes') and laid over the upstream value on read. A re-sync
 * replaces the upstream fields but keeps the overlay (FORK_PLAN.md §7.6).
 */
import type { RulesEntity } from '~/types/rules'

/** Fields the user owns on every entry; never written by sync, never overlaid. */
export const USER_OWNED_FIELDS = new Set([
  'img', 'tokenImg', 'gmNotes', 'tags', 'isFavorite', 'unidentified', 'legacy', 'localEdits',
])

/** Bookkeeping fields that are neither edited by the user nor overlaid. */
const SYSTEM_FIELDS = new Set(['id', 'origin', 'kind', 'sortName', 'sourceRefs', 'upstream', 'createdAt', 'updatedAt'])

export function isOverlayPath(path: string): boolean {
  const head = path.split('.')[0]
  return !USER_OWNED_FIELDS.has(head) && !SYSTEM_FIELDS.has(head)
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: any = obj
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[key]
  }
  return cur
}

/** Returns a copy of `obj` with `path` set; only the objects along the path are cloned. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.')
  const base: any = Array.isArray(obj) ? [...obj] : { ...(obj as any) }
  base[head] = rest.length ? setPath(base[head] ?? {}, rest.join('.'), value) : value
  return base
}

/** The entry as the user sees it: upstream fields with local edits laid over. */
export function withLocalEdits<T extends RulesEntity>(entity: T): T {
  const edits = entity.localEdits
  if (!edits || !Object.keys(edits).length) return entity
  // Shorter paths first so 'saves' then 'saves.fort' compose correctly
  return Object.keys(edits)
    .sort((a, b) => a.split('.').length - b.split('.').length)
    .reduce<T>((acc, path) => setPath(acc, path, edits[path]), entity)
}

/** Paths in `localEdits` whose upstream value changed since the edit was made. */
export function conflictingEdits(before: RulesEntity, after: RulesEntity): string[] {
  return Object.keys(after.localEdits ?? {}).filter(
    path => JSON.stringify(getPath(before, path)) !== JSON.stringify(getPath(after, path)),
  )
}
