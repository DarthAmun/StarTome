<template>
  <div class="cmp-page">

    <!-- Subnav -->
    <div class="sys-subnav">
      <div class="sys-breadcrumb">
        <span class="sys-breadcrumb-link">Compendium</span>
        <span class="sys-breadcrumb-sep">›</span>
        <span class="sys-breadcrumb-cur">{{ cfg?.plural ?? kindParam }}</span>
      </div>
      <div class="sys-subnav-actions">
        <div class="cmp-seg" role="group" aria-label="Game">
          <button :class="{ on: prefs.game === 'all' }" @click="prefs.game = 'all'">All</button>
          <button v-for="g in GAME_IDS" :key="g" :class="{ on: prefs.game === g }" @click="prefs.game = g">{{ GAME_CONFIG[g].short }}</button>
        </div>
        <button v-if="kind" class="btn btn-accent btn-sm" @click="createEntry">+ New {{ cfg!.label }}</button>
      </div>
    </div>

    <div v-if="!kind" class="sys-entity-empty"><span>Unknown compendium section.</span></div>

    <div v-else class="sys-entity-shell">

      <!-- ── List ─────────────────────────────────────────────────── -->
      <div class="sys-entity-list cmp-list">
        <div class="sys-entity-list-head">
          <div class="cmp-list-title">{{ cfg!.plural }}</div>
          <span class="cmp-count">{{ page.total.toLocaleString() }}</span>
        </div>
        <div class="sys-entity-list-search">
          <span class="cmp-search-icon">⌕</span>
          <input v-model="search" class="sys-entity-search-input" :placeholder="`Search ${cfg!.plural.toLowerCase()}…`" />
          <button class="sys-filter-btn" :class="{ active: activeFilterCount > 0 }" title="Filters" @click="showFilters = !showFilters">
            <span v-if="activeFilterCount" class="sys-filter-badge">{{ activeFilterCount }}</span>⊕
          </button>
        </div>

        <div v-if="showFilters" class="cmp-filters">
          <div v-if="cfg!.hasLevel" class="cmp-frow">
            <span class="cmp-flabel">{{ cfg!.levelLabel }}</span>
            <input v-model.number="prefs.levelMin" type="number" class="cmp-num" placeholder="min" />
            <span class="cmp-dash">–</span>
            <input v-model.number="prefs.levelMax" type="number" class="cmp-num" placeholder="max" />
          </div>
          <div class="cmp-frow">
            <span class="cmp-flabel">Rarity</span>
            <button v-for="r in RARITIES" :key="r" class="cmp-chip" :class="{ on: prefs.rarities.includes(r) }"
              :style="prefs.rarities.includes(r) ? { borderColor: RARITY_COLOR[r] } : {}" @click="toggle(prefs.rarities, r)">{{ r }}</button>
          </div>
          <div class="cmp-frow">
            <span class="cmp-flabel">Traits</span>
            <input v-model="prefs.traits" class="cmp-text" placeholder="healing, magical" />
          </div>
          <div class="cmp-frow">
            <span class="cmp-flabel">Source</span>
            <button v-for="o in ORIGINS" :key="o.key" class="cmp-chip" :class="{ on: prefs.origins.includes(o.key) }" @click="toggle(prefs.origins, o.key)">{{ o.label }}</button>
          </div>
          <div class="cmp-frow">
            <label class="cmp-check"><input v-model="prefs.favoritesOnly" type="checkbox" /> Favorites only</label>
            <label class="cmp-check"><input v-model="prefs.showLegacy" type="checkbox" /> Show superseded legacy</label>
          </div>
          <button v-if="activeFilterCount" class="sys-chip-clear" @click="clearFilters">Clear filters</button>
        </div>

        <div class="sys-sort-bar">
          <span class="sys-sort-lbl">Sort</span>
          <select v-model="prefs.sort" class="sys-sort-sel">
            <option value="name">Name</option>
            <option value="level">{{ cfg!.levelLabel }}</option>
          </select>
          <button class="sys-sort-dir" @click="prefs.dir = prefs.dir === 'asc' ? 'desc' : 'asc'">{{ prefs.dir === 'asc' ? '↑' : '↓' }}</button>
        </div>

        <div class="sys-entity-list-body">
          <div
            v-for="e in page.items" :key="e.id"
            class="sys-entity-row cmp-row" :class="{ active: selectedId === e.id }"
            @click="select(e.id)"
          >
            <span class="cmp-level" :title="cfg!.levelLabel">{{ cfg!.hasLevel ? e.level : '' }}</span>
            <span class="cmp-rarity" :style="{ background: e.rarity === 'common' ? 'transparent' : RARITY_COLOR[e.rarity] }" :title="e.rarity" />
            <span class="sys-entity-row-name">{{ e.name }}</span>
            <span v-if="e.isFavorite" class="cmp-fav">★</span>
            <span v-if="e.localEdits" class="cmp-edited" title="Has local edits">✎</span>
            <span class="sys-entity-row-sub">{{ rowSub(e) }}</span>
          </div>
          <button v-if="page.items.length < page.total" class="cmp-more" :disabled="loading" @click="loadMore">
            {{ loading ? 'Loading…' : `Load more (${page.items.length.toLocaleString()} of ${page.total.toLocaleString()})` }}
          </button>
          <div v-if="!loading && !page.items.length" class="cmp-empty">
            <template v-if="search || activeFilterCount">No matches.</template>
            <template v-else>No {{ cfg!.plural.toLowerCase() }} yet.<br><span>The Foundry compendium sync fills this section; you can also add homebrew entries.</span></template>
          </div>
        </div>
      </div>

      <!-- ── Detail ───────────────────────────────────────────────── -->
      <div v-if="selected" class="sys-entity-editor">
        <div class="sys-entity-editor-topbar">
          <div class="cmp-detail-title">
            <span class="cmp-detail-name">{{ selected.name }}</span>
            <span class="cmp-badge" :class="`cmp-badge--${selected.origin}`">{{ ORIGIN_LABEL[selected.origin] }}</span>
            <span v-if="selected.localEdits" class="cmp-badge cmp-badge--edited">edited</span>
          </div>
          <button class="btn btn-ghost btn-sm" :title="selected.isFavorite ? 'Remove from favorites' : 'Add to favorites'" @click="toggleFavorite">{{ selected.isFavorite ? '★' : '☆' }}</button>
          <button v-if="selected.origin === 'foundry' && selected.localEdits" class="btn btn-ghost btn-sm" title="Drop your edits and show the Foundry version" @click="resetEdits">Reset edits</button>
          <button class="btn btn-ghost btn-sm" title="Copy as a homebrew entry you fully own" @click="duplicate">Duplicate</button>
          <button class="btn btn-ghost btn-sm" @click="toggleEdit">{{ editing ? 'Done' : 'Edit' }}</button>
          <button v-if="selected.origin !== 'foundry'" class="btn btn-danger btn-sm" @click="remove">Delete</button>
          <button class="btn btn-ghost btn-sm" title="Close" @click="select(null)">✕</button>
        </div>
        <div class="sys-entity-editor-body">
          <RulesEditor v-if="editing" ref="editorRef" :entity="selected" @saved="onSaved" />
          <RulesStatBlock v-else :entity="selected" />
        </div>
      </div>

      <div v-else class="sys-entity-empty">
        <div class="sys-entity-empty-icon" :style="{ color: cfg!.color, background: cfg!.color + '18', borderColor: cfg!.color + '33' }">
          <OhVueIcon :name="cfg!.icon" scale="1.2" />
        </div>
        <span>Select an entry to see its stat block</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { lsKey } from '~/utils/appNamespace'
import {
  rulesCreate, rulesDelete, rulesDuplicate, rulesGet, rulesQuery, rulesResetEdits, rulesUpdate, useRulesRevision,
  type RulesPage, type RulesQuery,
} from '~/composables/useRules'
import { formatBulk, formatMoney, RARITY_COLOR, SIZE_LABEL } from '~/rules/format'
import { GAME_CONFIG, GAME_IDS, type GameId } from '~/types/game'
import {
  kindForSegment, RARITIES, RULES_KIND_CONFIG,
  type Creature, type Item, type Rarity, type RulesEntity, type RulesOrigin, type Spell,
} from '~/types/rules'

const route = useRoute()
const router = useRouter()
const revision = useRulesRevision()

const kindParam = computed(() => String(route.params.kind))
const kind = computed(() => kindForSegment(kindParam.value))
const cfg = computed(() => kind.value ? RULES_KIND_CONFIG[kind.value] : null)

useHead({ title: () => `${cfg.value?.plural ?? 'Compendium'} — StarTome` })

const ORIGINS: { key: RulesOrigin; label: string }[] = [
  { key: 'foundry', label: 'Foundry' }, { key: 'user', label: 'Homebrew' }, { key: 'legacy', label: 'Legacy import' },
]
const ORIGIN_LABEL: Record<RulesOrigin, string> = { foundry: 'Foundry', user: 'Homebrew', legacy: 'Legacy import' }
const PAGE_SIZE = 100

// ── Filter prefs, remembered per kind ──────────────────────────────────────
interface Prefs {
  game: GameId | 'all'
  levelMin: number | '' | null
  levelMax: number | '' | null
  rarities: Rarity[]
  traits: string
  origins: RulesOrigin[]
  favoritesOnly: boolean
  showLegacy: boolean
  sort: 'name' | 'level'
  dir: 'asc' | 'desc'
}
const DEFAULT_PREFS: Prefs = { game: 'all', levelMin: null, levelMax: null, rarities: [], traits: '', origins: [], favoritesOnly: false, showLegacy: false, sort: 'name', dir: 'asc' }

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(lsKey(`compendium.${kindParam.value}`))
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS }
  } catch { return { ...DEFAULT_PREFS } }
}
const prefs = reactive<Prefs>(loadPrefs())
watch(kindParam, () => Object.assign(prefs, loadPrefs()))
watch(prefs, () => {
  try { localStorage.setItem(lsKey(`compendium.${kindParam.value}`), JSON.stringify(prefs)) } catch {}
}, { deep: true })

const search = ref('')
const showFilters = ref(false)

const activeFilterCount = computed(() =>
  (prefs.levelMin !== null && prefs.levelMin !== '' ? 1 : 0) + (prefs.levelMax !== null && prefs.levelMax !== '' ? 1 : 0)
  + (prefs.rarities.length ? 1 : 0) + (prefs.traits.trim() ? 1 : 0) + (prefs.origins.length ? 1 : 0)
  + (prefs.favoritesOnly ? 1 : 0) + (prefs.showLegacy ? 1 : 0),
)

function clearFilters() {
  Object.assign(prefs, { levelMin: null, levelMax: null, rarities: [], traits: '', origins: [], favoritesOnly: false, showLegacy: false })
}

function toggle<T>(list: T[], v: T) {
  const i = list.indexOf(v)
  if (i >= 0) list.splice(i, 1); else list.push(v)
}

// ── Query ──────────────────────────────────────────────────────────────────
const page = ref<RulesPage>({ items: [], total: 0 })
const loading = ref(false)
let queryToken = 0

function numOrNull(v: number | '' | null) { return v === '' || v === null ? null : Number(v) }

function queryOpts(): RulesQuery {
  return {
    kind: kind.value!,
    games: prefs.game === 'all' ? undefined : [prefs.game],
    text: search.value,
    levelMin: numOrNull(prefs.levelMin),
    levelMax: numOrNull(prefs.levelMax),
    rarities: prefs.rarities,
    traits: prefs.traits.split(',').map(t => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean),
    origins: prefs.origins,
    favoritesOnly: prefs.favoritesOnly,
    hideSuperseded: !prefs.showLegacy,
    sort: prefs.sort,
    dir: prefs.dir,
  }
}

async function reload() {
  if (!kind.value) return
  const token = ++queryToken
  loading.value = true
  try {
    // Keep already-loaded pages when refreshing after an edit
    const limit = Math.max(PAGE_SIZE, page.value.items.length)
    const res = await rulesQuery({ ...queryOpts(), offset: 0, limit })
    if (token === queryToken) page.value = res
  } finally {
    if (token === queryToken) loading.value = false
  }
}

async function loadMore() {
  loading.value = true
  try {
    const more = await rulesQuery({ ...queryOpts(), offset: page.value.items.length, limit: PAGE_SIZE })
    page.value = { items: [...page.value.items, ...more.items], total: more.total }
  } finally { loading.value = false }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = { items: [], total: page.value.total }; reload() }, 150)
})
watch([kind, () => JSON.stringify(prefs)], () => { page.value = { items: [], total: 0 }; reload() }, { immediate: true })
watch(revision, () => reload())

// ── Selection ──────────────────────────────────────────────────────────────
const selectedId = computed(() => (route.query.id as string | undefined) ?? null)
const selected = ref<RulesEntity | null>(null)
const editing = ref(false)
const editorRef = ref<{ flush: () => void } | null>(null)

watch(selectedId, async (id) => {
  editorRef.value?.flush()
  editing.value = route.query.edit === '1'
  selected.value = id ? (await rulesGet(id)) ?? null : null
}, { immediate: true })

function select(id: string | null) {
  router.replace({ query: id ? { id } : {} })
}

function onSaved(e: RulesEntity) {
  if (e.id === selected.value?.id) selected.value = e
}

function toggleEdit() {
  if (editing.value) editorRef.value?.flush()
  editing.value = !editing.value
  // Keep the URL in step so a reload reopens the same mode
  if (selectedId.value) router.replace({ query: editing.value ? { id: selectedId.value, edit: '1' } : { id: selectedId.value } })
}

async function createEntry() {
  const game: GameId | 'both' = prefs.game === 'all' ? 'pf2e' : prefs.game
  const e = await rulesCreate(kind.value!, { name: `New ${cfg.value!.label}`, game })
  await router.replace({ query: { id: e.id, edit: '1' } })
}

async function toggleFavorite() {
  if (!selected.value) return
  selected.value = (await rulesUpdate(selected.value.id, 'isFavorite', !selected.value.isFavorite)) ?? selected.value
}

async function resetEdits() {
  if (!selected.value || !confirm('Drop your local edits and show the Foundry version?')) return
  selected.value = (await rulesResetEdits(selected.value.id)) ?? selected.value
}

async function duplicate() {
  if (!selected.value) return
  const copy = await rulesDuplicate(selected.value.id)
  if (copy) await router.replace({ query: { id: copy.id, edit: '1' } })
}

async function remove() {
  if (!selected.value || !confirm(`Delete "${selected.value.name}"?`)) return
  await rulesDelete(selected.value.id)
  select(null)
}

// ── Row subtitle ───────────────────────────────────────────────────────────
function rowSub(e: RulesEntity): string {
  switch (e.kind) {
    case 'item': {
      const i = e as Item
      return [i.price ? formatMoney(i.price, i.game) : '', i.bulk ? formatBulk(i.bulk) : ''].filter(Boolean).join(' · ')
    }
    case 'creature': return SIZE_LABEL[(e as Creature).size]
    case 'spell': return (e as Spell).traditions.join(', ')
    default: return e.game === 'both' ? '' : GAME_CONFIG[e.game].short
  }
}
</script>

<style scoped>
.cmp-page { display: flex; flex-direction: column; flex: 1; overflow: hidden; }

/* List toolbar (same look as the legacy record pages) */
.sys-filter-btn {
  position: relative; background: none; border: 1px solid var(--border); border-radius: 4px;
  padding: 2px 7px; cursor: pointer; color: var(--text3); font-size: 13px; flex-shrink: 0;
}
.sys-filter-btn:hover, .sys-filter-btn.active { color: var(--accent); border-color: var(--accent); }
.sys-filter-badge {
  position: absolute; top: -5px; right: -5px; background: var(--accent); color: #fff; border-radius: 50%;
  font-size: 9px; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;
}
.sys-sort-bar { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-bottom: 1px solid var(--border); background: var(--bg2); }
.sys-sort-lbl { font-size: 11px; color: var(--text3); flex-shrink: 0; }
.sys-sort-sel { flex: 1; min-width: 0; font-size: 12px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; }
.sys-sort-dir { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; cursor: pointer; color: var(--text2); font-size: 12px; }
.sys-sort-dir:hover { background: var(--surface-hi); }
.sys-chip-clear { align-self: flex-start; background: none; border: none; cursor: pointer; color: var(--text3); font-size: 11px; padding: 1px 0; }
.sys-chip-clear:hover { color: var(--text); }
.cmp-seg { display: inline-flex; border: 1px solid var(--border-hi); border-radius: 6px; overflow: hidden; margin-right: 8px; }
.cmp-seg button { background: none; border: none; color: var(--text2); font-size: 11.5px; padding: 4px 10px; cursor: pointer; }
.cmp-seg button + button { border-left: 1px solid var(--border-hi); }
.cmp-seg button.on { background: var(--accent); color: #fff; }
.cmp-list { width: 340px; }
.cmp-list-title { flex: 1; font-size: 14px; font-weight: 600; color: var(--text); }
.cmp-count { font-family: var(--fm); font-size: 11px; color: var(--text3); }
.cmp-search-icon { font-size: 13px; color: var(--text3); flex-shrink: 0; }
.cmp-filters { display: flex; flex-direction: column; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.cmp-frow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.cmp-flabel { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); width: 52px; flex-shrink: 0; }
.cmp-num { width: 56px; }
.cmp-num, .cmp-text { background: var(--parch-dark); border: 1px solid var(--border-hi); border-radius: 4px; color: var(--text); font-size: 12px; padding: 3px 6px; }
.cmp-text { flex: 1; min-width: 0; }
.cmp-dash { color: var(--text3); }
.cmp-chip { background: none; border: 1px solid var(--border-hi); border-radius: 10px; color: var(--text2); font-size: 11px; padding: 1px 8px; cursor: pointer; text-transform: capitalize; }
.cmp-chip.on { color: var(--text); border-color: var(--accent); background: var(--surface-hi); }
.cmp-check { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--text2); margin-right: 10px; cursor: pointer; }
.cmp-row { gap: 8px; }
.cmp-level { font-family: var(--fm); font-size: 11px; color: var(--text3); width: 18px; text-align: right; flex-shrink: 0; }
.cmp-rarity { width: 3px; height: 14px; border-radius: 2px; flex-shrink: 0; }
.cmp-fav { color: #e8c44a; font-size: 11px; }
.cmp-edited { color: var(--text3); font-size: 11px; }
.cmp-more { margin: 8px 12px 12px; padding: 6px; background: var(--surface); border: 1px solid var(--border-hi); border-radius: 6px; color: var(--text2); font-size: 12px; cursor: pointer; }
.cmp-empty { padding: 32px 16px; text-align: center; color: var(--text3); font-size: 13px; line-height: 1.6; }
.cmp-empty span { font-size: 12px; }
.cmp-detail-title { flex: 1; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--text); min-width: 0; overflow: hidden; }
.cmp-detail-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cmp-badge { flex-shrink: 0;  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--border-hi); color: var(--text2); }
.cmp-badge--user { color: #7cc44e; border-color: #7cc44e55; }
.cmp-badge--legacy { color: #e8924a; border-color: #e8924a55; }
.cmp-badge--edited { color: #e8c44a; border-color: #e8c44a55; }
</style>
