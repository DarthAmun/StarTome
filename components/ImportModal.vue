<template>
  <Teleport to="body">
    <div v-if="open" class="pv-dialog-mask" @click.self="phase !== 'running' && emit('close')">
      <div class="pv-dialog imp-modal">

        <!-- Header -->
        <div class="pv-dialog-header">
          <span class="pv-dialog-title">
            <OhVueIcon :name="phaseIcon" scale="0.85" style="margin-right:6px;opacity:0.7" />
            {{ phaseTitle }}
          </span>
          <button v-if="phase !== 'running'" class="pv-dialog-close" @click="emit('close')">
            <OhVueIcon name="md-close" scale="0.85" />
          </button>
        </div>

        <div class="pv-dialog-content">

          <!-- ── Configure ───────────────────────────── -->
          <template v-if="phase === 'configure'">
            <div class="imp-file-meta">
              <span class="imp-file-type">{{ payload?.type ?? '—' }}</span>
              <span class="imp-file-date">exported {{ exportedOn }}</span>
            </div>

            <div v-if="totalItems === 0" class="imp-empty">
              Nothing importable found in this file.
            </div>
            <div v-else class="imp-section-list">

              <!-- Sections -->
              <label v-for="sec in sections" :key="sec.key" class="imp-check-row">
                <input type="checkbox" :checked="sec.enabled"
                  @change="toggleSection(sec.key)" />
                <span class="imp-check-label">{{ sec.label }}</span>
                <span class="imp-badge">{{ sec.count.toLocaleString() }}</span>
              </label>


            </div>

            <p v-if="totalItems > 0" class="imp-notice">
              Items with the same ID will be overwritten.
            </p>
          </template>

          <!-- ── Running / Done ─────────────────────── -->
          <template v-else>
            <div class="imp-progress-wrap">
              <div class="imp-progress-track">
                <div class="imp-progress-fill" :style="{ width: progressPct + '%' }" />
              </div>
              <span class="imp-progress-label">
                {{ progressDone.toLocaleString() }} / {{ progressTotal.toLocaleString() }}
              </span>
            </div>

            <div class="imp-log" ref="logEl">
              <div v-for="(line, i) in logLines" :key="i"
                class="imp-log-line" :class="line.ok ? 'ok' : 'fail'">
                <span class="imp-log-icon">{{ line.ok ? '✓' : '✗' }}</span>
                {{ line.msg }}
              </div>
              <div v-if="phase === 'running'" class="imp-log-line imp-log-spinner">
                <span class="imp-spinner">⟳</span> Importing…
              </div>
            </div>

            <div v-if="phase === 'done'" class="imp-done-summary">
              <span class="imp-done-ok">{{ okCount }} succeeded</span>
              <template v-if="failCount > 0">
                · <span class="imp-done-fail">{{ failCount }} failed</span>
              </template>
            </div>
          </template>

        </div>

        <!-- Footer -->
        <div class="pv-dialog-footer imp-footer">
          <template v-if="phase === 'configure'">
            <button class="sett-btn" @click="emit('close')">Cancel</button>
            <button class="sett-btn sett-btn--primary" :disabled="nothingSelected || totalItems === 0"
              @click="emit('run')">
              <OhVueIcon name="md-fileupload" scale="0.8" />
              Import {{ selectedCount.toLocaleString() }} items
            </button>
          </template>
          <template v-else-if="phase === 'done'">
            <button class="sett-btn sett-btn--primary" @click="emit('close')">
              <OhVueIcon name="md-check" scale="0.8" />
              Done
            </button>
          </template>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
export interface ImportSection {
  key: string
  label: string
  count: number
  enabled: boolean
}

export interface LogLine {
  ok: boolean
  msg: string
}

const props = defineProps<{
  open: boolean
  phase: 'configure' | 'running' | 'done'
  payload: any
  sections: ImportSection[]
  logLines: LogLine[]
  progressDone: number
  progressTotal: number
}>()

const emit = defineEmits<{
  close: []
  run: []
  'update:sections': [v: ImportSection[]]
}>()

const logEl = ref<HTMLElement | null>(null)

const phaseTitle = computed(() => ({
  configure: 'Configure Import',
  running:   'Importing…',
  done:      'Import Complete',
}[props.phase]))

const phaseIcon = computed(() => ({
  configure: 'md-fileupload',
  running:   'md-hourglass-empty',
  done:      'md-check-circle-outline',
}[props.phase]))

const exportedOn = computed(() => {
  if (!props.payload?.exportedAt) return '—'
  return new Date(props.payload.exportedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
})

const totalItems = computed(() =>
  props.sections.reduce((s, sec) => s + sec.count, 0)
)

const selectedCount = computed(() =>
  props.sections.filter(s => s.enabled).reduce((s, sec) => s + sec.count, 0)
)

const nothingSelected = computed(() => props.sections.every(s => !s.enabled))

const progressPct = computed(() =>
  props.progressTotal > 0 ? Math.round(props.progressDone / props.progressTotal * 100) : 0
)

const okCount = computed(() => props.logLines.filter(l => l.ok).length)
const failCount = computed(() => props.logLines.filter(l => !l.ok).length)

function toggleSection(key: string) {
  emit('update:sections', props.sections.map(s =>
    s.key === key ? { ...s, enabled: !s.enabled } : s
  ))
}

watch(() => props.logLines.length, async () => {
  await nextTick()
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
})
</script>

<style scoped>
.imp-modal { width: 560px; max-height: 80vh; display: flex; flex-direction: column; }

.pv-dialog-content { flex: 1; overflow-y: auto; }

/* File meta row */
.imp-file-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--parch-line);
}
.imp-file-type {
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--gold);
  background: rgba(184,134,11,0.1);
  border: 1px solid rgba(184,134,11,0.3);
  border-radius: 999px;
  padding: 2px 9px;
}
.imp-file-date {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--ink-ghost);
}

/* Empty state */
.imp-empty {
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--ink-ghost);
  text-align: center;
  padding: 24px 0;
  font-style: italic;
}

/* Section list */
.imp-section-list { display: flex; flex-direction: column; gap: 1px; }

.imp-check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 2px;
  cursor: pointer;
  transition: background 0.1s;
}
.imp-check-row:hover { background: rgba(28,20,16,0.05); }
.imp-check-row input[type="checkbox"] { cursor: pointer; accent-color: var(--gold); }



.imp-check-label {
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--ink);
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}


.imp-badge {
  font-family: var(--font-head);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ink-ghost);
  background: rgba(28,20,16,0.06);
  border: 1px solid var(--parch-line);
  border-radius: 999px;
  padding: 2px 7px;
  flex-shrink: 0;
}

.imp-notice {
  font-family: var(--font-ui);
  font-size: 10px;
  color: var(--ink-ghost);
  font-style: italic;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--parch-line);
}

/* Progress */
.imp-progress-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.imp-progress-track {
  flex: 1;
  height: 6px;
  background: rgba(28,20,16,0.1);
  border-radius: 3px;
  overflow: hidden;
}
.imp-progress-fill {
  height: 100%;
  background: linear-gradient(to right, var(--blood, #8b1a1a), var(--gold, #b8860b));
  border-radius: 3px;
  transition: width 0.15s ease;
}
.imp-progress-label {
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  white-space: nowrap;
  flex-shrink: 0;
}

/* Log */
.imp-log {
  height: 210px;
  overflow-y: auto;
  background: rgba(28,20,16,0.04);
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.imp-log-line {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  line-height: 1.7;
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--ink-ghost);
}
.imp-log-line.ok   { color: var(--ink-faded); }
.imp-log-line.fail { color: #c05040; font-weight: 600; }

.imp-log-icon { flex-shrink: 0; font-size: 9px; }

.imp-log-spinner { color: var(--gold); font-style: italic; }

@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
.imp-spinner { display: inline-block; animation: spin 1.2s linear infinite; }

/* Done summary */
.imp-done-summary {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--ink-ghost);
  margin-top: 10px;
  text-align: right;
}
.imp-done-ok   { color: #4a8f5a; font-weight: 600; }
.imp-done-fail { color: #c05040; font-weight: 600; }

/* Footer */
.imp-footer { padding: 14px 24px 18px; }

/* Reuse sett-btn styles from parent (not scoped there, so we re-declare) */
.sett-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--parch-dark, #e8dcc5);
  border: 1px solid var(--parch-line, rgba(28,20,16,0.15));
  color: var(--ink-faded);
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.sett-btn:hover:not(:disabled) { color: var(--ink); border-color: var(--gold); }
.sett-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sett-btn--primary {
  background: rgba(139,26,26,0.08);
  border-color: rgba(139,26,26,0.35);
  color: #8b1a1a;
}
.sett-btn--primary:hover:not(:disabled) {
  background: rgba(139,26,26,0.14);
  border-color: #8b1a1a;
  color: #8b1a1a;
}
</style>
