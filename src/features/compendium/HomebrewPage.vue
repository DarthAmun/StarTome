<script setup lang="ts">
/**
 * Homebrew: bring in entries from a JSON file (yours, or one Claude wrote from
 * the format guide) and manage the packs your own entries are grouped in.
 * Every entry is checked first; small slips are fixed and listed.
 */
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { FlaskConical } from 'lucide-vue-next'
import { GAME_CONFIG, type GameId } from '@/domain/game'
import { issuesReport, readHomebrewText, type HomebrewRow, type HomebrewStatus } from '@/domain/rules/homebrew'
import { summarizePacks, type PackSummary } from '@/domain/rules/packs'
import { RULES_KIND_CONFIG, type RulesEntity } from '@/domain/rules/types'
import { workspace } from '@/data/repo'
import { rulesUserEntries } from '@/data/rules'
import { applyHomebrew, deletePack, exportPacks, planHomebrew, renamePack } from '@/services/homebrew'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import { takePendingImport } from '@/ui/pendingImport'
import { rulesRevision } from '@/ui/rulesLive'
import CompendiumTabs from './CompendiumTabs.vue'
import guideText from '../../../HOMEBREW_FORMAT.md?raw'

const GAMES: [GameId | 'both', string][] = [['sf2e', GAME_CONFIG.sf2e.short], ['pf2e', GAME_CONFIG.pf2e.short], ['both', 'Both']]
const STATUS: Record<HomebrewStatus, string> = { new: 'New', update: 'Update', error: 'Can’t import' }

const game = ref<GameId | 'both'>('sf2e')
const pack = ref('')
const packs = shallowRef<PackSummary[]>([])
const pasted = ref('')
const dragOver = ref(false)
const error = ref('')
const source = ref('')
const raw = shallowRef<unknown[] | null>(null)
const rows = shallowRef<HomebrewRow[] | null>(null)
const picked = ref<number[]>([])
const open = ref(new Set<number>())
const busy = ref(false)
const copied = ref(false)
const report = shallowRef<RulesEntity[] | null>(null)

onMounted(async () => { game.value = await workspace.get<GameId | 'both'>('', 'homebrew.game', 'sf2e'); void readFile(takePendingImport()) })
watch(rulesRevision, async () => { packs.value = summarizePacks(await rulesUserEntries()) }, { immediate: true })
function setGame(g: GameId | 'both') { game.value = g; void workspace.set('', 'homebrew.game', g); if (raw.value) void check() }

const warnCount = (r: HomebrewRow) => r.issues.filter(i => i.level === 'warning').length
const counts = computed(() => {
  const list = rows.value ?? []
  return { new: list.filter(r => r.status === 'new').length, update: list.filter(r => r.status === 'update').length, error: list.filter(r => r.status === 'error').length, warned: list.filter(r => r.status !== 'error' && warnCount(r)).length }
})
const importable = computed(() => (rows.value ?? []).filter(r => r.status !== 'error').map(r => r.index))
const allPicked = computed(() => importable.value.length > 0 && picked.value.length === importable.value.length)
function toggle(i: number) { const next = new Set(open.value); if (!next.delete(i)) next.add(i); open.value = next }

function load(text: string, label: string) {
  error.value = ''
  const read = readHomebrewText(text)
  if ('error' in read) { error.value = read.error; return }
  if (!read.entries.length) { error.value = 'The file has no entries.'; return }
  raw.value = read.entries; source.value = label
  void check()
}
async function check() {
  if (!raw.value) return
  try {
    const planned = await planHomebrew(raw.value, game.value, pack.value)
    rows.value = planned
    picked.value = planned.filter(r => r.status !== 'error').map(r => r.index)
    // Errors open by themselves; fixes stay one click away
    open.value = new Set(planned.filter(r => r.status === 'error').map(r => r.index))
  } catch (err) { reportError('Checking the file', err) }
}
async function readFile(f: File | undefined | null) {
  if (!f) return
  try { load(await f.text(), f.name) } catch (err) { error.value = `Couldn't read ${f.name}: ${err instanceof Error ? err.message : String(err)}` }
}
function onPick(e: Event) { const input = e.target as HTMLInputElement; void readFile(input.files?.[0]); input.value = '' }

async function apply() {
  if (!rows.value) return
  busy.value = true
  try { report.value = await applyHomebrew(rows.value, new Set(picked.value)) }
  catch (err) { error.value = `Import failed, nothing was changed: ${err instanceof Error ? err.message : String(err)}` } finally { busy.value = false }
}
async function copyReport() {
  if (!rows.value) return
  await navigator.clipboard.writeText(issuesReport(rows.value))
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
function reset() { raw.value = null; rows.value = null; report.value = null; picked.value = []; open.value = new Set(); pasted.value = ''; error.value = '' }

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
const downloadGuide = () => download(new Blob([guideText], { type: 'text/markdown' }), 'HOMEBREW_FORMAT.md')

// ── Packs ──────────────────────────────────────────────────────────────────
const chosen = ref<string[]>([])
const renaming = ref<string | null>(null)
const newName = ref('')
async function exportChosen() {
  try { const f = await exportPacks(chosen.value, __APP_VERSION__); download(f.blob, f.name); notify(`Exported ${f.count} entries.`, 'ok') } catch (err) { reportError('Exporting the packs', err) }
}
async function rename(title: string) {
  renaming.value = null
  if (newName.value.trim() === title) return
  try { notify(`Moved ${await renamePack(title, newName.value)} entries to “${newName.value.trim() || 'no pack'}”.`, 'ok') } catch (err) { reportError('Renaming the pack', err) }
}
async function remove(p: PackSummary) {
  if (!await confirmDialog({ title: `Delete ${p.title ? `“${p.title}”` : 'the entries in no pack'}?`, body: `${p.count} homebrew ${p.count === 1 ? 'entry is' : 'entries are'} removed from the compendium. Export the pack first if you want to keep a copy.`, confirmLabel: 'Delete', danger: true })) return
  try { notify(`Deleted ${await deletePack(p.title)} entries.`, 'ok'); chosen.value = chosen.value.filter(t => t !== p.title) } catch (err) { reportError('Deleting the pack', err) }
}
</script>

<template>
  <div class="wrap">
    <CompendiumTabs />
    <div class="page">
      <div class="page-head"><h1>Homebrew</h1></div>

      <section v-if="!report">
        <h2>Import</h2>
        <p class="dim">Adds compendium entries from a JSON file: one you wrote, or one Claude wrote from the <a @click="downloadGuide">format guide</a>. Every entry is checked first: small slips are fixed and listed, entries that can't be read are left out. Importing an entry again (same id) updates it and keeps its portrait.</p>
        <div class="choose">
          <span class="faint">Entries without a game are for</span>
          <span class="seg"><button v-for="[g, label] in GAMES" :key="g" :class="{ on: game === g }" @click="setGame(g)">{{ label }}</button></span>
          <span class="faint">and go into the pack</span>
          <input v-model.lazy="pack" class="input pack-input" list="hb-packs" placeholder="none" title="Entries that name their own pack keep it" @change="check" />
          <datalist id="hb-packs"><option v-for="p in packs.filter(x => x.title)" :key="p.title" :value="p.title" /></datalist>
        </div>
        <div v-if="!rows" class="sources">
          <label class="drop" :class="{ over: dragOver }" @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="dragOver = false; readFile($event.dataTransfer?.files?.[0])">
            <input type="file" accept=".json,application/json,text/plain" data-test="homebrew-file" @change="onPick" />
            <FlaskConical :size="24" :stroke-width="1.4" /><b>Drop a homebrew file</b><span class="faint">.json: a StarTome export, a list of entries, or one entry</span>
          </label>
          <div class="paste">
            <textarea v-model="pasted" class="input" placeholder="…or paste JSON here (a ```json block from a chat works too)" spellcheck="false" data-test="homebrew-paste" />
            <button class="btn" :disabled="!pasted.trim()" @click="load(pasted, 'Pasted text')">Check</button>
          </div>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
      </section>

      <section v-if="rows && !report">
        <h2>{{ source }}</h2>
        <div class="stats">
          <div><b class="num">{{ counts.new }}</b><span>new</span></div><div><b class="num">{{ counts.update }}</b><span>updates</span></div>
          <div :class="{ warn: counts.warned }"><b class="num">{{ counts.warned }}</b><span>with fixes</span></div><div :class="{ err: counts.error }"><b class="num">{{ counts.error }}</b><span>can't import</span></div>
        </div>
        <table>
          <thead><tr><th><input type="checkbox" :checked="allPicked" title="All" @change="picked = ($event.target as HTMLInputElement).checked ? [...importable] : []" /></th><th>Entry</th><th>Kind</th><th>Level</th><th>Game</th><th>Status</th></tr></thead>
          <tbody>
            <template v-for="r in rows" :key="r.index">
              <tr :class="{ bad: r.status === 'error' }">
                <td><input v-model="picked" type="checkbox" :value="r.index" :disabled="r.status === 'error'" /></td>
                <td><a v-if="r.issues.length" @click="toggle(r.index)">{{ open.has(r.index) ? '▾' : '▸' }} {{ r.name }}</a><template v-else>{{ r.name }}</template></td>
                <td>{{ r.kind ? RULES_KIND_CONFIG[r.kind].label : '—' }}</td><td class="num">{{ r.entry ? r.entry.level : '—' }}</td>
                <td>{{ r.entry ? (r.entry.game === 'both' ? 'Both' : GAME_CONFIG[r.entry.game].short) : '—' }}</td>
                <td><span class="chip" :class="r.status">{{ STATUS[r.status] }}</span> <span v-if="r.status !== 'error' && warnCount(r)" class="chip fix">{{ warnCount(r) }} fixed</span></td>
              </tr>
              <tr v-if="open.has(r.index)"><td /><td colspan="5"><ul class="issues"><li v-for="(iss, i) in r.issues" :key="i" :class="iss.level"><code v-if="iss.path">{{ iss.path }}</code> {{ iss.message }}</li></ul></td></tr>
            </template>
          </tbody>
        </table>
        <div class="actions">
          <button class="btn btn-primary" :disabled="!picked.length || busy" data-test="homebrew-apply" @click="apply">Import {{ picked.length }} {{ picked.length === 1 ? 'entry' : 'entries' }}</button>
          <button v-if="counts.warned || counts.error" class="btn" title="Copy every problem as text to send back to whoever wrote the file" @click="copyReport">{{ copied ? 'Copied' : 'Copy problems for Claude' }}</button>
          <button class="btn" :disabled="busy" @click="reset">Cancel</button>
        </div>
      </section>

      <section v-if="report">
        <h2>Imported {{ report.length }} {{ report.length === 1 ? 'entry' : 'entries' }}</h2>
        <ul><li v-for="e in report" :key="e.id"><RouterLink :to="{ name: 'compendium', query: { kind: e.kind, id: e.id } }">{{ e.name }}</RouterLink><span class="faint"> · {{ RULES_KIND_CONFIG[e.kind].label }} {{ e.level }}</span></li></ul>
        <div class="actions"><button class="btn" @click="reset">Import another</button></div>
      </section>

      <section>
        <h2>Your packs</h2>
        <p v-if="!packs.length" class="faint">No homebrew yet. Entries you create or import appear here, grouped by pack.</p>
        <div v-for="p in packs" :key="p.title" class="pack-row">
          <input v-model="chosen" type="checkbox" :value="p.title" :aria-label="`Choose ${p.title || 'no pack'}`" />
          <template v-if="renaming === p.title"><input v-model="newName" class="input" @keydown.enter="rename(p.title)" /><button class="btn" @click="rename(p.title)">Save</button><button class="btn btn-ghost" @click="renaming = null">Cancel</button></template>
          <template v-else>
            <RouterLink class="grow" :to="{ name: 'compendium' }">{{ p.title || 'No pack' }}</RouterLink><span class="num faint">{{ p.count }} entries</span>
            <button class="btn" @click="renaming = p.title; newName = p.title">Rename</button><button class="btn btn-danger" @click="remove(p)">Delete</button>
          </template>
        </div>
        <div v-if="packs.length" class="actions"><button class="btn" :disabled="!chosen.length" @click="exportChosen">Export {{ chosen.length || '' }} selected pack{{ chosen.length === 1 ? '' : 's' }}</button></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.wrap { height: 100%; display: flex; flex-direction: column; }
.page { flex: 1; max-width: 980px; }
section { margin-bottom: 2rem; display: flex; flex-direction: column; gap: .6rem; }
section p { margin: 0; }
a { cursor: pointer; }
.choose { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
.seg { display: inline-flex; border: var(--frame); border-radius: var(--radius); overflow: hidden; }
.seg button { padding: .2rem .8rem; background: none; border: 0; color: var(--text-faint); }
.seg button.on { background: var(--accent-soft); color: var(--accent); }
.pack-input { width: 15rem; }
.sources { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; }
.drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .35rem; padding: 1.4rem; border: 1px dashed var(--line-strong); border-radius: var(--radius); color: var(--text-dim); cursor: pointer; }
.drop.over { border-color: var(--accent); background: var(--accent-soft); }
.drop input { display: none; }
.paste { display: flex; flex-direction: column; gap: .4rem; align-items: flex-end; }
.paste textarea { min-height: 7rem; font-family: var(--font-mono); font-size: .85rem; resize: vertical; }
.error, .err b { color: var(--danger); } .warn b { color: var(--warn); }
.stats { display: flex; gap: 2rem; }
.stats div { display: flex; flex-direction: column; } .stats b { font-size: 1.3rem; } .stats span { font-size: .78rem; color: var(--text-faint); }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: .25rem .6rem; border-bottom: var(--frame); }
th { font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); }
tr.bad td { color: var(--text-faint); }
.chip.new { color: var(--ok); } .chip.update { color: var(--accent); } .chip.error { color: var(--danger); } .chip.fix { color: var(--warn); }
.issues { margin: .2rem 0 .5rem; padding-left: 1.1rem; font-size: .9rem; }
.issues .error { color: var(--danger); } .issues .warning { color: var(--text-dim); }
.actions { display: flex; gap: .5rem; }
.pack-row { display: flex; align-items: center; gap: .7rem; padding: .3rem 0; border-bottom: var(--frame); }
.grow { flex: 1; }
ul { margin: 0; padding-left: 1.2rem; }
</style>
