<script setup lang="ts">
/** Adds to the fight: a compendium creature or a token typed by hand, several at once, as enemy or ally, with initiative rolled when the fight runs. */
import { reactive, ref } from 'vue'
import { ADJUSTMENT_LABEL, type Adjustment } from '@/domain/rules/combat'
import type { RulesEntity } from '@/domain/rules/types'
import AppDialog from '@/ui/components/AppDialog.vue'
import { reportError } from '@/ui/dialogs'
import CreaturePicker from '../CreaturePicker.vue'
import type { Cell } from './engine/types'
import { live, placeBlank, placeCreature } from './live'
import { keepTurn } from './turns'

const props = defineProps<{ cell: Cell; start: 'creature' | 'token' }>()
const emit = defineEmits<{ close: [] }>()

const running = live.encounter?.status === 'active'
const tab = ref(props.start)
const picked = ref<RulesEntity | null>(null)
const f = reactive({ count: 1, adjustment: '' as Adjustment | '', ally: false, roll: running, label: '', hp: null as number | null, ac: null as number | null, size: 1, mod: 0 })

async function add() {
  const opts = { count: f.count, spread: true, ally: f.ally, rollInitiative: f.roll, announce: running }
  try {
    keepTurn()
    if (tab.value === 'creature') { if (!picked.value) return; await placeCreature(picked.value.id, props.cell.col, props.cell.row, f.adjustment || null, opts) }
    else await placeBlank({ label: f.label, hpMax: f.hp, ac: f.ac, size: f.size, initiativeModifier: Number(f.mod) || 0 }, props.cell.col, props.cell.row, opts)
    emit('close')
  } catch (err) { reportError('Adding to the encounter', err) }
}
</script>

<template>
  <AppDialog title="Add to the encounter" @close="emit('close')">
    <div class="tabs"><button class="btn" :class="{ 'btn-primary': tab === 'creature' }" @click="tab = 'creature'">From the compendium</button><button class="btn" :class="{ 'btn-primary': tab === 'token' }" data-test="quick-token" @click="tab = 'token'">A token by hand</button></div>
    <template v-if="tab === 'creature'">
      <p v-if="picked" class="picked"><b>{{ picked.name }}</b> <span class="faint">level {{ picked.level }}</span> <button class="btn btn-ghost" @click="picked = null">Change</button></p>
      <CreaturePicker v-else :game="live.game" @pick="picked = $event" />
      <label><span class="label">Version</span><select v-model="f.adjustment" class="input"><option value="">Normal</option><option v-for="(l, k) in ADJUSTMENT_LABEL" :key="k" :value="k">{{ l }}</option></select></label>
    </template>
    <div v-else class="row">
      <label class="grow"><span class="label">Name</span><input v-model="f.label" class="input" placeholder="Bandit" aria-label="Token name" /></label>
      <label><span class="label">HP</span><input v-model.number="f.hp" type="number" class="input num" aria-label="Token HP" /></label>
      <label><span class="label">AC</span><input v-model.number="f.ac" type="number" class="input num" /></label>
      <label><span class="label">Size</span><input v-model.number="f.size" type="number" min="1" class="input num" /></label>
      <label><span class="label">Initiative +</span><input v-model.number="f.mod" type="number" class="input num" /></label>
    </div>
    <div class="row">
      <label><span class="label">How many</span><input v-model.number="f.count" type="number" min="1" max="20" class="input num" aria-label="How many" /></label>
      <label class="dim"><input v-model="f.ally" type="checkbox" /> Ally or summon (no XP)</label>
      <label class="dim"><input v-model="f.roll" type="checkbox" /> Roll initiative</label>
    </div>
    <template #footer>
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn btn-primary" :disabled="tab === 'creature' && !picked" data-test="quick-add-confirm" @click="add">Add</button>
    </template>
  </AppDialog>
</template>

<style scoped>
.tabs, .row { display: flex; gap: .6rem; align-items: end; flex-wrap: wrap; } .grow { flex: 1; } .num { width: 5rem; } .picked { margin: 0; }
</style>
