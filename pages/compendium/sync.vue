<template>
  <div class="syn-page">
    <div class="sys-subnav">
      <div class="sys-breadcrumb">
        <span class="sys-breadcrumb-link">Compendium</span>
        <span class="sys-breadcrumb-sep">›</span>
        <span class="sys-breadcrumb-cur">Foundry sync</span>
      </div>
    </div>

    <div class="syn-body">
      <!-- ── Installed ─────────────────────────────────────────── -->
      <section class="syn-section">
        <h2 class="syn-h">Installed compendium</h2>
        <div class="syn-cards">
          <div v-for="g in GAME_IDS" :key="g" class="syn-card" :style="{ '--game-color': GAME_CONFIG[g].color }">
            <div class="syn-card-head">
              <span class="syn-card-game">{{ GAME_CONFIG[g].label }}</span>
              <span v-if="states[g]" class="syn-card-version">{{ states[g]!.version }}</span>
              <span v-else class="syn-card-version syn-muted">not installed</span>
            </div>
            <p v-if="states[g]" class="syn-card-line">
              {{ entryCounts[g]?.toLocaleString() ?? '…' }} entries · synced {{ formatDate(states[g]!.syncedAt) }}
            </p>
            <p class="syn-card-line">
              <template v-if="latest[g] === 'loading'"><span class="syn-muted">Checking GitHub…</span></template>
              <template v-else-if="typeof latest[g] === 'string'"><span class="syn-muted">Update check failed: {{ latest[g] }}</span></template>
              <template v-else-if="latest[g]">
                Latest release <b>{{ (latest[g] as LatestRelease).version }}</b>
                <span v-if="states[g] && compareVersions(states[g]!.version, (latest[g] as LatestRelease).version) >= 0" class="syn-ok"> · up to date</span>
                <template v-else>
                  <span class="syn-warn"> · {{ states[g] ? 'update available' : 'available' }}</span>
                  — <a :href="(latest[g] as LatestRelease).zipUrl" target="_blank" rel="noopener">download json-assets.zip</a>
                </template>
              </template>
            </p>
          </div>
        </div>
        <p class="syn-hint">
          Download <code>json-assets.zip</code> for PF2e and/or SF2e from the
          <a :href="RELEASES_PAGE" target="_blank" rel="noopener">Foundry PF2e releases</a>
          and drop it below. The file is read in your browser; nothing is uploaded.
        </p>
      </section>

      <!-- ── Import ────────────────────────────────────────────── -->
      <section class="syn-section">
        <h2 class="syn-h">Import a release</h2>
        <label
          class="syn-drop" :class="{ 'syn-drop--over': dragOver, 'syn-drop--busy': !!busy }"
          @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop"
        >
          <input type="file" accept=".zip,application/zip" class="syn-file" :disabled="!!busy" @change="onPick" />
          <OhVueIcon name="gi-bookshelf" scale="1.6" />
          <span v-if="busy === 'inspect'">Reading {{ file?.name }}…</span>
          <span v-else-if="file">{{ file.name }} · {{ mb(file.size) }}</span>
          <span v-else>Drop <b>json-assets.zip</b> here, or click to choose it</span>
        </label>

        <p v-if="error" class="syn-error">{{ error }}</p>

        <template v-if="info && !report">
          <div class="syn-release">
            <b>{{ GAME_CONFIG[info.game].label }} {{ info.version }}</b>
            <span class="syn-muted"> · {{ info.packs.filter(p => p.group !== 'skip').length }} syncable packs</span>
            <p v-if="olderThanInstalled" class="syn-error">
              This release is older than the installed {{ states[info.game]!.version }}. Download the latest json-assets.zip instead.
            </p>
          </div>

          <div v-for="grp in GROUPS" :key="grp.key" class="syn-group">
            <div class="syn-group-head">
              <span class="syn-group-title">{{ grp.label }}</span>
              <span class="syn-muted">{{ grp.hint }}</span>
              <button class="syn-link" @click="setGroup(grp.key, true)">all</button>
              <button class="syn-link" @click="setGroup(grp.key, false)">none</button>
            </div>
            <div class="syn-packs">
              <label v-for="p in packsIn(grp.key)" :key="p.name" class="syn-pack">
                <input v-model="selected" type="checkbox" :value="p.name" />
                <span class="syn-pack-name">{{ p.label }}</span>
                <span class="syn-muted syn-pack-size">{{ mb(p.size) }}</span>
              </label>
            </div>
          </div>

          <div class="syn-actions">
            <label class="syn-check"><input v-model="force" type="checkbox" /> Re-convert packs that did not change</label>
            <button class="btn btn-accent" :disabled="!selected.length || !!busy || olderThanInstalled" @click="start">
              Sync {{ selected.length }} pack{{ selected.length === 1 ? '' : 's' }} ({{ mb(selectedSize) }})
            </button>
          </div>
        </template>

        <div v-if="busy === 'run'" class="syn-progress">
          <div class="syn-bar"><div class="syn-bar-fill" :style="{ width: `${progressPct}%` }" /></div>
          <span>{{ progressLabel }}</span>
        </div>

        <!-- ── Report ─────────────────────────────────────────── -->
        <div v-if="report" class="syn-report">
          <h3 class="syn-h3">{{ GAME_CONFIG[report.game].label }} {{ report.version }} synced in {{ (report.durationMs / 1000).toFixed(1) }} s</h3>
          <div class="syn-stats">
            <div><b>{{ report.created.toLocaleString() }}</b><span>new</span></div>
            <div><b>{{ report.updated.toLocaleString() }}</b><span>updated</span></div>
            <div><b>{{ report.unchanged.toLocaleString() }}</b><span>unchanged</span></div>
            <div><b>{{ report.removed.toLocaleString() }}</b><span>removed upstream</span></div>
            <div><b>{{ report.superseded.toLocaleString() }}</b><span>legacy, hidden</span></div>
            <div><b>{{ report.packs.filter(p => p.skipped).length }}</b><span>packs unchanged</span></div>
          </div>

          <div v-if="report.conflicts.length" class="syn-block">
            <h4>Your edits vs. upstream changes ({{ report.conflicts.length }})</h4>
            <p class="syn-muted">Foundry changed fields you had edited. Your values are kept; open an entry and use "Reset edits" to take Foundry's.</p>
            <ul>
              <li v-for="c in report.conflicts" :key="c.id">
                <NuxtLink :to="`/compendium/${RULES_KIND_CONFIG[c.kind].segment}?id=${c.id}`">{{ c.name }}</NuxtLink>
                <span class="syn-muted"> — {{ c.paths.join(', ') }}</span>
              </li>
            </ul>
          </div>

          <details v-if="issueEntries.length" class="syn-block">
            <summary>Conversion notes ({{ issueTotal.toLocaleString() }})</summary>
            <p class="syn-muted">Text that could not be converted exactly. It stays readable; nothing was dropped.</p>
            <ul>
              <li v-for="[code, iss] in issueEntries" :key="code">
                <b>{{ ISSUE_LABEL[code] ?? code }}</b>: {{ iss.count.toLocaleString() }}
                <span class="syn-muted"> — e.g. {{ iss.examples[0] }}</span>
              </li>
            </ul>
          </details>

          <div class="syn-actions">
            <NuxtLink class="btn btn-accent" to="/compendium/creatures">Open the compendium</NuxtLink>
            <button class="btn btn-ghost" @click="resetImport">Import another release</button>
          </div>
        </div>
      </section>

      <!-- ── Licenses ──────────────────────────────────────────── -->
      <section class="syn-section">
        <h2 class="syn-h">Licenses &amp; attribution</h2>
        <p class="syn-text">
          Compendium content is imported from the
          <a href="https://github.com/foundryvtt/pf2e" target="_blank" rel="noopener">Foundry VTT PF2e/SF2e system</a>
          (code under the Apache License 2.0). The game content is Paizo material published under the
          <b>ORC License</b> (remastered rules) or the <b>Open Game License 1.0a</b> (legacy rules); each entry records which applies.
          It is stored only in this browser and is not part of StarTome's code.
        </p>
        <p v-if="licenseCounts.length" class="syn-text syn-muted">
          In your compendium: <template v-for="([lic, n], i) in licenseCounts" :key="lic">{{ i ? ', ' : '' }}{{ n.toLocaleString() }} {{ lic }}</template>.
        </p>
        <p class="syn-text syn-muted">
          StarTome is unofficial and not affiliated with Paizo Inc. Pathfinder and Starfinder are trademarks of Paizo Inc.
          License texts: <a href="https://github.com/foundryvtt/pf2e/tree/v14-dev/static/licenses" target="_blank" rel="noopener">ORC and OGL</a>.
        </p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getDb, type DbSyncState } from '~/composables/useDb'
import {
  compareVersions, fetchLatestRelease, loadSyncStates, RELEASES_PAGE, useFoundrySync, type LatestRelease,
} from '~/composables/useFoundrySync'
import { useRulesRevision } from '~/composables/useRules'
import type { PackGroup } from '~/converters/foundry/packs'
import { GAME_CONFIG, GAME_IDS, type GameId } from '~/types/game'
import { RULES_KIND_CONFIG } from '~/types/rules'

useHead({ title: 'Foundry sync — StarTome' })

const GROUPS: { key: PackGroup; label: string; hint: string }[] = [
  { key: 'core', label: 'Rules', hint: 'equipment, spells, feats, conditions, actions, character options' },
  { key: 'bestiary', label: 'Bestiaries', hint: 'Monster Core, NPC Core, Bestiaries' },
  { key: 'adventure', label: 'Adventures', hint: 'adventure-path and Society bestiaries — pick the ones you run' },
]

const ISSUE_LABEL: Record<string, string> = {
  'damage-formula': 'Level-dependent damage kept as text',
  'damage-dynamic-type': 'Damage types chosen at play time',
  'spell-unplaced': 'Spells outside a casting entry',
  'uuid-unresolved': 'Links to content outside the synced packs',
  'localize-missing': 'Missing translation keys',
  'enricher-unknown': 'Unknown Foundry markup',
  'convert-failed': 'Entries that failed to convert',
}

const { info, progress, report, error, busy, inspect, run } = useFoundrySync()
const revision = useRulesRevision()

const file = shallowRef<File | null>(null)
const dragOver = ref(false)
const selected = ref<string[]>([])
const force = ref(false)

// ── Installed state & update check ─────────────────────────────────────────
const states = ref<Partial<Record<GameId, DbSyncState>>>({})
const entryCounts = ref<Partial<Record<GameId, number>>>({})
const licenseCounts = ref<[string, number][]>([])
const latest = ref<Partial<Record<GameId, LatestRelease | string | 'loading'>>>({})

async function loadInstalled() {
  states.value = await loadSyncStates()
  const counts: Partial<Record<GameId, number>> = {}
  const lic = new Map<string, number>()
  await getDb().rules.where('origin').equals('foundry').each(r => {
    if (r.game === 'pf2e' || r.game === 'sf2e') counts[r.game] = (counts[r.game] ?? 0) + 1
    const l = r.publication?.license
    if (l) lic.set(l, (lic.get(l) ?? 0) + 1)
  })
  entryCounts.value = counts
  licenseCounts.value = [...lic.entries()].sort((a, b) => b[1] - a[1])
}

async function checkUpdates() {
  for (const g of GAME_IDS) {
    latest.value = { ...latest.value, [g]: 'loading' }
    try {
      latest.value = { ...latest.value, [g]: await fetchLatestRelease(g) }
    } catch (e) {
      latest.value = { ...latest.value, [g]: (e as Error).message }
    }
  }
}

onMounted(() => { loadInstalled(); checkUpdates() })
watch(revision, loadInstalled)

// ── Import ─────────────────────────────────────────────────────────────────
async function useFile(f: File | undefined | null) {
  if (!f || busy.value) return
  file.value = f
  await inspect(f)
  selected.value = info.value?.packs.filter(p => p.defaultSelected).map(p => p.name) ?? []
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  useFile(e.dataTransfer?.files?.[0])
}

function onPick(e: Event) {
  useFile((e.target as HTMLInputElement).files?.[0])
  ;(e.target as HTMLInputElement).value = ''
}

function packsIn(group: PackGroup) {
  return info.value?.packs.filter(p => p.group === group) ?? []
}

function setGroup(group: PackGroup, on: boolean) {
  const names = packsIn(group).map(p => p.name)
  selected.value = on ? [...new Set([...selected.value, ...names])] : selected.value.filter(n => !names.includes(n))
}

const selectedSize = computed(() => info.value?.packs.filter(p => selected.value.includes(p.name)).reduce((s, p) => s + p.size, 0) ?? 0)

const olderThanInstalled = computed(() => {
  const i = info.value
  const installed = i && states.value[i.game]
  return !!installed && compareVersions(i.version, installed.version) < 0
})

async function start() {
  if (!file.value) return
  await run(file.value, selected.value, force.value)
}

function resetImport() {
  file.value = null
  info.value = null
  report.value = null
}

// ── Progress ───────────────────────────────────────────────────────────────
const PHASE_LABEL = { lang: 'Reading language files', index: 'Indexing', convert: 'Converting', finish: 'Finishing up' } as const

const progressPct = computed(() => {
  const p = progress.value
  if (!p) return 2
  const per = 100 / Math.max(1, p.packCount * 2)
  if (p.phase === 'lang') return 2
  if (p.phase === 'index') return Math.min(50, p.packIndex * per)
  if (p.phase === 'convert') return Math.min(98, 50 + p.packIndex * per)
  return 99
})

const progressLabel = computed(() => {
  const p = progress.value
  if (!p) return 'Starting…'
  const pack = p.pack ? ` ${p.pack} (${p.packIndex + 1} of ${p.packCount})` : ''
  return `${PHASE_LABEL[p.phase]}${pack}…`
})

const issueEntries = computed(() => Object.entries(report.value?.issues ?? {}).sort((a, b) => b[1].count - a[1].count))
const issueTotal = computed(() => issueEntries.value.reduce((s, [, i]) => s + i.count, 0))

function mb(bytes: number) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<style scoped>
.syn-page { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.syn-body { flex: 1; overflow-y: auto; padding: 18px 24px 40px; display: flex; flex-direction: column; gap: 22px; max-width: 920px; }
.syn-section { display: flex; flex-direction: column; gap: 10px; }
.syn-h { font-family: var(--fh); font-size: 15px; margin: 0; color: var(--text); letter-spacing: 0.04em; }
.syn-h3 { font-family: var(--fh); font-size: 14px; margin: 0 0 8px; color: var(--text); }
.syn-muted { color: var(--text3); }
.syn-ok { color: #7cc44e; }
.syn-warn { color: #e8c44a; }
.syn-error { color: #e87a7a; font-size: 13px; margin: 0; }
.syn-hint, .syn-text { font-size: 13px; color: var(--text2); margin: 0; line-height: 1.6; }
.syn-hint code { font-family: var(--fm); font-size: 12px; }
.syn-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.syn-card { border: 1px solid var(--border-hi); border-left: 3px solid var(--game-color); border-radius: 8px; padding: 10px 12px; background: var(--surface); }
.syn-card-head { display: flex; align-items: baseline; gap: 8px; }
.syn-card-game { font-weight: 600; color: var(--text); flex: 1; }
.syn-card-version { font-family: var(--fm); font-size: 12px; color: var(--game-color); }
.syn-card-line { font-size: 12px; color: var(--text2); margin: 4px 0 0; }
.syn-drop {
  position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  border: 2px dashed var(--border-hi); border-radius: 10px; padding: 26px; color: var(--text2); font-size: 13px; cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.syn-drop:hover, .syn-drop--over { border-color: var(--accent); background: var(--surface); }
.syn-drop--busy { opacity: 0.7; cursor: progress; }
.syn-file { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.syn-release { font-size: 13px; color: var(--text); }
.syn-group { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
.syn-group-head { display: flex; align-items: baseline; gap: 8px; font-size: 12px; margin-bottom: 6px; flex-wrap: wrap; }
.syn-group-title { font-weight: 600; color: var(--text); }
.syn-link { background: none; border: none; color: var(--accent-l, var(--accent)); cursor: pointer; font-size: 12px; padding: 0 2px; }
.syn-packs { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 2px 14px; }
.syn-pack { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text2); cursor: pointer; min-width: 0; }
.syn-pack-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.syn-pack-size { font-family: var(--fm); font-size: 11px; }
.syn-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.syn-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text2); cursor: pointer; }
.syn-progress { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--text2); }
.syn-bar { height: 8px; border-radius: 4px; background: var(--surface-hi); overflow: hidden; }
.syn-bar-fill { height: 100%; background: var(--accent); transition: width 0.3s; }
.syn-report { border: 1px solid var(--border-hi); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.syn-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.syn-stats div { display: flex; flex-direction: column; background: var(--surface); border-radius: 6px; padding: 6px 10px; }
.syn-stats b { font-family: var(--fm); font-size: 17px; color: var(--text); }
.syn-stats span { font-size: 11px; color: var(--text3); }
.syn-block { font-size: 12.5px; color: var(--text2); }
.syn-block h4 { margin: 0 0 4px; font-size: 13px; color: var(--text); }
.syn-block p { margin: 0 0 4px; }
.syn-block ul { margin: 4px 0 0; padding-left: 18px; }
.syn-block summary { cursor: pointer; color: var(--text); font-weight: 600; }
.syn-section a { color: var(--accent-l, var(--accent)); }
</style>
