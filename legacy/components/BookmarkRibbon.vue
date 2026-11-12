<template>
  <div class="bm-bar no-print">
    <div class="bm-track">

      <!-- Pin button -->
      <button
        class="bm-pin-btn"
        :class="{ 'bm-pin-btn--active': isCurrentPageBookmarked }"
        :title="isCurrentPageBookmarked ? 'Remove bookmark' : 'Bookmark this page'"
        @click="toggleCurrentPage"
      >
        <OhVueIcon
          :name="isCurrentPageBookmarked ? 'md-bookmarkadded' : 'md-bookmarkborder'"
          scale="0.75"
        />
      </button>

      <div v-if="bookmarks.length" class="bm-sep" />

      <!-- Saved bookmarks -->
      <div
        v-for="(bm, i) in bookmarks"
        :key="bm.id"
        class="bm-tab"
        :class="{ 'bm-tab--active': isCurrentRoute(bm.route) }"
        :style="{ '--bm-color': bm.color }"
        :title="bm.label"
        draggable="true"
        @click="navigate(bm)"
        @dragstart="onDragStart(i)"
        @dragover.prevent="onDragOver(i)"
        @drop="onDrop(i)"
        @dragend="onDragEnd"
      >
        <OhVueIcon :name="bm.icon" scale="0.65" class="bm-icon" />
        <span class="bm-label">{{ bm.label }}</span>
        <button class="bm-remove" :title="`Remove '${bm.label}'`" @click.stop="removeBookmark(bm.id)">×</button>
      </div>

    </div>

    <!-- Theme toggle (pinned right) -->
    <button
      class="bm-theme-btn"
      :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      @click="toggleTheme"
    >
      {{ isDark ? '☀' : '☾' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useBookmarks } from '~/composables/useBookmarks'
import { useEntities } from '~/composables/useEntities'
import { useEncounterStore } from '~/stores/encounter'
import { rulesGet } from '~/composables/useRules'
import { RULES_KIND_CONFIG } from '~/types/rules'
import { useSettings } from '~/composables/useSettings'
import { ENTITY_TYPE_CONFIG } from '~/types/entities'
import type { EntityType } from '~/types/entities'
import { dbApi } from '~/composables/useDb'

const router = useRouter()
const { settings, update: updateSettings } = useSettings()
const isDark = computed(() => settings.value.theme !== 'light')
function toggleTheme() { updateSettings('theme', isDark.value ? 'light' : 'dark') }

const route = useRoute()
const { bookmarks, removeBookmark, reorder, isBookmarked, bookmarkPage, bookmarkEntity } = useBookmarks()
const notesStore = useEntities()
const encounterStore = useEncounterStore()

function navigate(bm: { route: string }) { router.push(bm.route) }

// Full current route including query params that represent distinct bookmark targets
const currentFullRoute = computed(() => {
  const rulesId = route.query.id as string | undefined
  if (rulesId && route.path.startsWith('/compendium/')) {
    return `${route.path}?id=${encodeURIComponent(rulesId)}`
  }
  const snapId = route.query.snap as string | undefined
  if (snapId && route.path.match(/\/campaign\/\d+\/\w+\/\d+$/)) {
    return `${route.path}?snap=${snapId}`
  }

  const graphId = route.query.graph as string | undefined
  if (graphId && route.path.match(/\/campaign\/\d+\/graphs$/)) {
    return `${route.path}?graph=${graphId}`
  }
  return route.path
})

function isCurrentRoute(bmRoute: string): boolean {
  const [bmPath, bmQueryStr] = bmRoute.split('?')
  const bmParams = new URLSearchParams(bmQueryStr ?? '')
  const bmRules = bmParams.get('id')
  const bmSnap = bmParams.get('snap')
  const bmMap = bmParams.get('map')
  const bmGraph = bmParams.get('graph')
  if (bmRules) return route.path === bmPath && (route.query.id as string) === bmRules
  if (bmSnap) return route.path === bmPath && (route.query.snap as string) === bmSnap
  if (bmMap) return route.path === bmPath && (route.query.map as string) === bmMap
  if (bmGraph) return route.path === bmPath && (route.query.graph as string) === bmGraph
  return route.path === bmPath
}

const ENTITY_SEGMENTS = new Set(['npcs', 'locations', 'factions', 'quests', 'events', 'sessions', 'notes', 'rumors', 'random-tables'])

const currentEntity = computed(() => {
  const m = route.path.match(/\/campaign\/\d+\/([\w-]+)\/(\d+)$/)
  if (!m || !ENTITY_SEGMENTS.has(m[1])) return null
  return notesStore.entities.find(e => e.id === Number(m[2])) ?? null
})

const isCurrentPageBookmarked = computed(() => isBookmarked(currentFullRoute.value))

async function toggleCurrentPage() {
  if (isCurrentPageBookmarked.value) {
    const bm = bookmarks.value.find(b => b.route === currentFullRoute.value)
    if (bm) removeBookmark(bm.id)
    return
  }
  // Graph bookmark (?graph=graphId)
  const graphId = route.query.graph as string | undefined
  if (graphId && route.path.match(/\/campaign\/\d+\/graphs$/)) {
    const layout = await dbApi.graphLayout.get(Number(graphId))
    const graphName = layout?.name ?? 'Graph'
    bookmarkPage(currentFullRoute.value, graphName, 'gi-all-seeing-eye', '#7cc44e')
    return
  }

  // Location map bookmark (/locations/{id}/map)
  const mapRouteMatch = route.path.match(/\/campaign\/\d+\/locations\/(\d+)\/map$/)
  if (mapRouteMatch) {
    const locationId = Number(mapRouteMatch[1])
    const locationEntity = notesStore.entities.find(e => e.id === locationId)
    const label = locationEntity ? `${locationEntity.name} (Map)` : 'Map'
    const config = ENTITY_TYPE_CONFIG['location' as EntityType]
    bookmarkPage(currentFullRoute.value, label, config?.defaultIcon ?? 'gi-castle', config?.color ?? 'var(--ink-ghost)')
    return
  }

  const entity = currentEntity.value
  if (entity) {
    const snapId = Number(route.query.snap)
    if (snapId) {
      const snap = notesStore.snapshots.find(s => s.id === snapId)
      const snapLabel = snap?.label || snap?.name || `Snapshot #${snapId}`
      const config = ENTITY_TYPE_CONFIG[entity.type as EntityType]
      bookmarkPage(
        currentFullRoute.value,
        `${entity.name} › ${snapLabel}`,
        config?.defaultIcon ?? 'gi-scroll-unfurled',
        config?.color ?? 'var(--ink-ghost)',
      )
      return
    }
    bookmarkEntity({ id: entity.id, name: entity.name, type: entity.type, campaignId: entity.campaignId })
    return
  }
  const encounterMatch = route.path.match(/^\/encounter\/(\d+)/)
  if (encounterMatch && encounterStore.current) {
    bookmarkPage(route.path, encounterStore.current.name, 'gi-broadsword', 'var(--accent)')
    return
  }
  // Compendium entry: /compendium/{segment}?id=…
  const rulesId = route.query.id as string | undefined
  if (rulesId && route.path.startsWith('/compendium/')) {
    const entry = await rulesGet(rulesId)
    if (entry) {
      const cfg = RULES_KIND_CONFIG[entry.kind]
      bookmarkPage(currentFullRoute.value, entry.name, cfg.icon, cfg.color)
      return
    }
  }
  const label = (document.querySelector('.page-title, .camp-banner-title') as HTMLElement)?.textContent?.trim()
    ?? route.path.split('/').filter(s => Boolean(s) && isNaN(Number(s))).pop()
    ?? 'Page'
  bookmarkPage(route.path, label, 'md-bookmark', 'var(--accent)')
}

const draggingIndex = ref<number | null>(null)
function onDragStart(i: number) { draggingIndex.value = i }
function onDragOver(i: number) {
  if (draggingIndex.value === null || draggingIndex.value === i) return
  reorder(draggingIndex.value, i)
  draggingIndex.value = i
}
function onDrop(_i: number) {}
function onDragEnd() { draggingIndex.value = null }
</script>

<style scoped>
.bm-bar {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  z-index: var(--z-overlay);
  padding: 0 8px;
  gap: 4px;
}

.bm-track {
  display: flex;
  align-items: center;
  height: 100%;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  flex: 1;
  min-width: 0;
}
.bm-track::-webkit-scrollbar { display: none; }

/* Theme toggle pinned to the right */
.bm-theme-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 99px;
  border: 1.5px solid var(--border);
  background: none;
  color: var(--text3);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.12s;
}
.bm-theme-btn:hover { color: var(--text2); border-color: var(--border-hi); background: var(--surface-hi); }

/* Pin button */
.bm-pin-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 99px;
  border: 1.5px dashed var(--border-hi);
  background: none;
  color: var(--text3);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.12s;
}
.bm-pin-btn:hover { color: var(--text2); border-color: var(--text3); }
.bm-pin-btn--active {
  border-style: solid;
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-bg);
}
.bm-pin-btn--active:hover { background: var(--accent-bhi); }

.bm-sep {
  width: 1px;
  height: 18px;
  background: var(--border);
  flex-shrink: 0;
  margin: 0 2px;
}

/* Tabs */
.bm-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  height: 28px;
  border-radius: 99px;
  background: var(--bg2);
  border: 1px solid var(--border);
  cursor: pointer;
  user-select: none;
  transition: background 0.12s, border-color 0.12s;
  position: relative;
  flex-shrink: 0;
  max-width: 180px;
  min-width: 0;
  overflow: hidden;
}
.bm-tab:hover { background: var(--surface-hi); border-color: var(--border-hi); }
.bm-tab--active {
  background: oklch(from var(--bm-color, var(--accent)) l c h / 0.12);
  border-color: oklch(from var(--bm-color, var(--accent)) l c h / 0.4);
}

.bm-icon {
  color: var(--bm-color, var(--text3));
  flex-shrink: 0;
}

.bm-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.bm-tab--active .bm-label { color: var(--bm-color, var(--accent)); font-weight: 600; }

.bm-remove {
  display: none;
  background: none;
  border: none;
  color: var(--text3);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: color 0.12s;
}
.bm-remove:hover { color: var(--danger); }
.bm-tab:hover .bm-remove { display: block; }
</style>
