/**
 * A text field's local draft over a stored value. While the field is being edited the draft is
 * the truth: values coming back from the store (live queries) never overwrite it. It saves a short
 * while after the last keystroke, and right away on commit (Enter), on end (blur) and when the
 * scope ends. `save` may return false (or a promise of false) to refuse a value: the field then
 * shows the stored value again.
 */
import { onScopeDispose, ref, watch, type Ref } from 'vue'

export interface Draft {
  /** What the field shows. */
  text: Ref<string>
  /** The user typed: keep it, and save after the quiet delay. */
  input: (value: string) => void
  /** Save now if the draft differs from what was last saved. */
  commit: () => void
  /** Editing ended: save now, then follow the store again. */
  end: () => void
}

/** How long after editing ends a store value that isn't the saved one is still taken as stale. */
const SETTLE_MS = 1000

export function useDraft(source: () => string, save: (value: string) => unknown, delay = 1500): Draft {
  const text = ref(source())
  let editing = false
  let saved = text.value
  /** After editing ends, the value we wait to see come back before following the store again. */
  let awaiting: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let settle: ReturnType<typeof setTimeout> | null = null
  const stop = (t: ReturnType<typeof setTimeout> | null) => { if (t) clearTimeout(t) }

  const follow = () => { awaiting = null; stop(settle); settle = null; if (!editing) text.value = source() }
  watch(source, (v) => {
    if (editing) return
    if (awaiting !== null && v !== awaiting) return
    follow()
  })

  function commit() {
    stop(timer); timer = null
    if (text.value === saved) return
    const value = saved = text.value
    void Promise.resolve(save(value)).then((ok) => {
      if (ok === false && saved === value) { saved = source(); if (!editing) follow() }
    }, () => { saved = source(); if (!editing) follow() })
  }
  function input(value: string) {
    editing = true
    text.value = value
    stop(timer)
    timer = setTimeout(commit, delay)
  }
  function end() {
    commit()
    editing = false
    if (source() === text.value) return follow()
    awaiting = text.value
    stop(settle)
    settle = setTimeout(follow, SETTLE_MS)
  }
  onScopeDispose(() => { if (editing) commit(); stop(settle) })
  return { text, input, commit, end }
}
