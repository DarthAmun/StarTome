<script setup lang="ts">
/**
 * A token's conditions: add from the list or type one (also "Persistent fire
 * 2d6"), raise and lower values, hide one from the players, pick its colour.
 * The reminder under each name is a summary; the name opens the rules text.
 */
import { computed, ref } from 'vue'
import { EyeOff, Eye, Minus, Plus, X } from 'lucide-vue-next'
import { builtinConditions, conditionInfo, getConditionColor, type TokenCondition } from '@/domain/rules/conditions'
import { parsePersistent } from '@/domain/rules/turnEffects'
import type { Token } from '@/data/encounters'
import { rulesFindByName } from '@/data/rules'
import AppDialog from '@/ui/components/AppDialog.vue'
import { notify } from '@/ui/dialogs'
import { peek } from '@/ui/workbench'
import { live, updateToken } from './live'
import { conditionColor } from './scene'

const props = defineProps<{ token: Token }>()
const emit = defineEmits<{ close: [] }>()

const search = ref('')
const all = computed(() => builtinConditions(live.game).filter(c => c.name !== 'Persistent Damage'))
const has = (name: string) => props.token.conditions.some(c => c.name.toLowerCase() === name.toLowerCase())
const offered = computed(() => { const q = search.value.trim().toLowerCase(); return all.value.filter(c => !has(c.name) && (!q || c.name.toLowerCase().includes(q))) })
/** What the typed text adds when it is no known condition: persistent damage, or a condition of your own. */
const typed = computed(() => {
  const q = search.value.trim()
  if (!q || all.value.some(c => c.name.toLowerCase() === q.toLowerCase()) || has(q)) return null
  const p = parsePersistent(q)
  if (p) return { ...p, label: `${p.name} (${p.formula} each turn)` }
  const m = /^(.*?)\s+(\d+)$/.exec(q)
  return m?.[1] ? { name: m[1], value: Number(m[2]), label: q } : { name: q, label: q }
})

const write = (conditions: TokenCondition[]) => updateToken(props.token.id, { conditions })
function add(name: string, value: number | null = null, formula?: string) {
  const info = conditionInfo(name)
  write([...props.token.conditions, { name, value: value ?? (info?.valued ? 1 : null), color: info?.color ?? getConditionColor(name), ...(info ? { icon: info.icon } : {}), ...(formula ? { formula } : {}) }])
  search.value = ''
}
function addTyped() { const t = typed.value; if (t) add(t.name, 'value' in t ? t.value ?? null : null, 'formula' in t ? t.formula : undefined) }
const change = (name: string, patch: Partial<TokenCondition>) => write(props.token.conditions.map(c => (c.name === name ? { ...c, ...patch } : c)))
const remove = (name: string) => write(props.token.conditions.filter(c => c.name !== name))
function step(c: TokenCondition, by: number) {
  const next = (c.value ?? 0) + by
  if (next <= 0) remove(c.name)
  else change(c.name, { value: next })
}
async function rules(name: string) {
  const e = await rulesFindByName('condition', /^persistent/i.test(name) ? 'Persistent Damage' : name, live.game)
  if (e) peek({ kind: 'rules', id: e.id })
  else notify('The compendium has no entry for this condition. Sync it for the full rules text.')
}
</script>

<template>
  <AppDialog :title="`Conditions · ${token.name}`" @close="emit('close')">
    <ul class="have" data-test="token-conditions">
      <li v-for="c in token.conditions" :key="c.name" :data-condition="c.name">
        <input type="color" :value="conditionColor(c)" :aria-label="`Colour of ${c.name}`" @change="change(c.name, { color: ($event.target as HTMLInputElement).value })" />
        <span class="what"><button class="name" title="Rules text" @click="rules(c.name)">{{ c.name }}</button><small class="faint">{{ conditionInfo(c.name)?.desc }}</small></span>
        <input v-if="/^persistent/i.test(c.name)" class="input formula" :value="c.formula ?? ''" placeholder="2d6" :aria-label="`Damage of ${c.name}`" @change="change(c.name, { formula: ($event.target as HTMLInputElement).value.trim() })" />
        <template v-if="c.value != null">
          <button class="btn btn-icon" :aria-label="`Lower ${c.name}`" @click="step(c, -1)"><Minus :size="13" /></button><b class="num">{{ c.value }}</b>
          <button class="btn btn-icon" :aria-label="`Raise ${c.name}`" @click="step(c, 1)"><Plus :size="13" /></button>
        </template>
        <button class="btn btn-ghost btn-icon" :title="c.hidden ? 'Only you see it' : 'Players see it'" @click="change(c.name, { hidden: !c.hidden })"><EyeOff v-if="c.hidden" :size="14" /><Eye v-else :size="14" /></button>
        <button class="btn btn-ghost btn-icon" :aria-label="`Remove ${c.name}`" @click="remove(c.name)"><X :size="14" /></button>
      </li>
      <li v-if="!token.conditions.length" class="faint">None.</li>
    </ul>
    <input v-model="search" class="input" placeholder="Add a condition… (or “Persistent fire 2d6”, or one of your own)" data-test="condition-search" @keydown.enter="offered[0] && !typed ? add(offered[0].name) : addTyped()" />
    <button v-if="typed" class="btn" @click="addTyped">Add “{{ typed.label }}”</button>
    <div class="offer">
      <button v-for="c in offered" :key="c.name" class="chip" :style="{ borderColor: c.color }" :title="c.desc" @click="add(c.name)">{{ c.name }}</button>
    </div>
    <template #footer><button class="btn btn-primary" @click="emit('close')">Done</button></template>
  </AppDialog>
</template>

<style scoped>
.have { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .3rem; }
.have li { display: flex; align-items: center; gap: .4rem; }
.have input[type='color'] { width: 1.5rem; height: 1.5rem; padding: 0; border: 0; background: none; }
.what { flex: 1; display: flex; flex-direction: column; min-width: 0; } .name { background: none; border: 0; padding: 0; text-align: left; font-weight: 600; color: var(--text); }
.name:hover { color: var(--accent); } small { font-size: .76rem; } .formula { width: 5rem; }
.offer { display: flex; flex-wrap: wrap; gap: .3rem; max-height: 11rem; overflow: auto; } .offer .chip { background: none; cursor: pointer; } .offer .chip:hover { color: var(--text); background: var(--bg-hover); }
</style>
