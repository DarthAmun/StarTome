<script setup lang="ts">
/** Earn Income for one party member: task level, proficiency, days and result; the pay goes into their purse. */
import { computed, reactive, ref } from 'vue'
import type { GameId } from '@/domain/game'
import { checkDegree, type Degree } from '@/domain/rules/dcs'
import { formatMoney } from '@/domain/rules/format'
import { clampTaskLevel, INCOME_RANKS, incomePerDay, incomeTotal, MAX_TASK_LEVEL, taskDc, type IncomeRank } from '@/domain/rules/income'
import { characterOwner } from '@/domain/rules/inventory'
import { DEGREE_LABEL } from '@/domain/rules/rolls'
import { adjustPurse } from '@/data/inventory'
import AppDialog from '@/ui/components/AppDialog.vue'
import { reportError } from '@/ui/dialogs'

const props = defineProps<{ campaignId: string; game: GameId; character: { id: string; name: string; level: number } }>()
const emit = defineEmits<{ close: [] }>()

const DEGREES: Degree[] = ['critical-success', 'success', 'failure', 'critical-failure']
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
const total = computed(() => incomeTotal(props.game, taskLevel.value, rank.value, mixed.value ? DEGREES.map(d => ({ degree: d, days: Number(mixedDays[d]) || 0 })) : [{ degree: degree.value, days: Number(days.value) || 0 }]))

function roll() {
  lastRoll.value = Math.floor(Math.random() * 20) + 1
  degree.value = checkDegree(lastRoll.value, Number(modifier.value) || 0, dc.value)
}
async function apply() {
  saving.value = true
  try { await adjustPurse(props.campaignId, characterOwner(props.character.id), total.value); emit('close') }
  catch (err) { reportError('Adding the income', err) } finally { saving.value = false }
}
</script>

<template>
  <AppDialog :title="`Earn income · ${character.name}`" @close="emit('close')">
    <div class="row">
      <label><span class="label">Task level</span><input v-model.number="taskLevel" type="number" min="0" :max="MAX_TASK_LEVEL" class="input num" /></label>
      <span class="faint dc">DC {{ dc }}</span>
      <label><span class="label">Proficiency</span><select v-model="rank" class="input"><option v-for="r in INCOME_RANKS" :key="r" :value="r">{{ r }}</option></select></label>
    </div>
    <label class="dim"><input v-model="mixed" type="checkbox" /> Day by day (mixed results)</label>
    <template v-if="!mixed">
      <div class="row">
        <label><span class="label">Days</span><input v-model.number="days" type="number" min="1" class="input num" /></label>
        <label><span class="label">Result</span><select v-model="degree" class="input"><option v-for="d in DEGREES" :key="d" :value="d">{{ DEGREE_LABEL[d] }}</option></select></label>
      </div>
      <div class="row">
        <label><span class="label">Modifier</span><input v-model.number="modifier" type="number" class="input num" placeholder="+0" /></label>
        <button class="btn" @click="roll">Roll d20</button>
        <span v-if="lastRoll !== null" class="faint">{{ lastRoll }} + {{ modifier || 0 }} = {{ lastRoll + (modifier || 0) }} → {{ DEGREE_LABEL[degree] }}</span>
      </div>
    </template>
    <div v-else class="mixed">
      <label v-for="d in DEGREES" :key="d"><span class="label">{{ DEGREE_LABEL[d] }}</span><input v-model.number="mixedDays[d]" type="number" min="0" class="input num" /> <span class="faint">{{ money(incomePerDay(game, taskLevel, rank, d)) }}/day</span></label>
    </div>
    <p><template v-if="!mixed">{{ money(incomePerDay(game, taskLevel, rank, degree)) }} per day × {{ days || 0 }} = </template><b>{{ money(total) }}</b> into {{ character.name }}'s purse</p>
    <p class="faint">Downtime income goes in as a correction, not as treasure: it shows in what the party owns, not in the wealth %.</p>
    <template #footer>
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn btn-primary" :disabled="!total || saving" @click="apply">Add {{ money(total) }}</button>
    </template>
  </AppDialog>
</template>

<style scoped>
p { margin: 0; }
.row { display: flex; align-items: end; gap: .8rem; flex-wrap: wrap; }
.num { width: 6rem; }
.dc { padding-bottom: .5rem; }
.mixed { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem .8rem; }
</style>
