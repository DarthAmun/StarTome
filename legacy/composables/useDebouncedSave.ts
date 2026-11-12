/**
 * Debounced save that is flushed, never dropped: a pending save runs
 * immediately when the component unmounts (e.g. navigating away mid-edit).
 */
export function useDebouncedSave(ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: (() => void) | null = null

  function flush() {
    if (timer) clearTimeout(timer)
    timer = null
    const save = pending
    pending = null
    save?.()
  }

  function schedule(save: () => void) {
    pending = save
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, ms)
  }

  onBeforeUnmount(flush)
  return { schedule, flush }
}
