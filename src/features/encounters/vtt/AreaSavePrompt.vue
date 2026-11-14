<script setup lang="ts">
/**
 * An area's saves: one row per creature inside. Creatures with a stat block
 * get their modifier, NPC saves can be rolled at once, players' rolls are
 * typed. The damage is rolled once and split by each degree of success.
 */
import { computed, ref, watch } from 'vue'
import { AREA_SAVE_LABEL, tokensInArea, type AreaCondition, type AreaSave } from '@/domain/rules/areas'
import { applyAdjustment } from '@/domain/rules/combat'
import { conditionInfo } from '@/domain/rules/conditions'
import { checkDegree, type Degree } from '@/domain/rules/dcs'
import { basicSaveDamage, DEGREE_LABEL, rollDie, rollExpression } from '@/domain/rules/rolls'
import { statLinkOf, type Token } from '@/data/encounters'
import { rulesGet } from '@/data/rules'
import AppDialog from '@/ui/components/AppDialog.vue'
import { areaCells, asAreaToken, closeAreaPrompt } from './areasLive'
import { addConditions, applyDamage, areas, live, logLine, mapTokens } from './live'
import { sharedOf } from './linkLive'
import { defenses } from './starshipLive'

interface Row { token: Token; modifier: number | null; d20: number | null; damageOverride: number | null }

const prompt = computed(() => live.areaPrompts[0] ?? null)
const area = computed(() => areas().find(a => a.id === prompt.value?.areaId) ?? null)
const effect = computed(() => area.value?.effect ?? null)
const rows = ref<Row[]>([])
const damage = ref<number | null>(null)
const breakdown = ref('')

async function saveModifier(t: Token, save: AreaSave): Promise<number | null> {
  // The party's starship: its sheet with the helmed bonuses; any crew member rolls it
  if (t.sensor?.role === 'player-ship') return defenses.value?.saves[save] ?? null
  // A linked player's save is the one their app reports
  const shared = sharedOf(t)?.defenses
  if (shared) return shared[save]
  const link = statLinkOf(t), entry = link ? await rulesGet(link.rulesId) : undefined
  if (!entry || !link) return null
  const e = applyAdjustment(entry, link.adjustment)
  if (e.kind === 'creature') return e.saves[save]
  if (e.kind === 'hazard') return e.saves?.[save] ?? null
  // Vehicles only have Fortitude; Reflex against a collision goes to the pilot
  if (e.kind === 'vehicle') return save === 'fort' ? e.fort : null
  if (e.kind === 'starship') return e.saves[save]
  return null
}

watch(() => prompt.value?.id, async () => {
  damage.value = null
  breakdown.value = ''
  const p = prompt.value, a = area.value, e = effect.value
  if (!p || !a || !e) { rows.value = []; return }
  // Named tokens may stand on the sensor map; "everyone inside" is about the battle map
  const alive = (p.tokenIds ? live.tokens : mapTokens()).filter(t => !t.dead)
  const inside = new Set(tokensInArea(areaCells(a), alive.map(asAreaToken)).map(t => t.id))
  const tokens = p.tokenIds ? alive.filter(t => p.tokenIds?.includes(t.id)) : alive.filter(t => inside.has(t.id))
  rows.value = await Promise.all(tokens.map(async t => ({ token: t, modifier: await saveModifier(t, e.save), d20: null, damageOverride: null })))
}, { immediate: true })
// A prompt whose area is gone (removed, expired) closes by itself
watch([prompt, area], ([p, a]) => { if (p && !a?.effect) closeAreaPrompt(p.id) })

function degreeOf(r: Row): Degree | null {
  if (!effect.value || r.d20 == null || r.modifier == null || r.d20 < 1 || r.d20 > 20) return null
  return checkDegree(r.d20, r.modifier, effect.value.dc)
}
function damageOf(r: Row): number | null {
  if (r.damageOverride != null) return r.damageOverride
  const d = degreeOf(r), e = effect.value
  if (!d || !e?.damage || damage.value == null) return null
  if (e.basic) return basicSaveDamage(damage.value, d)
  // Not a basic save: full damage on a failure is the usual start; the field corrects it
  return d === 'failure' || d === 'critical-failure' ? damage.value : 0
}
const conditionsOf = (r: Row): AreaCondition[] => { const d = degreeOf(r); return d ? effect.value?.onDegree?.[d] ?? [] : [] }
const num = (v: string): number | null => (v === '' ? null : Math.floor(Number(v)) || 0)

function rollDamage() {
  const r = effect.value?.damage?.formula ? rollExpression(effect.value.damage.formula) : null
  if (r) { damage.value = r.total; breakdown.value = r.breakdown }
}
function rollNpcs() { for (const r of rows.value) if (!r.token.playerToken && r.d20 == null) r.d20 = rollDie(20) }

function applyAll() {
  const p = prompt.value, a = area.value, e = effect.value
  if (!p || !a || !e) return
  for (const r of rows.value) {
    const d = degreeOf(r)
    if (!d) continue
    logLine(r.token, 'roll', { note: `${AREA_SAVE_LABEL[e.save]} save vs ${a.label}`, value: (r.d20 ?? 0) + (r.modifier ?? 0), degree: d })
    const amount = damageOf(r) ?? 0
    if (amount > 0) applyDamage(r.token.id, amount, e.damage?.type ? { type: e.damage.type } : {})
    addConditions(r.token.id, conditionsOf(r), (name) => { const info = conditionInfo(name); return info ? { color: info.color, icon: info.icon } : {} })
  }
  closeAreaPrompt(p.id)
}
</script>

<template>
  <AppDialog v-if="prompt && area && effect" :title="area.label" wide @close="closeAreaPrompt(prompt.id)">
    <p v-if="prompt.reason" class="dim">{{ prompt.reason }}</p>
    <p><b>DC {{ effect.dc }} {{ effect.basic ? 'basic ' : '' }}{{ AREA_SAVE_LABEL[effect.save] }}</b>
      <template v-if="effect.damage"> · {{ effect.damage.formula }} {{ effect.damage.type }}
        <button class="btn" data-test="area-roll-damage" @click="rollDamage">Roll damage</button>
        <input class="input num small" :value="damage ?? ''" aria-label="Damage rolled" placeholder="dmg" @change="damage = num(($event.target as HTMLInputElement).value)" />
        <span v-if="breakdown" class="faint">{{ breakdown }}</span>
      </template>
    </p>
    <table v-if="rows.length">
      <thead><tr><th>Creature</th><th>Modifier</th><th>d20</th><th>Result</th><th>Damage</th><th>Conditions</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.token.id" :data-save="r.token.name">
          <td :class="{ party: r.token.playerToken }">{{ r.token.name }}</td>
          <td><input class="input num small" :value="r.modifier ?? ''" :aria-label="`Save modifier of ${r.token.name}`" placeholder="+0" @change="r.modifier = num(($event.target as HTMLInputElement).value)" /></td>
          <td><input class="input num small" :value="r.d20 ?? ''" :aria-label="`d20 of ${r.token.name}`" :placeholder="r.token.playerToken ? 'their roll' : '–'" @change="r.d20 = num(($event.target as HTMLInputElement).value)" /></td>
          <td :class="degreeOf(r)">{{ degreeOf(r) ? `${(r.d20 ?? 0) + (r.modifier ?? 0)} · ${DEGREE_LABEL[degreeOf(r)!]}` : '–' }}</td>
          <td><input class="input num small" :value="damageOf(r) ?? ''" :aria-label="`Damage to ${r.token.name}`" @change="r.damageOverride = num(($event.target as HTMLInputElement).value)" /></td>
          <td class="dim">{{ conditionsOf(r).map(c => (c.value != null ? `${c.name} ${c.value}` : c.name)).join(', ') }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="faint">Nobody stands in it.</p>
    <template #footer>
      <button class="btn" @click="rollNpcs">Roll NPC saves</button>
      <button class="btn" @click="closeAreaPrompt(prompt.id)">Skip</button>
      <button class="btn btn-primary" data-test="area-apply" @click="applyAll">Apply to all</button>
    </template>
  </AppDialog>
</template>

<style scoped>
p { margin: 0; display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
table { border-collapse: collapse; width: 100%; } th { text-align: left; font-size: .75rem; color: var(--text-faint); font-weight: 500; } td, th { padding: .2rem .4rem; }
.small { width: 4.6rem; } .party { color: #3bbfa8; }
.critical-success { color: #5fc98a; } .success { color: #9bd17a; } .failure { color: #e8924a; } .critical-failure { color: var(--danger); }
</style>
