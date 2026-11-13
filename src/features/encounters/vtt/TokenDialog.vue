<script setup lang="ts">
/** Everything about one token on the map: what it is, its numbers, its timers and its flags. Changes apply at once. */
import { computed, ref } from 'vue'
import { RotateCcw, Trash2 } from 'lucide-vue-next'
import { ADJUSTMENT_LABEL, type Adjustment } from '@/domain/rules/combat'
import { statLinkOf, type CombatantPatch, type Token } from '@/data/encounters'
import AppDialog from '@/ui/components/AppDialog.vue'
import { useLive } from '@/ui/useLive'
import { rulesGet } from '@/data/rules'
import { peek } from '@/ui/workbench'
import CreaturePicker from '../CreaturePicker.vue'
import { applyDamage, grantTempHp, live, removeTokens, setStatBlock, updateToken, usesDying } from './live'
import { addTimer, setTimers } from './turns'

const props = defineProps<{ token: Token }>()
const emit = defineEmits<{ close: []; conditions: [] }>()

const t = computed(() => props.token)
const link = computed(() => statLinkOf(t.value))
const linked = useLive(async () => (link.value ? (await rulesGet(link.value.rulesId)) ?? null : null), null, [() => link.value?.rulesId])
const amount = ref<number | null>(null)
const critical = ref(false)
const timer = ref({ name: '', turns: 3, visible: false })
const linking = ref(false)

const set = (patch: CombatantPatch) => updateToken(t.value.id, patch)
const numOrNull = (e: Event): number | null => { const v = (e.target as HTMLInputElement).value.trim(); return v === '' || !Number.isFinite(Number(v)) ? null : Number(v) }
function hp(field: 'current' | 'max' | 'temp', e: Event) {
  const v = numOrNull(e)
  set({ hp: { ...t.value.hp, [field]: field === 'temp' ? Math.max(0, v ?? 0) : v } })
}
function hit(sign: 1 | -1) {
  if (amount.value) applyDamage(t.value.id, sign * Math.abs(amount.value), { critical: sign > 0 && critical.value })
  amount.value = null
}
function setAdjustment(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  if (link.value) void setStatBlock(t.value.id, link.value.rulesId, v === '' ? null : v as Adjustment)
}
function newTimer() { addTimer(t.value, timer.value.name, Math.floor(timer.value.turns), timer.value.visible); timer.value.name = '' }
async function remove() { await removeTokens([t.value.id], live.encounter?.status === 'active'); emit('close') }
</script>

<template>
  <AppDialog :title="t.name" wide @close="emit('close')">
    <div class="grid" data-test="token-dialog">
      <label class="wide"><span class="label">Label</span><input class="input" :value="t.label ?? ''" :placeholder="t.name" aria-label="Token label" @change="set({ label: ($event.target as HTMLInputElement).value.trim() || null })" /></label>
      <div class="wide link">
        <span class="label">Stat block</span>
        <template v-if="link">
          <button class="btn" @click="peek({ kind: 'rules', id: link.rulesId, adjustment: link.adjustment })">{{ linked?.name ?? 'Not in the compendium' }}</button>
          <select class="input adj" :value="link.adjustment ?? ''" aria-label="Weak or elite" @change="setAdjustment"><option value="">Normal</option><option v-for="(l, k) in ADJUSTMENT_LABEL" :key="k" :value="k">{{ l }}</option></select>
          <button class="btn" title="Take HP, AC and size from the stat block again; damage taken carries over" @click="setStatBlock(t.id, link.rulesId, link.adjustment)"><RotateCcw :size="14" /> Update from stat block</button>
          <button class="btn btn-ghost" @click="setStatBlock(t.id, null)">Unlink</button>
        </template>
        <button v-else class="btn" @click="linking = !linking">Link a stat block…</button>
        <button v-if="t.ref.kind === 'entry'" class="btn" @click="peek({ kind: 'entry', id: t.ref.entryId })">Open NPC</button>
      </div>
      <CreaturePicker v-if="linking && !link" class="wide" :game="live.game" @pick="e => { linking = false; void setStatBlock(t.id, e.id) }" />

      <label><span class="label">HP</span><input class="input num" :value="t.hp.current ?? ''" aria-label="Current HP" @change="hp('current', $event)" /></label>
      <label><span class="label">Max HP</span><input class="input num" :value="t.hp.max ?? ''" aria-label="Maximum HP" @change="hp('max', $event)" /></label>
      <label><span class="label">Temp HP</span><input class="input num" :value="t.hp.temp || ''" aria-label="Temporary HP" @change="hp('temp', $event)" /></label>
      <label><span class="label">AC</span><input class="input num" :value="t.ac ?? ''" aria-label="AC" @change="set({ ac: numOrNull($event) })" /></label>
      <div class="wide quick">
        <input v-model.number="amount" type="number" min="0" class="input num" placeholder="amount" aria-label="Damage or healing amount" @keydown.enter="hit(1)" />
        <button class="btn btn-danger" data-test="token-damage" @click="hit(1)">Damage</button>
        <button class="btn" @click="hit(-1)">Heal</button>
        <button class="btn" title="They do not stack: the higher value stays" @click="amount && grantTempHp(t.id, amount); amount = null">Temp HP</button>
        <label class="dim" title="A critical hit raises dying by 2"><input v-model="critical" type="checkbox" /> critical hit</label>
      </div>

      <label><span class="label">Initiative</span><input class="input num" :value="t.initiative ?? ''" aria-label="Initiative" @change="set({ initiative: numOrNull($event) })" /></label>
      <label><span class="label">Size (squares)</span><input class="input num" type="number" min="1" max="8" :value="t.size" @change="set({ size: Math.max(1, numOrNull($event) ?? 1) })" /></label>
      <label><span class="label">Elevation (ft)</span><input class="input num" :value="t.elevation ?? ''" @change="set({ elevation: numOrNull($event) })" /></label>
      <label><span class="label">Vision (squares)</span><input class="input num" :value="t.visionRange ?? ''" placeholder="∞" @change="set({ visionRange: numOrNull($event) })" /></label>

      <div class="wide flags">
        <label><input type="checkbox" :checked="t.visible" @change="set({ visible: !t.visible })" /> Players see it</label>
        <label title="Stays in the turn order while hidden"><input type="checkbox" :checked="t.actsWhileHidden" @change="set({ actsWhileHidden: !t.actsWhileHidden })" /> Acts while hidden</label>
        <label title="Shares its vision with the players, who see its exact HP"><input type="checkbox" :checked="t.playerToken" @change="set({ playerToken: !t.playerToken })" /> Player token</label>
        <label title="Fights with the party: worth no XP"><input type="checkbox" :checked="t.ally" @change="set({ ally: !t.ally })" /> Ally</label>
        <label title="Dying, wounded and recovery checks instead of being defeated at 0 HP"><input type="checkbox" :checked="usesDying(t)" @change="set({ usesDying: !usesDying(t) })" /> Uses dying rules</label>
        <label><input type="checkbox" :checked="t.dead" @change="set({ dead: !t.dead })" /> Dead</label>
      </div>

      <div class="wide">
        <span class="label">Timers <span class="faint">(count down at the start of its turn)</span></span>
        <div v-for="x in t.timers" :key="x.id" class="timer">
          <b>{{ x.name }}</b><span class="num">{{ x.remaining > 0 ? `${x.remaining} / ${x.duration}` : 'up' }}</span>
          <label class="faint"><input type="checkbox" :checked="!!x.visibleToPlayers" @change="setTimers(t, t.timers.map(y => (y.id === x.id ? { ...y, visibleToPlayers: !y.visibleToPlayers } : y)))" /> players see it</label>
          <button class="btn btn-ghost" @click="setTimers(t, t.timers.map(y => (y.id === x.id ? { ...y, remaining: y.duration } : y)))">Reset</button>
          <button class="btn btn-ghost btn-icon" aria-label="Remove timer" @click="setTimers(t, t.timers.filter(y => y.id !== x.id))"><Trash2 :size="13" /></button>
        </div>
        <div class="timer">
          <input v-model="timer.name" class="input" placeholder="Breath weapon" aria-label="Timer name" @keydown.enter="newTimer" />
          <input v-model.number="timer.turns" type="number" min="1" class="input num" aria-label="Turns" />
          <label class="faint"><input v-model="timer.visible" type="checkbox" /> players see it</label>
          <button class="btn" :disabled="!timer.name.trim()" @click="newTimer">Add timer</button>
        </div>
      </div>
      <label class="wide"><span class="label">GM notes</span><textarea class="input" rows="2" :value="t.notes" @change="set({ notes: ($event.target as HTMLTextAreaElement).value })" /></label>
    </div>
    <template #footer>
      <button class="btn btn-danger" data-test="token-remove" @click="remove"><Trash2 :size="14" /> Remove</button>
      <span class="grow" />
      <button class="btn" @click="emit('conditions')">Conditions ({{ t.conditions.length }})</button>
      <button class="btn btn-primary" @click="emit('close')">Done</button>
    </template>
  </AppDialog>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: .6rem .8rem; }
.wide { grid-column: 1 / -1; } .link, .quick, .flags, .timer { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
.link .label, .wide > .label { width: 100%; margin: 0; } .adj { width: auto; } .quick .num { width: 6rem; }
.flags { gap: .4rem 1.1rem; color: var(--text-dim); } .timer { margin-top: .3rem; } .timer .input { width: auto; flex: 1; } .timer .num { flex: none; width: 5rem; }
.grow { flex: 1; }
</style>
