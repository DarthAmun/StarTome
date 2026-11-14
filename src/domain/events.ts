/**
 * Domain events: how features tell each other what happened without calling
 * each other (REWORK_PLAN.md §8). The World says "a quest was completed";
 * the party decides what that means.
 */
export interface DomainEvents {
  questCompleted: { campaignId: string; entryId: string; name: string; milestone: boolean }
  entryDeleted: { campaignId: string; entryId: string }
  /** A linked player's shared numbers changed (HP, conditions, AC …). */
  characterMirrored: { campaignId: string; characterId: string }
  /** A linked player rolled; `line` is the roll in words, for the combat log. */
  linkRoll: { campaignId: string; characterId: string | null; line: string }
  /** A linked player's initiative roll was written to that encounter's turn order. */
  linkInitiative: { campaignId: string; encounterId: string; characterId: string; total: number }
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
