<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
      <div class="modal-box qa-box">
        <div class="modal-title">
          Add to the fight
          <span v-if="where" class="qa-where">{{ where }}</span>
        </div>

        <div class="qa-tabs" role="tablist">
          <button class="qa-tab" :class="{ 'qa-tab--active': tab === 'creature' }" role="tab" :aria-selected="tab === 'creature'" @click="tab = 'creature'">Creature</button>
          <button class="qa-tab" :class="{ 'qa-tab--active': tab === 'blank' }" role="tab" :aria-selected="tab === 'blank'" @click="tab = 'blank'">Empty token</button>
        </div>

        <div class="qa-common">
          <label class="qa-field qa-field--count">
            <span class="f-label">Count</span>
            <input v-model.number="count" type="number" min="1" max="8" class="qa-input" />
          </label>
          <label class="qa-check" title="Fights with the party, e.g. a summon. Gives no XP.">
            <input v-model="ally" type="checkbox" class="tem-checkbox" />
            <span>Ally <span class="f-hint">summon, no XP</span></span>
          </label>
        </div>

        <div v-if="tab === 'creature'" class="qa-creatures">
          <CreatureSearchList :game="game" place-label="Add to the fight" @place="onPlace" />
          <p class="f-hint qa-foot">Initiative is rolled on add. Double-click a row or use + to add.</p>
        </div>

        <form v-else class="qa-blank" @submit.prevent="onAddBlank">
          <label class="qa-field">
            <span class="f-label">Name</span>
            <InputText ref="nameRef" v-model="blank.label" placeholder="Summoned wolf, Guard…" />
          </label>
          <div class="qa-row">
            <label class="qa-field">
              <span class="f-label">HP</span>
              <input v-model.number="blank.hpMax" type="number" min="0" class="qa-input" />
            </label>
            <label class="qa-field">
              <span class="f-label">AC</span>
              <input v-model.number="blank.ac" type="number" min="0" class="qa-input" />
            </label>
            <label class="qa-field">
              <span class="f-label">Initiative +</span>
              <input v-model.number="blank.initiativeModifier" type="number" class="qa-input" title="Added to the d20 (Perception)" />
            </label>
            <label class="qa-field">
              <span class="f-label">Size</span>
              <select v-model.number="blank.size" class="qa-input">
                <option v-for="opt in SIZE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </label>
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <Button severity="secondary" type="button" @click="emit('close')">Cancel</Button>
            <Button type="submit" :disabled="!blank.label.trim()">Add</Button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Run mode's quick add (COMBAT_PLAN.md §2): a new enemy or summon from the
 * compendium, or an empty token typed in by hand, joining the fight with
 * rolled initiative. The parent decides where the tokens go.
 */
import { nextTick, reactive, ref, watch } from 'vue'
import type { CreatureOption } from '~/composables/useCreatureSearch'
import type { Adjustment } from '~/rules/combat'
import type { BlankTokenInput } from '~/stores/encounter'
import type { GameId } from '~/types/game'

export interface QuickAddOptions { count: number; ally: boolean }

const props = defineProps<{
  open: boolean
  game: GameId
  /** Where the tokens will appear, e.g. "next to Kyra". */
  where?: string
}>()

const emit = defineEmits<{
  close: []
  'add-creature': [rulesId: string, adjustment: Adjustment | null, opts: QuickAddOptions]
  'add-blank': [input: BlankTokenInput, opts: QuickAddOptions]
}>()

const SIZE_OPTIONS = [
  { value: 1, label: 'Medium or smaller' },
  { value: 2, label: 'Large' },
  { value: 3, label: 'Huge' },
  { value: 4, label: 'Gargantuan' },
]

const tab = ref<'creature' | 'blank'>('creature')
const count = ref(1)
const ally = ref(false)
const blank = reactive<BlankTokenInput>({ label: '', hpMax: null, ac: null, size: 1, initiativeModifier: 0 })
const nameRef = ref<any>(null)

watch(() => props.open, (open) => {
  if (!open) return
  count.value = 1
  ally.value = false
  Object.assign(blank, { label: '', hpMax: null, ac: null, size: 1, initiativeModifier: 0 })
})

watch(tab, async (t) => {
  if (t !== 'blank') return
  await nextTick()
  nameRef.value?.$el?.focus()
})

function opts(): QuickAddOptions {
  return { count: Math.max(1, Math.min(8, Math.floor(Number(count.value) || 1))), ally: ally.value }
}

function onPlace(rec: CreatureOption, adjustment: Adjustment | null) {
  emit('add-creature', rec.id, adjustment, opts())
}

function onAddBlank() {
  if (!blank.label.trim()) return
  emit('add-blank', {
    label: blank.label.trim(),
    hpMax: Number.isFinite(blank.hpMax) && blank.hpMax !== null && blank.hpMax > 0 ? blank.hpMax : null,
    ac: Number.isFinite(blank.ac) && blank.ac !== null && blank.ac > 0 ? blank.ac : null,
    size: blank.size,
    initiativeModifier: Number(blank.initiativeModifier) || 0,
  }, opts())
}
</script>

<style scoped>
/* Copies of the encounter page's modal rules: its scoped styles don't reach child components */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(4, 3, 8, 0.7); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; z-index: var(--z-modal);
}
.modal-box {
  background-color: var(--parch); background-image: var(--paper); background-blend-mode: multiply;
  border: 1px solid var(--parch-line); border-radius: 2px; padding: 24px;
  width: 460px; max-width: 92vw; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}
.modal-title {
  font-family: var(--font-head); font-size: 14px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase;
  color: var(--ink); margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--parch-line);
  display: flex; align-items: baseline; gap: 10px;
}
.qa-where { font-family: var(--font-body); font-size: 11px; letter-spacing: 0; text-transform: none; font-weight: 400; color: var(--ink-ghost); font-style: italic; }
.qa-box { display: flex; flex-direction: column; max-height: 86vh; }
.qa-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.qa-tab {
  flex: 1; font-family: var(--font-head); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
  padding: 5px 0; border: 1px solid var(--parch-line); border-radius: 2px; background: transparent; color: var(--ink-faded); cursor: pointer;
}
.qa-tab--active { border-color: var(--gold); color: var(--ink); background: rgba(184,134,11,0.08); }
.qa-common { display: flex; align-items: flex-end; gap: 16px; margin-bottom: 12px; }
.qa-field { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.qa-field--count { flex: 0 0 70px; }
.qa-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.qa-input {
  width: 100%; font-size: 13px; padding: 4px 6px; border: 1px solid var(--parch-line); border-radius: 2px;
  background: transparent; color: var(--ink); font-family: var(--font-mono);
}
.qa-check { display: flex; align-items: center; gap: 8px; font-family: var(--font-body); font-size: 13px; color: var(--ink); cursor: pointer; padding-bottom: 4px; }
.qa-creatures { display: flex; flex-direction: column; min-height: 0; height: 52vh; }
.qa-foot { margin-top: 8px; }
.qa-blank :deep(input.p-inputtext) { width: 100%; }
.f-hint { font-family: var(--font-body); font-size: 10px; font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--ink-ghost); font-style: italic; }
@media (max-width: 480px) {
  .qa-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
