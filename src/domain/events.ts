/**
 * Domain events: how features tell each other what happened without calling
 * each other (REWORK_PLAN.md §8). The World says "a quest was completed";
 * the party decides what that means.
 */
export interface DomainEvents {
  questCompleted: { campaignId: string; entryId: string; name: string; milestone: boolean }
  entryDeleted: { campaignId: string; entryId: string }
}

type Handler<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => void
const handlers: { [K in keyof DomainEvents]?: Set<Handler<K>> } = {}

export function onDomainEvent<K extends keyof DomainEvents>(name: K, handler: Handler<K>): () => void {
  const set = (handlers[name] ??= new Set() as never) as Set<Handler<K>>
  set.add(handler)
  return () => { set.delete(handler) }
}

export function emitDomainEvent<K extends keyof DomainEvents>(name: K, payload: DomainEvents[K]): void {
  for (const h of (handlers[name] ?? []) as Set<Handler<K>>) h(payload)
}
