<template>
  <div class="hb-page">
    <div class="sys-subnav">
      <div class="sys-breadcrumb">
        <NuxtLink to="/data" class="sys-breadcrumb-link">Import &amp; Export</NuxtLink>
        <span class="sys-breadcrumb-sep">›</span>
        <span class="sys-breadcrumb-cur">Homebrew import</span>
      </div>
    </div>

    <div class="hb-body">
      <!-- ── Source ────────────────────────────────────────────── -->
      <section v-if="!report" class="hb-section">
        <h2 class="hb-h">Import homebrew</h2>
        <p class="hb-text">
          Adds compendium entries from a JSON file — one you wrote, or one Claude wrote from the
          <a href="#" @click.prevent="downloadGuide">format guide</a>. Every entry is checked first: small slips are
          fixed and listed, entries that can't be read are left out. Importing an entry again (same id) updates it and
          keeps its portrait.
        </p>

        <div class="hb-game">
          <span class="hb-muted">Entries without a game are for</span>
          <button
            v-for="g in GAME_CHOICES" :key="g.id" class="hb-game-btn" :class="{ 'hb-game-btn--on': game === g.id }"
            @click="setGame(g.id)"
          >{{ g.label }}</button>
          <span class="hb-muted hb-pack-label">and go into the pack</span>
          <input v-model="pack" class="hb-pack" list="hb-packs" placeholder="none" title="Entries that name their own pack (publication.title) keep it" @change="rawEntries && check()" />
          <datalist id="hb-packs"><option v-for="p in packNames" :key="p" :value="p" /></datalist>
        </div>

        <template v-if="!rows">
          <div class="hb-sources">
            <label
              class="hb-source hb-drop" :class="{ 'hb-drop--over': dragOver }"
              @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop"
            >
              <input type="file" accept=".json,application/json,text/plain" class="hb-file" @change="onPick" />
              <OhVueIcon name="gi-cauldron" scale="1.4" />
              <b>Drop a homebrew file</b>
              <span class="hb-muted">.json — a StarTome export, a list of entries, or one entry</span>
            </label>
            <div class="hb-paste">
              <textarea v-model="pasted" class="hb-textarea" placeholder="…or paste JSON here (a ```json block from a chat works too)" spellcheck="false" />
              <button class="btn btn-ghost btn-sm" :disabled="!pasted.trim()" @click="load(pasted, 'Pasted text')">Check</button>
            </div>
          </div>
        </template>
        <p v-if="error" class="hb-error">{{ error }}</p>
      </section>

      <!-- ── Preview ───────────────────────────────────────────── -->
      <section v-if="rows && !report" class="hb-section">
        <h2 class="hb-h">{{ sourceLabel }}</h2>
        <div class="hb-stats">
          <div><b>{{ counts.new }}</b><span>new</span></div>
          <div><b>{{ counts.update }}</b><span>updates</span></div>
          <div :class="{ 'hb-stat--warn': counts.warned }"><b>{{ counts.warned }}</b><span>with fixes</span></div>
          <div :class="{ 'hb-stat--err': counts.error }"><b>{{ counts.error }}</b><span>can't import</span></div>
        </div>

        <table class="hb-table">
          <thead>
            <tr>
              <th><input type="checkbox" :checked="allPicked" :indeterminate.prop="somePicked && !allPicked" title="All" @change="pickAll(($event.target as HTMLInputElement).checked)" /></th>
              <th>Entry</th><th>Kind</th><th>Level</th><th>Game</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="r in rows" :key="r.index">
              <tr :class="{ 'hb-row--err': r.status === 'error' }">
                <td><input v-model="picked" type="checkbox" :value="r.index" :disabled="r.status === 'error'" /></td>
                <td class="hb-name">
                  <button v-if="r.issues.length" class="hb-toggle" @click="toggle(r.index)">
                    {{ open.has(r.index) ? '▾' : '▸' }} {{ r.name }}
                  </button>
                  <template v-else>{{ r.name }}</template>
                </td>
                <td>{{ r.kind ? RULES_KIND_CONFIG[r.kind].label : '—' }}</td>
                <td>{{ r.entry ? r.entry.level : '—' }}</td>
                <td>{{ r.entry ? gameLabel(r.entry.game) : '—' }}</td>
                <td>
                  <span class="hb-chip" :class="`hb-chip--${r.status}`">{{ STATUS_LABEL[r.status] }}</span>
                  <span v-if="r.status !== 'error' && warnCount(r)" class="hb-chip hb-chip--fix">{{ warnCount(r) }} fixed</span>
                </td>
              </tr>
              <tr v-if="open.has(r.index)" class="hb-issues-row">
                <td />
                <td colspan="5">
                  <ul class="hb-issues">
                    <li v-for="(iss, i) in r.issues" :key="i" :class="`hb-issue--${iss.level}`">
                      <code v-if="iss.path">{{ iss.path }}</code> {{ iss.message }}
                    </li>
                  </ul>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <div class="hb-actions">
          <button class="btn btn-accent" :disabled="!picked.length || busy" @click="apply">
            Import {{ picked.length }} {{ picked.length === 1 ? 'entry' : 'entries' }}
          </button>
          <button v-if="counts.warned || counts.error" class="btn btn-ghost" title="Copy every problem as text to send back to whoever wrote the file" @click="copyReport">
            {{ copied ? 'Copied' : 'Copy problems for Claude' }}
          </button>
          <button class="btn btn-ghost" :disabled="busy" @click="reset">Cancel</button>
        </div>
      </section>

      <!-- ── Report ────────────────────────────────────────────── -->
      <section v-if="report" class="hb-section hb-report">
        <h2 class="hb-h">Imported {{ report.length }} {{ report.length === 1 ? 'entry' : 'entries' }}</h2>
        <ul class="hb-done">
          <li v-for="e in report" :key="e.id">
            <NuxtLink :to="`/compendium/${RULES_KIND_CONFIG[e.kind].segment}?id=${e.id}`">{{ e.name }}</NuxtLink>
            <span class="hb-muted"> — {{ RULES_KIND_CONFIG[e.kind].label }} {{ e.level }}</span>
          </li>
        </ul>
        <div class="hb-actions">
          <button class="btn btn-ghost" @click="reset">Import another</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { takePendingImport } from '~/composables/usePendingImport'
import { summarizePacks, withPack } from '~/rules/packs'
import { getDb, now } from '~/composables/useDb'
import { notifyRulesChanged, rulesUserEntries } from '~/composables/useRules'
import { newRulesId } from '~/rules/factory'
import {
  checkHomebrewEntry, issuesReport, planHomebrewImport, readHomebrewText,
  type HomebrewRow, type HomebrewStatus,
} from '~/rules/homebrew'
import { GAME_CONFIG, type GameId } from '~/types/game'
import { RULES_KIND_CONFIG, type RulesEntity } from '~/types/rules'
import { lsKey } from '~/utils/appNamespace'
import guideText from '~/HOMEBREW_FORMAT.md?raw'

useHead({ title: 'Homebrew import — StarTome' })

const GAME_CHOICES: { id: GameId | 'both'; label: string }[] = [
  { id: 'sf2e', label: GAME_CONFIG.sf2e.short }, { id: 'pf2e', label: GAME_CONFIG.pf2e.short }, { id: 'both', label: 'Both' },
]
const STATUS_LABEL: Record<HomebrewStatus, string> = { new: 'New', update: 'Update', error: "Can't import" }
const GAME_KEY = lsKey('homebrew-game')

const game = ref<GameId | 'both'>('sf2e')
const pack = ref('')
const packNames = ref<string[]>([])
const pasted = ref('')
const dragOver = ref(false)
const error = ref('')
const sourceLabel = ref('')
const rawEntries = shallowRef<unknown[] | null>(null)
const rows = shallowRef<HomebrewRow[] | null>(null)
const picked = ref<number[]>([])
const open = ref(new Set<number>())
const busy = ref(false)
const copied = ref(false)
const report = shallowRef<RulesEntity[] | null>(null)

onMounted(() => {
  try {
    const g = localStorage.getItem(GAME_KEY)
    if (g === 'sf2e' || g === 'pf2e' || g === 'both') game.value = g
  } catch {}
  void rulesUserEntries().then(rows => { packNames.value = summarizePacks(rows).map(p => p.title).filter(Boolean) })
  // Sent here from Import & Export
  const p = takePendingImport()
  if (p?.text) load(p.text, p.label)
  else if (p?.file) void readFile(p.file)
})

function setGame(g: GameId | 'both') {
  game.value = g
  try { localStorage.setItem(GAME_KEY, g) } catch {}
  if (rawEntries.value) void check()
}

const gameLabel = (g: GameId | 'both') => (g === 'both' ? 'Both' : GAME_CONFIG[g].short)
const warnCount = (r: HomebrewRow) => r.issues.filter(i => i.level === 'warning').length

const counts = computed(() => {
  const list = rows.value ?? []
  return {
    new: list.filter(r => r.status === 'new').length,
    update: list.filter(r => r.status === 'update').length,
    error: list.filter(r => r.status === 'error').length,
    warned: list.filter(r => r.status !== 'error' && warnCount(r)).length,
  }
})

const importable = computed(() => (rows.value ?? []).filter(r => r.status !== 'error').map(r => r.index))
const allPicked = computed(() => importable.value.length > 0 && picked.value.length === importable.value.length)
const somePicked = computed(() => picked.value.length > 0)
function pickAll(on: boolean) { picked.value = on ? [...importable.value] : [] }

function toggle(i: number) {
  const next = new Set(open.value)
  if (next.has(i)) next.delete(i); else next.add(i)
  open.value = next
}

// ── Read ───────────────────────────────────────────────────────────────────

function load(text: string, label: string) {
  error.value = ''
  const read = readHomebrewText(text)
  if ('error' in read) { error.value = read.error; return }
  if (!read.entries.length) { error.value = 'The file has no entries.'; return }
  rawEntries.value = read.entries
  sourceLabel.value = label
  void check()
}

async function check() {
  const ts = now()
  const checks = rawEntries.value!.map((raw, i) => checkHomebrewEntry(raw, i, { now: ts, game: game.value, newId: newRulesId }))
  // Entries that name no pack go into the chosen one
  for (const c of checks) if (c.entry && !c.entry.publication && pack.value.trim()) c.entry = withPack(c.entry, pack.value)
  const db = getDb()
  const ok = checks.filter(c => c.entry).map(c => c.entry!)
  const [existing, named] = await Promise.all([
    db.rules.bulkGet(ok.map(e => e.id)),
    db.rules.where('[kind+sortName]').anyOf(ok.map(e => [e.kind, e.sortName])).toArray(),
  ])
  const sameName = new Map<string, RulesEntity[]>()
  for (const r of named) {
    const k = `${r.kind}:${r.sortName}`
    sameName.set(k, [...(sameName.get(k) ?? []), r])
  }
  const planned = planHomebrewImport(
    checks,
    new Map(existing.filter((r): r is RulesEntity => !!r).map(r => [r.id, r])),
    sameName,
    newRulesId,
  )
  rows.value = planned
  picked.value = planned.filter(r => r.status !== 'error').map(r => r.index)
  // Errors open by themselves; fixes stay one click away
  open.value = new Set(planned.filter(r => r.status === 'error').map(r => r.index))
}

async function readFile(f: File) {
  try { load(await f.text(), f.name) }
  catch (err) { error.value = `Couldn't read ${f.name}: ${(err as Error).message}` }
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) void readFile(f)
}

function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) void readFile(f)
  ;(e.target as HTMLInputElement).value = ''
}

// ── Write ──────────────────────────────────────────────────────────────────

async function apply() {
  if (!rows.value) return
  const wanted = new Set(picked.value)
  const entries = rows.value.filter(r => wanted.has(r.index) && r.entry).map(r => toRaw(r.entry!))
  busy.value = true
  try {
    await getDb().rules.bulkPut(entries)
    notifyRulesChanged()
    report.value = entries
  } catch (err) {
    error.value = `Import failed, nothing was changed: ${(err as Error).message}`
  } finally { busy.value = false }
}

async function copyReport() {
  if (!rows.value) return
  await navigator.clipboard.writeText(issuesReport(rows.value))
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function downloadGuide() {
  const url = URL.createObjectURL(new Blob([guideText], { type: 'text/markdown' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'HOMEBREW_FORMAT.md'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function reset() {
  rawEntries.value = null
  rows.value = null
  report.value = null
  picked.value = []
  open.value = new Set()
  pasted.value = ''
  error.value = ''
}
</script>

<style scoped>
.hb-page { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.hb-body { flex: 1; overflow-y: auto; padding: 18px 24px 40px; display: flex; flex-direction: column; gap: 22px; max-width: 980px; }
.hb-section { display: flex; flex-direction: column; gap: 10px; }
.hb-h { font-family: var(--fh); font-size: 15px; margin: 0; color: var(--text); letter-spacing: 0.04em; }
.hb-muted { color: var(--text3); }
.hb-error { color: #e87a7a; font-size: 13px; margin: 0; }
.hb-text { font-size: 13px; color: var(--text2); margin: 0; line-height: 1.6; }
.hb-section a { color: var(--accent-l, var(--accent)); }
.hb-pack-label { margin-left: 8px; }
.hb-pack { width: 200px; font-size: 12px; padding: 3px 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border-hi); border-radius: 5px; }
.hb-game { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12.5px; }
.hb-game-btn {
  background: none; border: 1px solid var(--border-hi); border-radius: 999px; padding: 2px 10px; color: var(--text2);
  font: inherit; font-size: 12px; cursor: pointer;
}
.hb-game-btn--on { border-color: var(--accent); background: var(--accent-bg); color: var(--text); }
.hb-sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
.hb-source {
  position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center;
  border: 2px dashed var(--border-hi); border-radius: 10px; padding: 22px; color: var(--text2); font-size: 13px; cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.hb-source b { color: var(--text); }
.hb-source:hover, .hb-drop--over { border-color: var(--accent); background: var(--surface); }
.hb-file { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.hb-paste { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.hb-textarea { width: 100%; min-height: 120px; flex: 1; font-family: var(--fm); font-size: 11.5px; resize: vertical; }
.hb-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.hb-stats div { display: flex; flex-direction: column; background: var(--surface); border-radius: 6px; padding: 6px 10px; }
.hb-stats b { font-family: var(--fm); font-size: 17px; color: var(--text); }
.hb-stats span { font-size: 11px; color: var(--text3); }
.hb-stats .hb-stat--warn b { color: var(--fav); }
.hb-stats .hb-stat--err b { color: var(--danger); }
.hb-table { border-collapse: collapse; font-size: 12.5px; color: var(--text2); width: 100%; }
.hb-table th { text-align: left; font-weight: 600; color: var(--text3); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 4px 12px 4px 0; }
.hb-table td { padding: 4px 12px 4px 0; border-top: 1px solid var(--border); vertical-align: top; }
.hb-table th:first-child, .hb-table td:first-child { width: 22px; }
.hb-name { color: var(--text); }
.hb-row--err .hb-name { color: var(--text3); }
.hb-toggle { background: none; border: none; padding: 0; color: inherit; font: inherit; cursor: pointer; text-align: left; }
.hb-issues-row td { border-top: none; padding-top: 0; }
.hb-issues { margin: 0 0 6px; padding-left: 16px; font-size: 12px; }
.hb-issues code { font-family: var(--fm); font-size: 11px; color: var(--text); }
.hb-issue--error { color: var(--danger); }
.hb-issue--warning { color: var(--text2); }
.hb-chip { display: inline-block; font-size: 10.5px; border-radius: 999px; padding: 1px 8px; margin-right: 4px; white-space: nowrap; }
.hb-chip--new { background: var(--accent-bg); color: var(--accent-l); }
.hb-chip--update { background: var(--surface-hi); color: var(--text); }
.hb-chip--error { background: var(--danger-bg); color: var(--danger); }
.hb-chip--fix { background: none; border: 1px solid var(--border-hi); color: var(--text3); }
.hb-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.hb-report { border: 1px solid var(--border-hi); border-radius: 8px; padding: 12px 14px; }
.hb-done { margin: 0; padding-left: 18px; font-size: 13px; max-height: 360px; overflow-y: auto; }
@media (max-width: 640px) {
  .hb-body { padding: 14px 16px 32px; }
  .hb-table th:nth-child(5), .hb-table td:nth-child(5) { display: none; }
}
</style>
