<template>
  <Teleport to="body">
    <div class="pv-dialog-mask" @click.self="emit('close')">
      <div class="pv-dialog eid" role="dialog" aria-label="Earn income">
        <div class="pv-dialog-header">
          <span class="pv-dialog-title">Earn income · {{ character.name }}</span>
          <button class="pv-dialog-close" aria-label="Close" @click="emit('close')">
            <OhVueIcon name="md-close" scale="0.85" />
          </button>
        </div>
        <div class="pv-dialog-content eid-body">
          <div class="eid-row">
            <label class="eid-field">Task level
              <input v-model.number="taskLevel" type="number" min="0" :max="MAX_TASK_LEVEL" class="eid-input" />
            </label>
            <span class="eid-dim">DC {{ dc }}</span>
            <label class="eid-field">Proficiency
              <select v-model="rank" class="eid-input"><option v-for="r in INCOME_RANKS" :key="r" :value="r">{{ r }}</option></select>
            </label>
          </div>

          <div class="eid-row">
            <label class="eid-check"><input v-model="mixed" type="checkbox" /> Day by day (mixed results)</label>
          </div>

          <template v-if="!mixed">
            <div class="eid-row">
              <label class="eid-field">Days <input v-model.number="days" type="number" min="1" class="eid-input" /></label>
              <label class="eid-field">Result
                <select v-model="degree" class="eid-input"><option v-for="d in DEGREES" :key="d" :value="d">{{ DEGREE_LABEL[d] }}</option></select>
              </label>
            </div>
            <div class="eid-row">
              <label class="eid-field">Modifier <input v-model.number="modifier" type="number" class="eid-input" placeholder="+0" /></label>
              <button class="ghost-btn eid-btn" @click="rollCheck">Roll d20</button>
              <span v-if="lastRoll !== null" class="eid-dim">{{ lastRoll }} + {{ modifier || 0 }} = {{ lastRoll + (modifier || 0) }} → {{ DEGREE_LABEL[degree] }}</span>
            </div>
          </template>
          <div v-else class="eid-mixed">
            <label v-for="d in DEGREES" :key="d" class="eid-field">{{ DEGREE_LABEL[d] }}
              <input v-model.number="mixedDays[d]" type="number" min="0" class="eid-input" />
              <span class="eid-dim">{{ money(incomePerDay(game, taskLevel, rank, d)) }}/day</span>
            </label>
          </div>

          <p class="eid-total">
            <template v-if="!mixed">{{ money(incomePerDay(game, taskLevel, rank, degree)) }} per day × {{ days || 0 }} = </template>
            <b>{{ money(total) }}</b> into {{ character.name }}'s purse
          </p>
          <p class="eid-dim">Downtime income goes in as a correction, not as treasure: it shows in what the party owns, not in the wealth %.</p>
        </div>
        <div class="pv-dialog-footer">
          <button class="ghost-btn" @click="emit('close')">Cancel</button>
          <button class="seal-btn" :disabled="!total || saving" @click="apply">Add {{ money(total) }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/** Earn Income for one party member (FEATURES_PLAN §10.4): the pay goes into their purse in one write. */
import { useInventory } from '~/composables/useInventory'
import { checkDegree, type Degree } from '~/rules/dcs'
import { formatMoney } from '~/rules/format'
import { clampTaskLevel, INCOME_RANKS, incomePerDay, incomeTotal, MAX_TASK_LEVEL, taskDc, type IncomeRank } from '~/rules/income'
import { characterOwner } from '~/rules/inventory'
import type { GameId } from '~/types/game'

const props = defineProps<{ campaignId: number; game: GameId; character: { id: number; name: string; level: number } }>()
const emit = defineEmits<{ close: [] }>()

const DEGREES: Degree[] = ['critical-success', 'success', 'failure', 'critical-failure']
const DEGREE_LABEL: Record<Degree, string> = { 'critical-success': 'Critical success', success: 'Success', failure: 'Failure', 'critical-failure': 'Critical failure' }

const taskLevel = ref(clampTaskLevel(props.character.level))
const rank = ref<IncomeRank>('trained')
const days = ref(1)
const degree = ref<Degree>('success')
const modifier = ref<number | null>(null)
const lastRoll = ref<number | null>(null)
const mixed = ref(false)
const mixedDays = reactive<Record<Degree, number>>({ 'critical-success': 0, success: 0, failure: 0, 'critical-failure': 0 })
const saving = ref(false)

const dc = computed(() => taskDc(taskLevel.value, props.game))
const money = (cp: number) => formatMoney({ cp }, props.game)

const total = computed(() => incomeTotal(props.game, taskLevel.value, rank.value, mixed.value
  ? DEGREES.map(d => ({ degree: d, days: Number(mixedDays[d]) || 0 }))
  : [{ degree: degree.value, days: Number(days.value) || 0 }]))

function rollCheck() {
  lastRoll.value = Math.floor(Math.random() * 20) + 1
  degree.value = checkDegree(lastRoll.value, Number(modifier.value) || 0, dc.value)
}

async function apply() {
  saving.value = true
  try {
    await useInventory().adjustPurse(props.campaignId, characterOwner(props.character.id), total.value)
    emit('close')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.eid { width: min(520px, 94vw); }
.eid-body { display: flex; flex-direction: column; gap: 10px; }
.eid-row { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.eid-field { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--text2); }
.eid-input { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 3px 6px; font-size: 13px; width: 110px; }
.eid-check { font-size: 12.5px; color: var(--text2); display: inline-flex; gap: 6px; align-items: center; }
.eid-dim { font-size: 11.5px; color: var(--text3); }
.eid-btn { padding: 3px 12px; font-size: 12px; }
.eid-mixed { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.eid-total { margin: 4px 0 0; font-size: 13.5px; color: var(--text2); }
.eid-total b { color: var(--text); }
</style>
