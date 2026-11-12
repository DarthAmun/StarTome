/**
 * The ~4,000 Game Icons (gi-*) are 7 MB of JS. They load in their own chunk
 * after startup (FORK_PLAN §14 PERF-02); nothing may import
 * 'oh-vue-icons/icons/gi' statically, or the chunk comes back into every page.
 * Look icons up through `gameIcon()` instead.
 */
import { ref } from 'vue'
import { addIcons, listIcons } from 'oh-vue-icons'

export const gameIconsReady = ref(false)
let loading: Promise<void> | null = null

export function loadGameIcons(): Promise<void> {
  return (loading ??= import('oh-vue-icons/icons/gi')
    .then((gi) => {
      const icons = Object.entries(gi).filter(([k]) => k.startsWith('Gi')).map(([, v]) => v)
      addIcons(...(icons as Parameters<typeof addIcons>))
      gameIconsReady.value = true
    })
    .catch((err) => {
      loading = null
      console.error('[StarTome] Loading the game icons failed:', err)
    }))
}

/**
 * A registered icon by name ("gi-castle"), or null while the set is loading.
 * Called inside a render or computed, that re-runs once the icons are there.
 */
// oh-vue-icons fills in minX/minY (0) when it registers an icon
export function gameIcon(name: string | null | undefined): { raw?: string; minX: number; minY: number; width: number; height: number } | null {
  void gameIconsReady.value
  if (!name) return null
  return (listIcons() as Record<string, any>)[name] ?? null
}
