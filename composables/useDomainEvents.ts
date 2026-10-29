/**
 * Small in-app event bus between repositories (FORK_PLAN §14 ARCH-05). The lore
 * repository says what happened ("a quest was completed"); the party
 * repository decides what that means (milestone prompt, quest XP). Lore no
 * longer imports the party, so the two don't call each other in a circle.
 */
export interface DomainEvents {
  questCompleted: { campaignId: number; questId: number; name: string; milestone: boolean }
}

type Listener<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => void | Promise<void>

const listeners: { [K in keyof DomainEvents]?: Set<Listener<K>> } = {}

export function onDomainEvent<K extends keyof DomainEvents>(type: K, listener: Listener<K>): () => void {
  const set = ((listeners as Record<string, Set<unknown>>)[type] ??= new Set()) as Set<Listener<K>>
  set.add(listener)
  return () => { set.delete(listener) }
}

/** Runs every listener and waits for them, so callers (and tests) see the effects. */
export async function emitDomainEvent<K extends keyof DomainEvents>(type: K, payload: DomainEvents[K]) {
  for (const listener of (listeners[type] ?? []) as Set<Listener<K>>) await listener(payload)
}
