<script setup lang="ts">
/** What the automation asks at a turn change: recovery checks and persistent damage; and the reminders for whoever acts. */
import { reactive } from 'vue'
import type { Degree } from '@/domain/rules/dcs'
import { DEGREE_LABEL, rollExpression } from '@/domain/rules/rolls'
import { flatCheckDegree, PERSISTENT_ASSISTED_DC, PERSISTENT_DC } from '@/domain/rules/turnEffects'
import { live } from './live'
import { dismissPrompt, resolvePersistent, resolveRecovery } from './turns'

const DEGREES: Degree[] = ['critical-success', 'success', 'failure', 'critical-failure']
const draft = reactive<Record<number, { damage: string; assisted: boolean }>>({})
const of = (id: number) => (draft[id] ??= { damage: '', assisted: false })
const d20 = () => Math.floor(Math.random() * 20) + 1

function rollRecovery(id: number, dc: number) { resolveRecovery(id, flatCheckDegree(d20(), dc)) }
function rollDamage(id: number, formula: string) { const r = rollExpression(formula); if (r) of(id).damage = String(r.total) }
function persistent(id: number, recovered: boolean) { resolvePersistent(id, Math.max(0, Number(of(id).damage) || 0), recovered) }
function rollFlat(id: number) { const dc = of(id).assisted ? PERSISTENT_ASSISTED_DC : PERSISTENT_DC; persistent(id, d20() >= dc) }
</script>

<template>
  <div v-if="live.turnPrompts.length || live.turnNotes.length" class="prompts" data-test="turn-prompts">
    <p v-for="n in live.turnNotes" :key="n.text" class="note">{{ n.text }}</p>
    <div v-for="p in live.turnPrompts" :key="p.id" class="prompt">
      <template v-if="p.kind === 'recovery'">
        <b>{{ p.tokenName }}</b> is dying {{ p.dying }}: recovery check, flat DC {{ p.dc }}
        <span class="btns">
          <button class="btn btn-primary" data-test="roll-recovery" @click="rollRecovery(p.id, p.dc)">Roll</button>
          <button v-for="d in DEGREES" :key="d" class="btn" :title="DEGREE_LABEL[d]" @click="resolveRecovery(p.id, d)">{{ DEGREE_LABEL[d] }}</button>
        </span>
      </template>
      <template v-else>
        <b>{{ p.tokenName }}</b> takes {{ p.condition.toLowerCase() }}{{ p.formula ? ` (${p.formula})` : '' }}
        <span class="btns">
          <button v-if="p.formula" class="btn" @click="rollDamage(p.id, p.formula)">Roll damage</button>
          <input v-model="of(p.id).damage" class="input num" placeholder="dmg" :aria-label="`Persistent damage to ${p.tokenName}`" />
          <label class="faint"><input v-model="of(p.id).assisted" type="checkbox" /> assisted (DC {{ PERSISTENT_ASSISTED_DC }})</label>
          <button class="btn btn-primary" :title="`Flat check DC ${of(p.id).assisted ? PERSISTENT_ASSISTED_DC : PERSISTENT_DC}`" @click="rollFlat(p.id)">Roll flat check</button>
          <button class="btn" @click="persistent(p.id, true)">It ends</button>
          <button class="btn" @click="persistent(p.id, false)">It stays</button>
        </span>
      </template>
      <button class="btn btn-ghost" title="Leave it to me" @click="dismissPrompt(p.id)">Skip</button>
    </div>
  </div>
</template>

<style scoped>
.prompts { position: absolute; left: 50%; bottom: .8rem; transform: translateX(-50%); z-index: 5; display: flex; flex-direction: column; gap: .35rem; max-width: min(46rem, 92%); }
.prompt, .note { margin: 0; padding: .45rem .7rem; background: var(--bg-raised); border: 1px solid var(--accent); border-radius: var(--radius); box-shadow: var(--shadow); display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
.note { border-color: var(--line-strong); color: var(--text-dim); font-size: .9rem; }
.btns { display: flex; gap: .3rem; align-items: center; flex-wrap: wrap; } .num { width: 4.2rem; }
</style>
