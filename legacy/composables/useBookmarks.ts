import { ENTITY_TYPE_CONFIG } from '~/types/entities'
import type { EntityType } from '~/types/entities'
import { lsKey } from '~/utils/appNamespace'

export interface Bookmark {
  id: string
  label: string
  route: string
  icon: string
  color: string
  type: 'campaign' | 'entity' | 'record' | 'page'
}

const STORAGE_KEY = lsKey('bookmarks')

const bookmarks = ref<Bookmark[]>([])

if (import.meta.client) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) bookmarks.value = JSON.parse(stored)
  } catch {}
}

function persist() {
  if (import.meta.client) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks.value))
  }
}

export function useBookmarks() {
  function addBookmark(bm: Omit<Bookmark, 'id'>) {
    if (bookmarks.value.some(b => b.route === bm.route)) return
    bookmarks.value.push({ ...bm, id: crypto.randomUUID() })
    persist()
  }

  function removeBookmark(id: string) {
    bookmarks.value = bookmarks.value.filter(b => b.id !== id)
    persist()
  }

  function isBookmarked(route: string): boolean {
    return bookmarks.value.some(b => b.route === route)
  }

  function reorder(fromIndex: number, toIndex: number) {
    const bms = [...bookmarks.value]
    if (fromIndex < 0 || fromIndex >= bms.length) return
    const [moved] = bms.splice(fromIndex, 1)
    bms.splice(Math.max(0, Math.min(toIndex, bms.length)), 0, moved)
    bookmarks.value = bms
    persist()
  }

  function bookmarkEntity(entity: {
    id: number
    name: string
    type: string
    campaignId: number
  }) {
    const TYPE_PLURAL: Record<string, string> = {
      npc: 'npcs', location: 'locations',
      faction: 'factions', quest: 'quests', event: 'events',
      session: 'sessions', note: 'notes',
    }
    const config = ENTITY_TYPE_CONFIG[entity.type as EntityType]
    const segment = TYPE_PLURAL[entity.type] ?? entity.type + 's'
    addBookmark({
      label: entity.name,
      route: `/campaign/${entity.campaignId}/${segment}/${entity.id}`,
      icon: config?.defaultIcon ?? 'gi-scroll-unfurled',
      color: config?.color ?? 'var(--ink-ghost)',
      type: 'entity',
    })
  }

  function bookmarkPage(route: string, label: string, icon: string, color: string) {
    addBookmark({ label, route, icon, color, type: 'page' })
  }

  return {
    bookmarks,
    addBookmark,
    removeBookmark,
    isBookmarked,
    reorder,
    bookmarkEntity,
    bookmarkPage,
  }
}
