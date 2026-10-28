<template>
  <div class="leg-page">
    <div class="sys-subnav">
      <div class="sys-breadcrumb">
        <span class="sys-breadcrumb-link">Compendium</span>
        <span class="sys-breadcrumb-sep">›</span>
        <span class="sys-breadcrumb-cur">DM's Tome import</span>
      </div>
    </div>

    <div class="leg-body">
      <!-- ── Source ────────────────────────────────────────────── -->
      <section class="leg-section">
        <h2 class="leg-h">Import from DM's Tome</h2>
        <p class="leg-text">
          Brings your DM's Tome campaign over: notes, encounters, maps, tokens. Your old library is matched against the
          synced compendium — portraits and token links move to the Foundry entries, your homebrew becomes compendium
          entries of its own. Nothing in DM's Tome is changed.
        </p>
        <p v-if="compendiumEmpty" class="leg-error">
          The compendium is empty. <NuxtLink to="/compendium/sync">Sync PF2e first</NuxtLink> (with the adventure bestiaries
          you use), otherwise nothing can be matched.
        </p>

        <template v-if="!analysis && !report && !busy">
          <div class="leg-sources">
            <button v-if="legacyDbAvailable" class="leg-source" :disabled="!!busy" @click="open({ browserDb: true })">
              <OhVueIcon name="gi-bookshelf" scale="1.4" />
              <b>Read DM's Tome in this browser</b>
              <span class="leg-muted">DM's Tome's data is reachable from here — no export needed</span>
            </button>
            <label
              class="leg-source leg-drop" :class="{ 'leg-drop--over': dragOver }"
              @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop"
            >
              <input type="file" accept=".json,application/json" class="leg-file" :disabled="!!busy" @change="onPick" />
              <OhVueIcon name="gi-scroll-unfurled" scale="1.4" />
              <b>Drop a DM's Tome export</b>
              <span class="leg-muted">dmstome-all-….json from Settings → Full Backup → Export</span>
            </label>
          </div>
        </template>

        <div v-if="busy" class="leg-progress">
          <div class="leg-bar"><div class="leg-bar-fill" :style="{ width: `${progressPct}%` }" /></div>
          <span>{{ progressLabel }}</span>
        </div>
        <p v-if="error" class="leg-error">{{ error }}</p>
      </section>

      <!-- ── Analysis ──────────────────────────────────────────── -->
      <template v-if="analysis && !report">
        <section class="leg-section">
          <h2 class="leg-h">What's in it</h2>
          <p class="leg-text">
            <b>{{ analysis.campaigns.join(', ') || 'No campaigns' }}</b>
            <span class="leg-muted">
              · {{ analysis.from === 'browser' ? 'read from DM\'s Tome in this browser' : 'export file' }}
              <template v-if="analysis.exportedAt"> from {{ formatDate(analysis.exportedAt) }}</template>
            </span>
          </p>
          <div class="leg-stats">
            <div v-for="[k, label] in LORE_LABELS" :key="k"><b>{{ (analysis.counts[k] ?? 0).toLocaleString() }}</b><span>{{ label }}</span></div>
          </div>
          <p v-if="analysis.alreadyImported.length" class="leg-error">
            {{ analysis.alreadyImported.join(', ') }} {{ analysis.alreadyImported.length === 1 ? 'is' : 'are' }} already here —
            importing again creates a second copy.
            <label class="leg-check"><input v-model="importAnyway" type="checkbox" /> Import anyway</label>
          </p>
        </section>

        <section class="leg-section">
          <h2 class="leg-h">Library matching</h2>
          <p class="leg-text leg-muted">
            Compared against {{ analysis.compendiumSize.toLocaleString() }} synced entries.
            Exact name matches are linked automatically; the rest is listed below.
          </p>
          <table class="leg-table">
            <thead><tr><th>Kind</th><th>Records</th><th>Matched</th><th>Fuzzy</th><th>No match</th></tr></thead>
            <tbody>
              <tr v-for="[kind, s] in kindRows" :key="kind">
                <td>{{ RULES_KIND_CONFIG[kind].plural }}</td>
                <td>{{ s.total.toLocaleString() }}</td>
                <td>{{ s.exact.toLocaleString() }} <span class="leg-muted">({{ pct(s.exact, s.total) }})</span></td>
                <td>{{ s.fuzzy || '' }}</td>
                <td>{{ s.unmatched || '' }}</td>
              </tr>
            </tbody>
          </table>
          <p class="leg-text">
            Portraits &amp; images: <b>{{ analysis.images.exact }}</b> of {{ analysis.images.total }} match exactly<template v-if="analysis.images.fuzzy">,
            {{ analysis.images.fuzzy }} more after review</template> — the rest stay on kept entries.
            Placed creatures: <b>{{ analysis.placements.exact }}</b> of {{ analysis.placements.linked }} link exactly<template v-if="analysis.placements.fuzzy">,
            {{ analysis.placements.fuzzy }} more after review</template>.
            <span v-if="analysis.placements.broken" class="leg-muted">{{ analysis.placements.broken }} placements point at deleted records and will be unlinked.</span>
          </p>
          <p v-if="lowBestiaryMatch" class="leg-text leg-muted">
            Many creatures or hazards don't match. Adventure-path creatures only match if that adventure's bestiary is synced —
            pick them on the <NuxtLink to="/compendium/sync">Foundry sync</NuxtLink> page, then open this file again.
          </p>
        </section>

        <!-- ── Review ──────────────────────────────────────────── -->
        <section v-if="analysis.review.length" class="leg-section">
          <h2 class="leg-h">Review ({{ analysis.review.length.toLocaleString() }})</h2>
          <p class="leg-text leg-muted">
            <b>Fuzzy</b>: found under a different name — check the pick. <b>No match</b>: records in use (portrait, token,
            placement, reference, carried) and your homebrew are kept as entries of their own; the rest — mostly legacy
            printings the remaster renamed or dropped — are left out unless you keep them.
          </p>
          <div class="leg-filters">
            <div class="leg-tabs">
              <button v-for="t in TABS" :key="t.key" class="leg-tab" :class="{ active: tab === t.key }" @click="tab = t.key">
                {{ t.label }} <span class="leg-muted">{{ tabCount(t.key) }}</span>
              </button>
            </div>
            <select v-model="kindFilter" class="leg-select">
              <option value="">All kinds</option>
              <option v-for="[kind] in kindRows" :key="kind" :value="kind">{{ RULES_KIND_CONFIG[kind].plural }}</option>
            </select>
            <input v-model="search" class="leg-search" placeholder="Filter by name…" />
          </div>
          <div class="leg-bulk">
            <span class="leg-muted">{{ filtered.length.toLocaleString() }} shown:</span>
            <button class="leg-link" @click="setAll('suggest')">take first candidate</button>
            <button class="leg-link" @click="setAll('keep')">keep all</button>
            <button class="leg-link" @click="setAll('drop')">drop all</button>
            <button class="leg-link" @click="setAll('default')">reset</button>
          </div>

          <div class="leg-rows">
            <div v-for="r in visible" :key="r.recordId" class="leg-row">
              <span class="leg-kind" :style="{ color: RULES_KIND_CONFIG[r.kind].color }">{{ RULES_KIND_CONFIG[r.kind].label }}</span>
              <div class="leg-row-main">
                <span class="leg-row-name">{{ r.name }}</span>
                <span class="leg-muted leg-row-meta">
                  <template v-if="r.level !== null">{{ RULES_KIND_CONFIG[r.kind].levelLabel }} {{ r.level }} · </template>{{ r.source || 'no source' }}
                </span>
                <span class="leg-chips">
                  <span v-if="r.usage.homebrew" class="leg-chip leg-chip--hb">homebrew</span>
                  <span v-if="r.usage.image" class="leg-chip">portrait</span>
                  <span v-if="r.usage.tokens" class="leg-chip">{{ r.usage.tokens }} token{{ r.usage.tokens > 1 ? 's' : '' }}</span>
                  <span v-if="r.usage.placements" class="leg-chip">{{ r.usage.placements }} placed</span>
                  <span v-if="r.usage.refs" class="leg-chip">{{ r.usage.refs }} ref{{ r.usage.refs > 1 ? 's' : '' }}</span>
                  <span v-if="r.usage.carried" class="leg-chip">carried: {{ r.usage.carried }}</span>
                  <span v-if="r.via === 'alias'" class="leg-chip">remaster rename</span>
                </span>
              </div>
              <select class="leg-select leg-decision" :class="`leg-decision--${decisionOf(r).action}`" :value="encode(decisionOf(r))" @change="setDecision(r, ($event.target as HTMLSelectElement).value)">
                <option v-for="c in r.candidates" :key="c.id" :value="`link:${c.id}`">
                  → {{ c.name }} ({{ c.level }}{{ c.pub ? `, ${shortPub(c.pub)}` : '' }}{{ c.superseded ? ', legacy' : '' }}{{ c.game !== 'pf2e' ? `, ${c.game}` : '' }})
                </option>
                <option value="keep">Keep as homebrew entry</option>
                <option value="drop">Leave out</option>
              </select>
            </div>
            <button v-if="filtered.length > visible.length" class="btn btn-ghost leg-more" @click="limit += 200">
              Show more ({{ (filtered.length - visible.length).toLocaleString() }} left)
            </button>
          </div>
        </section>

        <!-- ── Apply ───────────────────────────────────────────── -->
        <section class="leg-section">
          <h2 class="leg-h">Import</h2>
          <label class="leg-check"><input v-model="optLore" type="checkbox" /> Campaigns, notes, encounters, maps and tokens</label>
          <label class="leg-check">
            <input v-model="optLibrary" type="checkbox" />
            Also carry over the old library (systems &amp; records)
            <span class="leg-muted">— keeps encounter stat blocks working until they switch to the compendium</span>
          </label>
          <div class="leg-actions">
            <span class="leg-muted">
              {{ totals.link.toLocaleString() }} linked · {{ totals.keep.toLocaleString() }} kept · {{ totals.drop.toLocaleString() }} left out
            </span>
            <button class="btn btn-accent" :disabled="!!busy || (!!analysis.alreadyImported.length && !importAnyway)" @click="start">Import</button>
            <button class="btn btn-ghost" :disabled="!!busy" @click="reset">Cancel</button>
          </div>
        </section>
      </template>

      <!-- ── Report ────────────────────────────────────────────── -->
      <section v-if="report" class="leg-section leg-report">
        <h2 class="leg-h">Imported in {{ (report.durationMs / 1000).toFixed(1) }} s</h2>
        <div class="leg-stats">
          <div><b>{{ report.linked.toLocaleString() }}</b><span>records linked</span></div>
          <div><b>{{ report.kept.toLocaleString() }}</b><span>kept as entries</span></div>
          <div><b>{{ report.dropped.toLocaleString() }}</b><span>left out</span></div>
          <div><b>{{ report.entriesWithImages.toLocaleString() }}</b><span>entries with portraits</span></div>
          <div><b>{{ report.placements.linkedToFoundry }}</b><span>placements → Foundry</span></div>
          <div><b>{{ report.placements.linkedToCompendium - report.placements.linkedToFoundry }}</b><span>placements → homebrew</span></div>
        </div>
        <p class="leg-text leg-muted">
          Written: <template v-for="([t, n], i) in writtenRows" :key="t">{{ i ? ', ' : '' }}{{ n.toLocaleString() }} {{ t }}</template>.
        </p>
        <details v-if="report.issues.length" class="leg-block">
          <summary>Notes ({{ report.issues.length }})</summary>
          <ul>
            <li v-for="(iss, i) in report.issues" :key="i">{{ iss.table }} #{{ iss.id }}: {{ iss.detail }}</li>
          </ul>
        </details>
        <div class="leg-actions">
          <NuxtLink class="btn btn-accent" to="/">Open campaigns</NuxtLink>
          <NuxtLink class="btn btn-ghost" to="/compendium/creatures">Open the compendium</NuxtLink>
          <button class="btn btn-ghost" @click="reset">Import another</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getDb } from '~/composables/useDb'
import { useLegacyImport } from '~/composables/useLegacyImport'
import { hasLegacyDb, type RecordDecision, type RecordReview } from '~/sync/legacyImport'
import { RULES_KIND_CONFIG, RULES_KINDS, type RulesKind } from '~/types/rules'

useHead({ title: 'DM\'s Tome import — StarTome' })

const LORE_LABELS: [string, string][] = [
  ['entities', 'notes & entries'], ['encounters', 'encounters'], ['encounterTokens', 'placements'], ['tokens', 'library tokens'],
  ['graphLayouts', 'graphs'], ['records', 'library records'],
]

const TABS = [
  { key: 'fuzzy', label: 'Fuzzy' },
  { key: 'keep', label: 'Kept' },
  { key: 'drop', label: 'Left out' },
  { key: 'all', label: 'All' },
] as const
type Tab = typeof TABS[number]['key']

const { analysis, report, progress, error, busy, open, apply, reset: resetImport } = useLegacyImport()

const legacyDbAvailable = ref(false)
const compendiumEmpty = ref(false)
const dragOver = ref(false)

onMounted(async () => {
  // DM's Tome's database is only reachable when both apps share an origin (the deployed github.io site)
  try { legacyDbAvailable.value = await hasLegacyDb() } catch {}
  compendiumEmpty.value = (await getDb().rules.where('origin').equals('foundry').limit(1).count()) === 0
})

function onDrop(e: DragEvent) {
  dragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f && !busy.value) open({ file: f })
}

function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (f) open({ file: f })
}

// ── Review ─────────────────────────────────────────────────────────────────
const overrides = ref<Record<number, RecordDecision>>({})
const tab = ref<Tab>('fuzzy')
const kindFilter = ref<RulesKind | ''>('')
const search = ref('')
const limit = ref(200)
const importAnyway = ref(false)
const optLore = ref(true)
const optLibrary = ref(true)

watch(analysis, (a) => {
  overrides.value = {}
  importAnyway.value = false
  tab.value = a?.review.some(r => r.status === 'fuzzy') ? 'fuzzy' : 'keep'
})
watch([tab, kindFilter, search], () => { limit.value = 200 })

function decisionOf(r: RecordReview): RecordDecision {
  return overrides.value[r.recordId] ?? r.decision
}

function encode(d: RecordDecision): string {
  return d.action === 'link' ? `link:${d.rulesId}` : d.action
}

function setDecision(r: RecordReview, value: string) {
  const d: RecordDecision = value.startsWith('link:') ? { action: 'link', rulesId: value.slice(5) } : { action: value as 'keep' | 'drop' }
  overrides.value = { ...overrides.value, [r.recordId]: d }
}

function inTab(r: RecordReview, t: Tab) {
  if (t === 'all') return true
  if (t === 'fuzzy') return r.status === 'fuzzy'
  return r.status === 'unmatched' && decisionOf(r).action === t
}

function tabCount(t: Tab) {
  return analysis.value?.review.filter(r => inTab(r, t)).length ?? 0
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (analysis.value?.review ?? []).filter(r =>
    inTab(r, tab.value) && (!kindFilter.value || r.kind === kindFilter.value) && (!q || r.name.toLowerCase().includes(q)))
})
const visible = computed(() => filtered.value.slice(0, limit.value))

function setAll(mode: 'suggest' | 'keep' | 'drop' | 'default') {
  const next = { ...overrides.value }
  for (const r of filtered.value) {
    if (mode === 'default') delete next[r.recordId]
    else if (mode === 'suggest') { if (r.candidates[0]) next[r.recordId] = { action: 'link', rulesId: r.candidates[0].id } }
    else next[r.recordId] = { action: mode }
  }
  overrides.value = next
}

const kindRows = computed(() =>
  RULES_KINDS.filter(k => analysis.value?.kinds[k]).map(k => [k, analysis.value!.kinds[k]!] as const))

const lowBestiaryMatch = computed(() => {
  const k = analysis.value?.kinds
  return (['creature', 'hazard'] as const).some(kind => k?.[kind] && k[kind]!.exact / k[kind]!.total < 0.8)
})

const totals = computed(() => {
  const a = analysis.value
  const t = { link: 0, keep: 0, drop: 0 }
  if (!a) return t
  for (const s of Object.values(a.kinds)) t.link += s!.exact
  for (const r of a.review) t[decisionOf(r).action]++
  return t
})

async function start() {
  await apply(overrides.value, { lore: optLore.value, library: optLibrary.value })
}

function reset() {
  resetImport()
  overrides.value = {}
}

const writtenRows = computed(() => Object.entries(report.value?.written ?? {}).filter(([, n]) => n))

// ── Progress ───────────────────────────────────────────────────────────────
const PHASE_LABEL = {
  read: 'Reading DM\'s Tome data', analyse: 'Matching the library', records: 'Converting records', images: 'Storing portraits',
  library: 'Copying the old library', lore: 'Importing campaigns',
} as const
const PHASE_PCT = { read: 10, analyse: 45, records: 55, images: 65, library: 80, lore: 90 } as const

const progressPct = computed(() => {
  const p = progress.value
  if (!p) return 3
  const base = PHASE_PCT[p.phase]
  return p.total ? base + Math.min(9, ((p.done ?? 0) / p.total) * 9) : base
})
const progressLabel = computed(() => {
  const p = progress.value
  if (!p) return busy.value === 'open' ? 'Starting…' : 'Importing…'
  return `${PHASE_LABEL[p.phase]}${p.total ? ` (${(p.done ?? 0).toLocaleString()} of ${p.total.toLocaleString()})` : ''}…`
})

function pct(n: number, total: number) {
  return total ? `${Math.round((n / total) * 100)}%` : '—'
}

function shortPub(t: string) {
  return t.replace(/^(Pathfinder|Starfinder)\s+/, '').replace(/^Lost Omens\s+/, 'LO ')
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<style scoped>
.leg-page { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.leg-body { flex: 1; overflow-y: auto; padding: 18px 24px 40px; display: flex; flex-direction: column; gap: 22px; max-width: 980px; }
.leg-section { display: flex; flex-direction: column; gap: 10px; }
.leg-h { font-family: var(--fh); font-size: 15px; margin: 0; color: var(--text); letter-spacing: 0.04em; }
.leg-muted { color: var(--text3); }
.leg-error { color: #e87a7a; font-size: 13px; margin: 0; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; }
.leg-text { font-size: 13px; color: var(--text2); margin: 0; line-height: 1.6; }
.leg-section a { color: var(--accent-l, var(--accent)); }
.leg-sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
.leg-source {
  position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center;
  border: 2px dashed var(--border-hi); border-radius: 10px; padding: 22px; color: var(--text2); font-size: 13px; cursor: pointer;
  background: none; font-family: inherit; transition: border-color 0.15s, background 0.15s;
}
.leg-source b { color: var(--text); }
.leg-source:hover, .leg-drop--over { border-color: var(--accent); background: var(--surface); }
.leg-source:disabled { opacity: 0.6; cursor: progress; }
.leg-file { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.leg-progress { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--text2); }
.leg-bar { height: 8px; border-radius: 4px; background: var(--surface-hi); overflow: hidden; }
.leg-bar-fill { height: 100%; background: var(--accent); transition: width 0.3s; }
.leg-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.leg-stats div { display: flex; flex-direction: column; background: var(--surface); border-radius: 6px; padding: 6px 10px; }
.leg-stats b { font-family: var(--fm); font-size: 17px; color: var(--text); }
.leg-stats span { font-size: 11px; color: var(--text3); }
.leg-table { border-collapse: collapse; font-size: 12.5px; color: var(--text2); max-width: 560px; }
.leg-table th { text-align: left; font-weight: 600; color: var(--text3); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 4px 14px 4px 0; }
.leg-table td { padding: 3px 14px 3px 0; border-top: 1px solid var(--border); font-family: var(--fm); }
.leg-table td:first-child { font-family: inherit; color: var(--text); }
.leg-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.leg-tabs { display: flex; gap: 2px; background: var(--surface); border-radius: 7px; padding: 2px; }
.leg-tab { background: none; border: none; color: var(--text2); font-size: 12.5px; padding: 4px 10px; border-radius: 5px; cursor: pointer; font-family: inherit; }
.leg-tab.active { background: var(--surface-hi); color: var(--text); }
.leg-select, .leg-search {
  background: var(--surface); border: 1px solid var(--border-hi); border-radius: 6px; color: var(--text); font-size: 12.5px; padding: 4px 8px; font-family: inherit;
}
.leg-search { flex: 1; min-width: 160px; }
.leg-bulk { display: flex; gap: 10px; align-items: baseline; font-size: 12px; flex-wrap: wrap; }
.leg-link { background: none; border: none; color: var(--accent-l, var(--accent)); cursor: pointer; font-size: 12px; padding: 0; font-family: inherit; }
.leg-rows { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 8px; }
.leg-row { display: grid; grid-template-columns: 80px minmax(0, 1fr) minmax(200px, 300px); gap: 10px; align-items: center; padding: 6px 10px; border-top: 1px solid var(--border); }
.leg-row:first-child { border-top: none; }
.leg-kind { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.leg-row-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; min-width: 0; }
.leg-row-name { color: var(--text); font-size: 13px; font-weight: 500; }
.leg-row-meta { font-size: 11.5px; }
.leg-chips { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.leg-chip { font-size: 10.5px; padding: 0 6px; border-radius: 999px; background: var(--surface-hi); color: var(--text2); }
.leg-chip--hb { background: var(--accent-bg, var(--surface-hi)); color: var(--accent-l, var(--accent)); }
.leg-decision { width: 100%; min-width: 0; }
.leg-decision--keep { border-color: #7cc44e; }
.leg-decision--drop { color: var(--text3); }
.leg-more { margin: 8px auto; }
.leg-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text2); cursor: pointer; }
.leg-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.leg-report { border: 1px solid var(--border-hi); border-radius: 8px; padding: 12px 14px; }
.leg-block { font-size: 12.5px; color: var(--text2); }
.leg-block summary { cursor: pointer; color: var(--text); font-weight: 600; }
.leg-block ul { margin: 4px 0 0; padding-left: 18px; max-height: 260px; overflow-y: auto; }
@media (max-width: 640px) {
  .leg-body { padding: 14px 16px 32px; }
  .leg-row { grid-template-columns: 1fr; }
}
</style>
