<template>
  <Teleport to="body">
    <div v-if="open" class="pv-dialog-mask" @click.self="phase !== 'applying' && close()">
      <div class="pv-dialog ifm-modal">

        <!-- Header -->
        <div class="pv-dialog-header">
          <span class="pv-dialog-title">{{ phaseTitle }}</span>
          <button v-if="phase !== 'applying'" class="pv-dialog-close" @click="close()">
            <OhVueIcon name="md-close" scale="0.85" />
          </button>
        </div>

        <div class="pv-dialog-content ifm-content">

          <!-- ── Configure ─────────────────────────────────────────────── -->
          <template v-if="phase === 'configure'">
            <div class="ifm-fields">

              <div class="ifm-field">
                <label class="ifm-label">Game</label>
                <select v-model="game" class="ifm-select">
                  <option v-for="g in GAME_IDS" :key="g" :value="g">{{ GAME_CONFIG[g].label }}</option>
                </select>
              </div>
              <div class="ifm-field">
                <label class="ifm-label">Compendium</label>
                <select v-model="kind" class="ifm-select">
                  <option v-for="k in RULES_KINDS" :key="k" :value="k">{{ RULES_KIND_CONFIG[k].plural }}</option>
                </select>
              </div>
              <div class="ifm-field">
                <label class="ifm-label">Image</label>
                <select v-model="imageField" class="ifm-select">
                  <option value="img">Portrait</option>
                  <option v-if="kind === 'creature'" value="tokenImg">Token art</option>
                </select>
              </div>
              <div class="ifm-field">
                <label class="ifm-label">Image Folder</label>
                <div class="ifm-folder-row">
                  <button class="ifm-folder-btn" @click="pickFolder()">
                    <OhVueIcon name="fa-folder-open" scale="0.85" />
                    Choose Folder
                  </button>
                  <span v-if="pickedFiles.length" class="ifm-folder-count">
                    {{ pickedFiles.length }} image{{ pickedFiles.length !== 1 ? 's' : '' }} found
                  </span>
                  <span v-else class="ifm-hint">including subfolders</span>
                </div>
                <input
                  ref="folderInput"
                  type="file"
                  multiple
                  webkitdirectory
                  style="display:none"
                  @change="onFolderChange"
                />
              </div>

              <div class="ifm-field">
                <label class="ifm-jpeg-label">
                  <input type="checkbox" v-model="convertToJpeg" class="ifm-check" />
                  Convert to JPEG
                  <span class="ifm-hint">(smaller files; PNGs lose transparency)</span>
                </label>
              </div>

            </div>
          </template>

          <!-- ── Review ────────────────────────────────────────────────── -->
          <template v-else-if="phase === 'review'">
            <div class="ifm-stats-bar">
              <span class="ifm-stat ifm-stat--green">{{ greenCount }} matched</span>
              <span class="ifm-stat ifm-stat--amber">{{ amberCount }} uncertain</span>
              <span class="ifm-stat ifm-stat--dim">{{ noMatchCount }} unmatched</span>
              <div class="ifm-bulk-actions">
                <button class="ifm-chip" @click="checkAllGreen()">Check all matched</button>
                <button class="ifm-chip" @click="uncheckAmber()">Uncheck uncertain</button>
                <button class="ifm-chip" :class="{ 'ifm-chip--active': showUnmatched }" @click="showUnmatched = !showUnmatched">
                  {{ showUnmatched ? 'Hide unmatched' : `Show unmatched (${noMatchCount})` }}
                </button>
              </div>
            </div>

            <div class="ifm-table-wrap">
              <table class="ifm-table">
                <thead>
                  <tr>
                    <th class="ifm-th-thumb"></th>
                    <th class="ifm-th-file">File</th>
                    <th class="ifm-th-record">→ Entry</th>
                    <th class="ifm-th-score">Score</th>
                    <th class="ifm-th-apply">Use</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(m, i) in visibleMatches"
                    :key="m.objectUrl"
                    class="ifm-row"
                    :class="{ 'ifm-row--off': !m.apply }"
                  >
                    <td class="ifm-td-thumb">
                      <img :src="m.objectUrl" class="ifm-thumb" alt="" loading="lazy" />
                    </td>
                    <td class="ifm-td-file" :title="m.file.name">
                      {{ m.normalizedName || m.file.name }}
                    </td>
                    <td class="ifm-td-record">
                      <select
                        class="ifm-record-select"
                        :value="m.selectedId ?? ''"
                        @change="onSelectChange(m, ($event.target as HTMLSelectElement).value || null)"
                      >
                        <option value="">— no match —</option>
                        <option v-for="rec in sortedRecords" :key="rec.id" :value="rec.id">
                          {{ rec.name }}
                        </option>
                      </select>
                    </td>
                    <td class="ifm-td-score">
                      <span v-if="m.score > 0" class="ifm-score" :class="scoreClass(m.score)">
                        {{ Math.round(m.score * 100) }}%
                      </span>
                      <span v-else class="ifm-score ifm-score--dim">—</span>
                    </td>
                    <td class="ifm-td-apply">
                      <input
                        type="checkbox"
                        class="ifm-check"
                        :checked="m.apply && m.selectedId !== null"
                        :disabled="m.selectedId === null"
                        @change="toggleApply(m)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <!-- ── Matching / Applying / Done ──────────────────────────────── -->
          <template v-else>
            <div class="ifm-progress-wrap">
              <div class="ifm-progress-track">
                <div class="ifm-progress-fill" :style="{ width: (phase === 'matching' ? matchProgress : progressPct) + '%' }" />
              </div>
              <span class="ifm-progress-label">
                {{ phase === 'matching' ? matchProgress + '%' : progressDone + ' / ' + progressTotal }}
              </span>
            </div>
            <div v-if="phase === 'done'" class="ifm-done-summary">
              <span class="ifm-done-ok">{{ updatedCount }} entries updated</span>
              <template v-if="skippedCount > 0">
                · <span class="ifm-done-skip">{{ skippedCount }} skipped</span>
              </template>
            </div>
            <div v-else class="ifm-applying-hint">
              {{ phase === 'matching' ? `Scoring ${pickedFiles.length} images…` : 'Compressing and saving images…' }}
            </div>
          </template>

        </div>

        <!-- Footer -->
        <div class="pv-dialog-footer ifm-footer">
          <template v-if="phase === 'configure'">
            <button class="sett-btn" @click="close()">Cancel</button>
            <button class="sett-btn ifm-btn-primary" :disabled="!canPreview" @click="runMatching()">
              Preview Matches →
            </button>
          </template>
          <template v-else-if="phase === 'review'">
            <button class="sett-btn" @click="phase = 'configure'">← Back</button>
            <button class="sett-btn ifm-btn-primary" :disabled="applyCount === 0" @click="applyMatches()">
              Apply {{ applyCount }} {{ applyCount === 1 ? 'match' : 'matches' }}
            </button>
          </template>
          <template v-else-if="phase === 'done'">
            <button class="sett-btn ifm-btn-primary" @click="close()">Done</button>
          </template>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { markRaw, shallowRef } from 'vue'
import { fileToDataUrl } from '~/utils/image'
import { rulesNameList, rulesSetImage } from '~/composables/useRules'
import { scoreNormalized, normalize } from '~/composables/useImageMatcher'
import { GAME_CONFIG, GAME_IDS, type GameId } from '~/types/game'
import { RULES_KIND_CONFIG, RULES_KINDS, type RulesKind } from '~/types/rules'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

type Phase = 'configure' | 'matching' | 'review' | 'applying' | 'done'
const phase = ref<Phase>('configure')

// ── Configure state ────────────────────────────────────────────────────────
const game = ref<GameId>('pf2e')
const kind = ref<RulesKind>('creature')
const imageField = ref<'img' | 'tokenImg'>('img')
const convertToJpeg = ref(true)
// shallowRef: File is a browser-native object — deep Vue proxying causes memory corruption
const pickedFiles = shallowRef<File[]>([])
const folderInput = ref<HTMLInputElement | null>(null)

const canPreview = computed(() => pickedFiles.value.length > 0)

// ── Match state ────────────────────────────────────────────────────────────
interface MatchRow {
  file: File
  objectUrl: string
  normalizedName: string
  bestId: string | null
  score: number
  selectedId: string | null
  apply: boolean
}

const matches = ref<MatchRow[]>([])
const allRecords = shallowRef<{ id: string; name: string }[]>([])
const _objUrls: string[] = []
const matchProgress = ref(0)
const showUnmatched = ref(false)

const sortedRecords = computed(() =>
  [...allRecords.value].sort((a, b) => a.name.localeCompare(b.name))
)

const visibleMatches = computed(() =>
  showUnmatched.value ? matches.value : matches.value.filter(m => m.score >= 0.6)
)

// Create object URLs lazily when unmatched rows become visible
watch(showUnmatched, (visible) => {
  if (!visible) return
  for (const m of matches.value) {
    if (!m.objectUrl) {
      m.objectUrl = URL.createObjectURL(m.file)
      _objUrls.push(m.objectUrl)
    }
  }
})

// ── Apply state ────────────────────────────────────────────────────────────
const progressDone = ref(0)
const progressTotal = ref(0)
const updatedCount = ref(0)
const skippedCount = ref(0)

// ── Watchers ───────────────────────────────────────────────────────────────
watch(() => props.open, (v) => { if (!v) reset() })
watch(kind, (k) => { if (k !== 'creature') imageField.value = 'img' })

// ── Folder pick ────────────────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'])

function pickFolder() { folderInput.value?.click() }

function onFolderChange(e: Event) {
  const input = e.target as HTMLInputElement
  const all = Array.from(input.files ?? [])
  pickedFiles.value = all
    .filter(f => {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
      return IMAGE_EXTS.has(ext) || f.type.startsWith('image/')
    })
    .map(f => markRaw(f))
  input.value = ''
}

// ── Matching ───────────────────────────────────────────────────────────────
const MATCH_BATCH = 150

async function runMatching() {
  phase.value = 'matching'
  matchProgress.value = 0

  const records = await rulesNameList(kind.value, [game.value])
  allRecords.value = records

  revokeObjUrls()

  // Pre-normalize record names once — avoids re-running 6 regexes per (file × record) pair
  const normRecords = records.map(r => ({ id: r.id, norm: normalize(r.name) }))

  const files = pickedFiles.value
  const rows: MatchRow[] = []

  for (let i = 0; i < files.length; i += MATCH_BATCH) {
    const chunk = files.slice(i, i + MATCH_BATCH)
    for (const file of chunk) {
      const normFile = normalize(file.name)
      let bestId: string | null = null
      let bestScore = 0
      for (const { id, norm } of normRecords) {
        const s = scoreNormalized(normFile, norm)
        if (s > bestScore) {
          bestScore = s
          bestId = id
          if (bestScore === 1.0) break  // exact match, no need to check further
        }
      }
      const qualified = bestScore >= 0.6
      // Only create object URLs for matched files; unmatched get them lazily when shown
      const url = qualified ? URL.createObjectURL(file) : ''
      if (url) _objUrls.push(url)
      rows.push({
        file,
        objectUrl: url,
        normalizedName: normFile,
        bestId: qualified ? bestId : null,
        score: bestScore,
        selectedId: qualified ? bestId : null,
        apply: qualified,
      })
    }
    matchProgress.value = Math.min(99, Math.round((i + chunk.length) / files.length * 100))
    await new Promise(r => setTimeout(r, 0))
  }

  rows.sort((a, b) => {
    if (a.apply !== b.apply) return a.apply ? -1 : 1
    return b.score - a.score
  })

  matchProgress.value = 100
  matches.value = rows
  phase.value = 'review'
}

// ── Apply ──────────────────────────────────────────────────────────────────
async function applyMatches() {
  const toApply = matches.value.filter(m => m.apply && m.selectedId !== null)
  progressTotal.value = toApply.length
  progressDone.value = 0
  updatedCount.value = 0
  skippedCount.value = 0
  phase.value = 'applying'

  for (const m of toApply) {
    try {
      const dataUrl = await fileToDataUrl(m.file, convertToJpeg.value)
      // Stored as a blob in the image store; a re-sync keeps it (user-owned field)
      const updated = await rulesSetImage(m.selectedId!, imageField.value, dataUrl)
      if (updated) updatedCount.value++
      else skippedCount.value++
    } catch {
      skippedCount.value++
    }
    progressDone.value++
    await nextTick()
  }
  phase.value = 'done'
}

// ── Row interactions ───────────────────────────────────────────────────────
function toggleApply(m: MatchRow) {
  const i = matches.value.indexOf(m)
  if (i === -1 || m.selectedId === null) return
  matches.value[i] = { ...m, apply: !m.apply }
}

function onSelectChange(m: MatchRow, id: string | null) {
  const i = matches.value.indexOf(m)
  if (i === -1) return
  matches.value[i] = { ...m, selectedId: id, apply: id !== null }
}

// ── Bulk ───────────────────────────────────────────────────────────────────
function checkAllGreen() {
  matches.value = matches.value.map(m =>
    m.score >= 0.9 ? { ...m, apply: true } : m
  )
}
function uncheckAmber() {
  matches.value = matches.value.map(m =>
    m.score >= 0.6 && m.score < 0.9 ? { ...m, apply: false } : m
  )
}

// ── Computed helpers ───────────────────────────────────────────────────────
const applyCount = computed(() => matches.value.filter(m => m.apply && m.selectedId !== null).length)
const greenCount = computed(() => matches.value.filter(m => m.score >= 0.9).length)
const amberCount = computed(() => matches.value.filter(m => m.score >= 0.6 && m.score < 0.9).length)
const noMatchCount = computed(() => matches.value.filter(m => m.score < 0.6).length)
const progressPct = computed(() =>
  progressTotal.value > 0 ? Math.round(progressDone.value / progressTotal.value * 100) : 0
)
const phaseTitle = computed(() => ({
  configure: 'Image Folder Import',
  matching:  'Matching…',
  review:    'Review Matches',
  applying:  'Applying…',
  done:      'Import Complete',
}[phase.value]))

function scoreClass(score: number) {
  if (score >= 0.9) return 'ifm-score--green'
  if (score >= 0.6) return 'ifm-score--amber'
  return 'ifm-score--dim'
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
function revokeObjUrls() {
  for (const u of _objUrls) URL.revokeObjectURL(u)
  _objUrls.length = 0
}

function close() { emit('close') }

function reset() {
  phase.value = 'configure'
  imageField.value = 'img'
  convertToJpeg.value = true
  pickedFiles.value = []
  matches.value = []
  allRecords.value = []
  revokeObjUrls()
  matchProgress.value = 0
  showUnmatched.value = false
  progressDone.value = 0
  progressTotal.value = 0
  updatedCount.value = 0
  skippedCount.value = 0
}

onUnmounted(revokeObjUrls)
</script>

<style scoped>
.ifm-modal { width: 720px; max-height: 88vh; display: flex; flex-direction: column; }

.ifm-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

/* ── Configure ── */
.ifm-fields { display: flex; flex-direction: column; gap: 14px; padding: 2px 0; }

.ifm-field { display: flex; flex-direction: column; gap: 5px; }

.ifm-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text3);
}

.ifm-select {
  font-size: 13px;
  color: var(--text);
  background: var(--surface-hi);
  border: 1px solid var(--border);
  border-radius: var(--r1);
  padding: 6px 10px;
  cursor: pointer;
  outline: none;
  font-family: var(--fu);
  max-width: 320px;
}
.ifm-select:focus { border-color: oklch(58% 0.24 295 / 0.5); }
.ifm-select:disabled { opacity: 0.5; cursor: not-allowed; }

.ifm-field-static {
  font-size: 13px;
  color: var(--text2);
  padding: 6px 0;
}

.ifm-hint { font-size: 11px; color: var(--text3); font-style: italic; }

.ifm-folder-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.ifm-folder-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--r1);
  background: var(--surface-hi);
  border: 1px solid var(--border);
  color: var(--text2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: var(--fu);
  transition: all 0.12s;
}
.ifm-folder-btn:hover { border-color: var(--border-hi); color: var(--text); }

.ifm-folder-count { font-size: 12px; color: var(--accent); font-weight: 500; }

.ifm-jpeg-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--text2);
  cursor: pointer;
  user-select: none;
}

/* ── Review ── */
.ifm-stats-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
  flex-shrink: 0;
}

.ifm-stat {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid;
}
.ifm-stat--green { color: #22c55e; background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.3); }
.ifm-stat--amber { color: #f59e0b; background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.3); }
.ifm-stat--dim   { color: var(--text3); background: var(--surface-hi); border-color: var(--border); }

.ifm-bulk-actions { display: flex; gap: 4px; margin-left: auto; }

.ifm-chip {
  font-size: 11px;
  font-family: var(--fu);
  padding: 3px 10px;
  border-radius: var(--r1);
  border: 1px solid var(--border);
  background: none;
  color: var(--text2);
  cursor: pointer;
  transition: all 0.12s;
}
.ifm-chip:hover { border-color: var(--border-hi); color: var(--text); }
.ifm-chip--active { background: var(--surface-hi); border-color: var(--border-hi); color: var(--text); }

.ifm-table-wrap { flex: 1; overflow-y: auto; min-height: 0; }

.ifm-table { width: 100%; border-collapse: collapse; }

.ifm-table thead th {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text3);
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  position: sticky;
  top: 0;
  background: var(--surface);
}

.ifm-th-thumb { width: 40px; }
.ifm-th-file  { width: 32%; }
.ifm-th-record { }
.ifm-th-score { width: 52px; text-align: center; }
.ifm-th-apply { width: 36px; text-align: center; }

.ifm-row { transition: background 0.1s; }
.ifm-row:hover { background: var(--surface-hi); }
.ifm-row--off { opacity: 0.45; }

.ifm-row td { padding: 5px 6px; border-bottom: 1px solid var(--border); vertical-align: middle; }

.ifm-td-thumb { width: 40px; }
.ifm-thumb {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
  display: block;
  background: var(--surface-hi);
}

.ifm-td-file {
  font-family: var(--fm);
  font-size: 11px;
  color: var(--text2);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ifm-record-select {
  font-size: 12px;
  color: var(--text);
  background: var(--surface-hi);
  border: 1px solid var(--border);
  border-radius: var(--r1);
  padding: 3px 6px;
  width: 100%;
  cursor: pointer;
  outline: none;
  font-family: var(--fu);
  max-width: 240px;
}
.ifm-record-select:focus { border-color: oklch(58% 0.24 295 / 0.5); }

.ifm-td-score { text-align: center; }
.ifm-score {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid;
  font-family: var(--fm);
}
.ifm-score--green { color: #22c55e; background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.3); }
.ifm-score--amber { color: #f59e0b; background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.3); }
.ifm-score--dim   { color: var(--text3); background: none; border-color: transparent; }

.ifm-td-apply { text-align: center; }
.ifm-check { cursor: pointer; accent-color: var(--accent); width: 14px; height: 14px; }

/* ── Progress / Done ── */
.ifm-progress-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.ifm-progress-track {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--surface-hi);
  overflow: hidden;
}
.ifm-progress-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  transition: width 0.2s;
}
.ifm-progress-label { font-family: var(--fm); font-size: 11px; color: var(--text3); flex-shrink: 0; }

.ifm-applying-hint { font-size: 12px; color: var(--text3); font-style: italic; }

.ifm-done-summary { font-size: 13px; color: var(--text2); }
.ifm-done-ok  { color: #22c55e; font-weight: 500; }
.ifm-done-skip { color: var(--text3); }

/* ── Footer ── */
.ifm-footer { display: flex; justify-content: flex-end; gap: 8px; }

.ifm-btn-primary {
  background: var(--accent-bg) !important;
  border-color: oklch(58% 0.24 295 / 0.4) !important;
  color: var(--accent) !important;
  font-weight: 600 !important;
}
.ifm-btn-primary:hover:not(:disabled) {
  background: oklch(58% 0.24 295 / 0.2) !important;
  border-color: var(--accent) !important;
}
.ifm-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
