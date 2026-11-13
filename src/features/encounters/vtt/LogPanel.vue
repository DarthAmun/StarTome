<script setup lang="ts">
/** The combat log, newest first, and a note for the selected token. */
import { computed, ref } from 'vue'
import { ATTACK_LABEL, DEGREE_LABEL } from '@/domain/rules/rolls'
import type { CombatLogEntry } from '@/domain/schema'
import { confirmDialog } from '@/ui/dialogs'
import { clearLog, getToken, live, logLine, type LogDetail } from './live'

const note = ref('')
const lines = computed(() => [...live.log].reverse())

function text(e: CombatLogEntry): string {
  const d = e.detail as LogDetail
  switch (e.type) {
    case 'damage': return `takes ${d.value} damage${d.absorbed ? ` (${d.absorbed} to temporary HP)` : ''}${d.conditionName ? ` from ${d.conditionName.toLowerCase()}` : ''}`
    case 'healing': return `regains ${d.value} HP`
    case 'temp-hp': return `has ${d.value} temporary HP`
    case 'roll': return `${d.note}: ${d.value}${d.degree ? ` · ${(d.attack ? ATTACK_LABEL : DEGREE_LABEL)[d.degree]}` : ''}${d.targetName ? ` vs ${d.targetName}` : ''}`
    case 'condition-added': return `is ${d.conditionName?.toLowerCase()}${d.value != null ? ` ${d.value}` : ''}`
    case 'condition-changed': return `${d.conditionName?.toLowerCase()} is now ${d.value}`
    case 'condition-removed': return `is no longer ${d.conditionName?.toLowerCase()}`
    case 'death': return 'is down'
    case 'revival': return 'is back up'
    case 'timer-up': return `${d.note} is up`
    default: return d.note ?? e.type
  }
}
function add() {
  const t = getToken(live.selectedId)
  if (t && note.value.trim()) { logLine(t, 'note', { note: note.value.trim() }); note.value = '' }
}
async function clear() {
  if (await confirmDialog({ title: 'Clear the combat log?', body: 'Every line of this encounter\'s log is removed.', confirmLabel: 'Clear', danger: true })) clearLog()
}
</script>

<template>
  <section class="log" data-test="combat-log">
    <header><span class="eyebrow">Combat log</span><span class="grow" /><button v-if="live.log.length" class="btn btn-ghost" @click="clear">Clear</button></header>
    <input v-model="note" class="input" :disabled="!live.selectedId" :placeholder="live.selectedId ? `Note for ${getToken(live.selectedId)?.name}…` : 'Select a token to add a note'" @keydown.enter="add" />
    <ol>
      <li v-for="e in lines" :key="e.id" :class="{ auto: (e.detail as LogDetail).auto }"><span class="num r" title="Round">{{ e.round }}</span><b>{{ e.combatantName }}</b> {{ text(e) }}</li>
    </ol>
    <p v-if="!lines.length" class="faint">Nothing yet.</p>
  </section>
</template>

<style scoped>
.log { display: flex; flex-direction: column; gap: .4rem; min-height: 0; padding: .5rem .6rem; }
header { display: flex; align-items: center; } .grow { flex: 1; }
ol { list-style: none; margin: 0; padding: 0; overflow: auto; font-size: .86rem; }
li { padding: .12rem 0; } li.auto { color: var(--text-dim); } .r { display: inline-block; width: 1.5rem; color: var(--text-faint); }
p { margin: 0; }
</style>
