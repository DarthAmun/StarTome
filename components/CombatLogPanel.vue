<template>
  <div class="combat-log">
      <div class="log-note-bar">
        <select v-model="logNoteTokenId" class="log-note-select">
          <option :value="null" disabled>Token…</option>
          <option v-for="t in store.current?.tokens ?? []" :key="t.id" :value="t.id">{{ t.label || t.name }}</option>
        </select>
        <input v-model="logNoteText" class="log-note-input" placeholder="Note…" @keyup.enter="submitLogNote" />
        <button class="log-note-add" :disabled="!logNoteTokenId || !logNoteText.trim()" @click="submitLogNote">+</button>
      </div>
      <div class="log-entries">
        <div v-if="!store.current?.combatLog.length" class="log-empty">No events yet this session.</div>
        <div v-for="entry in reversedLog" :key="entry.id" class="log-row">
          <span class="log-round-badge">R{{ entry.round }}</span>
          <span class="log-token-name">{{ entry.tokenName }}</span>
          <span class="log-event" :class="`log-event--${entry.type}`">
            <template v-if="entry.type === 'damage'">took {{ entry.value }} damage</template>
            <template v-else-if="entry.type === 'healing'">healed {{ entry.value }} HP</template>
            <template v-else-if="entry.type === 'condition-added'">gained {{ entry.conditionName }}</template>
            <template v-else-if="entry.type === 'condition-removed'">lost {{ entry.conditionName }}</template>
            <template v-else-if="entry.type === 'death'">fell unconscious ☠</template>
            <template v-else-if="entry.type === 'revival'">revived</template>
            <template v-else-if="entry.type === 'note'">{{ entry.note }}</template>
            <template v-else-if="entry.type === 'timer-up'">⏳ {{ entry.note }} is up</template>
          </span>
        </div>
      </div>
      <div class="log-footer">
        <button class="log-clear-btn" @click="emit('clear')">Clear Log</button>
      </div>
  </div>
</template>

<script setup lang="ts">
/** The encounter page's Run-mode log: add a note to a token, read the round-by-round events, ask to clear. */
import { computed, ref } from 'vue'
import { useEncounterStore } from '~/stores/encounter'

const emit = defineEmits<{ clear: [] }>()
const store = useEncounterStore()

const logNoteTokenId = ref<number | null>(null)
const logNoteText = ref('')
const reversedLog = computed(() => [...(store.current?.combatLog ?? [])].reverse())

function submitLogNote() {
  if (!logNoteTokenId.value || !logNoteText.value.trim()) return
  store.addLogNote(logNoteTokenId.value, logNoteText.value.trim())
  logNoteText.value = ''
}
</script>

<style scoped>
.combat-log { display: contents; }
.log-note-bar {
  display: flex;
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--parch-line);
  flex-shrink: 0;
}
.log-note-select {
  flex: 0 0 90px;
  font-size: 11px;
  padding: 3px 4px;
  border: 1px solid var(--parch-line);
  border-radius: 3px;
  background: var(--parch);
  color: var(--ink);
  font-family: var(--font-ui);
}
.log-note-input {
  flex: 1;
  font-size: 11px;
  padding: 3px 6px;
  border: 1px solid var(--parch-line);
  border-radius: 3px;
  background: var(--parch);
  color: var(--ink);
  font-family: var(--font-ui);
}
.log-note-input::placeholder { color: var(--ink-ghost); }
.log-note-add {
  flex: 0 0 26px;
  height: 26px;
  border: 1px solid var(--parch-line);
  border-radius: 3px;
  background: var(--parch);
  color: var(--ink-ghost);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.log-note-add:not(:disabled):hover { color: var(--ink); border-color: var(--gold); }
.log-note-add:disabled { opacity: 0.35; cursor: not-allowed; }
.log-entries {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}
.log-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 11px;
  color: var(--ink-ghost);
  font-style: italic;
}
.log-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 10px;
  font-size: 11px;
  line-height: 1.4;
  border-bottom: 1px solid rgba(28,20,16,0.04);
}
.log-row:last-child { border-bottom: none; }
.log-round-badge {
  flex: 0 0 auto;
  background: var(--parch-dark, rgba(28,20,16,0.08));
  color: var(--ink-ghost);
  font-family: 'Cinzel', serif;
  font-size: 8px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 2px;
  letter-spacing: 0.04em;
}
.log-token-name {
  flex: 0 0 auto;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-faded);
  font-style: italic;
  font-size: 10px;
}
.log-event { flex: 1; }
.log-event--damage        { color: var(--blood); }
.log-event--healing       { color: var(--grass); }
.log-event--condition-added  { color: var(--arcane-l, #9f7abf); }
.log-event--condition-removed { color: var(--ink-ghost); }
.log-event--death         { color: var(--blood); font-weight: 700; }
.log-event--revival       { color: var(--grass); }
.log-event--note          { color: var(--ink-faded); font-style: italic; }
.log-footer {
  padding: 8px 10px;
  border-top: 1px solid var(--parch-line);
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}
.log-clear-btn {
  background: none;
  border: 1px solid var(--parch-line);
  border-radius: 3px;
  padding: 3px 12px;
  font-family: 'Cinzel', serif;
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  cursor: pointer;
}
.log-clear-btn:hover { border-color: var(--blood); color: var(--blood); }
</style>
