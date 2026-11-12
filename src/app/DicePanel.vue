<script setup lang="ts">
/**
 * The dice panel, above the tray: build a pool by clicking dice (right-click
 * takes one out), add a modifier, roll. Every roll made anywhere in the app is
 * listed here, newest first.
 */
import { computed, reactive, ref } from 'vue'
import { Trash2, X } from 'lucide-vue-next'
import { clearRolls, dice, rollDice, runRollAction } from '@/ui/dice'

const DICE = [4, 6, 8, 10, 12, 20, 100] as const
const pool = reactive<Record<number, number>>({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 })
const modifier = ref(0)

const expr = computed(() => {
  const parts = DICE.filter(d => (pool[d] ?? 0) > 0).map(d => `${pool[d]}d${d}`)
  if (!parts.length) return ''
  return parts.join('+') + (modifier.value > 0 ? `+${modifier.value}` : modifier.value < 0 ? `${modifier.value}` : '')
})
const latest = computed(() => dice.history[0] ?? null)

function add(d: number, by: number) { pool[d] = Math.max(0, (pool[d] ?? 0) + by) }
function reset() { for (const d of DICE) pool[d] = 0; modifier.value = 0 }
function roll() { if (expr.value) rollDice(expr.value) }
</script>

<template>
  <section v-if="dice.open" class="dice panel" aria-label="Dice">
    <header>
      <span class="eyebrow">Dice</span>
      <span class="grow" />
      <button v-if="dice.history.length" class="btn btn-ghost btn-icon" title="Clear the history" @click="clearRolls"><Trash2 :size="14" /></button>
      <button class="btn btn-ghost btn-icon" title="Close" @click="dice.open = false"><X :size="15" /></button>
    </header>
    <div class="pool">
      <button v-for="d in DICE" :key="d" class="die" :class="{ on: pool[d] }" :title="`Add a d${d} (right-click removes one)`" @click="add(d, 1)" @contextmenu.prevent="add(d, -1)">
        <span v-if="pool[d]" class="count">{{ pool[d] }}</span>d{{ d }}
      </button>
    </div>
    <div class="row">
      <label class="mod">Modifier <input v-model.number="modifier" type="number" class="input" aria-label="Modifier" /></label>
      <button class="btn" :disabled="!expr && !modifier" @click="reset">Clear</button>
      <button class="btn btn-primary" :disabled="!expr" @click="roll">Roll {{ expr }}</button>
    </div>
    <div v-if="latest" class="result" :class="[latest.tone, { crit: latest.isCrit, fail: latest.isFail }]" data-test="dice-result">
      <div class="label dim">{{ latest.label }}</div>
      <div class="total num">{{ latest.total }}<span v-if="latest.outcome" class="outcome">{{ latest.outcome }}</span></div>
      <div v-if="latest.isCrit" class="call">Natural 20</div>
      <div v-else-if="latest.isFail" class="call">Natural 1</div>
      <div class="faint num">{{ latest.breakdown }}</div>
      <div v-if="latest.detail" class="faint">{{ latest.detail }}</div>
      <div v-if="latest.done" class="done">{{ latest.done }}</div>
      <div v-else-if="latest.actions?.length" class="actions">
        <button v-for="a in latest.actions" :key="a.label" class="btn" :class="{ 'btn-primary': a.primary }" :title="a.title" @click="runRollAction(latest, a)">{{ a.label }}</button>
      </div>
    </div>
    <ol v-if="dice.history.length > 1" class="history">
      <li v-for="r in dice.history.slice(1)" :key="r.id" :class="[r.tone, { crit: r.isCrit, fail: r.isFail }]">
        <span class="num total">{{ r.total }}</span><span class="dim what">{{ r.label }}<template v-if="r.outcome"> · {{ r.outcome }}</template></span>
        <button v-for="a in r.done ? [] : r.actions ?? []" :key="a.label" class="btn mini" :title="a.title" @click="runRollAction(r, a)">{{ a.label }}</button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.dice { position: fixed; left: calc(var(--rail-w) + .8rem); bottom: calc(var(--tray-h) + .6rem); width: 320px; max-height: 70vh; display: flex; flex-direction: column; gap: .6rem; padding: .7rem .8rem; box-shadow: var(--shadow); z-index: 30; border-color: var(--line-strong); }
header, .row { display: flex; align-items: center; gap: .4rem; }
.grow { flex: 1; }
.pool { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.die { position: relative; padding: .45rem 0; background: var(--bg-sunken); border: var(--frame); border-radius: var(--radius); font-family: var(--font-mono); font-size: .8rem; color: var(--text-dim); }
.die.on { border-color: var(--accent); color: var(--text); }
.count { position: absolute; top: -6px; right: -4px; min-width: 16px; padding: 0 3px; border-radius: 8px; background: var(--accent); color: var(--accent-ink); font-size: .68rem; }
.mod { display: flex; align-items: center; gap: .4rem; flex: 1; font-size: .8rem; color: var(--text-faint); }
.mod .input { width: 4.2rem; }
.result { padding: .6rem .7rem; border: var(--frame); border-radius: var(--radius); background: var(--bg-sunken); }
.result .total { font-size: 2rem; line-height: 1.1; }
.outcome { margin-left: .6rem; font-size: .9rem; font-family: var(--font-ui); color: var(--text-dim); }
.call { font-size: .75rem; letter-spacing: .14em; text-transform: uppercase; }
.crit .total, .crit .call, .critical-success .total { color: var(--ok); }
.fail .total, .fail .call, .critical-failure .total { color: var(--danger); }
.failure .total { color: var(--warn); }
.actions { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .5rem; }
.done { margin-top: .4rem; color: var(--ok); font-size: .85rem; }
.history { list-style: none; margin: 0; padding: 0; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
.history li { display: flex; align-items: baseline; gap: .6rem; padding: .15rem .2rem; font-size: .85rem; }
.history .total { min-width: 2.2rem; text-align: right; }
.what { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini { padding: 0 .4rem; font-size: .75rem; }
</style>
