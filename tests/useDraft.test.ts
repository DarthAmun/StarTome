import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useDraft } from '@/ui/useDraft'

/** A fake store whose saves come back as a live value later, like a Dexie live query. */
function setup(delay = 1500) {
  const stored = ref('Scene')
  const saves: string[] = []
  const scope = effectScope()
  const draft = scope.run(() => useDraft(() => stored.value, (v) => { saves.push(v) }, delay))!
  return { stored, saves, scope, draft }
}
const flush = async () => { await Promise.resolve(); await nextTick() }

describe('useDraft', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('saves once, a while after the last keystroke', async () => {
    const { draft, saves } = setup()
    for (const t of ['Scene ', 'Scene o', 'Scene on', 'Scene one']) { draft.input(t); vi.advanceTimersByTime(400) }
    expect(saves).toEqual([])
    vi.advanceTimersByTime(1500)
    expect(saves).toEqual(['Scene one'])
  })

  it('never lets a stale store value overwrite what is being typed', async () => {
    const { draft, saves, stored } = setup(200)
    draft.input('The long')
    vi.advanceTimersByTime(200)
    expect(saves).toEqual(['The long'])
    draft.input('The long title')
    stored.value = 'The long' // the first save comes back while typing goes on
    await flush()
    expect(draft.text.value).toBe('The long title')
    draft.end()
    expect(saves).toEqual(['The long', 'The long title'])
    stored.value = 'The long' // a late echo of the first save after blur is ignored too
    await flush()
    expect(draft.text.value).toBe('The long title')
    stored.value = 'The long title'
    await flush()
    expect(draft.text.value).toBe('The long title')
  })

  it('saves on blur and on commit without waiting', () => {
    const { draft, saves } = setup()
    draft.input('A')
    draft.commit()
    draft.input('AB')
    draft.end()
    expect(saves).toEqual(['A', 'AB'])
    draft.end()
    expect(saves).toEqual(['A', 'AB'])
  })

  it('follows the store when not editing', async () => {
    const { draft, stored } = setup()
    stored.value = 'Renamed elsewhere'
    await flush()
    expect(draft.text.value).toBe('Renamed elsewhere')
  })

  it('shows the stored value again when a save is refused', async () => {
    const stored = ref('Old')
    const draft = effectScope().run(() => useDraft(() => stored.value, v => (v.trim() ? undefined : false)))!
    draft.input('  ')
    draft.end()
    await flush()
    expect(draft.text.value).toBe('Old')
  })

  it('saves pending typing when the scope ends', () => {
    const { draft, saves, scope } = setup()
    draft.input('Half typed')
    scope.stop()
    expect(saves).toEqual(['Half typed'])
  })
})
