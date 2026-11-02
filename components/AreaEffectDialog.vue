<template>
  <Teleport to="body">
    <div v-if="open && area" class="modal-overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
      <form class="modal-box" @submit.prevent="save(false)">
        <div class="modal-title">Area effect</div>

        <label class="ae-field">
          <span class="f-label">Name</span>
          <input v-model="form.label" class="ae-input" placeholder="Fireball" />
        </label>

        <div class="ae-row">
          <label class="ae-field">
            <span class="f-label">Save</span>
            <select v-model="form.save" class="ae-input">
              <option value="">None</option>
              <option v-for="(label, k) in AREA_SAVE_LABEL" :key="k" :value="k">{{ label }}</option>
            </select>
          </label>
          <label class="ae-field">
            <span class="f-label">DC</span>
            <input v-model.number="form.dc" type="number" min="1" class="ae-input" :disabled="!form.save" />
          </label>
          <label class="ae-check" title="Damage by degree: none / half / full / double">
            <input v-model="form.basic" type="checkbox" class="tem-checkbox" :disabled="!form.save" />
            <span>Basic</span>
          </label>
        </div>

        <div class="ae-row">
          <label class="ae-field ae-field--wide">
            <span class="f-label">Damage</span>
            <input v-model="form.damageFormula" class="ae-input" placeholder="6d6" :disabled="!form.save" />
          </label>
          <label class="ae-field">
            <span class="f-label">Type</span>
            <input v-model="form.damageType" class="ae-input" placeholder="fire" :disabled="!form.save" />
          </label>
        </div>
        <p v-if="form.damageFormula && !damageValid" class="ae-error">The damage doesn't read as dice, e.g. 6d6 or 2d8+4.</p>

        <div v-if="form.save" class="ae-conds">
          <span class="f-label">Conditions by result <span class="f-hint">e.g. "Frightened 1, Prone"</span></span>
          <label v-for="d in DEGREES" :key="d" class="ae-cond-row">
            <span class="ae-cond-label">{{ DEGREE_LABEL[d] }}</span>
            <input v-model="form.conds[d]" class="ae-input" />
          </label>
        </div>

        <div class="ae-row">
          <label class="ae-field ae-field--wide">
            <span class="f-label">Lingers</span>
            <select v-model="form.trigger" class="ae-input" :disabled="!form.save">
              <option value="">No, one save when placed</option>
              <option v-for="(label, k) in AREA_TRIGGER_LABEL" :key="k" :value="k">Save again when a creature {{ label }}</option>
            </select>
          </label>
          <label class="ae-field">
            <span class="f-label">Until round</span>
            <input v-model.number="form.untilRound" type="number" min="1" class="ae-input" placeholder="—" :disabled="!form.trigger" />
          </label>
        </div>

        <div class="flex justify-end gap-2 mt-4">
          <Button severity="secondary" type="button" @click="emit('close')">Cancel</Button>
          <Button severity="secondary" type="submit" :disabled="!valid">Save</Button>
          <Button type="button" :disabled="!valid || !form.save" @click="save(true)">Save &amp; roll saves</Button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * What an area does (COMBAT_PLAN.md §5): the save, its DC and damage, the
 * conditions each result gives, and whether it lingers.
 */
import { computed, reactive, watch } from 'vue'
import { AREA_SAVE_LABEL, AREA_TRIGGER_LABEL, type AreaCondition, type AreaOverlay, type AreaSave, type AreaTrigger } from '~/rules/areas'
import type { Degree } from '~/rules/dcs'
import { DEGREE_LABEL, parseExpression } from '~/rules/rolls'

const props = defineProps<{ open: boolean; area: AreaOverlay | null }>()
const emit = defineEmits<{
  close: []
  save: [changes: Partial<AreaOverlay>, rollNow: boolean]
}>()

const DEGREES: Degree[] = ['critical-success', 'success', 'failure', 'critical-failure']

const form = reactive({
  label: '',
  save: '' as AreaSave | '',
  dc: 20,
  basic: true,
  damageFormula: '',
  damageType: '',
  conds: { 'critical-success': '', success: '', failure: '', 'critical-failure': '' } as Record<Degree, string>,
  trigger: '' as AreaTrigger | '',
  untilRound: null as number | null,
})

watch(() => [props.open, props.area] as const, ([open, a]) => {
  if (!open || !a) return
  const e = a.effect
  Object.assign(form, {
    label: a.label,
    save: e?.save ?? '',
    dc: e?.dc ?? 20,
    basic: e?.basic ?? true,
    damageFormula: e?.damage?.formula ?? '',
    damageType: e?.damage?.type ?? '',
    trigger: a.lingering?.trigger ?? '',
    untilRound: a.lingering?.untilRound ?? null,
  })
  for (const d of DEGREES) form.conds[d] = (e?.onDegree?.[d] ?? []).map(c => c.value === null ? c.name : `${c.name} ${c.value}`).join(', ')
}, { immediate: true })

const damageValid = computed(() => !form.damageFormula.trim() || !!parseExpression(form.damageFormula))
const valid = computed(() => damageValid.value && (!form.save || (Number(form.dc) > 0)))

/** "Frightened 1, prone" → [{ Frightened, 1 }, { Prone, null }]. */
function parseConditions(text: string): AreaCondition[] {
  return text.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.*?)\s+(\d+)$/)
    const name = (m ? m[1] : s).trim()
    return { name: name.charAt(0).toUpperCase() + name.slice(1), value: m ? Number(m[2]) : null }
  })
}

function save(rollNow: boolean) {
  if (!valid.value) return
  const onDegree: NonNullable<NonNullable<AreaOverlay['effect']>['onDegree']> = {}
  for (const d of DEGREES) {
    const list = parseConditions(form.conds[d])
    if (list.length) onDegree[d] = list
  }
  const changes: Partial<AreaOverlay> = {
    label: form.label.trim() || props.area!.label,
    effect: form.save
      ? {
          save: form.save,
          dc: Math.floor(Number(form.dc)),
          basic: form.basic,
          damage: form.damageFormula.trim() ? { formula: form.damageFormula.trim(), type: form.damageType.trim() } : null,
          ...(Object.keys(onDegree).length ? { onDegree } : {}),
        }
      : null,
    lingering: form.save && form.trigger
      ? { trigger: form.trigger, untilRound: form.untilRound && form.untilRound > 0 ? Math.floor(form.untilRound) : null }
      : null,
  }
  emit('save', changes, rollNow && !!form.save)
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
  width: 480px; max-width: 92vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}
.modal-title {
  font-family: var(--font-head); font-size: 14px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase;
  color: var(--ink); margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--parch-line);
}
.ae-row { display: flex; gap: 10px; align-items: flex-end; margin-top: 10px; flex-wrap: wrap; }
.ae-field { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 80px; }
.ae-field--wide { flex: 2; }
.ae-input {
  width: 100%; font-size: 13px; padding: 4px 6px; border: 1px solid var(--parch-line); border-radius: 2px;
  background: transparent; color: var(--ink); font-family: var(--font-body);
}
.ae-input:disabled { opacity: 0.5; }
.ae-check { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink); padding-bottom: 5px; cursor: pointer; }
.ae-conds { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
.ae-cond-row { display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: center; }
.ae-cond-label { font-size: 12px; color: var(--ink-faded); }
.ae-error { font-size: 11px; color: var(--blood); margin: 4px 0 0; }
.f-hint { font-family: var(--font-body); font-size: 10px; font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--ink-ghost); font-style: italic; }
</style>
