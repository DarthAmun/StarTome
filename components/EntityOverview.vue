<template>
  <div ref="rootRef" class="eo" tabindex="-1" :style="{ '--type-color': typeColor }" @keydown="onKeyDown">

    <!-- ── Header: title, query, filters, grouping, sort, density ── -->
    <header class="eo-head">
      <div class="eo-row">
        <div class="eo-title-wrap">
          <h1 class="eo-title">{{ typeConfig.plural }}</h1>
          <span class="eo-total">{{ allItems.length }} {{ allItems.length === 1 ? 'entry' : 'entries' }}</span>
        </div>
        <div class="eo-spacer" />
        <span class="eo-hint">Type to search · ←↑↓→ move · ↵ open · Space favorite</span>
        <NuxtLink v-for="v in def.views" :key="v.path" :to="`/campaign/${campaignId}/${v.path}`" class="eo-btn">{{ v.label }}</NuxtLink>
        <button v-if="def.creatable" class="eo-btn eo-btn--primary" @click="createEntry">
          <OhVueIcon name="md-add" scale="0.8" /> New {{ typeConfig.label }}
        </button>
        <span v-else class="eo-total">Draw regions on the World Map</span>
      </div>

      <div class="eo-row">
        <label class="eo-search" :class="{ focused: searchFocused }">
          <OhVueIcon name="fa-search" scale="0.7" class="eo-search-icon" />
          <input
            ref="searchRef"
            v-model="state.query"
            :placeholder="`Search ${typeConfig.plural.toLowerCase()}…`"
            @focus="searchFocused = true"
            @blur="searchFocused = false"
          />
          <kbd>/</kbd>
        </label>
        <EntityFilterPills :browse="browse" />
        <div class="eo-spacer" />
        <div v-if="def.archive" class="eo-seg-wrap">
          <span class="eo-seg-label">{{ def.archive }}</span>
          <div class="eo-seg">
            <button v-for="m in ARCHIVE_MODES" :key="m.v" :class="{ on: state.archiveMode === m.v }" @click="state.archiveMode = m.v">{{ m.l }}</button>
          </div>
        </div>
      </div>

      <div class="eo-row eo-row--meta">
        <span class="eo-count">
          <strong>{{ items.length }}</strong>
          {{ isFiltered ? `of ${allItems.length} ${typeConfig.plural}` : typeConfig.plural }}
        </span>
        <span v-if="def.archive && archivedCount" class="eo-count eo-count--ghost">
          · {{ archivedCount }} {{ def.archive.toLowerCase() }} {{ state.archiveMode === 'hide' ? 'hidden' : state.archiveMode === 'dim' ? 'dimmed' : 'shown' }}
        </span>
        <button v-for="c in activeChips" :key="c.label" class="eo-chip-active" @click="c.remove()">
          {{ c.label }} <span>×</span>
        </button>
        <button v-if="activeChips.length" class="eo-clear" @click="clearAll">Clear all</button>
        <div class="eo-spacer" />
        <label class="eo-select">
          Group
          <select v-model="state.groupBy">
            <option value="none">None</option>
            <option v-for="g in def.groups" :key="g.key" :value="g.key">{{ g.label }}</option>
          </select>
        </label>
        <label class="eo-select">
          Sort
          <select v-model="state.sort" @change="state.dir = 1">
            <option v-for="o in sortOptions" :key="o.v" :value="o.v">{{ o.l }}</option>
          </select>
          <button class="eo-dir" title="Reverse order" @click.prevent="state.dir = state.dir === 1 ? -1 : 1">{{ state.dir === 1 ? '↑' : '↓' }}</button>
        </label>
        <div class="eo-seg">
          <button v-for="d in DENSITIES" :key="d.v" :class="{ on: state.density === d.v }" :title="d.l" @click="state.density = d.v; peek = null">
            <OhVueIcon :name="d.icon" scale="0.75" /> {{ d.l }}
          </button>
        </div>
      </div>
    </header>

    <!-- ── Body ── -->
    <div class="eo-body">
      <div ref="scrollRef" class="eo-scroll" @scroll="onScroll">
       <div class="eo-inner" :style="state.density === 'table' ? { minWidth: tableMinWidth + 'px' } : undefined">
        <div v-if="state.density === 'table'" class="eo-thead" :style="{ gridTemplateColumns: tableCols }">
          <button v-for="h in headCols" :key="h.key" :class="{ on: state.sort === h.key, right: h.align === 'right' }" @click="sortBy(h.key)">
            {{ h.label }}<span v-if="state.sort === h.key" class="eo-arrow">{{ state.dir === 1 ? '↑' : '↓' }}</span>
          </button>
        </div>

        <section v-for="g in groups" :key="g.key" class="eo-group">
          <div class="eo-ghead" :class="{ table: state.density === 'table' }" @click="toggleGroup(g.label)">
            <OhVueIcon name="md-arrowdropdown" scale="0.9" class="eo-chev" :class="{ closed: !g.open }" />
            <span v-if="g.fav" class="eo-star">★</span>
            <span v-else class="eo-gdot" :style="{ background: g.dot }" />
            <span class="eo-glabel">{{ g.label }}</span>
            <span class="eo-gcount">{{ g.count }}</span>
            <template v-if="!g.open && g.preview.length">
              <div class="eo-stack">
                <span v-for="p in g.preview" :key="p.id" class="eo-stack-av" :class="{ arch: p.archived }">
                  <img v-if="p.image" :src="p.image" alt="" />
                  <template v-else>{{ p.initial }}</template>
                </span>
              </div>
              <span class="eo-gcollapsed">collapsed</span>
            </template>
            <div class="eo-gline" />
          </div>

          <template v-if="g.open">
            <!-- Gallery -->
            <div v-if="state.density === 'gallery'" class="eo-grid" :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${def.cardMin}px, 1fr))` }">
              <div
                v-for="c in g.cards" :key="g.key + c.item.id"
                class="eo-card" :class="cardClass(c)"
                :data-idx="c.idx" tabindex="0" v-on="cardHandlers(c)"
              >
                <div class="eo-media" :class="`eo-media--${def.media}`">
                  <!-- image types -->
                  <template v-if="def.media === 'portrait' || def.media === 'banner'">
                    <img v-if="c.item.image" :src="c.item.image" alt="" class="eo-img" :style="{ aspectRatio: def.aspect }" loading="lazy" />
                    <div v-else class="eo-fallback" :style="{ aspectRatio: def.aspect }">
                      <span class="eo-fb-initial">{{ c.item.initial }}</span>
                      <span class="eo-fb-note"><OhVueIcon :name="c.item.icon" scale="0.6" /> No image</span>
                    </div>
                  </template>
                  <div v-else-if="def.media === 'emblem'" class="eo-emblem" :style="{ aspectRatio: def.aspect }">
                    <img v-if="c.item.image" :src="c.item.image" alt="" loading="lazy" />
                    <span v-else class="eo-fb-initial">{{ c.item.initial }}</span>
                  </div>
                  <div v-else-if="def.media === 'swatch'" class="eo-swatch" :style="{ aspectRatio: def.aspect, '--sw': c.item.swatch ?? undefined }">
                    <svg v-if="c.item.polygon" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet">
                      <polygon :points="c.item.polygon" />
                    </svg>
                  </div>
                  <div v-else class="eo-band" :class="`kind-${c.item.chipKind}`" :style="chipStyle(c.item)">
                    <span class="eo-band-text">{{ c.item.bandText }}</span>
                    <OhVueIcon :name="c.item.icon" scale="1" class="eo-band-icon" />
                  </div>

                  <div class="eo-rule" />
                  <button class="eo-fav" :class="{ on: c.item.favorite }" :title="c.item.favorite ? 'Remove from favorites' : 'Add to favorites'" @click.stop="toggleFavorite(c.item.id)">★</button>
                  <div class="eo-badges">
                    <span v-if="c.item.archived && def.archiveGlyph" class="eo-badge">{{ def.archiveGlyph }}</span>
                    <span v-if="c.item.badge" class="eo-badge">{{ c.item.badge }}</span>
                  </div>
                </div>
                <div class="eo-card-body">
                  <div class="eo-name">{{ c.item.name }}</div>
                  <div class="eo-meta">{{ c.item.meta }}</div>
                  <div v-if="c.item.progress" class="eo-progress">
                    <div class="eo-bar"><div :style="{ width: Math.round(100 * c.item.progress.done / c.item.progress.total) + '%' }" /></div>
                    <span>{{ c.item.progress.done }}/{{ c.item.progress.total }}</span>
                  </div>
                  <div class="eo-foot">
                    <span class="eo-chip" :class="`kind-${c.item.chipKind}`" :style="chipStyle(c.item)">{{ c.item.chip }}</span>
                    <span class="eo-sub">{{ subOf(c.item) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Compact -->
            <div v-else-if="state.density === 'compact'" class="eo-compact">
              <div
                v-for="c in g.cards" :key="g.key + c.item.id"
                class="eo-crow" :class="cardClass(c)"
                :data-idx="c.idx" tabindex="0" v-on="cardHandlers(c)"
              >
                <EntityOverviewThumb :item="c.item" :media="def.media" :size="50" />
                <span class="eo-crow-body">
                  <span class="eo-crow-name">
                    <span v-if="c.item.favorite" class="eo-star sm">★</span>
                    <span class="eo-name">{{ c.item.name }}</span>
                    <span v-if="c.item.archived && def.archiveGlyph" class="eo-skull">{{ def.archiveGlyph }}</span>
                  </span>
                  <span class="eo-meta">{{ c.item.meta }}</span>
                </span>
                <span class="eo-crow-end">
                  <span class="eo-chip sm" :class="`kind-${c.item.chipKind}`" :style="chipStyle(c.item)">{{ c.item.chip }}</span>
                  <span class="eo-sub">{{ state.sort === 'name' ? (c.item.badge || c.item.sub) : subOf(c.item) }}</span>
                </span>
              </div>
            </div>

            <!-- Table -->
            <div v-else class="eo-table">
              <div
                v-for="c in g.cards" :key="g.key + c.item.id"
                class="eo-trow" :class="cardClass(c)" :style="{ gridTemplateColumns: tableCols }"
                :data-idx="c.idx" tabindex="0" v-on="cardHandlers(c)"
              >
                <span class="eo-tname">
                  <EntityOverviewThumb :item="c.item" :media="def.media" :size="26" />
                  <span class="eo-name">{{ c.item.name }}</span>
                  <span v-if="c.item.favorite" class="eo-star sm">★</span>
                  <span v-if="c.item.archived && def.archiveGlyph" class="eo-skull">{{ def.archiveGlyph }}</span>
                </span>
                <span v-for="col in def.cols" :key="col.key" class="eo-cell" :class="{ right: col.align === 'right' }">{{ valuesOf(c.item, col.key).join(', ') || '—' }}</span>
                <span><span class="eo-chip sm" :class="`kind-${c.item.chipKind}`" :style="chipStyle(c.item)">{{ c.item.chip }}</span></span>
                <span class="eo-cell right ghost">{{ formatRelative(c.item.updatedAt) }}</span>
              </div>
            </div>
          </template>
        </section>

        <div v-if="!items.length" class="eo-empty">
          <template v-if="allItems.length">
            <span class="eo-empty-title">Nothing in the tome matches</span>
            <span>No {{ typeConfig.plural.toLowerCase() }} match the current search and filters.</span>
            <button class="eo-btn" @click="clearAll">Clear search and filters</button>
          </template>
          <template v-else>
            <OhVueIcon :name="typeConfig.defaultIcon" scale="2.4" :style="{ color: typeColor, opacity: 0.35 }" />
            <span class="eo-empty-title">No {{ typeConfig.plural.toLowerCase() }} yet</span>
            <button v-if="def.creatable" class="eo-btn eo-btn--primary" @click="createEntry">Create the first one</button>
            <span v-else>Draw regions on the World Map.</span>
          </template>
        </div>
        <div v-if="hasMore" class="eo-more">Showing {{ rendered }} of {{ items.length }} — more load as you scroll</div>
       </div>
      </div>

      <!-- A–Z jump rail -->
      <div v-if="state.sort === 'name' && items.length > 24" class="eo-az">
        <button v-for="l in az" :key="l.l" :disabled="!l.present" @click="jump(l.l)">{{ l.l }}</button>
      </div>
    </div>

    <!-- ── Peek ── -->
    <div v-if="peekItem" class="eo-peek" :style="{ left: peek!.x + 'px', top: peek!.y + 'px' }">
      <div class="eo-peek-media" :class="{ arch: peekItem.archived, short: !peekItem.image && def.media !== 'portrait' }">
        <img v-if="peekItem.image" :src="peekItem.image" alt="" />
        <svg v-else-if="peekItem.polygon" viewBox="0 0 160 90" :style="{ '--sw': peekItem.swatch ?? undefined }"><polygon :points="peekItem.polygon" /></svg>
        <span v-else class="eo-fb-initial lg">{{ peekItem.initial }}</span>
        <div class="eo-rule" />
      </div>
      <div class="eo-peek-body">
        <div>
          <div class="eo-peek-name">{{ peekItem.name }}</div>
          <div class="eo-meta">{{ peekItem.meta }}</div>
        </div>
        <div class="eo-peek-chips">
          <span class="eo-chip" :class="`kind-${peekItem.chipKind}`" :style="chipStyle(peekItem)">{{ peekItem.chip }}</span>
          <span v-if="peekItem.badge" class="eo-chip kind-plain">{{ peekItem.badge }}</span>
        </div>
        <div class="eo-facts">
          <template v-for="f in peekItem.peekFacts" :key="f.k"><span class="k">{{ f.k }}</span><span class="v">{{ f.v }}</span></template>
        </div>
        <p v-if="peekExcerpt" class="eo-excerpt">{{ peekExcerpt }}</p>
        <div class="eo-peek-foot"><span>↵ Open</span><span>Space {{ peekItem.favorite ? 'unfavorite' : 'favorite' }}</span><span class="r">edited {{ formatRelative(peekItem.updatedAt) }}</span></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EntityType } from '~/types/entities'
import { ENTITY_TYPE_CONFIG } from '~/types/entities'
import { useEntityBrowse, plainExcerpt } from '~/composables/useEntityBrowse'
import { useFormatters } from '~/composables/useFormatters'
import type { BrowseItem, Density, ArchiveMode } from '~/composables/useEntityBrowse'
import { useCampaignEntity } from '~/composables/useCampaignEntity'

const props = defineProps<{ type: EntityType }>()

const browse = useEntityBrowse(props.type)
const {
  def, state, allItems, itemById, items, archivedCount, isFiltered,
  clearAll, activeChips, groupKeyOf, groupOrder, valuesOf, toggleFavorite,
} = browse
const { formatRelative } = useFormatters()
const { openEntry, createEntry, ensureLoaded, campaignId } = useCampaignEntity(props.type)

const typeConfig = computed(() => ENTITY_TYPE_CONFIG[props.type])
const typeColor = computed(() => typeConfig.value.color)

const DENSITIES: Array<{ v: Density; l: string; icon: string }> = [
  { v: 'gallery', l: 'Gallery', icon: 'md-viewmodule' },
  { v: 'compact', l: 'Compact', icon: 'md-draghandle' },
  { v: 'table', l: 'Table', icon: 'md-sort' },
]
const ARCHIVE_MODES: Array<{ v: ArchiveMode; l: string }> = [
  { v: 'show', l: 'Show' }, { v: 'dim', l: 'Dim' }, { v: 'hide', l: 'Hide' },
]

const rootRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const searchFocused = ref(false)

/** Status chips use the app-wide status colour when the type has one. */
function chipStyle(it: BrowseItem) {
  return it.chipColor
    ? { '--kind-fg': it.chipColor, '--kind-bg': `color-mix(in srgb, ${it.chipColor} 16%, transparent)` }
    : undefined
}

// ── Sort ─────────────────────────────────────────────────────────────────────
const sortOptions = computed(() => {
  const opts = [{ v: 'name', l: 'Name' }, { v: 'updated', l: 'Recently updated' }, { v: 'created', l: 'Recently created' }]
  for (const c of def.cols) opts.push({ v: c.key, l: c.label })
  opts.push({ v: 'status', l: def.statusLabel })
  return opts.filter((o, i, a) => a.findIndex(x => x.v === o.v) === i)
})
const headCols = computed((): { key: string; label: string; align?: 'right' }[] => [
  { key: 'name', label: 'Name' },
  ...def.cols.map(c => ({ key: c.key, label: c.label, align: c.align })),
  { key: 'status', label: def.statusLabel },
  { key: 'updated', label: 'Updated', align: 'right' as const },
])
const tableCols = computed(() => `minmax(200px, 2.2fr) ${def.cols.map(c => `minmax(0, ${c.weight ?? 1}fr)`).join(' ')} 116px 82px`)

// Below this width the table scrolls sideways instead of squashing columns
const tableMinWidth = computed(() => 64 + 200 + def.cols.reduce((w, c) => w + Math.max(64, (c.weight ?? 1) * 110), 0) + 116 + 82 + 12 * (def.cols.length + 3))

function sortBy(key: string) {
  if (state.sort === key) state.dir = state.dir === 1 ? -1 : 1
  else { state.sort = key; state.dir = 1 }
}

function subOf(it: BrowseItem) {
  if (state.sort === 'updated') return `edited ${formatRelative(it.updatedAt)}`
  if (state.sort === 'created') return `added ${formatRelative(it.createdAt)}`
  return it.sub
}

// ── Groups (with paged rendering for large campaigns) ────────────────────────
const PAGE = 96
const limit = ref(PAGE)
watch(() => [state.query, state.filters, state.sort, state.dir, state.groupBy, state.archiveMode], () => {
  limit.value = PAGE
  focusIdx.value = -1
  peek.value = null
}, { deep: true })

const FAV_LABEL = 'Favorites'
const rawGroups = computed(() => {
  const out: Array<{ key: string; label: string; items: BrowseItem[]; fav?: boolean }> = []
  const favs = items.value.filter(i => i.favorite)
  if (favs.length) out.push({ key: '__fav', label: FAV_LABEL, items: favs, fav: true })
  if (!items.value.length) return out
  if (state.groupBy === 'none') {
    out.push({ key: '__all', label: `All ${typeConfig.value.plural}`, items: items.value })
  } else {
    const m = new Map<string, BrowseItem[]>()
    for (const it of items.value) {
      const k = groupKeyOf(it)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(it)
    }
    for (const k of groupOrder([...m.keys()])) out.push({ key: `g:${k}`, label: k || 'None', items: m.get(k)! })
  }
  return out
})

const groups = computed(() => {
  let budget = limit.value
  let idx = 0
  const out = []
  for (const g of rawGroups.value) {
    const open = !state.collapsedGroups.includes(g.label)
    if (budget <= 0 && open) break
    const slice = open ? g.items.slice(0, budget) : []
    budget -= slice.length
    const dot = state.groupBy === 'status' || state.groupBy === def.filters[0]?.key
      ? g.items[0]?.chipColor ?? `var(--kind-${g.items[0]?.chipKind ?? 'mute'}-fg)`
      : typeColor.value
    out.push({
      key: g.key, label: g.label, count: g.items.length, open, fav: !!g.fav, dot,
      preview: open ? [] : g.items.slice(0, 6).map(i => ({ id: i.id, image: i.image, initial: i.initial, archived: i.archived })),
      cards: slice.map(item => ({ item, idx: idx++, fav: !!g.fav })),
    })
  }
  return out
})
const flat = computed(() => groups.value.flatMap(g => g.cards))
const rendered = computed(() => flat.value.length)
const hasMore = computed(() => rawGroups.value.reduce((n, g) => n + (state.collapsedGroups.includes(g.label) ? 0 : g.items.length), 0) > rendered.value)

function toggleGroup(label: string) {
  const c = state.collapsedGroups
  state.collapsedGroups = c.includes(label) ? c.filter(x => x !== label) : [...c, label]
  peek.value = null
}

function onScroll(e: Event) {
  const s = e.currentTarget as HTMLElement
  if (peek.value) peek.value = null
  if (hasMore.value && s.scrollTop + s.clientHeight > s.scrollHeight - 900) limit.value += PAGE
}

// ── A–Z ──────────────────────────────────────────────────────────────────────
const az = computed(() => {
  const present = new Set(items.value.map(i => i.initial))
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => ({ l, present: present.has(l) }))
})

async function jump(letter: string) {
  const pos = items.value.findIndex(i => i.initial === letter)
  if (pos < 0) return
  const target = items.value[pos]
  limit.value = Math.max(limit.value, pos + 60 + (rawGroups.value[0]?.fav ? rawGroups.value[0].items.length : 0))
  if (state.groupBy === 'none') state.collapsedGroups = state.collapsedGroups.filter(l => !l.startsWith('All '))
  await nextTick()
  const card = flat.value.find(c => c.item.id === target.id && !c.fav)
  const el = card && cardEl(card.idx)
  if (el && scrollRef.value) {
    scrollRef.value.scrollTop += el.getBoundingClientRect().top - scrollRef.value.getBoundingClientRect().top - (state.density === 'table' ? 84 : 50)
    el.focus({ preventScroll: true })
  }
}

// ── Focus, peek & keyboard ───────────────────────────────────────────────────
const focusIdx = ref(-1)
const peek = ref<{ id: number; x: number; y: number } | null>(null)
const peekItem = computed(() => peek.value ? itemById.value.get(peek.value.id) ?? null : null)
// Only the peeked entry's notes are ever shown, so the excerpt is built on demand
const peekExcerpt = computed(() => peekItem.value ? plainExcerpt(peekItem.value.entity.content) : '')
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let keyboardFocus = false

function cardEl(i: number) {
  return scrollRef.value?.querySelector<HTMLElement>(`[data-idx="${i}"]`) ?? null
}

function cardClass(c: { idx: number; item: BrowseItem }) {
  return {
    focused: c.idx === focusIdx.value,
    arch: c.item.archived,
    dim: c.item.archived && state.archiveMode === 'dim',
  }
}

function showPeek(el: HTMLElement, id: number) {
  const root = rootRef.value
  if (!root || !el.isConnected) return
  const rr = root.getBoundingClientRect(), r = el.getBoundingClientRect()
  const L = r.left - rr.left, T = r.top - rr.top
  const pw = 300, ph = def.media === 'band' || def.media === 'swatch' ? 320 : 440
  let x: number, y: number
  if (r.width > 520) { // table rows: float at the right edge under the row
    x = rr.width - pw - 48; y = T + r.height + 6
    if (y + ph > rr.height - 10) y = T - ph - 6
  } else {
    x = L + r.width + 12
    if (x + pw > rr.width - 40) x = L - pw - 12
    if (x < 12) x = Math.max(12, L + r.width / 2 - pw / 2)
    y = T - 8
  }
  y = Math.max(12, Math.min(y, rr.height - ph - 12))
  peek.value = { id, x, y }
}

function hoverIn(e: MouseEvent, it: BrowseItem) {
  const el = e.currentTarget as HTMLElement
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => showPeek(el, it.id), 380)
}
function hoverOut() {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => { if (!keyboardFocus) peek.value = null }, 60)
}
function onCardFocus(idx: number, it: BrowseItem, e: FocusEvent) {
  keyboardFocus = true
  focusIdx.value = idx
  showPeek(e.currentTarget as HTMLElement, it.id)
  setTimeout(() => { keyboardFocus = false }, 50)
}

function cardHandlers(c: { idx: number; item: BrowseItem }) {
  return {
    click: () => openItem(c.item),
    mouseenter: (e: MouseEvent) => hoverIn(e, c.item),
    mouseleave: hoverOut,
    focus: (e: FocusEvent) => onCardFocus(c.idx, c.item, e),
  }
}

function openItem(it: BrowseItem) {
  if (hoverTimer) clearTimeout(hoverTimer)
  peek.value = null
  openEntry(it.entity)
}

async function focusByIdx(i: number) {
  const n = flat.value.length
  if (!n) return
  i = Math.max(0, Math.min(n - 1, i))
  let el = cardEl(i)
  if (!el && hasMore.value) { limit.value += PAGE; await nextTick(); el = cardEl(i) }
  el?.focus()
}

function moveVert(dir: 1 | -1) {
  const cur = cardEl(focusIdx.value)
  if (!cur || !scrollRef.value) return focusByIdx(0)
  const r = cur.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cands: Array<[HTMLElement, number, DOMRect]> = []
  let best = Infinity
  for (const el of scrollRef.value.querySelectorAll<HTMLElement>('[data-idx]')) {
    const q = el.getBoundingClientRect()
    const dy = dir > 0 ? q.top - r.top : r.top - q.top
    if (dy > 4) { cands.push([el, dy, q]); best = Math.min(best, dy) }
  }
  const row = cands.filter(c => c[1] < best + 4)
  if (!row.length) { if (dir > 0 && hasMore.value) limit.value += PAGE; return }
  row.sort((a, b) => Math.abs(a[2].left + a[2].width / 2 - cx) - Math.abs(b[2].left + b[2].width / 2 - cx))
  row[0][0].focus()
}

function focusSearch() {
  nextTick(() => searchRef.value?.focus())
}

function onKeyDown(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  const inField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)
  if (inField) {
    if (e.key === 'Escape') { state.query = ''; t.blur(); rootRef.value?.focus() }
    if (t === searchRef.value && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault()
      if (e.key === 'Enter' && flat.value[0]) openItem(flat.value[0].item)
      else focusByIdx(0)
    }
    return
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'Escape') { peek.value = null; return }
  if (e.key === '/') { e.preventDefault(); focusSearch(); return }
  if (e.key.length === 1 && /\S/.test(e.key)) {
    e.preventDefault()
    state.query += e.key
    focusSearch()
    return
  }
  const cur = focusIdx.value
  const card = flat.value[cur]
  if (e.key === 'ArrowRight') { e.preventDefault(); focusByIdx(cur + 1) }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); focusByIdx(cur - 1) }
  else if (e.key === 'ArrowDown') { e.preventDefault(); cur < 0 ? focusByIdx(0) : moveVert(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveVert(-1) }
  else if (e.key === 'Enter' && card) { e.preventDefault(); openItem(card.item) }
  else if (e.key === ' ' && card) { e.preventDefault(); toggleFavorite(card.item.id) }
}

// The rail's search button asks the overview to focus its search field
watch(() => state.focusSearchTick, focusSearch)

onMounted(async () => {
  await ensureLoaded()
  // Focus the overview so type-to-search works immediately — but never steal
  // focus from a field the user is already typing in.
  const active = document.activeElement as HTMLElement | null
  if (!active || active === document.body) rootRef.value?.focus({ preventScroll: true })
})
onUnmounted(() => { if (hoverTimer) clearTimeout(hoverTimer) })
</script>

<style scoped>
.eo {
  --kind-good-bg: oklch(72% 0.17 145 / .15); --kind-good-fg: oklch(80% 0.14 145);
  --kind-bad-bg:  oklch(63% 0.2 25 / .17);   --kind-bad-fg:  oklch(76% 0.14 25);
  --kind-mute-bg: oklch(65% 0.012 280 / .13); --kind-mute-fg: oklch(76% 0.012 280);
  --kind-info-bg: oklch(70% 0.12 235 / .16); --kind-info-fg: oklch(80% 0.1 235);
  --kind-warn-bg: oklch(76% 0.14 70 / .16);  --kind-warn-fg: oklch(84% 0.12 75);
  --kind-ghost-bg: transparent;              --kind-ghost-fg: var(--text2);
  --eo-card: var(--bg2);
  --eo-line: var(--border-hi);

  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  outline: none;
  font-size: 13px;
  color: var(--text);
}
:global(html[data-theme="light"]) .eo {
  --kind-good-fg: oklch(48% 0.14 145);
  --kind-bad-fg:  oklch(50% 0.18 25);
  --kind-mute-fg: oklch(45% 0.012 280);
  --kind-info-fg: oklch(48% 0.12 235);
  --kind-warn-fg: oklch(52% 0.13 70);
  --eo-card: var(--surface-solid);
}

/* ── Header ─────────────────────────────────────────────── */
.eo-head {
  padding: 16px 24px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 10;
}
.eo-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.eo-row--meta { min-height: 30px; }
.eo-spacer { flex: 1; }
.eo-title-wrap { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.eo-title {
  margin: 0;
  font-family: var(--fh);
  font-weight: 600;
  font-size: 21px;
  letter-spacing: .07em;
  white-space: nowrap;
}
.eo-total { color: var(--text3); font-size: 12px; white-space: nowrap; }
.eo-hint { font-size: 11px; color: var(--text3); white-space: nowrap; }
@media (max-width: 1250px) { .eo-hint { display: none; } }

.eo-btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 12px;
  border: 1px solid var(--eo-line); border-radius: 8px;
  background: var(--eo-card); color: var(--text);
  font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap; text-decoration: none;
}
.eo-btn:hover { border-color: var(--accent); }
.eo-btn--primary { background: var(--accent); border-color: var(--accent); color: white; font-weight: 600; }
.eo-btn--primary:hover { background: var(--accent-l); border-color: var(--accent-l); }

.eo-search {
  display: flex; align-items: center; gap: 8px;
  height: 32px; padding: 0 10px; flex: 0 1 270px; min-width: 180px;
  border: 1px solid var(--eo-line); border-radius: 8px; background: var(--eo-card);
}
.eo-search.focused { border-color: var(--accent); }
.eo-search-icon { color: var(--text3); flex: none; }
.eo-search input { flex: 1; min-width: 0; background: transparent; border: 0; outline: none; color: var(--text); font: inherit; }
.eo-search input::placeholder { color: var(--text3); }
.eo-search kbd { font: 600 10px var(--fm); color: var(--text3); border: 1px solid var(--eo-line); border-radius: 4px; padding: 1px 5px; }

.eo-seg-wrap { display: flex; align-items: center; gap: 8px; }
.eo-seg-label { font-size: 12px; color: var(--text3); }
.eo-seg { display: flex; padding: 2px; gap: 2px; border: 1px solid var(--eo-line); border-radius: 8px; background: var(--bg); }
.eo-seg button {
  display: flex; align-items: center; gap: 6px;
  height: 24px; padding: 0 9px; border: 0; border-radius: 6px;
  background: transparent; color: var(--text3); font: inherit; font-size: 12px; cursor: pointer;
}
.eo-seg button.on { background: var(--surface-hi); color: var(--text); }

.eo-count { font-size: 12.5px; color: var(--text2); white-space: nowrap; }
.eo-count strong { color: var(--text); font-weight: 600; }
.eo-count--ghost { color: var(--text3); font-size: 12px; }
.eo-chip-active {
  display: flex; align-items: center; gap: 6px; height: 24px; padding: 0 6px 0 9px;
  border: 0; border-radius: 6px; background: var(--accent-bg); color: var(--accent-l);
  font: inherit; font-size: 11.5px; cursor: pointer; white-space: nowrap;
}
.eo-chip-active span { opacity: .6; font-size: 13px; }
.eo-clear { height: 24px; padding: 0 6px; border: 0; background: transparent; color: var(--text2); font: inherit; font-size: 11.5px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }

.eo-select {
  display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 4px 0 10px;
  border: 1px solid var(--eo-line); border-radius: 8px; background: var(--eo-card);
  color: var(--text3); font-size: 12px;
}
.eo-select select { background: transparent; border: 0; color: var(--text); font: inherit; font-size: 12.5px; outline: none; cursor: pointer; }
.eo-select select option { background: var(--surface-solid); color: var(--text); }
.eo-dir { width: 22px; height: 22px; border: 0; border-radius: 5px; background: var(--surface-hi); color: var(--text2); font: inherit; cursor: pointer; }

/* ── Body ───────────────────────────────────────────────── */
.eo-body { flex: 1; min-height: 0; position: relative; }
.eo-scroll { position: absolute; inset: 0; overflow-y: auto; overflow-x: auto; }

.eo-thead {
  position: sticky; top: 0; z-index: 6;
  display: grid; gap: 12px; align-items: center; height: 34px; padding: 0 40px 0 24px;
  background: var(--bg2); border-bottom: 1px solid var(--border);
}
.eo-thead button {
  display: flex; align-items: center; gap: 4px; border: 0; padding: 0; background: transparent;
  color: var(--text3); font: inherit; font-size: 11px; font-weight: 600; letter-spacing: .08em;
  text-transform: uppercase; cursor: pointer; white-space: nowrap; overflow: hidden;
}
.eo-thead button.on { color: var(--text); }
.eo-thead button.right { justify-content: flex-end; }
.eo-arrow { color: var(--accent-l); }

.eo-ghead {
  position: sticky; top: 0; z-index: 5;
  display: flex; align-items: center; gap: 10px; padding: 12px 40px 9px 24px;
  background: color-mix(in srgb, var(--bg) 93%, transparent);
  backdrop-filter: blur(8px);
  cursor: pointer; user-select: none;
}
.eo-ghead.table { top: 34px; }
.eo-chev { color: var(--text2); transition: transform .15s; }
.eo-chev.closed { transform: rotate(-90deg); }
.eo-star { color: var(--fav); font-size: 13px; line-height: 1; }
.eo-star.sm { font-size: 10px; flex: none; }
.eo-gdot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.eo-glabel { font-family: var(--fh); font-weight: 600; font-size: 13px; letter-spacing: .09em; white-space: nowrap; }
.eo-gcount { font-size: 11px; font-weight: 600; color: var(--text2); background: var(--surface-hi); border-radius: 9px; padding: 1px 7px; font-variant-numeric: tabular-nums; }
.eo-gline { flex: 1; height: 1px; background: var(--border); }
.eo-stack { display: flex; padding-left: 6px; }
.eo-stack-av {
  width: 22px; height: 22px; margin-left: -6px; border-radius: 50%; overflow: hidden;
  background: color-mix(in srgb, var(--type-color) 22%, var(--bg2));
  box-shadow: 0 0 0 2px var(--bg);
  display: grid; place-items: center;
  font-family: var(--fh); font-size: 10px; font-weight: 600; color: var(--type-color);
}
.eo-stack-av img { width: 100%; height: 100%; object-fit: cover; }
.eo-stack-av.arch { filter: grayscale(1); }
.eo-gcollapsed { font-size: 11.5px; color: var(--text3); white-space: nowrap; }

/* ── Gallery cards ──────────────────────────────────────── */
.eo-grid { display: grid; gap: 14px; padding: 4px 40px 22px 24px; }
.eo-card {
  position: relative; display: flex; flex-direction: column; min-width: 0;
  background: var(--eo-card); border: 1px solid var(--eo-line); border-radius: 10px;
  overflow: hidden; cursor: pointer; outline: none;
  box-shadow: 0 6px 14px -10px oklch(0% 0 0 / .6);
  transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease, opacity .14s ease;
}
.eo-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--accent) 45%, var(--eo-line)); box-shadow: 0 14px 28px -14px oklch(0% 0 0 / .9); opacity: 1; }
.eo-card.focused, .eo-crow.focused { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 32%, transparent), 0 12px 24px -14px oklch(0% 0 0 / .9); }
.dim { opacity: .42; }
.dim:hover, .dim.focused { opacity: 1; }
.arch .eo-media, .arch :deep(.eot) { filter: grayscale(1) brightness(.8); }
.arch .eo-name { color: var(--text2); }

.eo-media { position: relative; }
.eo-img { display: block; width: 100%; object-fit: cover; background: var(--bg); }
.eo-fallback {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  background: radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--type-color) 16%, transparent), transparent 70%), var(--bg);
}
.eo-fb-initial {
  width: 62px; height: 62px; border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--type-color) 60%, transparent);
  display: grid; place-items: center;
  font-family: var(--fh); font-size: 27px; font-weight: 600; color: var(--type-color);
}
.eo-fb-initial.lg { width: 96px; height: 96px; font-size: 44px; }
.eo-fb-note { display: flex; align-items: center; gap: 5px; font-size: 10.5px; color: var(--text3); }
.eo-emblem { display: grid; place-items: center; background: var(--bg); }
.eo-emblem img { width: 100%; height: 100%; object-fit: cover; }
.eo-emblem .eo-fb-initial { border-radius: 14px; width: 46%; height: auto; aspect-ratio: 1; }
.eo-swatch {
  display: grid; place-items: center;
  background: repeating-linear-gradient(135deg, oklch(100% 0 0 / .06) 0 1px, transparent 1px 9px), color-mix(in srgb, var(--sw) 28%, var(--bg));
}
.eo-swatch svg, .eo-peek-media svg { width: 100%; height: 100%; }
.eo-swatch polygon, .eo-peek-media polygon { fill: color-mix(in srgb, var(--sw) 55%, transparent); stroke: var(--sw); stroke-width: 1.5; stroke-linejoin: round; }
.eo-band { height: 52px; display: flex; align-items: center; gap: 10px; padding: 0 12px 0 36px; background: var(--kind-bg); }
.eo-band-text { flex: 1; text-align: right; font: 500 10.5px var(--fm); letter-spacing: .03em; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eo-band-icon { color: var(--type-color); flex: none; }
.kind-good  { --kind-bg: var(--kind-good-bg);  --kind-fg: var(--kind-good-fg); }
.kind-bad   { --kind-bg: var(--kind-bad-bg);   --kind-fg: var(--kind-bad-fg); }
.kind-mute  { --kind-bg: var(--kind-mute-bg);  --kind-fg: var(--kind-mute-fg); }
.kind-info  { --kind-bg: var(--kind-info-bg);  --kind-fg: var(--kind-info-fg); }
.kind-warn  { --kind-bg: var(--kind-warn-bg);  --kind-fg: var(--kind-warn-fg); }
.kind-ghost { --kind-bg: var(--kind-ghost-bg); --kind-fg: var(--kind-ghost-fg); }
.kind-plain { --kind-bg: var(--surface-hi);    --kind-fg: var(--text); }
.eo-rule { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: color-mix(in srgb, var(--type-color) 60%, transparent); }

.eo-fav {
  position: absolute; left: 8px; top: 8px;
  width: 22px; height: 22px; border-radius: 6px; border: 0; padding: 0;
  background: oklch(10% 0.02 255 / .72); color: oklch(100% 0 0 / .55);
  display: grid; place-items: center; font-size: 12px; cursor: pointer;
  opacity: 0; transition: opacity .12s;
}
.eo-band .eo-fav, .eo-media--band .eo-fav { top: 15px; }
.eo-card:hover .eo-fav, .eo-card.focused .eo-fav, .eo-fav.on { opacity: 1; }
.eo-fav.on { color: var(--fav); }
.eo-fav:hover { color: color-mix(in srgb, var(--fav) 85%, white); }
.eo-badges { position: absolute; right: 8px; top: 8px; display: flex; gap: 4px; }
.eo-media--band .eo-badges { display: none; }
.eo-badge { height: 20px; padding: 0 6px; border-radius: 6px; background: oklch(10% 0.02 255 / .72); color: oklch(90% 0.01 280); font-size: 10.5px; font-weight: 600; line-height: 20px; letter-spacing: .03em; }

.eo-card-body { padding: 10px 11px 11px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.eo-name { font-weight: 600; font-size: 13.5px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eo-meta { font-size: 11.5px; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eo-progress { display: flex; align-items: center; gap: 8px; margin-top: 3px; font-size: 10.5px; color: var(--text2); font-variant-numeric: tabular-nums; }
.eo-bar { flex: 1; height: 4px; border-radius: 2px; background: var(--surface-hi); overflow: hidden; }
.eo-bar div { height: 100%; background: var(--type-color); border-radius: 2px; }
.eo-foot { display: flex; align-items: center; gap: 6px; margin-top: 4px; min-width: 0; }
.eo-chip {
  display: inline-flex; align-items: center; height: 19px; padding: 0 7px; border-radius: 5px;
  font-size: 10.5px; font-weight: 600; letter-spacing: .02em; white-space: nowrap;
  background: var(--kind-bg); color: var(--kind-fg);
  max-width: 100%; overflow: hidden; text-overflow: ellipsis;
}
.eo-chip.kind-ghost { box-shadow: inset 0 0 0 1px var(--eo-line); }
.eo-chip.sm { height: 18px; font-size: 10px; padding: 0 6px; }
.eo-sub { margin-left: auto; font-size: 11px; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.eo-skull { font-size: 11px; color: var(--text2); }

/* ── Compact ────────────────────────────────────────────── */
.eo-compact { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; padding: 2px 40px 20px 24px; }
.eo-crow {
  display: flex; align-items: center; gap: 11px; padding: 7px 10px 7px 7px; min-width: 0;
  border-radius: 9px; background: var(--eo-card); border: 1px solid var(--eo-line);
  cursor: pointer; outline: none; transition: border-color .12s, opacity .12s;
}
.eo-crow:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--eo-line)); }
.eo-crow-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.eo-crow-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
.eo-crow-name .eo-name { font-size: 13px; }
.eo-crow-end { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; max-width: 40%; }
.eo-crow-end .eo-sub { font-size: 10.5px; }

/* ── Table ──────────────────────────────────────────────── */
.eo-table { padding: 0 0 14px; }
.eo-trow {
  display: grid; gap: 12px; align-items: center; height: 40px; padding: 0 40px 0 24px;
  border-bottom: 1px solid var(--border); cursor: pointer; outline: none;
}
.eo-trow:hover { background: var(--accent-bg); }
.eo-trow.focused { background: var(--accent-bg); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 70%, transparent); }
.eo-tname { display: flex; align-items: center; gap: 10px; min-width: 0; }
.eo-tname .eo-name { font-size: 13px; }
.eo-cell { font-size: 12.5px; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.eo-cell.right { text-align: right; }
.eo-cell.ghost { color: var(--text3); font-size: 12px; }

/* ── Empty / more / A–Z ─────────────────────────────────── */
.eo-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 90px 24px; text-align: center; color: var(--text2); }
.eo-empty-title { font-family: var(--fh); font-size: 17px; letter-spacing: .06em; color: var(--text); }
.eo-more { padding: 8px 24px 40px; font-size: 11.5px; color: var(--text3); text-align: center; }
.eo-az {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%); z-index: 8;
  display: flex; flex-direction: column; align-items: center; padding: 6px 0;
  border-radius: 12px; background: color-mix(in srgb, var(--bg2) 85%, transparent); border: 1px solid var(--border);
}
.eo-az button { width: 22px; height: 15px; border: 0; padding: 0; background: transparent; color: var(--text2); font: 600 9.5px var(--fu); cursor: pointer; }
.eo-az button:hover:not(:disabled) { color: var(--accent-l); }
.eo-az button:disabled { color: var(--border-hi); cursor: default; }

/* ── Peek ───────────────────────────────────────────────── */
.eo-peek {
  position: absolute; width: 300px; z-index: 30; pointer-events: none;
  background: var(--surface-solid); border: 1px solid var(--eo-line); border-radius: 12px;
  box-shadow: var(--sh-lg); overflow: hidden;
  animation: eoPeek .16s ease-out;
}
@keyframes eoPeek { from { opacity: 0; transform: translateY(4px) scale(.985); } to { opacity: 1; transform: none; } }
.eo-peek-media {
  position: relative; height: 210px; display: grid; place-items: center; overflow: hidden;
  background: radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--type-color) 16%, transparent), transparent 70%), var(--bg);
}
.eo-peek-media.short { height: 110px; }
.eo-peek-media img { width: 100%; height: 100%; object-fit: cover; }
.eo-peek-media.arch { filter: grayscale(1) brightness(.85); }
.eo-peek-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 9px; }
.eo-peek-name { font-family: var(--fh); font-weight: 600; font-size: 17px; letter-spacing: .04em; line-height: 1.2; }
.eo-peek-chips { display: flex; gap: 5px; flex-wrap: wrap; }
.eo-facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 12px; }
.eo-facts .k { color: var(--text3); }
.eo-facts .v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eo-excerpt { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--text2); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.eo-peek-foot { display: flex; gap: 12px; padding-top: 9px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text3); }
.eo-peek-foot .r { margin-left: auto; }
</style>
