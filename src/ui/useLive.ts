/** A database query as a ref that updates when the rows it read change (in this tab or another). */
import { onScopeDispose, shallowRef, watch, type ShallowRef, type WatchSource } from 'vue'
import { live } from '@/data/repo'

export function useLive<T>(query: () => Promise<T>, initial: T, deps: WatchSource[] = []): ShallowRef<T> {
  const value = shallowRef(initial) as ShallowRef<T>
  let stop: (() => void) | null = null
  const start = () => {
    stop?.()
    const sub = live(query).subscribe({
      next: (v) => { value.value = v },
      error: (err) => { console.error('live query failed', err) },
    })
    stop = () => sub.unsubscribe()
  }
  if (deps.length) watch(deps, start, { immediate: true })
  else start()
  onScopeDispose(() => stop?.())
  return value
}
