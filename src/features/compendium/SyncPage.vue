<script setup lang="ts">
/**
 * Foundry sync: drop a release's json-assets.zip, choose packs, and the
 * compendium is filled or brought up to date. Your edits, notes, favourites
 * and art stay; entries that left a pack are marked, never deleted.
 */
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { LibraryBig } from 'lucide-vue-next'
import type { PackGroup } from '@/domain/foundry/packs'
import { GAME_CONFIG, GAME_IDS, type GameId } from '@/domain/game'
import { foundryStats, syncStates, type SyncState } from '@/data/rules'
import { compareVersions, fetchLatestRelease, FoundrySyncClient, RELEASES_PAGE, type LatestRelease } from '@/services/foundry/client'
import type { ReleaseInfo, SyncProgress, SyncReport } from '@/services/foundry/sync'
import { takePendingImport } from '@/ui/pendingImport'
import { rulesRevision } from '@/ui/rulesLive'
import CompendiumTabs from './CompendiumTabs.vue'

const router = useRouter()
const GROUPS: { key: PackGroup; label: string; hint: string }[] = [
  { key: 'core', label: 'Rules', hint: 'equipment, spells, feats, conditions, actions, character options' },
  { key: 'bestiary', label: 'Bestiaries', hint: 'Monster Core, NPC Core, Bestiaries' },
  { key: 'adventure', label: 'Adventures', hint: 'adventure-path and Society bestiaries: pick the ones you run' },
]
const ISSUE_LABEL: Record<string, string> = {
  'damage-formula': 'Level-dependent damage kept as text', 'damage-dynamic-type': 'Damage types chosen at play time',
  'spell-unplaced': 'Spells outside a casting entry', 'uuid-unresolved': 'Links to content outside the synced packs',
  'localize-missing': 'Missing translation keys', 'enricher-unknown': 'Unknown Foundry markup', 'convert-failed': 'Entries that failed to convert',
}
const PHASE = { lang: 'Reading language files', index: 'Indexing', convert: 'Converting', finish: 'Finishing up' } as const

const client = new FoundrySyncClient()
onUnmounted(() => client.release())

const info = shallowRef<ReleaseInfo | null>(null)
const progress = shallowRef<SyncProgress | null>(null)
const report = shallowRef<SyncReport | null>(null)
const error = ref<string | null>(null)
const busy = ref<'inspect' | 'run' | null>(null)
const file = shallowRef<File | null>(null)
const dragOver = ref(false)
const selected = ref<string[]>([])
const force = ref(false)

// ── What is installed, and whether a newer release exists ──────────────────
const states = ref<Partial<Record<GameId, SyncState>>>({})
const entryCounts = ref<Partial<Record<GameId, number>>>({})
const licences = ref<[string, number][]>([])
const latest = ref<Partial<Record<GameId, LatestRelease | string>>>({})

async function loadInstalled() {
  states.value = Object.fromEntries((await syncStates.all()).map(s => [s.game, s]))
  const stats = await foundryStats()
  entryCounts.value = stats.perGame
  licences.value = stats.licences
}
async function checkUpdates() {
  for (const g of GAME_IDS) {
    latest.value = { ...latest.value, [g]: 'Checking GitHub…' }
    try { latest.value = { ...latest.value, [g]: await fetchLatestRelease(g) } }
    catch (err) { latest.value = { ...latest.value, [g]: `Update check failed: ${err instanceof Error ? err.message : String(err)}` } }
  }
}
onMounted(async () => { void checkUpdates(); await loadInstalled(); void useFile(takePendingImport()) })
watch(rulesRevision, loadInstalled)
const upToDate = (g: GameId, l: LatestRelease) => !!states.value[g] && compareVersions(states.value[g].version, l.version) >= 0

// ── Import ─────────────────────────────────────────────────────────────────
async function useFile(f: File | undefined | null) {
  if (!f || busy.value) return
  file.value = f; error.value = null; report.value = null; info.value = null
  busy.value = 'inspect'
  try {
    info.value = await client.inspect(f)
    // Defaults plus every pack synced before, so an adventure bestiary you opted into stays ticked
    const synced = states.value[info.value.game]?.packs ?? {}
    selected.value = info.value.packs.filter(p => p.defaultSelected || p.name in synced).map(p => p.name)
  } catch (err) { error.value = err instanceof Error ? err.message : String(err) } finally { busy.value = null }
}
function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  void useFile(input.files?.[0])
  input.value = ''
}
const packsIn = (group: PackGroup) => info.value?.packs.filter(p => p.group === group) ?? []
function setGroup(group: PackGroup, on: boolean) {
  const names = packsIn(group).map(p => p.name)
  selected.value = on ? [...new Set([...selected.value, ...names])] : selected.value.filter(n => !names.includes(n))
}
const selectedSize = computed(() => info.value?.packs.filter(p => selected.value.includes(p.name)).reduce((s, p) => s + p.size, 0) ?? 0)
const older = computed(() => { const i = info.value, installed = i && states.value[i.game]; return !!i && !!installed && compareVersions(i.version, installed.version) < 0 })

async function start() {
  if (!file.value) return
  error.value = null; progress.value = null
  busy.value = 'run'
  // Ask the browser not to evict a compendium that took minutes to build
  try { await navigator.storage?.persist?.() } catch { /* not supported here */ }
  try { report.value = await client.run(file.value, selected.value, force.value, (p) => { progress.value = p }) }
  catch (err) { error.value = err instanceof Error ? err.message : String(err) } finally { busy.value = null }
}
function again() { file.value = null; info.value = null; report.value = null }

const pct = computed(() => {
  const p = progress.value
  if (!p || p.phase === 'lang') return 2
  const per = 100 / Math.max(1, p.packCount * 2)
  return p.phase === 'index' ? Math.min(50, p.packIndex * per) : p.phase === 'convert' ? Math.min(98, 50 + p.packIndex * per) : 99
})
const progressLabel = computed(() => {
  const p = progress.value
  return p ? `${PHASE[p.phase]}${p.pack ? ` ${p.pack} (${p.packIndex + 1} of ${p.packCount})` : ''}…` : 'Starting…'
})
const issues = computed(() => Object.entries(report.value?.issues ?? {}).sort((a, b) => b[1].count - a[1].count))
const mb = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div class="wrap">
    <CompendiumTabs />
    <div class="page">
      <div class="page-head"><h1>Foundry sync</h1></div>

      <section>
        <h2>Installed</h2>
        <div class="cards">
          <div v-for="g in GAME_IDS" :key="g" class="card panel" :style="{ '--c': GAME_CONFIG[g].color }">
            <div class="card-head"><b>{{ GAME_CONFIG[g].label }}</b><span class="num" :class="{ faint: !states[g] }">{{ states[g]?.version ?? 'not installed' }}</span></div>
            <p v-if="states[g]" class="dim">{{ (entryCounts[g] ?? 0).toLocaleString() }} entries · synced {{ when(states[g].syncedAt) }}</p>
            <p v-if="typeof latest[g] === 'string'" class="faint">{{ latest[g] }}</p>
            <p v-else-if="latest[g]" class="dim">
              Latest release <b>{{ latest[g].version }}</b>
              <span v-if="upToDate(g, latest[g])" class="ok"> · up to date</span>
              <template v-else><span class="warn"> · {{ states[g] ? 'update available' : 'available' }}</span> · <a :href="latest[g].zipUrl" target="_blank" rel="noopener">download json-assets.zip</a></template>
            </p>
          </div>
        </div>
        <p class="dim">Download <code>json-assets.zip</code> for PF2e and/or SF2e from the <a :href="RELEASES_PAGE" target="_blank" rel="noopener">Foundry PF2e releases</a> and drop it below. The file is read in your browser; nothing is uploaded.</p>
      </section>

      <section>
        <h2>Import a release</h2>
        <label class="drop" :class="{ over: dragOver, busy: !!busy }" @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="dragOver = false; useFile($event.dataTransfer?.files?.[0])">
          <input type="file" accept=".zip,application/zip" :disabled="!!busy" data-test="sync-file" @change="onPick" />
          <LibraryBig :size="26" :stroke-width="1.4" />
          <span v-if="busy === 'inspect'">Reading {{ file?.name }}…</span>
          <span v-else-if="file">{{ file.name }} · {{ mb(file.size) }}</span>
          <span v-else>Drop <b>json-assets.zip</b> here, or click to choose it</span>
        </label>
        <p v-if="error" class="error">{{ error }}</p>

        <template v-if="info && !report">
          <p><b>{{ GAME_CONFIG[info.game].label }} {{ info.version }}</b><span class="faint"> · {{ info.packs.filter(p => p.group !== 'skip').length }} packs can be synced</span></p>
          <p v-if="older" class="error">This release is older than the installed {{ states[info.game]?.version }}. Download the latest json-assets.zip instead.</p>
          <div v-for="grp in GROUPS" :key="grp.key" class="group">
            <div class="group-head"><b>{{ grp.label }}</b><span class="faint">{{ grp.hint }}</span><a @click="setGroup(grp.key, true)">all</a><a @click="setGroup(grp.key, false)">none</a></div>
            <div class="packs">
              <label v-for="p in packsIn(grp.key)" :key="p.name" class="pack"><input v-model="selected" type="checkbox" :value="p.name" /><span>{{ p.label }}</span><span class="faint num">{{ mb(p.size) }}</span></label>
            </div>
          </div>
          <div class="actions">
            <label class="dim"><input v-model="force" type="checkbox" /> Re-convert packs that did not change</label>
            <button class="btn btn-primary" :disabled="!selected.length || !!busy || older" data-test="sync-run" @click="start">Sync {{ selected.length }} pack{{ selected.length === 1 ? '' : 's' }} ({{ mb(selectedSize) }})</button>
          </div>
        </template>

        <div v-if="busy === 'run'" class="progress"><div class="bar"><div :style="{ width: `${pct}%` }" /></div><span class="dim">{{ progressLabel }}</span></div>

        <div v-if="report" class="report" data-test="sync-report">
          <h3>{{ GAME_CONFIG[report.game].label }} {{ report.version }} synced in {{ (report.durationMs / 1000).toFixed(1) }} s</h3>
          <div class="stats">
            <div><b class="num">{{ report.created.toLocaleString() }}</b><span>new</span></div>
            <div><b class="num">{{ report.updated.toLocaleString() }}</b><span>updated</span></div>
            <div><b class="num">{{ report.unchanged.toLocaleString() }}</b><span>unchanged</span></div>
            <div><b class="num">{{ report.removed.toLocaleString() }}</b><span>removed upstream</span></div>
            <div><b class="num">{{ report.superseded.toLocaleString() }}</b><span>legacy, hidden</span></div>
            <div><b class="num">{{ report.packs.filter(p => p.skipped).length }}</b><span>packs unchanged</span></div>
          </div>
          <div v-if="report.conflicts.length">
            <h4>Your edits against upstream changes ({{ report.conflicts.length }})</h4>
            <p class="dim">Foundry changed fields you had edited. Your values are kept; open an entry and use Reset to take Foundry's.</p>
            <ul><li v-for="c in report.conflicts" :key="c.id"><RouterLink :to="{ name: 'compendium', query: { kind: c.kind, id: c.id } }">{{ c.name }}</RouterLink><span class="faint"> · {{ c.paths.join(', ') }}</span></li></ul>
          </div>
          <details v-if="issues.length">
            <summary>Conversion notes ({{ issues.reduce((s, [, i]) => s + i.count, 0).toLocaleString() }})</summary>
            <p class="dim">Text that could not be converted exactly. It stays readable; nothing was dropped.</p>
            <ul><li v-for="[code, iss] in issues" :key="code"><b>{{ ISSUE_LABEL[code] ?? code }}</b>: {{ iss.count.toLocaleString() }}<span class="faint"> · e.g. {{ iss.examples[0] }}</span></li></ul>
          </details>
          <div class="actions"><button class="btn btn-primary" @click="router.push({ name: 'compendium' })">Open the compendium</button><button class="btn" @click="again">Import another release</button></div>
        </div>
      </section>

      <section>
        <h2>Licences and attribution</h2>
        <p class="dim">Compendium content is imported from the <a href="https://github.com/foundryvtt/pf2e" target="_blank" rel="noopener">Foundry VTT PF2e/SF2e system</a> (code under the Apache License 2.0). The game content is Paizo material published under the <b>ORC License</b> (remastered rules) or the <b>Open Game License 1.0a</b> (legacy rules); each entry records which applies. It is stored only in this browser and is not part of StarTome's code.</p>
        <p v-if="licences.length" class="faint">In your compendium: <template v-for="([lic, n], i) in licences" :key="lic">{{ i ? ', ' : '' }}{{ n.toLocaleString() }} {{ lic }}</template>.</p>
        <p class="faint">StarTome is unofficial and not affiliated with Paizo Inc. Pathfinder and Starfinder are trademarks of Paizo Inc. Licence texts: <a href="https://github.com/foundryvtt/pf2e/tree/v14-dev/static/licenses" target="_blank" rel="noopener">ORC and OGL</a>.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.wrap { height: 100%; display: flex; flex-direction: column; }
.page { flex: 1; max-width: 980px; }
section { margin-bottom: 2rem; display: flex; flex-direction: column; gap: .6rem; }
section p { margin: 0; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; }
.card { padding: .7rem .9rem; border-left: 3px solid var(--c); display: flex; flex-direction: column; gap: .25rem; }
.card-head { display: flex; justify-content: space-between; }
.ok { color: var(--ok); } .warn { color: var(--warn); } .error { color: var(--danger); }
.drop { display: flex; flex-direction: column; align-items: center; gap: .5rem; padding: 1.6rem; border: 1px dashed var(--line-strong); border-radius: var(--radius); color: var(--text-dim); cursor: pointer; }
.drop.over { border-color: var(--accent); background: var(--accent-soft); }
.drop.busy { opacity: .6; cursor: default; }
.drop input { display: none; }
.group-head { display: flex; gap: .7rem; align-items: baseline; margin-bottom: .3rem; }
.group-head a { cursor: pointer; font-size: .85rem; }
.packs { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: .1rem .8rem; }
.pack { display: grid; grid-template-columns: auto 1fr auto; gap: .4rem; align-items: center; font-size: .92rem; }
.actions { display: flex; align-items: center; gap: .8rem; justify-content: flex-end; }
.progress { display: flex; flex-direction: column; gap: .3rem; }
.bar { height: 6px; background: var(--bg-sunken); border: var(--frame); }
.bar div { height: 100%; background: var(--accent); transition: width var(--speed) var(--ease); }
.report { display: flex; flex-direction: column; gap: .7rem; padding: 1rem; border: var(--frame); border-radius: var(--radius); background: var(--bg-raised); }
.stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: .5rem; }
.stats div { display: flex; flex-direction: column; }
.stats b { font-size: 1.3rem; }
.stats span { font-size: .78rem; color: var(--text-faint); }
ul { margin: 0; padding-left: 1.2rem; }
</style>
