<script setup lang="ts">
/**
 * The compendium: one browser for every kind of rules entry. Kind, game,
 * level, rarity, traits, source and pack are filters; the entry you pick
 * shows beside the list with its stat block and rolls.
 */
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDownAZ, ArrowUpAZ, Hammer, Plus, Search, Star } from 'lucide-vue-next'
import { GAME_CONFIG, GAME_IDS, type GameId } from '@/domain/game'
import { formatBulk, formatMoney, RARITY_COLOR, SIZE_LABEL } from '@/domain/rules/format'
import { summarizePacks, type PackSummary } from '@/domain/rules/packs'
import { isRulesKind, RARITIES, RULES_KIND_CONFIG, RULES_KINDS, type Creature, type Item, type Rarity, type RulesEntity, type RulesKind, type RulesOrigin, type Spell } from '@/domain/rules/types'
import { rulesCounts, rulesCreate, rulesQuery, rulesUserEntries, type RulesPage, type RulesQuery } from '@/data/rules'
import { workspace } from '@/data/repo'
import GameIcon from '@/ui/components/GameIcon.vue'
import { reportError } from '@/ui/dialogs'
import { rulesRevision } from '@/ui/rulesLive'
import { campaign } from '@/ui/workbench'
import CompendiumTabs from './CompendiumTabs.vue'
import CreatureBuilder from './CreatureBuilder.vue'
import RulesView from './RulesView.vue'

const route = useRoute()
const router = useRouter()
const PAGE = 100
const ORIGINS: [RulesOrigin, string][] = [['foundry', 'Foundry'], ['user', 'Homebrew'], ['legacy', 'DM’s Tome']]

// ── Kind and filters; the filters are remembered per kind ──────────────────
interface Prefs {
  game: GameId | 'all'; levelMin: number | null; levelMax: number | null; rarities: Rarity[]; traits: string; origins: RulesOrigin[]
  favoritesOnly: boolean; showLegacy: boolean; showRemoved: boolean; packs: string[]; sort: 'name' | 'level'; dir: 'asc' | 'desc'
}
const DEFAULTS: Prefs = { game: 'all', levelMin: null, levelMax: null, rarities: [], traits: '', origins: [], favoritesOnly: false, showLegacy: false, showRemoved: false, packs: [], sort: 'name', dir: 'asc' }
const kind = computed<RulesKind | null>(() => { const k = String(route.query.kind ?? ''); return isRulesKind(k) ? k : null })
const prefs = reactive<Prefs>({ ...DEFAULTS })
const search = ref('')
let loadedFor: string | null = null

watch(kind, async (k) => {
  loadedFor = null
  const saved = await workspace.get<Partial<Prefs>>('', `compendium.${k ?? 'all'}`, {})
  Object.assign(prefs, DEFAULTS, { game: campaign.value?.game ?? 'all' }, saved)
  loadedFor = k ?? 'all'
}, { immediate: true })
watch(prefs, () => { if (loadedFor) void workspace.set('', `compendium.${loadedFor}`, { ...prefs, rarities: [...prefs.rarities], origins: [...prefs.origins], packs: [...prefs.packs] }) }, { deep: true })

const setKind = (k: RulesKind | null) => router.replace({ query: k ? { kind: k } : {} })
const counts = shallowRef<Partial<Record<RulesKind, number>>>({})
const packs = shallowRef<PackSummary[]>([])
watch(rulesRevision, async () => { counts.value = await rulesCounts() }, { immediate: true })
watch([kind, rulesRevision], async () => { packs.value = summarizePacks((await rulesUserEntries()).filter(e => !kind.value || e.kind === kind.value)) }, { immediate: true })
const total = computed(() => Object.values(counts.value).reduce((a, b) => a + (b ?? 0), 0))

const activeFilters = computed(() => Number(prefs.levelMin !== null) + Number(prefs.levelMax !== null) + Number(prefs.rarities.length > 0) + Number(!!prefs.traits.trim()) + Number(prefs.origins.length > 0)
  + Number(prefs.favoritesOnly) + Number(prefs.showLegacy) + Number(prefs.showRemoved) + Number(prefs.packs.length > 0))
function clear() { Object.assign(prefs, { ...DEFAULTS, game: prefs.game, sort: prefs.sort, dir: prefs.dir }); search.value = '' }
function toggle<T>(list: T[], v: T) { const i = list.indexOf(v); if (i >= 0) list.splice(i, 1); else list.push(v) }
const numOrNull = (e: Event) => { const v = (e.target as HTMLInputElement).value; return v === '' ? null : Number(v) }

// ── Query ──────────────────────────────────────────────────────────────────
const page = shallowRef<RulesPage>({ items: [], total: 0 })
const loading = ref(false)
let token = 0

function query(): RulesQuery {
  return {
    kinds: kind.value ? [kind.value] : [], games: prefs.game === 'all' ? undefined : [prefs.game], text: search.value,
    levelMin: prefs.levelMin, levelMax: prefs.levelMax, rarities: [...prefs.rarities],
    traits: prefs.traits.split(',').map(t => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean),
    origins: [...prefs.origins], packs: [...prefs.packs], favoritesOnly: prefs.favoritesOnly, hideSuperseded: !prefs.showLegacy, showRemoved: prefs.showRemoved,
    sort: prefs.sort, dir: prefs.dir,
  }
}
async function reload(keep = false) {
  const mine = ++token
  loading.value = true
  try {
    const res = await rulesQuery({ ...query(), offset: 0, limit: keep ? Math.max(PAGE, page.value.items.length) : PAGE })
    if (mine === token) page.value = res
  } catch (err) { reportError('Reading the compendium', err) } finally { if (mine === token) loading.value = false }
}
async function more() {
  const res = await rulesQuery({ ...query(), offset: page.value.items.length, limit: PAGE })
  page.value = { items: [...page.value.items, ...res.items], total: res.total }
}
let timer: ReturnType<typeof setTimeout> | null = null
watch(search, () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void reload() }, 150) })
watch([kind, () => JSON.stringify(prefs)], () => { void reload() }, { immediate: true })
watch(rulesRevision, () => { void reload(true) })

// ── Selection ──────────────────────────────────────────────────────────────
const selectedId = computed(() => (typeof route.query.id === 'string' ? route.query.id : null))
const editFirst = computed(() => route.query.edit === '1')
function select(id: string | null, edit = false) {
  void router.replace({ query: { ...(kind.value ? { kind: kind.value } : {}), ...(id ? { id } : {}), ...(edit ? { edit: '1' } : {}) } })
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  const at = page.value.items.findIndex(x => x.id === selectedId.value)
  const next = page.value.items[Math.max(0, Math.min(page.value.items.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))]
  if (next) { select(next.id); document.querySelector(`[data-rule="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' }) }
}

// ── New entries ────────────────────────────────────────────────────────────
const newGame = computed<GameId>(() => (prefs.game === 'all' ? campaign.value?.game ?? 'pf2e' : prefs.game))
const adding = ref(false)
async function create(k: RulesKind) {
  adding.value = false
  try { const e = await rulesCreate(k, { name: `New ${RULES_KIND_CONFIG[k].label}`, game: newGame.value }); await router.replace({ query: { kind: k, id: e.id, edit: '1' } }) }
  catch (err) { reportError('Creating the entry', err) }
}
const building = ref(false)
function built(c: Creature, edit: boolean) { building.value = false; void router.replace({ query: { kind: 'creature', id: c.id, ...(edit ? { edit: '1' } : {}) } }) }

function sub(e: RulesEntity): string {
  const game = e.game === 'both' || prefs.game !== 'all' ? '' : GAME_CONFIG[e.game].short
  let own = ''
  if (e.kind === 'item') { const i = e as Item; own = [i.price ? formatMoney(i.price, i.game) : '', i.bulk ? formatBulk(i.bulk) : ''].filter(Boolean).join(' · ') }
  else if (e.kind === 'creature') own = SIZE_LABEL[(e as Creature).size]
  else if (e.kind === 'spell') own = (e as Spell).traditions.join(', ')
  return [kind.value ? '' : RULES_KIND_CONFIG[e.kind].label, own, game].filter(Boolean).join(' · ')
}

/** Kinds a battle map takes as a token: dragged from this list onto an encounter's map, in this window's dock or another window. */
const PLACEABLE: string[] = ['creature', 'hazard', 'vehicle']
function drag(ev: DragEvent, e: { id: string; name: string }) { ev.dataTransfer?.setData('application/x-startome-rules', e.id); ev.dataTransfer?.setData('text/plain', e.name) }
</script>

<template>
  <div class="wrap">
    <CompendiumTabs />
    <div class="compendium">
      <aside class="filters">
        <div class="head"><h1>Compendium</h1>
          <div class="new">
            <button class="btn btn-primary" data-test="rules-new" @click="kind ? create(kind) : (adding = !adding)"><Plus :size="14" /> New</button>
            <div v-if="adding" class="menu panel"><button v-for="k in RULES_KINDS" :key="k" class="kind" @click="create(k)">{{ RULES_KIND_CONFIG[k].label }}</button></div>
          </div>
        </div>
        <div class="seg" role="group" aria-label="Game">
          <button :class="{ on: prefs.game === 'all' }" @click="prefs.game = 'all'">All</button>
          <button v-for="g in GAME_IDS" :key="g" :class="{ on: prefs.game === g }" @click="prefs.game = g">{{ GAME_CONFIG[g].short }}</button>
        </div>
        <div class="eyebrow">Kind</div>
        <button class="kind" :class="{ on: !kind }" @click="setKind(null)"><span /> <span>Everything</span> <span class="num faint">{{ total.toLocaleString() }}</span></button>
        <button v-for="k in RULES_KINDS" :key="k" class="kind" :class="{ on: kind === k }" :style="{ '--type': RULES_KIND_CONFIG[k].color }" @click="setKind(k)">
          <GameIcon :name="RULES_KIND_CONFIG[k].icon" :size="14" /> <span>{{ RULES_KIND_CONFIG[k].plural }}</span> <span class="num faint">{{ (counts[k] ?? 0).toLocaleString() }}</span>
        </button>
      </aside>

      <section class="list" tabindex="0" @keydown="onKey">
        <div class="bar">
          <label class="search"><Search :size="14" /><input v-model="search" class="input" :placeholder="`Search ${kind ? RULES_KIND_CONFIG[kind].plural.toLowerCase() : 'the compendium'}…`" data-test="rules-search" /></label>
          <button class="btn btn-ghost btn-icon" :class="{ on: prefs.favoritesOnly }" title="Favourites only" @click="prefs.favoritesOnly = !prefs.favoritesOnly"><Star :size="15" /></button>
          <button class="btn btn-ghost btn-icon" :title="`Sorted by ${prefs.sort}, ${prefs.dir === 'asc' ? 'ascending' : 'descending'}`" @click="prefs.dir = prefs.dir === 'asc' ? 'desc' : 'asc'"><component :is="prefs.dir === 'asc' ? ArrowDownAZ : ArrowUpAZ" :size="15" /></button>
          <select v-model="prefs.sort" class="input sort" aria-label="Sort"><option value="name">Name</option><option value="level">Level</option></select>
        </div>
        <details class="more" :open="activeFilters > 0">
          <summary>Filters<span v-if="activeFilters" class="chip on">{{ activeFilters }}</span><span class="grow" /><span class="num faint">{{ page.total.toLocaleString() }} found</span></summary>
          <div class="fields">
            <label>Level <input class="input lvl" type="number" :value="prefs.levelMin ?? ''" placeholder="min" @change="prefs.levelMin = numOrNull($event)" /> – <input class="input lvl" type="number" :value="prefs.levelMax ?? ''" placeholder="max" @change="prefs.levelMax = numOrNull($event)" /></label>
            <label class="grow">Traits <input v-model.lazy="prefs.traits" class="input" placeholder="undead, fire" /></label>
          </div>
          <div class="chips">
            <button v-for="r in RARITIES" :key="r" class="chip" :class="{ on: prefs.rarities.includes(r) }" :style="{ '--c': RARITY_COLOR[r] }" @click="toggle(prefs.rarities, r)">{{ r }}</button>
            <button v-for="[o, label] in ORIGINS" :key="o" class="chip" :class="{ on: prefs.origins.includes(o) }" @click="toggle(prefs.origins, o)">{{ label }}</button>
            <button class="chip" :class="{ on: prefs.showLegacy }" title="Pre-Remaster entries that have a Remaster version" @click="prefs.showLegacy = !prefs.showLegacy">superseded legacy</button>
            <button class="chip" :class="{ on: prefs.showRemoved }" title="Entries that left their Foundry pack" @click="prefs.showRemoved = !prefs.showRemoved">removed upstream</button>
          </div>
          <div v-if="packs.length" class="chips">
            <span class="faint">Pack</span>
            <button v-for="p in packs" :key="p.title" class="chip" :class="{ on: prefs.packs.includes(p.title) }" @click="toggle(prefs.packs, p.title)">{{ p.title || 'no pack' }} <span class="num faint">{{ p.count }}</span></button>
          </div>
          <button v-if="activeFilters" class="btn btn-ghost" @click="clear">Clear filters</button>
        </details>
        <div class="rows">
          <button v-for="e in page.items" :key="e.id" class="row" :class="{ on: e.id === selectedId }" :data-rule="e.id" :draggable="PLACEABLE.includes(e.kind)" :title="PLACEABLE.includes(e.kind) ? 'Drag onto a battle map (also one open in another window) to place it' : undefined" @click="select(e.id)" @dragstart="drag($event, e)">
            <span class="lvl-box num" :style="{ borderColor: RULES_KIND_CONFIG[e.kind].color }">{{ RULES_KIND_CONFIG[e.kind].hasLevel ? e.level : '·' }}</span>
            <span class="name">{{ e.name }}<Star v-if="e.isFavorite" :size="11" class="star" fill="currentColor" /><span v-if="e.localEdits" class="tag">edited</span><span v-if="e.origin === 'user'" class="tag">homebrew</span></span>
            <span v-if="e.rarity !== 'common'" class="dot" :style="{ background: RARITY_COLOR[e.rarity] }" :title="e.rarity" />
            <span class="sub faint">{{ sub(e) }}</span>
          </button>
          <button v-if="page.items.length < page.total" class="btn load" @click="more">Show more ({{ (page.total - page.items.length).toLocaleString() }} left)</button>
          <div v-if="!page.items.length && !loading" class="empty">
            <template v-if="!total">The compendium is empty. <RouterLink :to="{ name: 'compendium-sync' }">Sync it from a Foundry release</RouterLink> or <RouterLink :to="{ name: 'compendium-homebrew' }">import homebrew</RouterLink>.</template>
            <template v-else>Nothing matches. <button class="btn" @click="clear">Clear filters</button></template>
          </div>
        </div>
        <div v-if="!kind || kind === 'creature'" class="foot"><button class="btn" title="Build a homebrew creature from GM Core's creature-building tables" @click="building = true"><Hammer :size="14" /> Build creature</button></div>
      </section>

      <section class="detail">
        <RulesView v-if="selectedId" :key="selectedId" :rules-id="selectedId" :start-editing="editFirst" in-page @open="(id, edit) => select(id, edit)" @gone="select(null)" />
        <p v-else class="empty">Pick an entry to read its stat block. Numbers you would roll are buttons.</p>
      </section>
    </div>
    <CreatureBuilder :open="building" :game="newGame" @close="building = false" @saved="built" />
  </div>
</template>

<style scoped>
.wrap { height: 100%; display: flex; flex-direction: column; }
.compendium { flex: 1; min-height: 0; display: grid; grid-template-columns: 230px minmax(300px, 400px) minmax(0, 1fr); }
.filters { padding: 1.1rem .8rem 2rem 1.2rem; border-right: var(--frame); overflow: auto; display: flex; flex-direction: column; gap: .1rem; background-image: var(--wash); }
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: .7rem; }
.head h1 { font-size: 1.1rem; }
.new { position: relative; }
.menu { position: absolute; z-index: 5; top: calc(100% + 4px); left: 0; width: 190px; max-height: 60vh; overflow: auto; padding: .3rem; display: flex; flex-direction: column; box-shadow: var(--shadow); }
.seg { display: flex; border: var(--frame); border-radius: var(--radius); overflow: hidden; }
.seg button { flex: 1; padding: .25rem 0; background: none; border: 0; color: var(--text-faint); }
.seg button.on { background: var(--accent-soft); color: var(--accent); }
.eyebrow { margin: .9rem 0 .3rem; }
.kind { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: .4rem; padding: .22rem .5rem; background: none; border: 1px solid transparent; border-radius: var(--radius); text-align: left; color: var(--text-dim); }
.menu .kind { display: block; }
.kind :deep(svg) { color: var(--type); }
.kind:hover { background: var(--bg-hover); color: var(--text); }
.kind.on { border-color: var(--type, var(--accent)); background: color-mix(in srgb, var(--type, var(--accent)) 12%, transparent); color: var(--text); }
.list { display: flex; flex-direction: column; min-height: 0; border-right: var(--frame); outline: none; }
.bar { display: flex; align-items: center; gap: .3rem; padding: .5rem .7rem; border-bottom: var(--frame); }
.search { flex: 1; display: flex; align-items: center; gap: .4rem; color: var(--text-faint); }
.sort { width: auto; }
.bar .on { color: var(--accent); }
.more { padding: .35rem .7rem; border-bottom: var(--frame); font-size: .88rem; }
.more summary { display: flex; align-items: center; gap: .5rem; cursor: pointer; color: var(--text-dim); }
.more[open] { display: flex; flex-direction: column; gap: .45rem; }
.fields { display: flex; gap: .8rem; align-items: center; margin-top: .4rem; }
.fields label { display: flex; align-items: center; gap: .35rem; color: var(--text-faint); }
.lvl { width: 4.2rem; }
.grow { flex: 1; }
.chips { display: flex; flex-wrap: wrap; gap: .25rem; align-items: center; }
.chip { background: none; cursor: pointer; }
.chip.on { border-color: var(--c, var(--accent)); color: var(--c, var(--accent)); background: var(--accent-soft); }
.rows { flex: 1; overflow: auto; padding: .2rem 0 1rem; }
.row { display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto auto; align-items: center; gap: .55rem; width: 100%; padding: .26rem .7rem; background: none; border: 0; border-left: 2px solid transparent; text-align: left; }
.row:hover { background: var(--bg-hover); }
.row.on { background: var(--accent-soft); border-left-color: var(--accent); }
.lvl-box { text-align: center; font-size: .8rem; border: 1px solid; border-radius: var(--radius); color: var(--text-dim); }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.star { color: var(--accent); margin-left: .35rem; }
.tag { margin-left: .4rem; font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; color: var(--accent-2); }
.dot { width: 7px; height: 7px; border-radius: 50%; }
.sub { font-size: .8rem; white-space: nowrap; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.load { display: block; margin: .6rem auto; }
.foot { padding: .4rem .7rem; border-top: var(--frame); }
.detail { overflow: auto; min-width: 0; }
</style>
