/**
 * The attribute draft of an entity editor (FORK_PLAN §14 BUG-08, REUSE-02).
 *
 * The draft follows the stored entity, so a change made elsewhere while the
 * page is open (a party level-up, the PC toggle, a map pin) shows up at once.
 * Only the keys the user edited are kept over it, and a save writes just those
 * keys onto the entity's current attributes — it never writes back a stale
 * copy of a field someone else changed.
 */
import { ref, watch, type Ref } from 'vue'
import type { Entity } from '~/composables/useEntities'
import type { EntityAttributes } from '~/types/entities'

type Attrs = Record<string, unknown>

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function useAttributeDraft(entity: Ref<Entity | null | undefined>, isHistory: () => boolean = () => false) {
  const draft = ref<EntityAttributes>({})
  // Keys edited since the last save (a removed key is kept as undefined)
  let dirty: Attrs = {}

  watch(() => entity.value?.attributes, (attrs) => {
    if (isHistory() || !attrs) return
    draft.value = { ...(attrs as Attrs), ...dirty } as EntityAttributes
  }, { deep: true })

  /** Starts over from these attributes (entity load, snapshot view, leaving history). */
  function reset(attrs: EntityAttributes | Attrs | null | undefined) {
    draft.value = { ...((attrs ?? {}) as Attrs) } as EntityAttributes
    dirty = {}
  }

  /** The editor's new attributes: remembers which keys changed. */
  function edit(attrs: EntityAttributes) {
    if (!isHistory()) {
      const prev = draft.value as Attrs
      const next = attrs as Attrs
      for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
        if (!same(prev[key], next[key])) dirty[key] = next[key]
      }
    }
    draft.value = attrs
  }

  /** What to save: the entity's current attributes with the edited keys on top. */
  function takePatch(): EntityAttributes {
    const merged: Attrs = { ...((entity.value?.attributes ?? {}) as Attrs), ...dirty }
    for (const [key, value] of Object.entries(dirty)) if (value === undefined) delete merged[key]
    dirty = {}
    return merged as EntityAttributes
  }

  return { draft, reset, edit, takePatch }
}
