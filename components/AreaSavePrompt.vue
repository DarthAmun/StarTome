<template>
  <section v-if="prompt && area && effect" class="asp" aria-label="Area saves">
    <header class="asp-head">
      <div class="asp-title">
        <span class="asp-name">{{ area.label }}</span>
        <span class="asp-dc">DC {{ effect.dc }} {{ effect.basic ? 'basic ' : '' }}{{ AREA_SAVE_LABEL[effect.save] }}</span>
        <span v-if="store.areaPrompts.length > 1" class="asp-more" :title="`${store.areaPrompts.length - 1} more waiting`">+{{ store.areaPrompts.length - 1 }}</span>
        <button class="asp-close" title="Dismiss" @click="store.closeAreaPrompt(prompt.id)">✕</button>
      </div>
      <p v-if="prompt.reason" class="asp-reason">{{ prompt.reason }}</p>
    </header>

    <div class="asp-damage">
      <template v-if="effect.damage">
        <span class="asp-label">Damage {{ effect.damage.formula }} {{ effect.damage.type }}</span>
        <input v-model.number="damage" type="number" min="0" class="asp-num" placeholder="—" title="Rolled once for everyone; type it or roll it" />
        <button class="asp-btn" @click="rollDamage">Roll</button>
        <span v-if="damageBreakdown" class="asp-detail">{{ damageBreakdown }}</span>
      </template>
      <span v-else class="asp-detail">No damage, only the results' conditions.</span>
    </div>

    <table class="asp-table">
      <thead>
        <tr><th>Creature</th><th title="Save modifier">Mod</th><th title="The d20 (type a player's roll)">d20</th><th>Result</th><th v-if="effect.damage" title="Damage it takes">Dmg</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.token.id" :class="degreeOf(row) ? `asp-row--${degreeOf(row)}` : ''">
          <td class="asp-who">{{ row.token.label || row.token.name }}<span v-if="row.token.isPlayerToken" class="asp-pc">PC</span></td>
          <td><input v-model.number="row.modifier" type="number" class="asp-num" placeholder="?" /></td>
          <td class="asp-d20">
            <input v-model.number="row.d20" type="number" min="1" max="20" class="asp-num" placeholder="—" />
            <button class="asp-die" title="Roll the d20" @click="row.d20 = rollDie(20)">🎲</button>
          </td>
          <td class="asp-result">
            <template v-if="degreeOf(row)">{{ totalOf(row) }} · {{ DEGREE_LABEL[degreeOf(row)!] }}</template>
            <template v-else>—</template>
            <span v-if="degreeOf(row) && conditionsOf(row).length" class="asp-conds">{{ conditionsOf(row).map(c => c.value === null ? c.name : `${c.name} ${c.value}`).join(', ') }}</span>
          </td>
          <td v-if="effect.damage">
            <input :value="damageOf(row)" type="number" min="0" class="asp-num" placeholder="—" @input="row.damageOverride = numberOrNull(($event.target as HTMLInputElement).value)" />
          </td>
        </tr>
        <tr v-if="!rows.length"><td :colspan="effect.damage ? 5 : 4" class="asp-detail">Nobody is in the area.</td></tr>
      </tbody>
    </table>

    <footer class="asp-foot">
      <button class="asp-btn" :disabled="!rows.some(r => !r.token.isPlayerToken && r.d20 == null)" @click="rollNpcs">Roll NPC saves</button>
      <button class="asp-btn asp-btn--main" :disabled="!rows.some(r => degreeOf(r))" @click="applyAll">Apply results</button>
    </footer>
  </section>
</template>

<script setup lang="ts">
/**
 * Saves against an area (COMBAT_PLAN.md §5): one row per creature inside
 * with its save modifier, the d20 (rolled for NPCs, typed for players),
 * the degree and what it takes. Damage is rolled once for everyone and
 * split by degree for basic saves. Apply puts the damage through temp HP,
 * adds the conditions and logs every save.
 */
import { computed, ref, watch } from 'vue'
import { rulesGet } from '~/composables/useRules'
import type { CharacterMirror } from '~/partylink/port'
import { AREA_SAVE_LABEL, tokensInArea, type AreaCondition } from '~/rules/areas'
import { applyAdjustment } from '~/rules/combat'
import { checkDegree, type Degree } from '~/rules/dcs'
import { basicSaveDamage, DEGREE_LABEL, rollDie, rollExpression } from '~/rules/rolls'
import { useEncounterStore, type EncounterToken } from '~/stores/encounter'
import type { Creature, Hazard, Starship, Vehicle } from '~/types/rules'

const props = defineProps<{
  /** A Play Buddy character's shared numbers, for its saves. */
  pbMirrorOf: (token: EncounterToken) => CharacterMirror | null
}>()
const emit = defineEmits<{ 'apply-damage': [tokenId: number, amount: number, critical: boolean] }>()

const store = useEncounterStore()

interface Row { token: EncounterToken; modifier: number | null; d20: number | null; damageOverride: number | null }

const prompt = computed(() => store.areaPrompts[0] ?? null)
const area = computed(() => prompt.value ? store.current?.areas.find(a => a.id === prompt.value!.areaId) ?? null : null)
const effect = computed(() => area.value?.effect ?? null)

const rows = ref<Row[]>([])
const damage = ref<number | null>(null)
const damageBreakdown = ref('')

// A new prompt: the creatures in it (alive), with their save modifiers
watch(() => prompt.value?.id, async () => {
  damage.value = null
  damageBreakdown.value = ''
  const p = prompt.value, a = area.value, e = effect.value
  if (!p || !a || !e) { rows.value = []; return }
  const all = (store.current?.tokens ?? []).filter(t => !t.isDead && (p.tokenIds != null || t.sensorZone == null))
  const tokens = p.tokenIds ? all.filter(t => p.tokenIds!.includes(t.id)) : tokensInArea(store.areaCells(a), all)
  rows.value = await Promise.all(tokens.map(async t => ({ token: t, modifier: await saveModifier(t, e.save), d20: null, damageOverride: null })))
}, { immediate: true })

// Prompts whose area is gone (removed, expired) close by themselves
watch([prompt, area], ([p, a]) => { if (p && (!a || !a.effect)) store.closeAreaPrompt(p.id) })

async function saveModifier(t: EncounterToken, save: 'fort' | 'ref' | 'will'): Promise<number | null> {
  const mirror = props.pbMirrorOf(t)
  if (mirror?.defenses) return mirror.defenses[save]
  if (!t.linkedRulesId) return null
  const entry = await rulesGet(t.linkedRulesId)
  if (!entry) return null
  const e = applyAdjustment(entry, t.adjustment)
  if (e.kind === 'creature') return (e as Creature).saves[save]
  if (e.kind === 'hazard') return (e as Hazard).saves?.[save] ?? null
  // Vehicles only have Fortitude; Reflex against a collision goes to the pilot
  if (e.kind === 'vehicle') return save === 'fort' ? (e as Vehicle).fort : null
  if (e.kind === 'starship') return (e as Starship).saves[save]
  return null
}

function totalOf(r: Row) {
  return (r.d20 ?? 0) + (r.modifier ?? 0)
}

function degreeOf(r: Row): Degree | null {
  if (!effect.value || r.d20 == null || r.modifier == null || r.d20 < 1 || r.d20 > 20) return null
  return checkDegree(r.d20, r.modifier, effect.value.dc)
}

function damageOf(r: Row): number | null {
  if (r.damageOverride != null) return r.damageOverride
  const d = degreeOf(r), e = effect.value
  if (!d || !e?.damage || damage.value == null) return null
  if (e.basic) return basicSaveDamage(damage.value, d)
  // Not a basic save: the effect's text decides; full damage on a failure is the usual start
  return d === 'failure' || d === 'critical-failure' ? damage.value : 0
}

function conditionsOf(r: Row): AreaCondition[] {
  const d = degreeOf(r)
  return d ? effect.value?.onDegree?.[d] ?? [] : []
}

function numberOrNull(v: string) {
  return v === '' ? null : Math.max(0, Math.floor(Number(v)) || 0)
}

function rollDamage() {
  const f = effect.value?.damage?.formula
  const r = f ? rollExpression(f) : null
  if (!r) return
  damage.value = r.total
  damageBreakdown.value = r.breakdown
}

function rollNpcs() {
  for (const r of rows.value) if (!r.token.isPlayerToken && r.d20 == null) r.d20 = rollDie(20)
}

async function applyAll() {
  const p = prompt.value, a = area.value, e = effect.value
  if (!p || !a || !e) return
  for (const r of rows.value) {
    const d = degreeOf(r)
    if (!d) continue
    await store.logRoll(r.token.id, { label: `${AREA_SAVE_LABEL[e.save]} save vs ${a.label}`, total: totalOf(r), degree: d })
    const amount = damageOf(r) ?? 0
    if (amount > 0) emit('apply-damage', r.token.id, amount, false)
    const conds = conditionsOf(r)
    if (conds.length) await store.addConditions(r.token.id, conds)
  }
  store.closeAreaPrompt(p.id)
}
</script>

<style scoped>
.asp {
  position: absolute; top: 12px; left: 12px; z-index: 32; width: min(460px, calc(100% - 24px)); max-height: calc(100% - 24px); overflow-y: auto;
  background-color: var(--parch); background-image: var(--paper); background-blend-mode: multiply;
  border: 1px solid var(--parch-line); border-radius: 3px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  padding: 10px 12px; color: var(--ink);
}
.asp-title { display: flex; align-items: baseline; gap: 8px; }
.asp-name { font-family: var(--font-head); font-size: 14px; font-weight: 600; }
.asp-dc { flex: 1; font-size: 12px; color: var(--ink-faded); }
.asp-more { font-size: 11px; color: var(--ink-ghost); }
.asp-close { background: none; border: none; color: var(--ink-ghost); cursor: pointer; font-size: 13px; }
.asp-close:hover { color: var(--blood); }
.asp-reason { margin: 2px 0 0; font-size: 12px; font-style: italic; color: var(--ink-faded); }
.asp-damage { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0; }
.asp-label { font-size: 12px; color: var(--ink-faded); }
.asp-detail { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-ghost); }
.asp-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.asp-table th { text-align: left; font-family: var(--font-head); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-ghost); font-weight: 600; padding: 2px 4px; }
.asp-table td { padding: 3px 4px; border-top: 1px solid var(--parch-line); vertical-align: middle; }
.asp-who { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asp-pc { margin-left: 4px; font-size: 9px; color: var(--gold); }
.asp-d20 { white-space: nowrap; }
.asp-num {
  width: 48px; padding: 2px 4px; font-family: var(--font-mono); font-size: 12px;
  border: 1px solid var(--parch-line); border-radius: 2px; background: transparent; color: var(--ink);
}
.asp-die { background: none; border: none; cursor: pointer; font-size: 12px; padding: 0 2px; }
.asp-result { font-size: 12px; }
.asp-conds { display: block; font-size: 10.5px; color: var(--ink-faded); }
.asp-row--critical-success .asp-result { color: var(--gold); }
.asp-row--critical-failure .asp-result { color: var(--blood); }
.asp-foot { display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px; }
.asp-btn {
  font-family: var(--font-head); font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 4px 10px; border: 1px solid var(--parch-line); border-radius: 2px; background: transparent; color: var(--ink); cursor: pointer;
}
.asp-btn:disabled { opacity: 0.45; cursor: default; }
.asp-btn--main { border-color: var(--gold); background: rgba(184,134,11,0.12); }
</style>
