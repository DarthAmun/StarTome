<template>
  <Teleport to="body" :disabled="inline">
    <!-- Pill trigger (floating mode only) -->
    <button
      v-if="!inline"
      class="dice-fab no-print"
      :class="{ 'dice-fab--open': panelOpen }"
      @click="panelOpen = !panelOpen"
    >
      <OhVueIcon name="fa-dice-d20" scale="1.1" />
      <span>Dice</span>
    </button>

    <!-- Panel -->
    <Transition :name="inline ? '' : 'dp'">
      <div v-if="inline || panelOpen" class="dice-panel no-print" :class="{ 'dice-panel--inline': inline }" @mousedown.stop @keydown.escape="panelOpen = false">
        <!-- Dice grid: 4+3 layout, d100 spans 2 cols -->
        <div class="dp-dice-grid">
          <button
            v-for="d in DICE"
            :key="d"
            class="dp-die-btn"
            :class="{ 'dp-die-btn--active': pool[d] > 0, 'dp-die-btn--wide': d === 100 }"
            @click="addDie(d)"
            @contextmenu.prevent="removeDie(d)"
          >
            <OhVueIcon v-if="DIE_SHAPES[d] === null" :name="DIE_ICON[d]" scale="1.5" class="die-oh-icon" />
            <svg v-else class="die-svg" viewBox="0 0 44 44" v-html="DIE_SHAPES[d]" />
            <span class="die-label">d{{ d }}</span>
            <span v-if="pool[d] > 0" class="die-count">{{ pool[d] }}</span>
          </button>
        </div>

        <!-- Pool summary + modifier -->
        <div class="dp-middle">
          <div class="dp-pool-row">
            <span v-if="poolLabel" class="dp-pool-text">{{ poolLabel }}</span>
            <span v-else class="dp-pool-hint">Click dice · right-click to remove</span>
          </div>
          <div class="dp-modifier-row">
            <span class="dp-mod-label">Modifier</span>
            <button class="dp-mod-btn" @click="modifier--">−</button>
            <input
              type="number"
              class="dp-mod-val"
              :class="modifier > 0 ? 'dp-mod--pos' : modifier < 0 ? 'dp-mod--neg' : 'dp-mod--zero'"
              v-model.number="modifier"
            />
            <button class="dp-mod-btn" @click="modifier++">+</button>
          </div>
        </div>

        <!-- Actions -->
        <div class="dp-actions">
          <button class="dp-btn-clear" @click="clearAll">Clear</button>
          <button class="dp-btn-roll" :disabled="!hasDice" @click="rollDice">
            Roll!
          </button>
        </div>

        <!-- Result -->
        <Transition name="dp-res">
          <div v-if="result" class="dp-result" :class="[{ 'dp-result--crit': result.isCrit, 'dp-result--fail': result.isFail }, result.tone ? `dp-tone--${result.tone}` : '']">
            <div v-if="result.isCrit" class="dp-result-badge dp-result-badge--crit">NAT 20 ✦</div>
            <div v-else-if="result.isFail" class="dp-result-badge dp-result-badge--fail">NAT 1</div>
            <div v-if="result.title" class="dp-result-title">{{ result.title }}</div>
            <div class="dp-result-total">{{ result.total }}</div>
            <div v-if="result.outcome" class="dp-result-outcome">{{ result.outcome }}</div>
            <div v-if="result.detail" class="dp-result-detail">{{ result.detail }}</div>
            <div class="dp-result-breakdown">{{ result.breakdown }}</div>
            <div v-if="result.done" class="dp-done">{{ result.done }}</div>
            <div v-else-if="result.actions?.length" class="dp-actions-row">
              <button v-for="a in result.actions" :key="a.label" class="dp-act" :class="{ 'dp-act--main': a.primary }" :title="a.title" @click="runAction(result, a)">{{ a.label }}</button>
            </div>
          </div>
        </Transition>

        <!-- History: every roll with its dice, newest first -->
        <div v-if="history.length > 1" class="dp-history">
          <div class="dp-history-head">
            History
            <button class="dp-history-clear" title="Clear the history" @click="history = history.slice(0, 1)">Clear</button>
          </div>
          <div v-for="h in history.slice(1)" :key="h.id" class="dp-history-row" :class="h.tone ? `dp-tone--${h.tone}` : ''">
            <div class="dp-history-top">
              <span class="dp-history-label">{{ h.title ?? h.label }}</span>
              <span v-if="h.outcome" class="dp-history-outcome">{{ h.outcome }}</span>
              <span class="dp-history-total" :class="{ 'dp-his--crit': h.isCrit, 'dp-his--fail': h.isFail }">{{ h.total }}</span>
            </div>
            <div class="dp-history-dice">{{ h.breakdown }}<template v-if="h.detail"> · {{ h.detail }}</template></div>
            <div v-if="h.done" class="dp-done">{{ h.done }}</div>
            <div v-else-if="h.actions?.length" class="dp-actions-row">
              <button v-for="a in h.actions" :key="a.label" class="dp-act dp-act--small" :class="{ 'dp-act--main': a.primary }" :title="a.title" @click="runAction(h, a)">{{ a.label }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useDiceRoll, type RollAction, type ShownRoll } from '~/composables/useDiceRoll'

const DICE = [4, 6, 8, 10, 12, 20, 100] as const
type DieSides = typeof DICE[number]

// null = use OhVueIcon instead of inline SVG
const DIE_SHAPES: Record<number, string | null> = {
  4:   '<polygon points="22,2 43,43 1,43" />',
  6:   '<rect x="2" y="2" width="40" height="40" rx="6" />',
  8:   '<polygon points="22,2 42,22 22,42 2,22" />',
  10:  '<polygon points="22,1 41,20 32,43 12,43 3,20" />',
  12:  '<polygon points="22,2 40,15 36,38 8,38 4,15" />',
  20:  null,
  100: '<circle cx="22" cy="22" r="19" /><text x="22" y="27.5" text-anchor="middle" font-size="14" font-weight="bold" class="die-text">%</text>',
}

const DIE_ICON: Record<number, string> = {
  20: 'fa-dice-d20',
}

const props = defineProps<{ inline?: boolean }>()

const panelOpen = ref(false)

const pool = reactive<Record<number, number>>({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 })
const modifier = ref(0)

interface RollResult {
  total: number
  breakdown: string
  label: string
  /** Set for rolls from a stat block: what was rolled. */
  title?: string
  outcome?: string
  tone?: ShownRoll['tone']
  detail?: string
  /** Buttons for what comes next (damage, apply); gone once one ran. */
  actions?: RollAction[]
  /** What the button that ran did. */
  done?: string
  isCrit: boolean
  isFail: boolean
  id: number
}
const HISTORY_SIZE = 30
const history = ref<RollResult[]>([])
/** The newest roll, shown large; the history lists the ones before it. */
const result = computed(() => history.value[0] ?? null)

function pushResult(r: RollResult) {
  history.value = [r, ...history.value].slice(0, HISTORY_SIZE)
}

function runAction(r: RollResult, a: RollAction) {
  const what = a.run()
  // The roll may have added a new one in front; mark this one wherever it is
  const entry = history.value.find(h => h.id === r.id)
  if (entry) entry.done = what || `${a.label} ✓`
}
let nextId = 0

const hasDice = computed(() => DICE.some(d => pool[d] > 0))

const poolLabel = computed(() => {
  const parts = DICE.filter(d => pool[d] > 0).map(d => `${pool[d]}d${d}`)
  if (!parts.length) return ''
  let s = parts.join(' + ')
  if (modifier.value > 0) s += ` + ${modifier.value}`
  else if (modifier.value < 0) s += ` − ${Math.abs(modifier.value)}`
  return s
})


function addDie(sides: DieSides) {
  pool[sides]++
}
function removeDie(sides: DieSides) {
  if (pool[sides] > 0) pool[sides]--
}
function clearAll() {
  DICE.forEach(d => { pool[d] = 0 })
  modifier.value = 0
}

// ── External roll trigger ─────────────────────────────────────
const { pendingRoll, clearPendingRoll, shownRolls, takeShownRolls } = useDiceRoll()

function parseDiceExpression(expr: string): boolean {
  // Normalise: remove spaces, uppercase D → d
  const s = expr.replace(/\s/g, '').replace(/D/g, 'd')
  const tokenRe = /([+-]?)(\d*)d(\d+)|([+-]?\d+)/g
  let matched = false
  const newPool: Record<number, number> = { 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 }
  let newMod = 0
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(s)) !== null) {
    if (m[3] !== undefined) {
      // dice term: e.g. 2d6, d20, -1d8
      const sign = m[1] === '-' ? -1 : 1
      const count = (m[2] ? parseInt(m[2]) : 1) * sign
      const sides = parseInt(m[3])
      if (sides in newPool) newPool[sides] += count
      matched = true
    } else if (m[4] !== undefined) {
      // flat modifier: e.g. +5, -3
      newMod += parseInt(m[4])
      matched = true
    }
  }
  if (!matched) return false
  DICE.forEach(d => { pool[d] = Math.max(0, newPool[d]) })
  modifier.value = newMod
  return true
}

watch(pendingRoll, (expr) => {
  if (!expr) return
  clearPendingRoll()
  if (parseDiceExpression(expr)) {
    panelOpen.value = true
    nextTick(rollDice)
  }
})

// A finished roll from a stat block (useDiceRoll().showRoll)
watch(shownRolls, (list) => {
  if (!list.length) return
  for (const r of takeShownRolls()) {
    pushResult({
      total: r.total, breakdown: r.breakdown, label: r.label, title: r.label, outcome: r.outcome,
      tone: r.tone, detail: r.detail, actions: r.actions,
      isCrit: !!r.isCrit, isFail: !!r.isFail, id: ++nextId,
    })
  }
  panelOpen.value = true
}, { immediate: true })

function rollDice() {
  const rolls: { sides: number; values: number[] }[] = []
  let total = modifier.value

  DICE.forEach(sides => {
    if (!pool[sides]) return
    const values: number[] = []
    for (let i = 0; i < pool[sides]; i++) values.push(Math.floor(Math.random() * sides) + 1)
    rolls.push({ sides, values })
    total += values.reduce((a, b) => a + b, 0)
  })

  const d20Roll = rolls.find(r => r.sides === 20)
  const isCrit = !!d20Roll && d20Roll.values.includes(20)
  const isFail = !!d20Roll && pool[20] === 1 && d20Roll.values[0] === 1

  const breakdown = [
    ...rolls.map(r => `d${r.sides}: [${r.values.join(', ')}]`),
    ...(modifier.value ? [`${modifier.value > 0 ? '+' : ''}${modifier.value}`] : []),
  ].join('  ·  ')

  pushResult({ total, breakdown, label: poolLabel.value, isCrit, isFail, id: ++nextId })
}

</script>

<style scoped>
/* ── Pill trigger ────────────────────────────────────────────── */
.dice-fab {
  position: fixed;
  bottom: 116px;
  right: 20px;
  z-index: 199;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px 8px 12px;
  border-radius: 99px;
  background: var(--surface-solid, var(--bg2));
  border: 1px solid var(--border);
  box-shadow: var(--sh-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--text2);
  transition: all 0.18s;
  user-select: none;
}
.dice-fab:hover {
  border-color: var(--border-hi, var(--border));
  color: var(--text);
}
.dice-fab--open {
  border-color: var(--border-hi, var(--border));
  color: var(--text);
}

/* ── Panel ───────────────────────────────────────────────────── */
.dice-panel {
  position: fixed;
  bottom: 164px;
  right: 20px;
  z-index: 198;
  width: 320px;
  /* Sits 164px above the bottom: never taller than what's left above it */
  max-height: calc(100vh - 184px);
  overflow-y: auto;
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--r3);
  box-shadow: var(--sh-lg);

  --dp-die-bg:          var(--surface);
  --dp-die-border:      var(--border);
  --dp-die-fg:          var(--text3);
  --dp-die-hover-bg:    var(--surface-hi);
  --dp-die-hover-bd:    var(--border-hi);
  --dp-die-hover-fg:    var(--text);
  --dp-active-bg:       var(--accent-bg);
  --dp-active-border:   color-mix(in oklch, var(--accent) 45%, transparent);
  --dp-active-fg:       var(--accent-l);
  --dp-muted:           var(--text3);
  --dp-input-border:    var(--border);
  --dp-input-border-hi: var(--border-hi);
  --dp-input-fg:        var(--text);
  --dp-zero-fg:         var(--text3);
  --dp-roll-bg:         var(--accent-bg);
  --dp-roll-border:     color-mix(in oklch, var(--accent) 45%, transparent);
  --dp-roll-fg:         var(--accent-l);
  --dp-roll-hover-bg:   color-mix(in oklch, var(--accent) 15%, transparent);
  --dp-roll-hover-bd:   var(--accent);
  --dp-roll-hover-sh:   none;
  --dp-mod-hover-bg:    var(--surface-hi);
  --dp-mod-hover-bd:    var(--border-hi);
  --dp-mod-hover-fg:    var(--text);
  --dp-result-bg:       var(--surface);
  --dp-result-border:   var(--border);
  --dp-crit-border:     color-mix(in oklch, var(--accent) 50%, transparent);
  --dp-crit-bg:         var(--accent-bg);
  --dp-crit-shadow:     none;
  --dp-fail-border:     color-mix(in oklch, var(--danger) 40%, transparent);
  --dp-fail-bg:         color-mix(in oklch, var(--danger) 6%, transparent);
  --dp-breakdown-fg:    var(--text2);
  --dp-hist-border:     var(--border);
  --dp-hist-head:       var(--text3);
  --dp-hist-dice:       var(--text3);
  --dp-hist-total:      var(--text);
  --dp-row-border:      var(--border);
}
.dice-panel--inline {
  position: relative;
  bottom: auto; right: auto; z-index: auto;
  width: 100%; height: 100%; max-height: none;
  border-radius: 0; border: none; box-shadow: none;
  overflow-y: auto;
  background: transparent;
}

/* ── Dice grid ───────────────────────────────────────────────── */
.dp-dice-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 7px;
  padding: 12px 12px 8px;
}
.dp-die-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 8px;
  background: var(--dp-die-bg);
  border: 1px solid var(--dp-die-border);
  border-radius: 8px;
  cursor: pointer;
  color: var(--dp-die-fg);
  transition: all 0.15s;
}
.dp-die-btn--wide { grid-column: span 2; }
.dp-die-btn:hover {
  background: var(--dp-die-hover-bg);
  border-color: var(--dp-die-hover-bd);
  color: var(--dp-die-hover-fg);
}
.dp-die-btn--active {
  background: var(--dp-active-bg);
  border-color: var(--dp-active-border);
  color: var(--dp-active-fg);
}

.die-svg {
  width: 28px;
  height: 28px;
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
  stroke-linejoin: round;
}
/* inner mark on d20 */
:deep(.die-inner) { stroke-width: 1; opacity: 0.5; }
/* text label inside d100 */
:deep(.die-text) { fill: currentColor; stroke: none; font-family: inherit; }

.die-oh-icon {
  color: currentColor;
  width: 28px;
  height: 28px;
}
.die-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: 1;
}
.die-count {
  position: absolute;
  top: 3px;
  right: 3px;
  background: var(--accent-l);
  color: var(--bg);
  font-size: 9px;
  font-weight: 800;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Pool + modifier ─────────────────────────────────────────── */
.dp-middle {
  padding: 0 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.dp-pool-row { min-height: 18px; }
.dp-pool-text {
  font-size: 12px;
  color: var(--accent-l);
  font-family: monospace;
  letter-spacing: 0.02em;
}
.dp-pool-hint {
  font-size: 10px;
  color: var(--dp-muted);
  font-style: italic;
}
.dp-modifier-row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.dp-mod-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text3);
  flex: 1;
}
.dp-mod-btn {
  width: 24px; height: 24px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text3);
  font-size: 16px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  line-height: 1;
  transition: all 0.12s;
}
.dp-mod-btn:hover { border-color: var(--border-hi); color: var(--text); background: var(--surface-hi); }
.dp-mod-val {
  font-size: 14px;
  font-weight: 700;
  font-family: monospace;
  width: 48px;
  text-align: center;
  color: var(--text);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r1);
  padding: 2px 4px;
  outline: none;
  -moz-appearance: textfield;
}
.dp-mod-val::-webkit-outer-spin-button,
.dp-mod-val::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
.dp-mod-val:focus { border-color: var(--border-hi); }
.dp-mod--pos { color: var(--success); }
.dp-mod--neg { color: var(--danger); }
.dp-mod--zero { color: var(--text3); }

/* ── Actions ─────────────────────────────────────────────────── */
.dp-actions {
  display: flex;
  gap: 8px;
  padding: 0 12px 12px;
}
.dp-btn-clear {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--r1);
  background: transparent;
  color: var(--text3);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.15s;
}
.dp-btn-clear:hover { background: var(--surface-hi); color: var(--text); }
.dp-btn-roll {
  flex: 2;
  padding: 8px;
  border: 1px solid var(--dp-roll-border);
  border-radius: var(--r1);
  background: var(--dp-roll-bg);
  color: var(--dp-roll-fg);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: all 0.15s;
}
.dp-btn-roll:hover:not(:disabled) {
  background: var(--dp-roll-hover-bg);
  border-color: var(--dp-roll-hover-bd);
  box-shadow: var(--dp-roll-hover-sh);
}
.dp-btn-roll:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Result ──────────────────────────────────────────────────── */
.dp-result {
  margin: 0 12px 10px;
  padding: 14px 12px 12px;
  background: var(--dp-result-bg);
  border: 1px solid var(--dp-result-border);
  border-radius: var(--r2);
  text-align: center;
}
.dp-result--crit {
  border-color: var(--dp-crit-border);
  background: var(--dp-crit-bg);
  box-shadow: var(--dp-crit-shadow);
}
.dp-result--fail {
  border-color: var(--dp-fail-border);
  background: var(--dp-fail-bg);
}
.dp-result-badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.dp-result-badge--crit { color: var(--accent-l); }
.dp-result-badge--fail { color: var(--danger); }
.dp-result-total {
  font-size: 48px;
  font-weight: 700;
  font-family: var(--font-head, serif);
  color: var(--accent-l);
  line-height: 1;
  margin-bottom: 6px;
}
.dp-result--fail .dp-result-total { color: var(--danger); }
.dp-result-title { font-size: 12px; font-weight: 600; color: var(--text2); margin-bottom: 4px; }
.dp-result-outcome { font-size: 12px; color: var(--text); margin-bottom: 4px; }
.dp-result-breakdown {
  font-size: 11px;
  color: var(--dp-breakdown-fg);
  font-family: monospace;
  line-height: 1.5;
  word-break: break-all;
}

/* ── History ─────────────────────────────────────────────────── */
.dp-history {
  border-top: 1px solid var(--dp-hist-border);
  padding: 8px 12px 12px;
}
/* The floating panel keeps its dice and newest roll in view; older rolls scroll */
.dice-panel:not(.dice-panel--inline) .dp-history { max-height: 30vh; overflow-y: auto; }
.dp-history-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--dp-hist-head);
  margin-bottom: 6px;
}
.dp-history-clear {
  background: none; border: none; cursor: pointer; padding: 0;
  font: inherit; letter-spacing: inherit; text-transform: inherit; color: var(--text3, var(--dp-hist-head));
}
.dp-history-clear:hover { color: var(--danger); }
.dp-history-row {
  padding: 5px 0 5px 6px;
  border-bottom: 1px solid var(--dp-row-border);
  border-left: 2px solid transparent;
  font-size: 11px;
}
.dp-history-row:last-child { border-bottom: none; }
.dp-history-top { display: flex; align-items: baseline; gap: 6px; }
.dp-history-label { flex: 1; min-width: 0; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dp-history-outcome { font-size: 10px; color: var(--text); white-space: nowrap; }
.dp-history-dice { color: var(--dp-hist-dice); font-family: monospace; font-size: 10px; margin-top: 1px; overflow-wrap: anywhere; }
.dp-history-total { font-weight: 700; color: var(--dp-hist-total); }
/* Degree of success: a colored edge, gold for criticals */
.dp-tone--critical-success { border-left-color: var(--accent-l); }
.dp-tone--success { border-left-color: var(--success, #4a8a3a); }
.dp-tone--failure { border-left-color: var(--text3, #777); }
.dp-tone--critical-failure { border-left-color: var(--danger); }
.dp-result.dp-tone--critical-success, .dp-result.dp-tone--success,
.dp-result.dp-tone--failure, .dp-result.dp-tone--critical-failure { border-left-width: 3px; }
.dp-result-detail { font-size: 11px; color: var(--text2); margin-bottom: 4px; }
.dp-actions-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 8px; }
.dp-history .dp-actions-row { justify-content: flex-start; margin-top: 4px; }
.dp-act {
  font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--border); background: transparent; color: var(--text);
}
.dp-act:hover { border-color: var(--border-hi, var(--border)); background: var(--surface); }
.dp-act--main { border-color: var(--accent-l); color: var(--accent-l); }
.dp-act--small { font-size: 10px; padding: 2px 7px; }
.dp-done { font-size: 11px; font-style: italic; color: var(--text2); margin-top: 6px; }
.dp-his--crit { color: var(--accent-l); }
.dp-his--fail { color: var(--danger); }

/* ── Transitions ─────────────────────────────────────────────── */
.dp-enter-active { transition: opacity 0.2s, transform 0.22s cubic-bezier(0.34,1.56,0.64,1); transform-origin: bottom right; }
.dp-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; transform-origin: bottom right; }
.dp-enter-from, .dp-leave-to { opacity: 0; transform: scale(0.88) translateY(8px); }

.dp-res-enter-active { transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1); }
.dp-res-enter-from { opacity: 0; transform: scale(0.75); }
</style>
