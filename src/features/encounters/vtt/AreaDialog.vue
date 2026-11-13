<script setup lang="ts">
/** An area's name, colour and effect: save, DC, damage, conditions per degree, and whether it lingers. */
import { reactive } from 'vue'
import { AREA_SAVE_LABEL, AREA_TRIGGER_LABEL, type AreaCondition, type AreaOverlay, type AreaSave, type AreaTrigger } from '@/domain/rules/areas'
import { DEGREE_LABEL } from '@/domain/rules/rolls'
import type { Degree } from '@/domain/rules/dcs'
import AppDialog from '@/ui/components/AppDialog.vue'
import { openAreaPrompt, removeArea, updateArea } from './areasLive'

const props = defineProps<{ area: AreaOverlay }>()
const emit = defineEmits<{ close: [] }>()
const DEGREES: Degree[] = ['critical-success', 'success', 'failure', 'critical-failure']
const text = (list: AreaCondition[] | undefined) => (list ?? []).map(c => (c.value != null ? `${c.name} ${c.value}` : c.name)).join(', ')
const parse = (s: string): AreaCondition[] => s.split(',').map(x => x.trim()).filter(Boolean).map((x) => { const m = /^(.*?)\s+(\d+)$/.exec(x); return m?.[1] ? { name: m[1], value: Number(m[2]) } : { name: x, value: null } })

const a = props.area, e = a.effect
const f = reactive({
  label: a.label, color: a.color, hidden: !!a.hidden, has: !!e, save: (e?.save ?? 'ref') as AreaSave, dc: e?.dc ?? 20, basic: e?.basic ?? true,
  formula: e?.damage?.formula ?? '', type: e?.damage?.type ?? '', on: Object.fromEntries(DEGREES.map(d => [d, text(e?.onDegree?.[d])])) as Record<Degree, string>,
  linger: !!a.lingering, trigger: (a.lingering?.trigger ?? 'turn-start') as AreaTrigger, until: a.lingering?.untilRound ?? null as number | null,
})

function save(ask: boolean) {
  const onDegree = Object.fromEntries(DEGREES.map(d => [d, parse(f.on[d])]).filter(([, list]) => (list as AreaCondition[]).length)) as AreaOverlay['effect'] extends infer E ? E extends { onDegree?: infer O } ? O : never : never
  updateArea(a.id, {
    label: f.label.trim() || a.label, color: f.color, hidden: f.hidden,
    effect: f.has ? { save: f.save, dc: Number(f.dc) || 0, basic: f.basic, damage: f.formula.trim() ? { formula: f.formula.replace(/\s/g, ''), type: f.type.trim() } : null, onDegree } : null,
    lingering: f.has && f.linger ? { trigger: f.trigger, untilRound: f.until || null } : null,
  })
  if (ask && f.has) openAreaPrompt(a.id)
  emit('close')
}
</script>

<template>
  <AppDialog :title="`Area · ${area.label}`" @close="emit('close')">
    <div class="row">
      <label class="grow"><span class="label">Name</span><input v-model="f.label" class="input" /></label>
      <label><span class="label">Colour</span><input v-model="f.color" type="color" /></label>
    </div>
    <label class="dim"><input v-model="f.hidden" type="checkbox" /> Only I see it (a trap, a hidden hazard)</label>
    <label class="dim"><input v-model="f.has" type="checkbox" data-test="area-has-effect" /> It has an effect with a save</label>
    <template v-if="f.has">
      <div class="row">
        <label><span class="label">Save</span><select v-model="f.save" class="input"><option v-for="(l, k) in AREA_SAVE_LABEL" :key="k" :value="k">{{ l }}</option></select></label>
        <label><span class="label">DC</span><input v-model.number="f.dc" type="number" class="input num" aria-label="Save DC" /></label>
        <label class="dim basic"><input v-model="f.basic" type="checkbox" /> basic save</label>
      </div>
      <div class="row">
        <label><span class="label">Damage</span><input v-model="f.formula" class="input" placeholder="6d6" aria-label="Damage formula" /></label>
        <label><span class="label">Type</span><input v-model="f.type" class="input" placeholder="fire" /></label>
      </div>
      <label v-for="d in DEGREES" :key="d"><span class="label">Conditions on a {{ DEGREE_LABEL[d].toLowerCase() }}</span><input v-model="f.on[d]" class="input" placeholder="frightened 1, prone" /></label>
      <label class="dim"><input v-model="f.linger" type="checkbox" /> It stays and asks again when a creature…</label>
      <div v-if="f.linger" class="row">
        <select v-model="f.trigger" class="input"><option v-for="(l, k) in AREA_TRIGGER_LABEL" :key="k" :value="k">{{ l }}</option></select>
        <label><span class="label">Until round</span><input v-model.number="f.until" type="number" min="1" class="input num" placeholder="∞" /></label>
      </div>
    </template>
    <template #footer>
      <button class="btn btn-danger" @click="removeArea(area.id); emit('close')">Remove</button>
      <button class="btn" @click="save(false)">Save</button>
      <button v-if="f.has" class="btn btn-primary" data-test="area-ask-saves" @click="save(true)">Save and ask for saves</button>
    </template>
  </AppDialog>
</template>

<style scoped>
.row { display: flex; gap: .7rem; align-items: end; flex-wrap: wrap; } .grow { flex: 1; } .num { width: 6rem; } .basic { padding-bottom: .5rem; }
</style>
