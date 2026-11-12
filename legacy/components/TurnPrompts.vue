<template>
  <div v-if="store.turnPrompts.length || store.turnNotes.length" class="tp">
    <div v-for="n in store.turnNotes" :key="n.text" class="tp-note">
      <span class="tp-auto">auto</span> {{ tokenName(n.tokenId) }}: {{ n.text }}
    </div>

    <div v-for="p in store.turnPrompts" :key="p.id" class="tp-card">
      <!-- Recovery check -->
      <template v-if="p.kind === 'recovery'">
        <div class="tp-title"><b>{{ p.tokenName }}</b>: recovery check, DC {{ p.dc }} <span class="tp-dim">(dying {{ p.dying }})</span></div>
        <div class="tp-row">
          <button class="tp-btn" @click="rollRecovery(p)">Roll d20</button>
          <span v-if="state(p).roll !== null" class="tp-result">{{ state(p).roll }} → {{ DEGREE_LABEL[flatCheckDegree(state(p).roll!, p.dc)] }}</span>
          <button v-if="state(p).roll !== null" class="tp-btn tp-btn--go" @click="store.resolveRecovery(p.id, flatCheckDegree(state(p).roll!, p.dc))">Apply</button>
        </div>
        <div class="tp-row">
          <span class="tp-dim">Rolled at the table:</span>
          <button v-for="d in DEGREES" :key="d" class="tp-btn tp-btn--small" @click="store.resolveRecovery(p.id, d)">{{ DEGREE_LABEL[d] }}</button>
          <button class="tp-btn tp-btn--small tp-btn--ghost" @click="store.dismissPrompt(p.id)">Dismiss</button>
        </div>
      </template>

      <!-- Persistent damage -->
      <template v-else>
        <div class="tp-title"><b>{{ p.tokenName }}</b>: {{ p.condition }}<template v-if="p.formula">{{ ' ' + p.formula }}</template></div>
        <div class="tp-row">
          <input v-model="state(p).formula" class="tp-input" placeholder="2d6" title="Damage formula" />
          <button class="tp-btn" :disabled="!state(p).formula.trim()" @click="state(p).damage = evaluateFormula(state(p).formula)">Roll</button>
          <label class="tp-dim">Damage <input v-model.number="state(p).damage" type="number" min="0" class="tp-input tp-input--num" /></label>
        </div>
        <div class="tp-row">
          <label class="tp-dim"><input v-model="state(p).assisted" type="checkbox" /> Assisted</label>
          <span class="tp-dim">Flat check DC {{ flatDc(p) }}</span>
          <button class="tp-btn" @click="state(p).check = rollD20()">Roll d20</button>
          <span v-if="state(p).check !== null" class="tp-result">{{ state(p).check }} → {{ ended(p) ? 'ends' : 'continues' }}</span>
          <label class="tp-dim"><input v-model="state(p).recovered" type="checkbox" :disabled="state(p).check !== null" /> Ends</label>
        </div>
        <div class="tp-row">
          <button class="tp-btn tp-btn--go" @click="store.resolvePersistent(p.id, Math.max(0, Number(state(p).damage) || 0), ended(p))">Apply</button>
          <button class="tp-btn tp-btn--ghost" @click="store.dismissPrompt(p.id)">Dismiss</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/** GM-only questions the condition automation asks during combat (FEATURES_PLAN §10.2). */
import { reactive } from 'vue'
import { evaluateFormula } from '~/composables/useFormulaEvaluator'
import { flatCheckDegree, PERSISTENT_ASSISTED_DC, PERSISTENT_DC, type Degree } from '~/rules/turnEffects'
import { useEncounterStore, type TurnPrompt } from '~/stores/encounter'

const store = useEncounterStore()

const DEGREES: Degree[] = ['critical-success', 'success', 'failure', 'critical-failure']
const DEGREE_LABEL: Record<Degree, string> = { 'critical-success': 'Crit success', success: 'Success', failure: 'Failure', 'critical-failure': 'Crit failure' }

interface PromptState { roll: number | null; formula: string; damage: number | null; assisted: boolean; check: number | null; recovered: boolean }
const states = reactive<Record<number, PromptState>>({})

function state(p: TurnPrompt): PromptState {
  return states[p.id] ??= { roll: null, formula: p.kind === 'persistent' ? p.formula : '', damage: null, assisted: false, check: null, recovered: false }
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1
}

function rollRecovery(p: TurnPrompt) {
  state(p).roll = rollD20()
}

function flatDc(p: TurnPrompt) {
  return state(p).assisted ? PERSISTENT_ASSISTED_DC : PERSISTENT_DC
}

function ended(p: TurnPrompt) {
  const s = state(p)
  return s.check !== null ? s.check >= flatDc(p) : s.recovered
}

function tokenName(id: number) {
  const t = store.getToken(id)
  return t ? t.label || t.name : ''
}
</script>

<style scoped>
.tp { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 30; display: flex; flex-direction: column; gap: 6px; width: min(560px, calc(100% - 32px)); pointer-events: none; }
.tp > * { pointer-events: auto; }
.tp-note { font-size: 12px; padding: 4px 10px; border-radius: 6px; background: var(--surface, #1c1c24); border: 1px solid var(--border); color: var(--text2); }
.tp-auto { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text3); margin-right: 4px; }
.tp-card { padding: 8px 12px; border-radius: 8px; background: var(--surface, #1c1c24); border: 1px solid var(--border-hi, var(--border)); border-left: 3px solid #d04a4a; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35); font-size: 12.5px; display: flex; flex-direction: column; gap: 6px; }
.tp-title { color: var(--text); }
.tp-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tp-dim { color: var(--text3); font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px; }
.tp-result { font-family: var(--fm); color: var(--text); }
.tp-btn { padding: 3px 10px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface2, transparent); color: var(--text); cursor: pointer; font-size: 12px; }
.tp-btn:disabled { opacity: 0.45; cursor: default; }
.tp-btn--go { background: var(--accent, #8b2030); border-color: transparent; color: #fff; }
.tp-btn--small { padding: 2px 7px; font-size: 11px; }
.tp-btn--ghost { background: transparent; color: var(--text2); }
.tp-input { width: 90px; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg, transparent); color: var(--text); font-size: 12px; }
.tp-input--num { width: 56px; }
</style>
