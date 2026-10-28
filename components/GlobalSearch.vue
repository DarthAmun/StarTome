<template>
  <Teleport to="body">
    <!-- Pill trigger -->
    <button v-if="!hideTrigger" class="gs-pill-trigger" @click="open = true">
      <span class="gs-pill-icon">⌕</span>
      <span>Search</span>
      <span class="gs-pill-shortcut">{{ isMac ? '⌘K' : 'Ctrl+K' }}</span>
    </button>

    <!-- Modal -->
    <Transition name="gs-fade">
      <div v-if="open" class="pv-dialog-mask" @click.self="close">
        <div class="pv-dialog gs-dialog" :class="{ 'gs-dialog--cmd': inCommandMode }">
          <!-- Input row -->
          <div class="gs-input-row" :class="{ 'gs-input-row--cmd': inCommandMode }">
            <span class="gs-input-icon gs-input-icon--cmd" v-if="inCommandMode">›_</span>
            <OhVueIcon v-else name="fa-search" scale="0.85" class="gs-input-icon" />

            <!-- Context pills -->
            <span v-if="ctx.campaign" class="gs-ctx-pill gs-ctx-pill--campaign" @click="clearCtx('campaign')" title="Click to unset campaign context">
              {{ ctx.campaign.name }} ✕
            </span>

            <input
              ref="inputRef"
              v-model="query"
              class="gs-input"
              :placeholder="inCommandMode ? 'Type a command — goto, add, find, set, theme…' : 'Search… or #tag for tag search, > for commands'"
              autocomplete="off"
              @keydown="onKeydown"
            />
            <kbd class="gs-esc-hint" @click="close">Esc</kbd>
          </div>

          <!-- Command Mode Results -->
          <div v-if="inCommandMode" class="gs-results" ref="resultsRef">
            <template v-if="cmdLoading">
              <div class="gs-empty">Running…</div>
            </template>
            <template v-else>
              <template v-for="item in cmdItems" :key="'id' in item ? item.id : item.label">
                <!-- Section header -->
                <div v-if="item.kind === 'section'" class="gs-cmd-section">{{ item.label }}</div>

                <!-- Cmd item -->
                <div
                  v-else-if="item.kind === 'cmd'"
                  class="gs-result gs-cmd-row"
                  :class="{
                    'gs-result--active': isCmdActive(item.id),
                    'gs-cmd-row--disabled': !item.canExecute,
                  }"
                  @click="execCmdItem(item)"
                  @mouseenter="setCmdCursor(item.id)"
                >
                  <span class="gs-cmd-icon">{{ item.icon }}</span>
                  <span class="gs-result-name">{{ item.label }}</span>
                  <span v-if="item.warning" class="gs-cmd-warning">{{ item.warning }}</span>
                  <span v-else-if="item.hint" class="gs-result-sub">{{ item.hint }}</span>
                </div>

                <!-- Pick item -->
                <div
                  v-else-if="item.kind === 'pick'"
                  class="gs-result gs-pick-row"
                  :class="{ 'gs-result--active': isCmdActive(item.id) }"
                  @click="execPickItem(item)"
                  @mouseenter="setCmdCursor(item.id)"
                >
                  <span class="gs-cmd-icon">{{ item.icon }}</span>
                  <span class="gs-result-name">{{ item.label }}</span>
                  <span v-if="item.hint" class="gs-result-sub">{{ item.hint }}</span>
                </div>
              </template>

              <div v-if="!cmdItems.length" class="gs-empty">No suggestions</div>
            </template>
          </div>

          <!-- Normal Search Results -->
          <template v-else>
            <div v-if="query.trim()" class="gs-results" ref="resultsRef">
              <template v-if="loading">
                <div class="gs-empty">Searching…</div>
              </template>
              <template v-else-if="totalCount === 0">
                <div class="gs-empty">No results for "{{ query }}"</div>
              </template>
              <template v-else>
                <!-- Campaigns -->
                <div v-if="results.campaigns.length" class="gs-group">
                  <div class="gs-group-label">Campaigns</div>
                  <div
                    v-for="(item, i) in results.campaigns"
                    :key="`c-${item.id}`"
                    class="gs-result"
                    :class="{ 'gs-result--active': flatIndex(0, i) === cursor }"
                    @click="navigate(item)"
                    @mouseenter="cursor = flatIndex(0, i)"
                  >
                    <span class="gs-result-icon" style="color: var(--blood)">
                      <OhVueIcon name="gi-broadsword" scale="0.8" />
                    </span>
                    <span class="gs-result-name">{{ item.name }}</span>
                    <span class="gs-result-sub">Campaign</span>
                    <div class="gs-result-actions" @click.stop>
                      <button class="gs-bm-btn" :class="{ 'gs-bm-btn--active': isBookmarked(getRoute(item)) }" :title="isBookmarked(getRoute(item)) ? 'Remove bookmark' : 'Bookmark'" @click="toggleResultBookmark(item)">
                        <OhVueIcon :name="isBookmarked(getRoute(item)) ? 'md-bookmarkadded' : 'md-bookmarkborder'" scale="0.75" />
                      </button>
                      <button class="gs-popout" title="Open in new window" @click="popout(item)">
                        <OhVueIcon name="md-openinnew" scale="0.75" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Entities -->
                <div v-if="results.entities.length" class="gs-group">
                  <div class="gs-group-label">Entities</div>
                  <div
                    v-for="(item, i) in results.entities"
                    :key="`e-${item.id}`"
                    class="gs-result gs-entity-result"
                    :class="{ 'gs-result--active': flatIndex(1, i) === cursor }"
                    @mouseenter="cursor = flatIndex(1, i)"
                  >
                    <component
                      v-if="item.entity && ENTRY_COMPONENTS[item.type as EntityType]"
                      :is="ENTRY_COMPONENTS[item.type as EntityType]"
                      :entry="item.entity"
                      :deletable="false"
                      @open="navigate(item)"
                    />
                    <template v-else>
                      <span class="gs-result-icon" :style="{ color: entityColor(item.type) }">
                        <OhVueIcon :name="entityIcon(item.type)" scale="0.8" />
                      </span>
                      <span class="gs-result-name">{{ item.name }}</span>
                      <span class="gs-result-sub">{{ entityLabel(item.type) }}</span>
                    </template>
                    <div class="gs-result-actions" @click.stop>
                      <button class="gs-bm-btn" :class="{ 'gs-bm-btn--active': isBookmarked(getRoute(item)) }" :title="isBookmarked(getRoute(item)) ? 'Remove bookmark' : 'Bookmark'" @click="toggleResultBookmark(item)">
                        <OhVueIcon :name="isBookmarked(getRoute(item)) ? 'md-bookmarkadded' : 'md-bookmarkborder'" scale="0.75" />
                      </button>
                      <button class="gs-popout" title="Open in new window" @click="popout(item)">
                        <OhVueIcon name="md-openinnew" scale="0.75" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Compendium -->
                <div v-if="results.rules.length" class="gs-group">
                  <div class="gs-group-label">Compendium</div>
                  <div
                    v-for="(item, i) in results.rules"
                    :key="`r-${item.id}`"
                    class="gs-result"
                    :class="{ 'gs-result--active': flatIndex(2, i) === cursor }"
                    @click="navigate(item)"
                    @mouseenter="cursor = flatIndex(2, i)"
                  >
                    <span class="gs-result-icon" :style="{ color: recordColor(item) }">
                      <OhVueIcon :name="recordIcon(item)" scale="0.8" />
                    </span>
                    <span class="gs-result-name">{{ item.name }}</span>
                    <span class="gs-result-sub">{{ item._subtitle }}</span>
                    <div class="gs-result-actions" @click.stop>
                      <button class="gs-bm-btn" :class="{ 'gs-bm-btn--active': isBookmarked(getRoute(item)) }" :title="isBookmarked(getRoute(item)) ? 'Remove bookmark' : 'Bookmark'" @click="toggleResultBookmark(item)">
                        <OhVueIcon :name="isBookmarked(getRoute(item)) ? 'md-bookmarkadded' : 'md-bookmarkborder'" scale="0.75" />
                      </button>
                      <button class="gs-popout" title="Open in new window" @click="popout(item)">
                        <OhVueIcon name="md-openinnew" scale="0.75" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Encounters -->
                <div v-if="results.encounters.length" class="gs-group">
                  <div class="gs-group-label">Encounters</div>
                  <div
                    v-for="(item, i) in results.encounters"
                    :key="`enc-${item.id}`"
                    class="gs-result"
                    :class="{ 'gs-result--active': flatIndex(3, i) === cursor }"
                    @click="navigate(item)"
                    @mouseenter="cursor = flatIndex(3, i)"
                  >
                    <span class="gs-result-icon" style="color: #4ab8e8">
                      <OhVueIcon name="gi-broadsword" scale="0.8" />
                    </span>
                    <span class="gs-result-name">{{ item.name }}</span>
                    <span class="gs-result-sub">Encounter</span>
                    <div class="gs-result-actions" @click.stop>
                      <button class="gs-bm-btn" :class="{ 'gs-bm-btn--active': isBookmarked(getRoute(item)) }" :title="isBookmarked(getRoute(item)) ? 'Remove bookmark' : 'Bookmark'" @click="toggleResultBookmark(item)">
                        <OhVueIcon :name="isBookmarked(getRoute(item)) ? 'md-bookmarkadded' : 'md-bookmarkborder'" scale="0.75" />
                      </button>
                      <button class="gs-popout" title="Open in new window" @click="popout(item)">
                        <OhVueIcon name="md-openinnew" scale="0.75" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Graphs -->
                <div v-if="results.graphs.length" class="gs-group">
                  <div class="gs-group-label">Graphs</div>
                  <div
                    v-for="(item, i) in results.graphs"
                    :key="`g-${item.id}`"
                    class="gs-result"
                    :class="{ 'gs-result--active': flatIndex(4, i) === cursor }"
                    @click="navigate(item)"
                    @mouseenter="cursor = flatIndex(4, i)"
                  >
                    <span class="gs-result-icon" style="color: #7cc44e">
                      <OhVueIcon name="gi-all-seeing-eye" scale="0.8" />
                    </span>
                    <span class="gs-result-name">{{ item.name }}</span>
                    <span class="gs-result-sub">Graph</span>
                    <div class="gs-result-actions" @click.stop>
                      <button class="gs-bm-btn" :class="{ 'gs-bm-btn--active': isBookmarked(getRoute(item)) }" :title="isBookmarked(getRoute(item)) ? 'Remove bookmark' : 'Bookmark'" @click="toggleResultBookmark(item)">
                        <OhVueIcon :name="isBookmarked(getRoute(item)) ? 'md-bookmarkadded' : 'md-bookmarkborder'" scale="0.75" />
                      </button>
                      <button class="gs-popout" title="Open in new window" @click="popout(item)">
                        <OhVueIcon name="md-openinnew" scale="0.75" />
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <!-- Empty state before typing -->
            <div v-else class="gs-hint">
              Type to search, or <span class="gs-cmd-hint-trigger" @click="activateCommandMode">›_ type a command</span>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { rulesSearch } from '~/composables/useRules'
import { RULES_KIND_CONFIG, type RulesKind } from '~/types/rules'
import { GAME_CONFIG } from '~/types/game'
import { dbApi } from '~/composables/useDb'
import { ENTITY_TYPE_CONFIG } from '~/types/entities'
import type { EntityType } from '~/types/entities'
import { useEntities } from '~/composables/useEntities'
import type { Entity } from '~/composables/useEntities'
import { useBookmarks } from '~/composables/useBookmarks'
import { useCommandPalette } from '~/composables/useCommandPalette'
import type { CmdItem } from '~/composables/useCommandPalette'
import { useSettings } from '~/composables/useSettings'
import NpcEntry         from '~/components/notes/NpcEntry.vue'
import LocationEntry    from '~/components/notes/LocationEntry.vue'
import FactionEntry     from '~/components/notes/FactionEntry.vue'
import QuestEntry       from '~/components/notes/QuestEntry.vue'
import EventEntry       from '~/components/notes/EventEntry.vue'
import SessionEntry     from '~/components/notes/SessionEntry.vue'
import NoteEntry        from '~/components/notes/NoteEntry.vue'
import RandomTableEntry from '~/components/notes/RandomTableEntry.vue'
import RumorEntry       from '~/components/notes/RumorEntry.vue'

const ENTRY_COMPONENTS: Record<EntityType, any> = {
  npc: NpcEntry, location: LocationEntry, faction: FactionEntry,
  quest: QuestEntry, event: EventEntry, session: SessionEntry, note: NoteEntry,
  'random-table': RandomTableEntry, rumor: RumorEntry,
}

const props = defineProps<{ hideTrigger?: boolean }>()

const router = useRouter()
const notesStore = useEntities()
const { isBookmarked, bookmarkEntity, bookmarkPage, removeBookmark, bookmarks } = useBookmarks()
const { ctx, setCtx, clearCtx, isCommandMode, getSuggestions } = useCommandPalette()
const { update: updateSettings } = useSettings()

const { open } = useGlobalSearch()
const query = ref('')
const loading = ref(false)
const cursor = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLElement | null>(null)

const isMac = import.meta.client && /Mac|iPhone|iPad/.test(navigator.platform)

// ── Command palette state ─────────────────────────────────────────────────────

const cmdItems = ref<CmdItem[]>([])
const cmdLoading = ref(false)
const cmdCursorId = ref<string | null>(null)

const inCommandMode = computed(() => isCommandMode(query.value))

// Interactive items (navigable with arrow keys)
const cmdInteractive = computed(() =>
  cmdItems.value.filter(item =>
    (item.kind === 'pick') || (item.kind === 'cmd' && item.canExecute)
  ) as Array<Extract<CmdItem, { kind: 'cmd'; canExecute: true }> | Extract<CmdItem, { kind: 'pick' }>>
)

function isCmdActive(id: string): boolean {
  return cmdCursorId.value === id
}

function setCmdCursor(id: string) {
  cmdCursorId.value = id
}

function activateCommandMode() {
  query.value = '>'
  nextTick(() => inputRef.value?.focus())
}

let cmdTimer: ReturnType<typeof setTimeout> | null = null

async function runCommandSuggestions(q: string) {
  cmdLoading.value = true
  const allCampaigns = await dbApi.campaigns.list()
  const campaigns = allCampaigns.map((c: any) => ({ id: c.id, name: c.name }))

  const items = await getSuggestions(q, {
    campaigns,
    router,
    updateSettings,
    close,
  })
  cmdItems.value = items
  // Set cursor to first interactive item
  const first = items.find(i => i.kind === 'pick' || (i.kind === 'cmd' && i.canExecute))
  cmdCursorId.value = first && 'id' in first ? first.id : null
  cmdLoading.value = false
}

function execCmdItem(item: Extract<CmdItem, { kind: 'cmd' }>) {
  if (item.canExecute && item.execute) {
    item.execute()
    if (item.keepOpen) {
      // Trigger fresh suggestions (e.g. reroll dice) without clearing the input
      if (cmdTimer) clearTimeout(cmdTimer)
      cmdTimer = setTimeout(() => runCommandSuggestions(query.value), 0)
    } else {
      query.value = ''
    }
  }
}

function execPickItem(item: Extract<CmdItem, { kind: 'pick' }>) {
  if (item.fill) {
    query.value = item.fill
    nextTick(() => inputRef.value?.focus())
    return
  }
  item.execute()
  query.value = ''
}

// ── Normal search state ───────────────────────────────────────────────────────

interface SearchResult {
  kind: 'campaign' | 'entity' | 'rules' | 'encounter' | 'graph'
  id: number | string
  rulesKind?: RulesKind
  name: string
  type?: string
  campaignId?: number
  _subtitle?: string
  entity?: Entity
}

const results = ref<{ campaigns: SearchResult[]; entities: SearchResult[]; rules: SearchResult[]; encounters: SearchResult[]; graphs: SearchResult[] }>({
  campaigns: [],
  entities: [],
  rules: [],
  encounters: [],
  graphs: [],
})

const totalCount = computed(() =>
  results.value.campaigns.length + results.value.entities.length + results.value.rules.length + results.value.encounters.length + results.value.graphs.length
)

function flatIndex(group: 0 | 1 | 2 | 3 | 4, i: number): number {
  const offsets = [
    0,
    results.value.campaigns.length,
    results.value.campaigns.length + results.value.entities.length,
    results.value.campaigns.length + results.value.entities.length + results.value.rules.length,
    results.value.campaigns.length + results.value.entities.length + results.value.rules.length + results.value.encounters.length,
  ]
  return offsets[group] + i
}

const flatResults = computed((): SearchResult[] => [
  ...results.value.campaigns,
  ...results.value.entities,
  ...results.value.rules,
  ...results.value.encounters,
  ...results.value.graphs,
])

// ── Watchers ──────────────────────────────────────────────────────────────────

let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (val) => {
  if (inCommandMode.value) {
    // Command mode
    if (searchTimer) clearTimeout(searchTimer)
    if (cmdTimer) clearTimeout(cmdTimer)
    cmdTimer = setTimeout(() => runCommandSuggestions(val), 120)
  } else {
    // Normal search mode
    if (cmdTimer) clearTimeout(cmdTimer)
    if (searchTimer) clearTimeout(searchTimer)
    cmdItems.value = []
    if (!val.trim()) {
      results.value = { campaigns: [], entities: [], rules: [], encounters: [], graphs: [] }
      return
    }
    loading.value = true
    searchTimer = setTimeout(() => runSearch(val.trim()), 150)
  }
})

// When switching to command mode mid-query, trigger suggestions immediately
watch(inCommandMode, (val) => {
  if (val) {
    if (cmdTimer) clearTimeout(cmdTimer)
    cmdTimer = setTimeout(() => runCommandSuggestions(query.value), 120)
  }
})

// ── Search ────────────────────────────────────────────────────────────────────

async function runSearch(q: string) {
  // Tag search mode
  if (q.startsWith('#')) {
    const tag = q.slice(1).toLowerCase()
    if (!tag) {
      results.value = { campaigns: [], entities: [], rules: [], encounters: [], graphs: [] }
      loading.value = false
      return
    }
    const entityDbRows = await dbApi.entities.searchByTag(tag, 20)
    const entities: SearchResult[] = entityDbRows.map((r: any) => ({
      kind: 'entity' as const,
      id: r.id,
      name: r.name,
      type: r.type,
      campaignId: r.campaign_id,
      entity: notesStore.entities.find(en => en.id === r.id) ?? {
        id: r.id,
        campaignId: r.campaign_id,
        type: r.type,
        name: r.name,
        content: r.content,
        attributes: JSON.parse(r.attributes ?? '{}'),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
    }))
    results.value = { campaigns: [], entities, rules: [], encounters: [], graphs: [] }
    cursor.value = 0
    loading.value = false
    return
  }

  const lq = q.toLowerCase()

  const allCampaigns = await dbApi.campaigns.list()
  const campaigns: SearchResult[] = allCampaigns
    .filter((c: any) => c.name.toLowerCase().includes(lq))
    .slice(0, 5)
    .map((c: any) => ({ kind: 'campaign', id: c.id, name: c.name }))

  const entityDbRows = await dbApi.entities.search(lq, 5)
  const entities: SearchResult[] = entityDbRows.map((r: any) => ({
    kind: 'entity',
    id: r.id,
    name: r.name,
    type: r.type,
    campaignId: r.campaign_id,
    entity: notesStore.entities.find(en => en.id === r.id) ?? {
      id: r.id,
      campaignId: r.campaign_id,
      type: r.type,
      name: r.name,
      content: r.content,
      attributes: JSON.parse(r.attributes ?? '{}'),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    },
  }))

  const rulesRows = await rulesSearch(lq, 6)
  const rulesHits: SearchResult[] = rulesRows.map(e => ({
    kind: 'rules' as const,
    id: e.id,
    name: e.name,
    rulesKind: e.kind,
    _subtitle: `${RULES_KIND_CONFIG[e.kind].label}${RULES_KIND_CONFIG[e.kind].hasLevel ? ` ${e.level}` : ''}${e.game === 'both' ? '' : ` · ${GAME_CONFIG[e.game].short}`}`,
  }))

  const encounterRows = await dbApi.encounters.search(lq, 5)
  const encounters: SearchResult[] = encounterRows.map((e: any) => ({
    kind: 'encounter' as const,
    id: e.id!,
    name: e.name,
    campaignId: e.campaign_id,
    _subtitle: `Campaign ${e.campaign_id}`,
  }))

  const graphRows = await dbApi.graphLayout.searchAll(lq, 5)
  const graphs: SearchResult[] = graphRows.map((g: any) => ({
    kind: 'graph' as const,
    id: g.id!,
    name: g.name ?? 'Default',
    campaignId: g.campaign_id,
    _subtitle: `Campaign ${g.campaign_id}`,
  }))

  results.value = { campaigns, entities, rules: rulesHits, encounters, graphs }
  cursor.value = 0
  loading.value = false
}

// ── Entity helpers ────────────────────────────────────────────────────────────

function entityIcon(type: string): string {
  return ENTITY_TYPE_CONFIG[type as keyof typeof ENTITY_TYPE_CONFIG]?.defaultIcon ?? 'gi-scroll-unfurled'
}
function entityColor(type: string): string {
  return ENTITY_TYPE_CONFIG[type as keyof typeof ENTITY_TYPE_CONFIG]?.color ?? 'var(--ink-ghost)'
}
function entityLabel(type: string): string {
  return ENTITY_TYPE_CONFIG[type as keyof typeof ENTITY_TYPE_CONFIG]?.label ?? type
}

function recordIcon(item: SearchResult): string {
  return item.rulesKind ? RULES_KIND_CONFIG[item.rulesKind].icon : 'gi-scroll-unfurled'
}
function recordColor(item: SearchResult): string {
  return item.rulesKind ? RULES_KIND_CONFIG[item.rulesKind].color : 'var(--ink-ghost)'
}

// ── Navigation ────────────────────────────────────────────────────────────────

const TYPE_PLURAL_ROUTE: Record<string, string> = {
  npc: 'npcs', location: 'locations',
  faction: 'factions', quest: 'quests', event: 'events',
  session: 'sessions', note: 'notes',
  'random-table': 'random-tables', rumor: 'rumors',
}

function getRoute(item: SearchResult): string {
  if (item.kind === 'campaign') return `/campaign/${item.id}`
  if (item.kind === 'entity') {
    const segment = TYPE_PLURAL_ROUTE[item.type ?? ''] ?? (item.type + 's')
    return `/campaign/${item.campaignId}/${segment}/${item.id}`
  }
  if (item.kind === 'rules') return `/compendium/${RULES_KIND_CONFIG[item.rulesKind!].segment}?id=${item.id}`
  if (item.kind === 'encounter') return `/encounter/${item.id}`
  if (item.kind === 'graph') return `/campaign/${item.campaignId}/graphs?graph=${item.id}`
  return '/'
}

function navigate(item: SearchResult) {
  router.push(getRoute(item))
  close()
}

function popout(item: SearchResult) {
  const r = getRoute(item)
  const base = location.origin + location.pathname.replace(/\/+$/, '')
  window.open(`${base}/#${r}`, '_blank', 'width=1024,height=768,menubar=no,toolbar=no,location=no')
}

function toggleResultBookmark(item: SearchResult) {
  const r = getRoute(item)
  if (isBookmarked(r)) {
    const bm = bookmarks.value.find(b => b.route === r)
    if (bm) removeBookmark(bm.id)
  } else if (item.kind === 'entity' && item.entity) {
    bookmarkEntity({ id: item.id as number, name: item.name, type: item.type ?? 'note', campaignId: item.campaignId ?? 0 })
  } else if (item.kind === 'rules') {
    bookmarkPage(r, item.name, recordIcon(item), recordColor(item))
  } else if (item.kind === 'campaign') {
    bookmarkPage(`/campaign/${item.id}`, item.name, 'gi-broadsword', 'var(--blood)')
  } else if (item.kind === 'encounter') {
    bookmarkPage(`/encounter/${item.id}`, item.name, 'gi-broadsword', '#4ab8e8')
  } else if (item.kind === 'graph') {
    bookmarkPage(getRoute(item), item.name, 'gi-all-seeing-eye', '#7cc44e')
  }
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

function onKeydown(e: KeyboardEvent) {
  if (inCommandMode.value) {
    handleCmdKeydown(e)
  } else {
    handleSearchKeydown(e)
  }
}

function handleCmdKeydown(e: KeyboardEvent) {
  const interactive = cmdInteractive.value
  const currentIdx = interactive.findIndex(item => item.id === cmdCursorId.value)

  if (e.key === 'ArrowDown' || e.key === 'Tab') {
    e.preventDefault()
    const next = (currentIdx + 1) % interactive.length
    cmdCursorId.value = interactive[next]?.id ?? null
    scrollResultIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prev = (currentIdx - 1 + interactive.length) % interactive.length
    cmdCursorId.value = interactive[prev]?.id ?? null
    scrollResultIntoView()
  } else if (e.key === 'Enter') {
    const item = interactive[currentIdx === -1 ? 0 : currentIdx]
    if (!item) return
    if (item.kind === 'pick') execPickItem(item)
    else if (item.kind === 'cmd' && item.canExecute) execCmdItem(item)
  } else if (e.key === 'Escape') {
    close()
  }
}

function handleSearchKeydown(e: KeyboardEvent) {
  const total = totalCount.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    cursor.value = (cursor.value + 1) % total
    scrollResultIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    cursor.value = (cursor.value - 1 + total) % total
    scrollResultIntoView()
  } else if (e.key === 'Enter') {
    const item = flatResults.value[cursor.value]
    if (item) navigate(item)
  } else if (e.key === 'Escape') {
    close()
  }
}

function scrollResultIntoView() {
  nextTick(() => {
    const active = resultsRef.value?.querySelector('.gs-result--active') as HTMLElement | null
    active?.scrollIntoView({ block: 'nearest' })
  })
}

function close() {
  open.value = false
  query.value = ''
  results.value = { campaigns: [], entities: [], rules: [], encounters: [], graphs: [] }
  cmdItems.value = []
  cursor.value = 0
  cmdCursorId.value = null
}

const route = useRoute()

// Focus input on open; auto-set campaign context from current route
watch(open, async (val) => {
  if (!val) return
  nextTick(() => inputRef.value?.focus())
  if (ctx.value.campaign) return
  const m = route.path.match(/^\/campaign\/(\d+)/)
  if (m) {
    const camp = await dbApi.campaigns.get(Number(m[1]))
    if (camp) setCtx('campaign', { id: camp.id!, name: camp.name })
  }
})

// Global keyboard shortcut
if (import.meta.client) {
  const onGlobalKeydown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      if (open.value) close()
      else open.value = true
    }
  }
  onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onGlobalKeydown))
}
</script>

<style scoped>
/* ── Pill trigger ── */
.gs-pill-trigger {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 199;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px 8px 12px;
  border-radius: 99px;
  background: var(--surface-solid);
  border: 1px solid var(--border);
  box-shadow: var(--sh-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--text2);
  transition: all 0.18s;
  user-select: none;
}
.gs-pill-trigger:hover {
  border-color: var(--border-hi);
  color: var(--text);
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
}
.gs-pill-icon { font-size: 15px; line-height: 1; }
.gs-pill-shortcut {
  font-size: 10px;
  color: var(--text3);
  font-family: var(--fm);
  margin-left: 2px;
}

/* Dialog */
.gs-dialog {
  width: 560px;
  max-width: 94vw;
  padding: 0;
}
.gs-dialog--cmd {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), var(--sh-md);
}

/* Input row */
.gs-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--parch-line);
  flex-wrap: wrap;
}
.gs-input-row--cmd {
  border-bottom-color: var(--accent);
}
.gs-input-icon {
  color: var(--ink-ghost);
  flex-shrink: 0;
}
.gs-input-icon--cmd {
  font-size: 15px;
  font-weight: 700;
  font-family: var(--fm);
  color: var(--accent);
  flex-shrink: 0;
  letter-spacing: -1px;
}
.gs-input {
  flex: 1;
  min-width: 120px;
  font-family: var(--font-body);
  font-size: 16px;
  color: var(--ink);
  background: transparent;
  border: none;
  outline: none;
}
.gs-input::placeholder { color: var(--ink-ghost); }
.gs-esc-hint {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ink-ghost);
  border: 1px solid var(--parch-line);
  border-radius: 3px;
  padding: 2px 5px;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s, border-color 0.15s;
}
.gs-esc-hint:hover { color: var(--ink); border-color: var(--ink-ghost); }

/* Context pills */
.gs-ctx-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.gs-ctx-pill:hover { opacity: 0.75; }
.gs-ctx-pill--campaign {
  background: var(--accent-bg);
  border: 1px solid var(--accent);
  color: var(--accent-l);
}
.gs-ctx-pill--system {
  background: oklch(58% 0.15 220 / 0.12);
  border: 1px solid oklch(58% 0.15 220 / 0.5);
  color: oklch(72% 0.12 220);
}

/* Results pane — fixed height so the modal never shifts position */
.gs-results {
  height: 340px;
  overflow-y: auto;
  padding: 6px 0 8px;
}

.gs-group {
  margin-bottom: 4px;
}
.gs-group-label {
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  padding: 6px 16px 3px;
}

/* Command section header */
.gs-cmd-section {
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  padding: 8px 16px 3px;
  opacity: 0.8;
}

/* Result rows */
.gs-result {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 16px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
  position: relative;
}
.gs-result:hover,
.gs-result--active {
  background: rgba(184, 134, 11, 0.08);
}
.gs-result--active {
  border-left: 2px solid var(--gold);
  padding-left: 14px;
}

/* Command rows use accent highlight */
.gs-cmd-row.gs-result--active,
.gs-pick-row.gs-result--active {
  background: var(--accent-bg);
  border-left-color: var(--accent);
}

.gs-cmd-row--disabled {
  opacity: 0.55;
  cursor: default;
}

/* Command icon */
.gs-cmd-icon {
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--accent-l);
}

/* Warning badge */
.gs-cmd-warning {
  font-size: 10px;
  font-family: var(--fm);
  color: var(--blood);
  background: oklch(54% 0.24 22 / 0.1);
  border: 1px solid oklch(54% 0.24 22 / 0.3);
  border-radius: 3px;
  padding: 1px 6px;
  flex-shrink: 0;
}

.gs-result-icon {
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.gs-result-name {
  flex: 1;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gs-result--active .gs-result-name { color: var(--ink); font-weight: 600; }
.gs-result-sub {
  font-family: var(--font-head);
  font-size: 9px;
  color: var(--ink-ghost);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  flex-shrink: 0;
}

/* Result action buttons */
.gs-result-actions {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: none;
  align-items: center;
  gap: 4px;
}
.gs-result:hover .gs-result-actions { display: flex; }

.gs-bm-btn,
.gs-popout {
  background: none;
  border: 1px solid var(--parch-line);
  border-radius: 3px;
  color: var(--ink-ghost);
  cursor: pointer;
  padding: 3px 5px;
  line-height: 1;
  display: flex;
  align-items: center;
  transition: color 0.15s, border-color 0.15s;
}
.gs-bm-btn:hover,
.gs-popout:hover { color: var(--gold); border-color: var(--gold); }

.gs-bm-btn--active {
  color: var(--gold);
  display: flex !important;
}

.gs-result .gs-bm-btn--active { display: flex; }
.gs-result:not(:hover) .gs-result-actions:has(.gs-bm-btn--active) { display: flex; }
.gs-result:not(:hover) .gs-result-actions:has(.gs-bm-btn--active) .gs-popout { display: none; }

.gs-result:hover .gs-result-sub { margin-right: 72px; }

/* Entity results */
.gs-entity-result :deep(.entry) {
  padding: 0;
  border-bottom: none;
}
.gs-entity-result :deep(.entry:hover) { padding-left: 0; }
.gs-entity-result :deep(.entry:hover::before) { display: none; }

/* Hint / empty states — same fixed height as .gs-results */
.gs-hint,
.gs-empty {
  height: 340px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink-ghost);
  font-style: italic;
  text-align: center;
}

.gs-cmd-hint-trigger {
  font-style: normal;
  color: var(--accent-l);
  cursor: pointer;
  font-family: var(--fm);
  font-size: 12px;
  border: 1px solid var(--accent);
  padding: 1px 7px;
  border-radius: 4px;
  transition: background 0.15s;
}
.gs-cmd-hint-trigger:hover { background: var(--accent-bg); }

/* Transition */
.gs-fade-enter-active,
.gs-fade-leave-active { transition: opacity 0.15s, transform 0.15s; }
.gs-fade-enter-from,
.gs-fade-leave-to { opacity: 0; transform: scale(0.97); }
</style>
