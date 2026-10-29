<template>
  <div class="dms-root" :class="{ resizing: !!resizeState }" @keydown.esc="navigateTo(`/campaign/${id}`)">

    <!-- ── Top Bar ─────────────────────────────────────────────── -->
    <div class="dms-top">
      <div class="dms-mark">
        <span class="dms-mark-icon">◈</span>
        <span>GM Screen</span>
      </div>
      <div class="dms-sep-v" />
      <div class="dms-camp">
        <div class="dms-camp-name">{{ campaignName }}</div>
        <div class="dms-camp-sub">{{ GAME_CONFIG[campaignGameId].short }} · {{ widgets.length }} widget{{ widgets.length !== 1 ? 's' : '' }}</div>
      </div>
      <div class="dms-top-stretch" />
      <div class="dms-density">
        <button v-for="d in DENSITIES" :key="d.key" :class="['dms-density-btn', { active: density === d.key }]" @click="density = d.key">{{ d.label }}</button>
      </div>
      <div class="dms-zoom-ctrl">
        <button class="dms-top-btn dms-zoom-btn" title="Zoom out" @click="adjustZoom(-0.15)">−</button>
        <button class="dms-top-btn dms-zoom-pct" title="Fit board to viewport" @click="resetView">{{ Math.round(zoom * 100) }}%</button>
        <button class="dms-top-btn dms-zoom-btn" title="Zoom in" @click="adjustZoom(0.15)">+</button>
      </div>
      <button class="dms-top-btn" @click="resetLayout" title="Reset to default layout">↺ Reset</button>
      <button class="dms-top-btn" @click="clearAll" title="Remove all widgets">⌫ Clear</button>

      <!-- Layout presets -->
      <div class="dms-presets" ref="presetsRef">
        <button class="dms-top-btn dms-presets-trigger" @click="showPresets = !showPresets" title="Saved layouts">
          <OhVueIcon name="md-tune" scale="0.8" /> Layouts {{ presets.length ? `(${presets.length})` : '' }}
        </button>
        <div v-if="showPresets" class="dms-presets-dropdown">
          <div class="dms-presets-head">
            <span class="dms-presets-title">Saved Layouts</span>
            <button class="dms-presets-save" @click="promptSavePreset">+ Save current</button>
          </div>
          <div v-if="!presets.length" class="dms-presets-empty">No saved layouts yet.</div>
          <div v-for="p in presets" :key="p.name" class="dms-preset-row">
            <button class="dms-preset-load" @click="loadPreset(p)">{{ p.name }}</button>
            <span class="dms-preset-count">{{ p.widgets.length }}w</span>
            <button class="dms-preset-del" @click="deletePreset(p.name)" title="Delete">✕</button>
          </div>
        </div>
      </div>

      <NuxtLink :to="`/campaign/${id}`" class="dms-top-btn dms-top-btn--danger">✕ Exit</NuxtLink>
    </div>

    <!-- Entity quick-view drawer (opened when clicking {{entity: ...}} tags) -->
    <EntityQuickPanel
      :type="drawer.type"
      :name="drawer.name"
      :campaign-id="id"
      :open="drawer.open"
      @close="drawer.open = false"
    />

    <!-- ── Body ───────────────────────────────────────────────── -->
    <div class="dms-body">

      <!-- Left Palette -->
      <div :class="['dms-palette', { collapsed: palCollapsed }]">

        <!-- Collapsed rail -->
        <div class="dms-palette-rail">
          <button class="dms-palette-collapse" title="Expand palette" @click="palCollapsed = false">»</button>
          <div class="dms-palette-rail-sep" />
          <button v-for="g in palGroups.filter(g => g.items.length)" :key="g.key"
            class="dms-palette-rail-btn"
            :title="`${g.label} (${g.items.length})`"
            @click="palCollapsed = false; openGroups[g.key] = true">
            <span class="rail-dot" :style="{ background: g.color }" />
            <span class="rail-count">{{ g.items.length }}</span>
          </button>
          <div class="dms-palette-rail-sep" />
          <button class="dms-palette-rail-btn" title="Compendium" @click="palCollapsed = false; openGroups.compendium = true">
            <span class="rail-dot" :style="{ background: WIDGET_COLORS['rules-entry'] }" />
          </button>
          <div class="dms-palette-rail-sep" />
          <button class="dms-palette-rail-btn" title="Quick widgets" @click="palCollapsed = false; openGroups.quick = true">
            <span style="font-size:13px;color:var(--accent-l)">✦</span>
          </button>
        </div>

        <!-- Expanded: search + scroll -->
        <div class="dms-palette-search">
          <span class="dms-palette-search-icon">⌕</span>
          <input class="dms-palette-search-input" placeholder="Find entity…" v-model="paletteQuery" />
          <button class="dms-palette-collapse" title="Collapse palette" @click="palCollapsed = true">«</button>
        </div>

        <div class="dms-palette-scroll">

          <!-- Bookmarks group -->
          <div v-if="bookmarkPalItems.length" class="dms-pal-group">
            <div class="dms-pal-group-head" @click="openGroups.bookmarks = !openGroups.bookmarks">
              <span :class="['dms-pal-group-arrow', { open: openGroups.bookmarks }]">▶</span>
              <span class="dms-pal-group-dot" style="background: var(--gold, #b8860b)" />
              <span class="dms-pal-group-label">Bookmarks</span>
              <span class="dms-pal-group-count">{{ bookmarkPalItems.length }}</span>
            </div>
            <template v-if="openGroups.bookmarks">
              <div v-for="item in bookmarkPalItems" :key="item.bm.id"
                :class="['dms-pal-item', { pinned: isEntityPinned(item.widget.kind, item.widget.entityId) }]"
                :draggable="!isEntityPinned(item.widget.kind, item.widget.entityId)"
                :title="isEntityPinned(item.widget.kind, item.widget.entityId) ? 'Already pinned' : 'Drag or double-click to add'"
                @dragstart="!isEntityPinned(item.widget.kind, item.widget.entityId) && onPalDragStart($event, item.widget.kind, item.widget.entityId)"
                @dragend="onDragEnd"
                @dblclick="!isEntityPinned(item.widget.kind, item.widget.entityId) && addWidget({ kind: item.widget.kind, entityId: item.widget.entityId })">
                <span class="dms-pal-item-dot" style="background: var(--gold, #b8860b)" />
                <span class="dms-pal-item-name">{{ item.bm.label }}</span>
                <span class="dms-pal-item-meta">{{ widgetKindLabel({ kind: item.widget.kind } as any) }}</span>
                <span v-if="isEntityPinned(item.widget.kind, item.widget.entityId)" class="dms-pal-item-meta" style="color:var(--success)">✓</span>
              </div>
            </template>
          </div>

          <!-- Quick widgets group -->
          <div class="dms-pal-group">
            <div class="dms-pal-group-head" @click="openGroups.quick = !openGroups.quick">
              <span :class="['dms-pal-group-arrow', { open: openGroups.quick }]">▶</span>
              <span class="dms-pal-group-dot" style="background: var(--accent)" />
              <span class="dms-pal-group-label">Quick</span>
              <span class="dms-pal-group-count">{{ QUICK_WIDGETS.length }}</span>
            </div>
            <div v-if="openGroups.quick" class="dms-pal-quick">
              <div v-for="q in QUICK_WIDGETS" :key="q.kind"
                :class="['dms-pal-quick-btn', { pinned: isWidgetPinned(q.kind) }]"
                :draggable="!isWidgetPinned(q.kind)"
                :title="isWidgetPinned(q.kind) ? 'Already on board' : 'Drag or double-click to add'"
                @dragstart="!isWidgetPinned(q.kind) && onPalDragStart($event, q.kind)"
                @dragend="onDragEnd"
                @dblclick="!isWidgetPinned(q.kind) && addWidget({ kind: q.kind })">
                <span class="dms-pal-quick-icon"><OhVueIcon :name="q.icon" scale="1.1" /></span>
                <span class="dms-pal-quick-label">{{ q.label }}</span>
                <span v-if="isWidgetPinned(q.kind)" style="font-size:10px;color:var(--success)">✓</span>
              </div>
            </div>
          </div>

          <!-- Campaign entity groups -->
          <div v-for="g in palGroups" :key="g.key" class="dms-pal-group">
            <div class="dms-pal-group-head" @click="openGroups[g.key] = !openGroups[g.key]">
              <span :class="['dms-pal-group-arrow', { open: openGroups[g.key] }]">▶</span>
              <span class="dms-pal-group-dot" :style="{ background: g.color }" />
              <span class="dms-pal-group-label">{{ g.label }}</span>
              <span class="dms-pal-group-count">{{ g.items.length }}</span>
            </div>
            <template v-if="openGroups[g.key]">
              <div v-for="e in g.items" :key="e.id"
                :class="['dms-pal-item', { pinned: isEntityPinned(g.key, e.id) }]"
                :draggable="!isEntityPinned(g.key, e.id)"
                :title="isEntityPinned(g.key, e.id) ? 'Already pinned' : 'Drag or double-click to add'"
                @dragstart="!isEntityPinned(g.key, e.id) && onPalDragStart($event, g.key as any, e.id)"
                @dragend="onDragEnd"
                @dblclick="!isEntityPinned(g.key, e.id) && addWidget({ kind: g.key as any, entityId: e.id })">
                <span class="dms-pal-item-dot" :style="{ background: g.color }" />
                <span class="dms-pal-item-name">{{ e.name }}</span>
                <span v-if="isEntityPinned(g.key, e.id)" class="dms-pal-item-meta" style="color:var(--success)">✓</span>
              </div>
              <div v-if="!g.items.length" class="dms-pal-empty">No {{ g.label.toLowerCase() }}</div>
            </template>
          </div>

          <!-- Compendium entries: searched with the palette query -->
          <div class="dms-pal-group">
            <div class="dms-pal-group-head" @click="openGroups.compendium = !openGroups.compendium">
              <span :class="['dms-pal-group-arrow', { open: openGroups.compendium }]">▶</span>
              <span class="dms-pal-group-dot" :style="{ background: WIDGET_COLORS['rules-entry'] }" />
              <span class="dms-pal-group-label">Compendium</span>
              <span class="dms-pal-group-count">{{ paletteQuery.trim() ? compendiumHits.length : '' }}</span>
            </div>
            <template v-if="openGroups.compendium">
              <div v-if="!paletteQuery.trim()" class="dms-pal-empty">Type in the search above to find entries</div>
              <template v-else>
                <div v-for="r in compendiumHits" :key="r.id"
                  :class="['dms-pal-item', { pinned: isRulesPinned(r.id) }]"
                  :draggable="!isRulesPinned(r.id)"
                  :title="isRulesPinned(r.id) ? 'Already pinned' : 'Drag or double-click to add'"
                  @dragstart="!isRulesPinned(r.id) && onPalDragStart($event, 'rules-entry', undefined, r.id)"
                  @dragend="onDragEnd"
                  @dblclick="!isRulesPinned(r.id) && addWidget({ kind: 'rules-entry', rulesId: r.id })">
                  <span class="dms-pal-item-dot" :style="{ background: RULES_KIND_CONFIG[r.kind].color }" />
                  <span class="dms-pal-item-name">{{ r.name }}</span>
                  <span v-if="isRulesPinned(r.id)" class="dms-pal-item-meta" style="color:var(--success)">✓</span>
                  <span v-else class="dms-pal-item-meta">{{ RULES_KIND_CONFIG[r.kind].label }}</span>
                </div>
                <div v-if="!compendiumHits.length" class="dms-pal-empty">No entries</div>
              </template>
            </template>
          </div>

          <div v-if="!palGroups.some(g => g.items.length) && !compendiumHits.length && paletteQuery" class="dms-pal-empty" style="padding:20px;text-align:center">
            No matches for "{{ paletteQuery }}"
          </div>
        </div>

        <div class="dms-pal-foot">
          <kbd>drag</kbd> or <kbd>dbl-click</kbd> to add · <kbd>shift+click</kbd> widget to select · <kbd>esc</kbd> to exit
        </div>
      </div>

      <!-- Widget Canvas -->
      <div ref="canvasRef" :class="['dms-canvas', `density-${density}`, { panning: isPanning }]"
        @dragover.prevent="onCanvasDragOver"
        @drop.prevent="onCanvasDrop"
        @dragleave="onCanvasDragLeave"
        @wheel="onCanvasWheel"
        @pointerdown="onCanvasPanStart">

        <!-- Selection toolbar (appears when multiple widgets are selected) -->
        <Transition name="dms-selectbar">
          <div v-if="selectedIds.length > 1" class="dms-select-bar">
            <span class="dms-select-icon">⊡</span>
            <span class="dms-select-text">{{ selectedIds.length }} widgets selected — drag any to move as group</span>
            <button class="dms-select-clear" title="Deselect all" @click="clearSelection">✕</button>
          </div>
        </Transition>

        <div ref="gridRef" :class="['dms-plane', `density-${density}`, { 'drag-active': isDragFromPalette }]"
          :style="gridStyle">

          <!-- Empty state -->
          <div v-if="!widgets.length" class="dms-empty">
            <div class="dms-empty-icon">GM</div>
            <div class="dms-empty-title">Empty Screen</div>
            <div class="dms-empty-sub">Drag entities from the palette anywhere on the plane. Resize, rearrange, and clear as you go — layout is saved per campaign.</div>
            <div class="dms-empty-quick">
              <button class="dms-empty-quick-btn" @click="resetLayout">↺ Suggest a layout</button>
            </div>
          </div>

          <!-- Drop preview ghost -->
          <div v-if="dragPreview" class="dms-drop-preview"
            :style="{
              left:   dragPreview.x + 'px',
              top:    dragPreview.y + 'px',
              width:  dragPreview.width  + 'px',
              height: dragPreview.height + 'px',
            }" />

          <!-- Widgets -->
          <div v-for="w in widgets" :key="w.id"
            :class="['dms-w', { dragging: dragState?.from?.widgetId === w.id, selected: isSelected(w.id) }]"
            :style="{ left: w.x + 'px', top: w.y + 'px', width: w.width + 'px', height: w.height + 'px' }"
            data-widget>

            <!-- Widget header -->
            <div class="dms-w-head"
              @pointerdown.prevent.stop="onWidgetPointerDown($event, w)">
              <span class="dms-w-head-dot" :style="{ background: widgetColor(w), color: widgetColor(w) }" />
              <span class="dms-w-head-kind">{{ widgetKindLabel(w) }}</span>
              <span class="dms-w-head-title">{{ widgetTitle(w) }}</span>
              <div class="dms-w-head-actions">
                <button v-if="w.kind === 'npc-generator'" class="dms-w-act" title="Configure" @pointerdown.stop @click.stop="npcGenRef?.openConfig()"><OhVueIcon name="md-settings" scale="0.8" /></button>
                <button class="dms-w-act del" title="Remove widget" @pointerdown.stop @click="removeWidget(w.id)">✕</button>
              </div>
            </div>

            <!-- Widget content -->
            <WidgetSession    v-if="w.kind === 'session'       && getEntity(w)" :entity="getEntity(w)!" class="dms-w-fill" />
            <WidgetNpc        v-else-if="w.kind === 'npc'      && getEntity(w)" :entity="getEntity(w)!" class="dms-w-fill" />
            <WidgetLocation   v-else-if="w.kind === 'location' && getEntity(w)" :entity="getEntity(w)!" class="dms-w-fill" />
            <WidgetFaction    v-else-if="w.kind === 'faction'  && getEntity(w)" :entity="getEntity(w)!" class="dms-w-fill" />
            <WidgetQuest      v-else-if="w.kind === 'quest'    && getEntity(w)" :entity="getEntity(w)!" class="dms-w-fill" />
            <WidgetNote       v-else-if="(w.kind === 'note' || w.kind === 'event') && getEntity(w)" :entity="getEntity(w)!" class="dms-w-fill" />
            <WidgetEncounterLink v-else-if="w.kind === 'encounter-link'" :campaign-id="id" :encounter-id="w.encounterId" class="dms-w-fill" @update:encounter-id="setEncounterId(w.id, $event)" />
            <WidgetConditionsGrid v-else-if="w.kind === 'conditions-grid'" :game="campaignGameId" class="dms-w-fill" />
            <WidgetTimer       v-else-if="w.kind === 'timer'"        class="dms-w-fill" />
            <WidgetRulesLookup v-else-if="w.kind === 'rules-lookup'" :game="campaignGameId" class="dms-w-fill" />
            <WidgetRandomTable v-else-if="w.kind === 'random-table' && getEntity(w)" :entity="getEntity(w)!" class="dms-w-fill" />
            <WidgetRumor       v-else-if="w.kind === 'rumor'       && getEntity(w)" :entity="getEntity(w)!" class="dms-w-fill" />
            <WidgetScratchpad    v-else-if="w.kind === 'scratchpad'"     v-model="scratchpad" class="dms-w-fill" />
            <WidgetNpcGenerator v-else-if="w.kind === 'npc-generator'" :ref="(el: any) => { npcGenRef = el }" :campaign-id="id" :game="campaignGameId" class="dms-w-fill" />
            <WidgetRulesEntry v-else-if="w.kind === 'rules-entry' && w.rulesId" :rules-id="w.rulesId" :game="campaignGameId" class="dms-w-fill" @loaded="rulesTitles[w.rulesId] = $event" />
            <WidgetDcTable v-else-if="w.kind === 'dc-table'" :config="w.config ?? {}" :game="campaignGameId" :pinned-rules-ids="[...pinnedRulesIds]" class="dms-w-fill" @update:config="updateWidgetConfig(w.id, $event)" />
            <WidgetWeather v-else-if="w.kind === 'weather'" :config="w.config ?? {}" class="dms-w-fill" @update:config="updateWidgetConfig(w.id, $event)" />
            <div v-else class="dms-w-missing">Entity removed or not found.</div>

            <!-- Resize handle -->
            <div class="dms-w-resize"
              :class="{ active: resizeState?.widgetId === w.id }"
              @mousedown.prevent.stop="onResizeStart($event, w)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { lsKey } from '~/utils/appNamespace'
import { GAME_CONFIG, campaignGame, type GameId } from '~/types/game'
import { dbApi } from '~/composables/useDb'
import { rulesSearch } from '~/composables/useRules'
import { RULES_KIND_CONFIG, type RulesEntity } from '~/types/rules'
import { useEntities } from '~/composables/useEntities'
import { usePageChrome } from '~/composables/usePageChrome'
import { useBookmarks } from '~/composables/useBookmarks'
import { ENTITY_TYPE_CONFIG, ENTITY_TYPE_ROUTE, ENTITY_TYPE_LIST } from '~/types/entities'
import type { EntityType } from '~/types/entities'
import { DM_SCREEN_CTX_KEY } from '~/composables/useDmScreenContext'
import { type WidgetKind, type DmWidget, SINGLETONS, DEFAULT_SIZES, WIDGET_LABELS, WIDGET_COLORS } from '~/types/widgets'

// ── Route ──────────────────────────────────────────────────────────────────
const route = useRoute()
const id = Number(route.params.id)

// ── Hide spine ─────────────────────────────────────────────────────────────
const { hideSpine, showSpine } = usePageChrome()
onMounted(hideSpine)
onUnmounted(showSpine)

// ── Data loading ────────────────────────────────────────────────────────────
const entitiesStore = useEntities()
const campaignName = ref('')
const campaignGameId = ref<GameId>('pf2e')

onMounted(async () => {
  const c = await dbApi.campaigns.get(id)
  campaignName.value = c?.name ?? ''
  campaignGameId.value = campaignGame(c)

  if (!entitiesStore.entities.some(e => e.campaignId === id)) {
    await entitiesStore.loadAll(id)
  }

  await nextTick()
  fitZoom()
})



// ── NPC Generator ref (singleton widget) ──────────────────────────────────
const npcGenRef = ref<{ openConfig: () => void } | null>(null)

// ── Entity quick-view drawer ───────────────────────────────────────────────
const drawer = reactive({ open: false, type: '', name: '' })

provide(DM_SCREEN_CTX_KEY, {
  onEntityClick: (type: string, name: string) => {
    if (!(type in ENTITY_TYPE_CONFIG)) return false
    drawer.type = type; drawer.name = name; drawer.open = true
    return true
  },
})

// ── Selection state ────────────────────────────────────────────────────────
const selectedIds = ref<string[]>([])
const isSelected = (id: string) => selectedIds.value.includes(id)
function toggleSelect(id: string) {
  const i = selectedIds.value.indexOf(id)
  if (i >= 0) selectedIds.value.splice(i, 1)
  else selectedIds.value.push(id)
}
function selectOnly(id: string) { selectedIds.value = [id] }
function clearSelection() { selectedIds.value = [] }

// ── Widget state ───────────────────────────────────────────────────────────

const MIN_W = 200, MIN_H = 96
const SNAP  = 24
const WIDGET_GAP  = 8    // enforced gap between any two widgets
const PLANE_CENTER = 4000 // CSS origin of the plane; (0,0) in logical terms lives here
function snap(v: number) { return Math.round(v / SNAP) * SNAP }

const LS_KEY    = lsKey(`dmscreen-v4-${id}`)
const LS_KEY_V3 = lsKey(`dmscreen-v3-${id}`)
const LS_KEY_V2 = lsKey(`dmscreen-v2-${id}`)
const LS_SCRATCH = lsKey(`dmscreen-scratch-v2-${id}`)

const widgets  = ref<DmWidget[]>([])
const scratchpad = ref('')

// ── Free-placement helpers ─────────────────────────────────────────────────
// Gap is included in all overlap checks so widgets never touch
function isOverlapping(x: number, y: number, width: number, height: number, excludeIds?: string[]): boolean {
  for (const w of widgets.value) {
    if (excludeIds?.includes(w.id)) continue
    const noOverlap = x + width  + WIDGET_GAP <= w.x || x >= w.x + w.width  + WIDGET_GAP ||
                      y + height + WIDGET_GAP <= w.y || y >= w.y + w.height + WIDGET_GAP
    if (!noOverlap) return true
  }
  return false
}

// Search for a free spot spiralling outward from the plane center
function findFreeXY(width: number, height: number): [number, number] {
  const startX = snap(PLANE_CENTER - width  / 2)
  const startY = snap(PLANE_CENTER - height / 2)
  const step   = SNAP * 2 + WIDGET_GAP
  for (let row = 0; row < 200; row++) {
    const y = startY + row * (height + step)
    for (let col = 0; col < 20; col++) {
      const x = startX + col * (width + step)
      if (!isOverlapping(x, y, width, height)) return [x, y]
    }
  }
  return [PLANE_CENTER, PLANE_CENTER]
}

// Flow-pack widgets that have no position yet, anchored to the plane center
function autolayout(ws: DmWidget[]): DmWidget[] {
  const GAP   = SNAP * 2 + WIDGET_GAP
  const ROW_W = 2400
  let x = snap(PLANE_CENTER), y = snap(PLANE_CENTER), rowH = 0

  return ws.map(w => {
    if (w.x != null && w.y != null) {
      rowH = Math.max(rowH, w.height)
      return w
    }
    if (x + w.width - snap(PLANE_CENTER) > ROW_W && x > snap(PLANE_CENTER)) {
      x = snap(PLANE_CENTER); y += rowH + GAP; rowH = 0
    }
    const result = { ...w, x, y }
    x += w.width + GAP
    rowH = Math.max(rowH, w.height)
    return result
  })
}

// Load from localStorage — v4 format first, then migrate v3/v2
if (import.meta.client) {
  try {
    let raw = localStorage.getItem(LS_KEY)

    if (!raw) {
      // v3 → v4: coordinates were top-left based; shift to plane-center based
      const v3raw = localStorage.getItem(LS_KEY_V3)
      if (v3raw) {
        const v3 = JSON.parse(v3raw)
        if (Array.isArray(v3) && v3.length) {
          raw = JSON.stringify(v3.map((w: any) => ({
            ...w,
            x: (w.x ?? 0) + PLANE_CENTER,
            y: (w.y ?? 0) + PLANE_CENTER,
          })))
        }
      }
    }

    if (!raw) {
      // v2 → v4: col/row grid → pixel + center offset
      const v2raw = localStorage.getItem(LS_KEY_V2)
      if (v2raw) {
        const v2 = JSON.parse(v2raw)
        if (Array.isArray(v2) && v2.length) {
          const CELL_W = 189, ROW_H = 110, GAP = 12
          const migrated = v2.map((w: any) => {
            if (w.kind === 'dice' || w.kind === 'search') return null
            if (w.x != null) return { ...w, x: w.x + PLANE_CENTER, y: w.y + PLANE_CENTER }
            const cols = w.cols ?? 3, rows = w.rows ?? 2
            const col  = w.col  ?? 1, row  = w.row  ?? 1
            const { col: _c, row: _r, cols: _cs, rows: _rs, size: _s, ...rest } = w
            return {
              ...rest,
              x: snap((col  - 1) * (CELL_W + GAP)) + PLANE_CENTER,
              y: snap((row  - 1) * (ROW_H  + GAP)) + PLANE_CENTER,
              width:  snap(cols * CELL_W + (cols - 1) * GAP),
              height: snap(rows * ROW_H  + (rows - 1) * GAP),
            }
          }).filter(Boolean)
          raw = JSON.stringify(migrated)
        }
      }
    }

    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length) {
        widgets.value = parsed.filter((w: any) => w.kind !== 'dice' && w.kind !== 'search' && w.kind !== 'system-entity')
      }
    }
  } catch {}
  try { scratchpad.value = localStorage.getItem(LS_SCRATCH) || '' } catch {}
}

// Persist to localStorage (debounced)
let persistTimer: ReturnType<typeof setTimeout> | null = null
watch(widgets, v => {
  if (!import.meta.client) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(v)) } catch {}
  }, 400)
}, { deep: true })

watch(scratchpad, v => {
  if (import.meta.client) {
    try { localStorage.setItem(LS_SCRATCH, v) } catch {}
  }
})

// ── Default layout ─────────────────────────────────────────────────────────
function buildDefaultLayout(): DmWidget[] {
  const ents = entitiesStore.entities.filter(e => e.campaignId === id)
  const byType = (t: string) => ents.filter(e => e.type === t)
  const ws: Array<Omit<DmWidget, 'x' | 'y'>> = []

  const lastSession = byType('session').at(-1)
  if (lastSession) ws.push({ id: `w-s-${lastSession.id}`, kind: 'session', entityId: lastSession.id, width: 1200, height: 240 })
  ws.push({ id: 'w-enc', kind: 'encounter-link', width: 576, height: 240 })
  byType('npc').slice(0, 2).forEach(n => ws.push({ id: `w-n-${n.id}`, kind: 'npc', entityId: n.id, width: 576, height: 120 }))
  const activeQuest = byType('quest').find(q => (q.attributes as any)?.status === 'active')
  if (activeQuest) ws.push({ id: `w-q-${activeQuest.id}`, kind: 'quest', entityId: activeQuest.id, width: 576, height: 120 })
  ws.push({ id: 'w-cond', kind: 'conditions-grid', width: 576, height: 240 })
  ws.push({ id: 'w-scratch', kind: 'scratchpad', width: 1200, height: 120 })

  return autolayout(ws as DmWidget[])
}

function resetLayout() {
  if (confirm('Reset layout to defaults?')) {
    widgets.value = buildDefaultLayout()
    clearSelection()
  }
}

function clearAll() {
  if (confirm('Remove all widgets? (Scratchpad is kept.)')) {
    widgets.value = []
    clearSelection()
  }
}

// ── Widget config ──────────────────────────────────────────────────────────
function updateWidgetConfig(wid: string, config: Record<string, any>) {
  const w = widgets.value.find(x => x.id === wid)
  if (w) w.config = config
}

// ── Layout presets ─────────────────────────────────────────────────────────
interface LayoutPreset { name: string; widgets: DmWidget[] }
const LS_PRESETS = lsKey(`dmscreen-presets-${id}`)
const presets = ref<LayoutPreset[]>([])
const showPresets = ref(false)
const presetsRef = ref<HTMLElement | null>(null)

if (import.meta.client) {
  try {
    const raw = localStorage.getItem(LS_PRESETS)
    if (raw) presets.value = JSON.parse(raw)
  } catch {}
}

function savePresets() {
  try { localStorage.setItem(LS_PRESETS, JSON.stringify(presets.value)) } catch {}
}

function promptSavePreset() {
  const name = prompt('Layout name:')?.trim()
  if (!name) return
  const existing = presets.value.findIndex(p => p.name === name)
  const entry: LayoutPreset = { name, widgets: JSON.parse(JSON.stringify(widgets.value)) }
  if (existing >= 0) presets.value[existing] = entry
  else presets.value.push(entry)
  savePresets()
  showPresets.value = false
}

function loadPreset(p: LayoutPreset) {
  if (!confirm(`Load layout "${p.name}"? Current layout will be replaced.`)) return
  widgets.value = JSON.parse(JSON.stringify(p.widgets))
  clearSelection()
  showPresets.value = false
}

function deletePreset(name: string) {
  presets.value = presets.value.filter(p => p.name !== name)
  savePresets()
}

// Close presets dropdown on outside click
if (import.meta.client) {
  const onDocClick = (e: MouseEvent) => {
    if (showPresets.value && presetsRef.value && !presetsRef.value.contains(e.target as Node)) {
      showPresets.value = false
    }
  }
  onMounted(() => document.addEventListener('click', onDocClick))
  onUnmounted(() => document.removeEventListener('click', onDocClick))
}

// ── Widget helpers ─────────────────────────────────────────────────────────
function getEntity(w: DmWidget) {
  if (!w.entityId) return null
  return entitiesStore.entities.find(e => e.id === w.entityId && e.campaignId === id) ?? null
}

function canAdd(kind: WidgetKind, entityId?: number, rulesId?: string): boolean {
  if (SINGLETONS.includes(kind) && widgets.value.some(w => w.kind === kind)) return false
  if (entityId != null && widgets.value.some(w => w.kind === kind && w.entityId === entityId)) return false
  if (rulesId != null && widgets.value.some(w => w.kind === kind && w.rulesId === rulesId)) return false
  return true
}

function addWidget(opts: { kind: WidgetKind; entityId?: number; rulesId?: string }) {
  const { kind, entityId, rulesId } = opts
  const [width, height] = DEFAULT_SIZES[kind]
  const [x, y] = findFreeXY(width, height)
  addWidgetAt({ kind, entityId, rulesId, x, y, width, height })
}

function addWidgetAt(opts: { kind: WidgetKind; entityId?: number; rulesId?: string; x: number; y: number; width: number; height: number }) {
  const { kind, entityId, rulesId, x, y, width, height } = opts
  if (!canAdd(kind, entityId, rulesId)) return
  const wid = entityId != null ? `w-${kind}-${entityId}`
    : rulesId != null ? `w-${kind}-${rulesId}`
    : `w-${kind}-${Date.now()}`
  widgets.value.push({ id: wid, kind, entityId, rulesId, x, y, width, height })
}

function removeWidget(wid: string) {
  widgets.value = widgets.value.filter(w => w.id !== wid)
  selectedIds.value = selectedIds.value.filter(sid => sid !== wid)
}

function setEncounterId(wid: string, encounterId: number | null) {
  widgets.value = widgets.value.map(w => w.id === wid ? { ...w, encounterId } : w)
}

// ── Resize ─────────────────────────────────────────────────────────────────
const gridRef = ref<HTMLElement | null>(null)

interface ResizeState {
  widgetId: string
  startX: number; startY: number
  startWidth: number; startHeight: number
  zoom: number
}
const resizeState = ref<ResizeState | null>(null)

function onResizeStart(e: MouseEvent, w: DmWidget) {
  resizeState.value = {
    widgetId: w.id, startX: e.clientX, startY: e.clientY,
    startWidth: w.width, startHeight: w.height, zoom: zoom.value,
  }
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd, { once: true })
}

function onResizeMove(e: MouseEvent) {
  const s = resizeState.value
  if (!s) return
  const w = widgets.value.find(x => x.id === s.widgetId)
  if (!w) return
  const newWidth  = Math.max(MIN_W, snap(s.startWidth  + (e.clientX - s.startX) / s.zoom))
  const newHeight = Math.max(MIN_H, snap(s.startHeight + (e.clientY - s.startY) / s.zoom))
  if (w.width === newWidth && w.height === newHeight) return
  // Allow growing only when the expanded footprint doesn't overlap another widget
  if (newWidth > w.width || newHeight > w.height) {
    if (isOverlapping(w.x, w.y, newWidth, newHeight, [w.id])) return
  }
  w.width  = newWidth
  w.height = newHeight
}

function onResizeEnd() {
  resizeState.value = null
  document.removeEventListener('mousemove', onResizeMove)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})

// Pre-computed pin sets so template v-for items do O(1) lookups instead of O(n) scans
const pinnedKinds = computed(() => new Set(widgets.value.map(w => w.kind)))
const pinnedEntityKeys = computed(() => {
  const s = new Set<string>()
  for (const w of widgets.value) if (w.entityId != null) s.add(`${w.kind}:${w.entityId}`)
  return s
})
const pinnedRulesIds = computed(() => {
  const s = new Set<string>()
  for (const w of widgets.value) if (w.rulesId != null) s.add(w.rulesId)
  return s
})

function isWidgetPinned(kind: WidgetKind)              { return pinnedKinds.value.has(kind) }
function isEntityPinned(kind: string, entityId: number) { return pinnedEntityKeys.value.has(`${kind}:${entityId}`) }
function isRulesPinned(rulesId: string)                 { return pinnedRulesIds.value.has(rulesId) }

function widgetTitle(w: DmWidget): string {
  if (w.kind === 'encounter-link')   return 'Encounter'
  if (w.kind === 'conditions-grid')  return 'Conditions'
  if (w.kind === 'timer')        return 'Timer'
  if (w.kind === 'rules-lookup') return 'Rules Lookup'
  if (w.kind === 'dc-table')     return 'DC Table'
  if (w.kind === 'scratchpad')   return 'Scratchpad'
  if (w.kind === 'rules-entry' && w.rulesId) return rulesTitles[w.rulesId] ?? 'Compendium'
  const e = getEntity(w)
  return e?.name ?? '(missing)'
}

function widgetKindLabel(w: DmWidget): string {
  return WIDGET_LABELS[w.kind] ?? ENTITY_TYPE_CONFIG[w.kind as EntityType]?.label ?? w.kind
}

function widgetColor(w: DmWidget): string {
  return WIDGET_COLORS[w.kind] ?? ENTITY_TYPE_CONFIG[w.kind as EntityType]?.color ?? 'var(--accent)'
}

// ── Density ────────────────────────────────────────────────────────────────
const DENSITIES = [
  { key: 'compact', label: 'Compact' },
  { key: 'comfortable', label: 'Cozy' },
  { key: 'loose', label: 'Loose' },
]
const density = ref('comfortable')

// ── Palette state ──────────────────────────────────────────────────────────
const palCollapsed = ref(false)
const paletteQuery = ref('')

// ── Compendium entries (for palette) ──────────────────────────────────────
const compendiumHits = shallowRef<RulesEntity[]>([])
const rulesTitles = reactive<Record<string, string>>({})
let compendiumTimer: ReturnType<typeof setTimeout> | null = null
watch([paletteQuery, campaignGameId], () => {
  if (compendiumTimer) clearTimeout(compendiumTimer)
  compendiumTimer = setTimeout(async () => {
    const q = paletteQuery.value.trim()
    compendiumHits.value = q ? await rulesSearch(q, 15, [campaignGameId.value]) : []
  }, 150)
})

const ENTITY_TYPES = ENTITY_TYPE_LIST

const QUICK_WIDGETS = [
  { kind: 'encounter-link'  as WidgetKind, label: 'Encounter',       icon: 'gi-broadsword' },
  { kind: 'conditions-grid' as WidgetKind, label: 'Conditions Grid', icon: 'gi-poison' },
  { kind: 'timer'           as WidgetKind, label: 'Timer',           icon: 'gi-hourglass' },
  { kind: 'rules-lookup'    as WidgetKind, label: 'Rules Lookup',    icon: 'gi-book-aura' },
  { kind: 'scratchpad'      as WidgetKind, label: 'Scratchpad',      icon: 'gi-scroll-unfurled' },
  { kind: 'npc-generator'   as WidgetKind, label: 'NPC Generator',   icon: 'gi-person' },
  { kind: 'weather'         as WidgetKind, label: 'Weather',         icon: 'gi-lightning-bolt' },
  { kind: 'dc-table'        as WidgetKind, label: 'DC Table',        icon: 'gi-archery-target' },
]

const openGroups = reactive<Record<string, boolean>>({
  bookmarks: true, quick: true,
  session: false, npc: false, location: false, faction: false,
  quest: false, event: false, note: false,
  'random-table': false, rumor: false, compendium: true,
})

const palGroups = computed(() => {
  const q = paletteQuery.value.trim().toLowerCase()
  return ENTITY_TYPES.map(et => ({
    key: et.key,
    label: et.label,
    color: et.color,
    items: entitiesStore.entities
      .filter(e => e.campaignId === id && e.type === et.key && (!q || e.name.toLowerCase().includes(q))),
  }))
})

// ── Drag and drop ──────────────────────────────────────────────────────────
interface DragState {
  kind: WidgetKind
  entityId?: number
  rulesId?: string
  width: number
  height: number
  from?: { widgetId: string; x: number; y: number }
}

const dragState   = ref<DragState | null>(null)
const dragPreview = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const canvasRef   = ref<HTMLElement | null>(null)

const isDragFromPalette = computed(() => !!dragState.value && !dragState.value.from)

// Convert screen coords → plane (canvas-space) coords
function screenToPlane(clientX: number, clientY: number): { x: number; y: number } | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  return {
    x: (clientX - rect.left - CANVAS_PADDING - panX.value) / zoom.value,
    y: (clientY - rect.top  - CANVAS_PADDING - panY.value) / zoom.value,
  }
}

function onPalDragStart(e: DragEvent, kind: WidgetKind, entityId?: number, rulesId?: string) {
  const [width, height] = DEFAULT_SIZES[kind]
  dragState.value = { kind, entityId, rulesId, width, height }
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
}

function onWidgetPointerDown(e: PointerEvent, w: DmWidget) {
  if (e.button > 0) return

  // Shift+click: toggle selection, don't start drag
  if (e.shiftKey) {
    toggleSelect(w.id)
    return
  }

  // Regular click: select only this widget unless already in multi-selection
  if (!isSelected(w.id)) selectOnly(w.id)

  dragState.value = { kind: w.kind, entityId: w.entityId, rulesId: w.rulesId, width: w.width, height: w.height, from: { widgetId: w.id, x: w.x, y: w.y } }

  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)

  // Offset of pointer relative to widget top-left in plane coords
  const startPlane = screenToPlane(e.clientX, e.clientY)!
  const offsetX = startPlane.x - w.x
  const offsetY = startPlane.y - w.y

  function onMove(ev: PointerEvent) {
    if (!dragState.value?.from) return
    const pos = screenToPlane(ev.clientX, ev.clientY)
    if (!pos) return
    const newX = snap(pos.x - offsetX)
    const newY = snap(pos.y - offsetY)

    const isGroupDrag = selectedIds.value.includes(w.id) && selectedIds.value.length > 1

    if (isGroupDrag) {
      const dx = newX - dragState.value.from.x
      const dy = newY - dragState.value.from.y
      const groupIds = selectedIds.value
      let valid = true
      for (const gid of groupIds) {
        const gw = widgets.value.find(x => x.id === gid)
        if (!gw) continue
        const nx = gw.x + dx
        const ny = gw.y + dy
        if (isOverlapping(nx, ny, gw.width, gw.height, groupIds)) { valid = false; break }
      }
      dragPreview.value = valid ? { x: newX, y: newY, width: w.width, height: w.height } : null
    } else {
      dragPreview.value = isOverlapping(newX, newY, w.width, w.height, [w.id])
        ? null
        : { x: newX, y: newY, width: w.width, height: w.height }
    }
  }

  function onUp() {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    onCanvasDrop()
  }

  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
}

function onCanvasDragOver(e: DragEvent) {
  if (!dragState.value) return
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  const pos = screenToPlane(e.clientX, e.clientY)
  if (!pos) return
  const { width, height } = dragState.value
  const x = snap(pos.x)
  const y = snap(pos.y)
  dragPreview.value = isOverlapping(x, y, width, height)
    ? null
    : { x, y, width, height }
}

function onCanvasDragLeave(e: DragEvent) {
  if (!e.relatedTarget) return
  const canvas = canvasRef.value
  if (canvas && !canvas.contains(e.relatedTarget as Node)) dragPreview.value = null
}

function onCanvasDrop() {
  if (!dragState.value) return
  const pos = dragPreview.value
  if (!pos) { onDragEnd(); return }

  if (dragState.value.from) {
    const srcId = dragState.value.from.widgetId
    const isGroupDrag = selectedIds.value.includes(srcId) && selectedIds.value.length > 1
    if (isGroupDrag) {
      const dx = pos.x - dragState.value.from.x
      const dy = pos.y - dragState.value.from.y
      widgets.value = widgets.value.map(w => {
        if (!selectedIds.value.includes(w.id)) return w
        return { ...w, x: w.x + dx, y: w.y + dy }
      })
    } else {
      widgets.value = widgets.value.map(w => w.id === srcId ? { ...w, x: pos.x, y: pos.y } : w)
    }
  } else {
    addWidgetAt({ kind: dragState.value.kind, entityId: dragState.value.entityId, rulesId: dragState.value.rulesId, x: pos.x, y: pos.y, width: pos.width, height: pos.height })
  }
  onDragEnd()
}

function onDragEnd() {
  dragState.value  = null
  dragPreview.value = null
}

// ── Pan / Zoom ─────────────────────────────────────────────────────────────
const CANVAS_PADDING = 18
const ZOOM_MIN = 0.15, ZOOM_MAX = 3
const ZOOM_FIT_MIN = 0.2, ZOOM_FIT_MAX = 1.0

const panX = ref(0)
const panY = ref(0)
const zoom = ref(1)
const isPanning = ref(false)

const gridStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
  transformOrigin: '0 0',
}))

function zoomTowardPoint(cx: number, cy: number, newZoom: number) {
  const sf = newZoom / zoom.value
  panX.value = cx * (1 - sf) + panX.value * sf
  panY.value = cy * (1 - sf) + panY.value * sf
  zoom.value = newZoom
}

function fitZoom() {
  const canvas = canvasRef.value
  if (!canvas) return
  if (!widgets.value.length) {
    zoom.value  = 0.8
    panX.value  = canvas.clientWidth  / 2 - PLANE_CENTER * 0.8
    panY.value  = canvas.clientHeight / 2 - PLANE_CENTER * 0.8
    return
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const w of widgets.value) {
    if (w.x           < minX) minX = w.x
    if (w.y           < minY) minY = w.y
    if (w.x + w.width  > maxX) maxX = w.x + w.width
    if (w.y + w.height > maxY) maxY = w.y + w.height
  }
  const contentW = maxX - minX + 4 * CANVAS_PADDING
  const contentH = maxY - minY + 4 * CANVAS_PADDING
  const z = Math.max(ZOOM_FIT_MIN, Math.min(ZOOM_FIT_MAX, Math.min(canvas.clientWidth / contentW, canvas.clientHeight / contentH)))
  zoom.value  = z
  panX.value  = CANVAS_PADDING - minX * z
  panY.value  = CANVAS_PADDING - minY * z
}

function onCanvasWheel(e: WheelEvent) {
  const canvas = canvasRef.value
  if (!canvas) return

  if (e.ctrlKey) {
    // Ctrl+scroll always zooms, even over a widget
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom.value * factor))
    const rect = canvas.getBoundingClientRect()
    zoomTowardPoint(e.clientX - rect.left - CANVAS_PADDING, e.clientY - rect.top - CANVAS_PADDING, newZoom)
    return
  }

  // If the scroll started inside a widget, let the browser scroll the widget content
  if ((e.target as HTMLElement).closest('[data-widget]')) return

  e.preventDefault()
  panX.value -= e.deltaX
  panY.value -= e.deltaY
}

function onCanvasPanStart(e: PointerEvent) {
  if (dragState.value || resizeState.value) return
  const target = e.target as HTMLElement
  if (target.closest('[data-widget]')) return
  clearSelection()
  e.preventDefault()
  isPanning.value = true
  const canvas = canvasRef.value!
  const startPX = panX.value - e.clientX
  const startPY = panY.value - e.clientY
  canvas.setPointerCapture(e.pointerId)
  function onMove(ev: PointerEvent) {
    panX.value = ev.clientX + startPX
    panY.value = ev.clientY + startPY
  }
  function onUp() {
    isPanning.value = false
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
}

function adjustZoom(delta: number) {
  const canvas = canvasRef.value
  if (!canvas) return
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom.value + delta))
  zoomTowardPoint(canvas.clientWidth / 2, canvas.clientHeight / 2, newZoom)
}

function resetView() {
  panX.value = 0
  panY.value = 0
  fitZoom()
}

// ── Bookmarks palette integration ─────────────────────────────────────────
const { bookmarks } = useBookmarks()

const SEGMENT_TO_KIND = Object.fromEntries(
  Object.entries(ENTITY_TYPE_ROUTE).map(([k, v]) => [v, k as WidgetKind])
) as Record<string, WidgetKind>

function bookmarkWidgetInfo(route: string): { kind: WidgetKind; entityId: number } | null {
  const m = route.match(/^\/campaign\/(\d+)\/([^/?]+)\/(\d+)$/)
  if (!m || Number(m[1]) !== id) return null
  const kind = SEGMENT_TO_KIND[m[2]]
  if (!kind) return null
  return { kind, entityId: Number(m[3]) }
}

const bookmarkPalItems = computed(() =>
  bookmarks.value.flatMap(bm => {
    const widget = bookmarkWidgetInfo(bm.route)
    return widget ? [{ bm, widget }] : []
  })
)
</script>

<style scoped>
.dms-root {
  position: fixed; inset: 0; z-index: 380;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--bg);
  animation: dms-fade 0.20s ease both;
}
@keyframes dms-fade { from { opacity: 0; } to { opacity: 1; } }

.dms-root::before {
  content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 60% 45% at 12% -5%, color-mix(in oklch, var(--accent) 25%, transparent) 0%, transparent 55%),
    radial-gradient(ellipse 55% 40% at 92% 105%, color-mix(in oklch, var(--accent-d) 18%, transparent) 0%, transparent 55%);
}

/* ── Top bar ── */
.dms-top {
  position: relative; z-index: 2;
  display: flex; align-items: center; gap: 14px;
  padding: 0 18px; height: 54px; flex-shrink: 0;
  background: var(--surface);
  backdrop-filter: blur(32px) saturate(180%);
  border-bottom: 1px solid var(--border);
}
.dms-mark {
  display: flex; align-items: center; gap: 9px;
  font-family: var(--fh); font-size: 13px; font-weight: 700;
  color: var(--accent-l); letter-spacing: 0.10em; text-transform: uppercase;
}
.dms-mark-icon {
  width: 24px; height: 24px; border-radius: 6px;
  background: var(--accent-bg); border: 1px solid color-mix(in oklch, var(--accent) 45%, transparent);
  display: flex; align-items: center; justify-content: center; font-size: 13px;
  box-shadow: 0 0 16px color-mix(in oklch, var(--accent) 30%, transparent);
}
.dms-sep-v { width: 1px; height: 22px; background: var(--border-hi); flex-shrink: 0; }
.dms-camp { display: flex; flex-direction: column; line-height: 1.2; }
.dms-camp-name { font-size: 14px; font-weight: 600; color: var(--text); }
.dms-camp-sub { font-size: 11px; color: var(--text3); font-family: var(--fm); }
.dms-top-stretch { flex: 1; }

.dms-density { display: flex; border: 1px solid var(--border-hi); border-radius: 8px; overflow: hidden; }
.dms-density-btn {
  padding: 5px 10px; font-size: 11px; font-family: var(--fm); font-weight: 500;
  color: var(--text3); background: transparent; transition: all 0.14s;
}
.dms-density-btn + .dms-density-btn { border-left: 1px solid var(--border); }
.dms-density-btn.active { background: var(--accent-bg); color: var(--accent-l); }
.dms-density-btn:hover:not(.active) { background: var(--surface-hi); color: var(--text); }

.dms-top-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 8px; text-decoration: none;
  background: var(--surface); border: 1px solid var(--border-hi);
  color: var(--text2); font-size: 12px; font-weight: 500;
  transition: all 0.14s; cursor: pointer; white-space: nowrap;
}
.dms-top-btn:hover { background: var(--surface-hi); border-color: var(--border-hi); color: var(--text); }
.dms-top-btn.active { background: var(--accent-bg); border-color: color-mix(in oklch, var(--accent) 45%, transparent); color: var(--accent-l); }
.dms-top-btn--danger:hover { background: var(--danger-bg); border-color: color-mix(in oklch, var(--danger) 40%, transparent); color: var(--danger); }

.dms-zoom-ctrl { display: flex; gap: 1px; }
.dms-zoom-btn { padding: 6px 10px; font-size: 14px; font-weight: 600; min-width: 32px; justify-content: center; }
.dms-zoom-pct { min-width: 52px; justify-content: center; font-family: var(--fm); font-size: 11px; }

/* ── Layout presets ── */
.dms-presets { position: relative; }
.dms-presets-dropdown {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 400;
  min-width: 240px;
  background: var(--surface-solid); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: var(--sh-md); overflow: hidden;
}
.dms-presets-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  background: var(--surface-hi);
}
.dms-presets-title { font-size: 11px; font-weight: 700; color: var(--text2); font-family: var(--fm); letter-spacing: 0.06em; text-transform: uppercase; }
.dms-presets-save { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--accent); background: var(--accent-bg); color: var(--accent-l); cursor: pointer; }
.dms-presets-empty { padding: 12px; font-size: 12px; color: var(--text3); font-style: italic; text-align: center; }
.dms-preset-row { display: flex; align-items: center; gap: 6px; padding: 4px 8px 4px 12px; border-bottom: 1px solid var(--parch-line); }
.dms-preset-row:last-child { border-bottom: none; }
.dms-preset-load { flex: 1; text-align: left; font-size: 12px; font-weight: 600; color: var(--text); background: none; border: none; cursor: pointer; padding: 4px 0; }
.dms-preset-load:hover { color: var(--accent-l); }
.dms-preset-count { font-size: 10px; color: var(--text3); font-family: var(--fm); flex-shrink: 0; }
.dms-preset-del { font-size: 10px; color: var(--text3); background: none; border: none; cursor: pointer; padding: 2px 4px; border-radius: 3px; flex-shrink: 0; }
.dms-preset-del:hover { color: var(--danger); background: var(--danger-bg); }

/* ── Body ── */
.dms-body { position: relative; z-index: 1; flex: 1; display: flex; overflow: hidden; }

/* ── Palette ── */
.dms-palette {
  width: 248px; flex-shrink: 0;
  background: var(--surface);
  backdrop-filter: blur(28px) saturate(180%);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column; overflow: hidden;
  transition: width 0.22s cubic-bezier(0.4,0,0.2,1);
}
.dms-palette.collapsed { width: 48px; }
.dms-palette.collapsed .dms-palette-search,
.dms-palette.collapsed .dms-palette-scroll,
.dms-palette.collapsed .dms-pal-foot { display: none; }

.dms-palette-rail {
  display: none; flex-direction: column; align-items: center;
  padding: 10px 0; gap: 6px; flex: 1;
}
.dms-palette.collapsed .dms-palette-rail { display: flex; }
.dms-palette-collapse {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; color: var(--text3);
  font-size: 11px; cursor: pointer; flex-shrink: 0; transition: all 0.14s;
}
.dms-palette-collapse:hover { background: var(--surface-hi); color: var(--text); }
.dms-palette-rail-btn {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; color: var(--text3);
  font-size: 14px; cursor: pointer; transition: all 0.14s; position: relative;
}
.dms-palette-rail-btn:hover { background: var(--surface-hi); color: var(--text); }
.rail-dot { width: 7px; height: 7px; border-radius: 50%; }
.rail-count {
  position: absolute; top: -2px; right: -2px;
  font-family: var(--fm); font-size: 9px; font-weight: 600;
  color: var(--text3); background: var(--bg2);
  border: 1px solid var(--border); border-radius: 99px; padding: 0 4px; line-height: 1.3;
}
.dms-palette-rail-sep { width: 24px; height: 1px; background: var(--border); margin: 4px 0; }

.dms-palette-search {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 10px 10px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.dms-palette-search-icon { font-size: 13px; color: var(--text3); flex-shrink: 0; }
.dms-palette-search-input {
  flex: 1; background: none; border: none; outline: none;
  font-size: 13px; color: var(--text); font-family: var(--fu);
}
.dms-palette-search-input::placeholder { color: var(--text3); }

.dms-palette-scroll { flex: 1; overflow-y: auto; padding: 6px; }
.dms-palette-scroll::-webkit-scrollbar { width: 4px; }
.dms-palette-scroll::-webkit-scrollbar-thumb { background: var(--border-hi); }

.dms-pal-group { margin-bottom: 4px; }
.dms-pal-group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px 4px; cursor: pointer; user-select: none;
}
.dms-pal-group-arrow { font-size: 9px; color: var(--text3); transition: transform 0.18s; width: 10px; }
.dms-pal-group-arrow.open { transform: rotate(90deg); }
.dms-pal-group-dot { width: 7px; height: 7px; border-radius: 2px; flex-shrink: 0; opacity: 0.8; }
.dms-pal-group-label { flex: 1; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text2); }
.dms-pal-group-count { font-family: var(--fm); font-size: 10px; color: var(--text3); }

.dms-pal-item {
  display: flex; align-items: center; gap: 9px;
  padding: 5px 10px 5px 22px; border-radius: 6px; cursor: grab;
  transition: background 0.10s; margin: 1px 0; user-select: none;
}
.dms-pal-item:hover { background: var(--surface-hi); }
.dms-pal-item:active { cursor: grabbing; }
.dms-pal-item.pinned { opacity: 0.42; cursor: default; }
.dms-pal-item-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.dms-pal-item-name {
  flex: 1; min-width: 0; font-size: 12.5px; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dms-pal-item-meta { font-family: var(--fm); font-size: 10px; color: var(--text3); flex-shrink: 0; }

.dms-pal-quick { display: flex; flex-direction: column; gap: 2px; padding: 2px 0 0 14px; }
.dms-pal-quick-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: 6px; cursor: grab;
  transition: background 0.10s; background: transparent;
  font-size: 12.5px; color: var(--text);
  border: 1px dashed transparent; user-select: none;
}
.dms-pal-quick-btn:hover { background: var(--surface-hi); border-color: var(--border); }
.dms-pal-quick-btn.pinned { opacity: 0.42; cursor: default; }
.dms-pal-quick-icon {
  width: 18px; height: 18px; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; flex-shrink: 0;
  background: var(--accent-bg); border: 1px solid color-mix(in oklch, var(--accent) 30%, transparent);
  color: var(--accent-l); font-family: var(--fm);
}
.dms-pal-quick-label { flex: 1; }
.dms-pal-empty { padding: 4px 10px 4px 22px; font-size: 11px; color: var(--text3); font-style: italic; }

.dms-pal-foot {
  padding: 10px 14px; border-top: 1px solid var(--border); flex-shrink: 0;
  font-size: 10.5px; color: var(--text3); line-height: 1.5; font-family: var(--fm);
}
.dms-pal-foot kbd {
  background: var(--surface-hi); border: 1px solid var(--border);
  padding: 0 5px; border-radius: 3px; font-size: 10px; color: var(--text2);
}

/* ── Canvas ── */
.dms-canvas {
  flex: 1; overflow: hidden; padding: 18px; position: relative;
  cursor: grab;
}
.dms-canvas.panning { cursor: grabbing; }

/* ── Infinite plane ── */
.dms-plane {
  position: relative;
  width: 8000px;
  height: 8000px;
  /* Dot grid — 24px spacing matches SNAP constant */
  background-image: radial-gradient(circle, var(--text3) 1px, transparent 1px);
  background-size: 24px 24px;
}

.dms-plane.drag-active::before {
  content: ''; position: absolute; inset: 0;
  border: 1.5px dashed color-mix(in oklch, var(--accent) 55%, transparent);
  background: color-mix(in oklch, var(--accent) 4%, transparent);
  pointer-events: none; border-radius: 14px;
}

/* Empty state */
.dms-empty {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; color: var(--text3); text-align: center;
  border: 1.5px dashed var(--border); border-radius: 14px;
  padding: 60px 80px;
}
.dms-empty-icon { font-family: var(--fh); font-size: 36px; font-weight: 700; color: color-mix(in oklch, var(--accent) 55%, transparent); letter-spacing: 0.08em; }
.dms-empty-title { font-family: var(--fh); font-size: 18px; color: var(--text2); letter-spacing: 0.06em; }
.dms-empty-sub { font-size: 13px; line-height: 1.6; max-width: 340px; color: var(--text3); }
.dms-empty-quick { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.dms-empty-quick-btn {
  padding: 6px 14px; border-radius: 99px;
  background: var(--accent-bg); border: 1px solid color-mix(in oklch, var(--accent) 30%, transparent);
  color: var(--accent-l); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.14s;
}
.dms-empty-quick-btn:hover { background: var(--accent-bhi); }

/* Widget cells — absolute positioned on the plane */
.dms-w {
  position: absolute;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px; overflow: hidden;
  display: flex; flex-direction: column;
  transition: border-color 0.14s, box-shadow 0.14s, transform 0.14s;
  box-shadow: var(--sh);
  cursor: default;
}
.dms-w:hover { border-color: var(--border-hi); box-shadow: var(--sh-md); }
.dms-w.dragging { opacity: 0.35; transform: scale(0.97); pointer-events: none; }

/* Selected widget highlight */
.dms-w.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 35%, transparent), var(--sh-md);
}
.dms-w.selected .dms-w-head {
  background: color-mix(in oklch, var(--accent) 10%, var(--surface-hi));
}

.dms-drop-preview {
  position: absolute;
  border: 2px dashed color-mix(in oklch, var(--accent) 65%, transparent);
  border-radius: 12px;
  background: color-mix(in oklch, var(--accent) 8%, transparent);
  pointer-events: none;
  z-index: 0;
}

/* Widget header */
.dms-w-head {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; flex-shrink: 0;
  background: var(--surface-hi);
  border-bottom: 1px solid var(--border);
  cursor: grab; user-select: none; touch-action: none;
}
.dms-w-head:active { cursor: grabbing; }
.dms-w-head-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 6px currentColor; }
.dms-w-head-kind { font-family: var(--fm); font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.10em; color: var(--text3); }
.dms-w-head-title { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dms-w-head-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; opacity: 0.45; transition: opacity 0.14s; }
.dms-w:hover .dms-w-head-actions { opacity: 1; }
.dms-w-act {
  width: 22px; height: 22px; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: var(--text3); transition: all 0.12s;
}
.dms-w-act:hover { background: var(--surface-hi); color: var(--text); }
.dms-w-act.del:hover { background: var(--danger-bg); color: var(--danger); }

.dms-w-fill { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.dms-w-missing { padding: 16px; font-size: 12px; color: var(--text3); font-style: italic; }

/* Resize handle */
.dms-w-resize {
  position: absolute; bottom: 0; right: 0;
  width: 22px; height: 22px; cursor: nwse-resize; z-index: 2;
  opacity: 0; transition: opacity 0.14s;
}
.dms-w:hover .dms-w-resize,
.dms-w-resize.active { opacity: 1; }
.dms-w-resize::before {
  content: '';
  position: absolute; bottom: 5px; right: 5px;
  width: 8px; height: 8px;
  border-right: 2px solid color-mix(in oklch, var(--accent) 80%, transparent);
  border-bottom: 2px solid color-mix(in oklch, var(--accent) 80%, transparent);
  border-radius: 0 0 3px 0;
}
.dms-w-resize::after {
  content: '';
  position: absolute; bottom: 9px; right: 9px;
  width: 4px; height: 4px;
  border-right: 1.5px solid color-mix(in oklch, var(--accent) 40%, transparent);
  border-bottom: 1.5px solid color-mix(in oklch, var(--accent) 40%, transparent);
}

/* Prevent text selection while resizing */
.dms-root.resizing,
.dms-root.resizing * { cursor: nwse-resize !important; user-select: none !important; }

/* Selection toolbar */
.dms-select-bar {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  z-index: 20;
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; border-radius: 99px;
  background: var(--surface);
  border: 1px solid color-mix(in oklch, var(--accent) 55%, transparent);
  font-size: 12px; color: var(--text2);
  box-shadow: var(--sh-md), 0 0 20px color-mix(in oklch, var(--accent) 18%, transparent);
  pointer-events: all; white-space: nowrap; user-select: none;
}
.dms-select-icon { color: var(--accent-l); font-size: 15px; flex-shrink: 0; }
.dms-select-text { font-family: var(--fm); }
.dms-select-clear {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: var(--text3); cursor: pointer; flex-shrink: 0; transition: all 0.12s;
}
.dms-select-clear:hover { background: var(--danger-bg); color: var(--danger); }

.dms-selectbar-enter-active,
.dms-selectbar-leave-active { transition: opacity 0.15s, transform 0.15s; }
.dms-selectbar-enter-from,
.dms-selectbar-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px); }
</style>
