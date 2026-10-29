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
          Brings your DM's Tome campaigns over: notes and entries with their portraits and images, links, snapshots,
          graphs, encounters with maps, walls and placements, and your library tokens. DM's Tome's rules library isn't
          imported — the compendium comes from the <NuxtLink to="/compendium/sync">Foundry sync</NuxtLink>. Nothing in
          DM's Tome is changed.
        </p>

        <template v-if="!summary && !report && !busy">
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

      <!-- ── Summary ───────────────────────────────────────────── -->
      <template v-if="summary && !report">
        <section class="leg-section">
          <h2 class="leg-h">What's in it</h2>
          <p class="leg-text">
            <span class="leg-muted">
              {{ summary.from === 'browser' ? 'Read from DM\'s Tome in this browser' : 'Export file' }}
              <template v-if="summary.exportedAt"> from {{ formatDate(summary.exportedAt) }}</template>
            </span>
          </p>
          <table class="leg-table">
            <thead><tr><th>Campaign</th><th>Entries</th><th>Encounters</th></tr></thead>
            <tbody>
              <tr v-for="c in summary.campaigns" :key="c.id">
                <td>{{ c.name }}</td><td>{{ c.entries.toLocaleString() }}</td><td>{{ c.encounters.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
          <div class="leg-stats">
            <div v-for="[k, label] in LORE_LABELS" :key="k"><b>{{ (summary.counts[k] ?? 0).toLocaleString() }}</b><span>{{ label }}</span></div>
          </div>
          <p v-if="summary.monsterTokens" class="leg-text leg-muted">
            {{ summary.monsterTokens.toLocaleString() }} library token{{ summary.monsterTokens === 1 ? '' : 's' }} for monsters
            and other stat blocks {{ summary.monsterTokens === 1 ? 'is' : 'are' }} left out. Their placements stay on the maps
            with their name and image; link them to compendium creatures from the encounter page if you want their stats.
          </p>
          <p v-if="summary.alreadyImported.length" class="leg-error">
            {{ summary.alreadyImported.join(', ') }} {{ summary.alreadyImported.length === 1 ? 'is' : 'are' }} already here —
            importing again creates a second copy.
            <label class="leg-check"><input v-model="importAnyway" type="checkbox" /> Import anyway</label>
          </p>
          <div class="leg-actions">
            <button class="btn btn-accent" :disabled="!!busy || !summary.campaigns.length || (!!summary.alreadyImported.length && !importAnyway)" @click="apply()">Import</button>
            <button class="btn btn-ghost" :disabled="!!busy" @click="reset">Cancel</button>
          </div>
        </section>
      </template>

      <!-- ── Report ────────────────────────────────────────────── -->
      <section v-if="report" class="leg-section leg-report">
        <h2 class="leg-h">Imported in {{ (report.durationMs / 1000).toFixed(1) }} s</h2>
        <div class="leg-stats">
          <div v-for="[k, label] in LORE_LABELS" :key="k"><b>{{ (report.written[k] ?? 0).toLocaleString() }}</b><span>{{ label }}</span></div>
        </div>
        <details v-if="report.issues.length" class="leg-block">
          <summary>Notes ({{ report.issues.length }})</summary>
          <ul>
            <li v-for="(iss, i) in report.issues" :key="i">{{ iss.table }}<template v-if="iss.id >= 0"> #{{ iss.id }}</template>: {{ iss.detail }}</li>
          </ul>
        </details>
        <div class="leg-actions">
          <NuxtLink class="btn btn-accent" to="/">Open campaigns</NuxtLink>
          <button class="btn btn-ghost" @click="reset">Import another</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLegacyImport } from '~/composables/useLegacyImport'
import { hasLegacyDb } from '~/sync/legacyImport'
import type { LoreTable } from '~/converters/legacy/lore'

useHead({ title: 'DM\'s Tome import — StarTome' })

const LORE_LABELS: [LoreTable, string][] = [
  ['campaigns', 'campaigns'], ['entities', 'notes & entries'], ['encounters', 'encounters'],
  ['encounterTokens', 'placements'], ['tokens', 'library tokens'], ['graphLayouts', 'graphs'],
]

const { summary, report, progress, error, busy, open, apply, reset: resetImport } = useLegacyImport()

const legacyDbAvailable = ref(false)
const dragOver = ref(false)
const importAnyway = ref(false)

onMounted(async () => {
  // DM's Tome's database is only reachable when both apps share an origin (the deployed github.io site)
  try { legacyDbAvailable.value = await hasLegacyDb() } catch {}
})

function onDrop(e: DragEvent) {
  dragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) open({ file: f })
}

function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) open({ file: f })
  ;(e.target as HTMLInputElement).value = ''
}

function reset() {
  resetImport()
  importAnyway.value = false
}

// ── Progress ───────────────────────────────────────────────────────────────
const PHASE_LABEL = { read: 'Reading DM\'s Tome data', lore: 'Importing campaigns', images: 'Storing maps' } as const
const PHASE_PCT = { read: 20, lore: 60, images: 90 } as const

const progressPct = computed(() => (progress.value ? PHASE_PCT[progress.value.phase] : 3))
const progressLabel = computed(() => {
  const p = progress.value
  if (!p) return busy.value === 'open' ? 'Starting…' : 'Importing…'
  return `${PHASE_LABEL[p.phase]}…`
})

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
.leg-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text2); cursor: pointer; }
.leg-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.leg-report { border: 1px solid var(--border-hi); border-radius: 8px; padding: 12px 14px; }
.leg-block { font-size: 12.5px; color: var(--text2); }
.leg-block summary { cursor: pointer; color: var(--text); font-weight: 600; }
.leg-block ul { margin: 4px 0 0; padding-left: 18px; max-height: 260px; overflow-y: auto; }
@media (max-width: 640px) {
  .leg-body { padding: 14px 16px 32px; }
}
</style>
