<script setup lang="ts">
/**
 * The turn order: round, whose turn it is, and each combatant's initiative, HP
 * and conditions. The HP field takes damage (a number) or healing (a negative
 * one) on Enter. Ticking rows shows, hides or removes several at once.
 */
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight, Dices, Eye, EyeOff, Smartphone, Trash2 } from 'lucide-vue-next'
import { validateFormula } from '@/domain/formula'
import { conditionInfo } from '@/domain/rules/conditions'
import type { Token } from '@/data/encounters'
import { confirmDialog } from '@/ui/dialogs'
import { applyDamage, live, removeTokens, rollAllInitiative, saveEncounter, updateToken } from './live'
import { askInitiative, linkedHere } from './linkLive'
import { conditionColor } from './scene'
import { nextTurn, order, prevTurn, round, turnIndex } from './turns'

defineProps<{ running: boolean }>()
const emit = defineEmits<{ edit: [id: string]; conditions: [id: string] }>()

const PRESETS: [string, string][] = [['Perception', ''], ['d20 + Perception', 'd20 + perception'], ['d20 + Stealth', 'd20 + stealth'], ['d20 + level', 'd20 + level']]
const picked = ref<Set<string>>(new Set())
const hpDraft = ref<Record<string, string>>({})
const formula = ref(live.encounter?.initiativeFormula ?? '')
const formulaOk = computed(() => !formula.value.trim() || validateFormula(formula.value))
/** Tokens out of the order (dead, hidden and not acting) still show, below it. */
const others = computed(() => live.tokens.filter(t => !order.value.some(o => o.id === t.id)))

function saveFormula() { if (formulaOk.value) saveEncounter({ initiativeFormula: formula.value.trim() || null }) }
function toggle(id: string) { const s = new Set(picked.value); if (s.has(id)) s.delete(id); else s.add(id); picked.value = s }
function hpEnter(t: Token) {
  const n = Number(hpDraft.value[t.id])
  if (Number.isFinite(n) && n) applyDamage(t.id, n)
  hpDraft.value = { ...hpDraft.value, [t.id]: '' }
}
function setInitiative(t: Token, e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim()
  updateToken(t.id, { initiative: raw === '' || !Number.isFinite(Number(raw)) ? null : Number(raw) })
}
function setVisible(visible: boolean) { for (const id of picked.value) updateToken(id, { visible }); picked.value = new Set() }
async function removePicked(running: boolean) {
  const ids = [...picked.value]
  if (!await confirmDialog({ title: `Remove ${ids.length} token${ids.length === 1 ? '' : 's'}?`, body: running ? 'Enemies with a stat block keep their XP for when the encounter is resolved.' : 'They are taken off the map.', confirmLabel: 'Remove', danger: true })) return
  await removeTokens(ids, running)
  picked.value = new Set()
}
const abbr = (name: string) => conditionInfo(name)?.abbr ?? name.slice(0, 3).toUpperCase()
</script>

<template>
  <section class="turns" data-test="turn-order">
    <header>
      <template v-if="running">
        <button class="btn btn-icon" title="Previous turn (undoes what the turn change did)" data-test="prev-turn" @click="prevTurn"><ChevronLeft :size="15" /></button>
        <span class="round">Round <b class="num" data-test="round">{{ round }}</b></span>
        <button class="btn btn-primary" data-test="next-turn" @click="nextTurn">Next turn <ChevronRight :size="15" /></button>
      </template>
      <span v-else class="eyebrow">Turn order</span>
      <span class="grow" />
      <button v-if="linkedHere().length" class="btn btn-icon" title="Ask the linked players to roll initiative in Play Buddy" data-test="ask-initiative" @click="askInitiative()"><Smartphone :size="15" /></button>
      <button class="btn btn-icon" title="Roll initiative for everyone who has none" data-test="roll-initiative" @click="rollAllInitiative()"><Dices :size="15" /></button>
    </header>
    <div class="formula">
      <input v-model="formula" class="input" :class="{ bad: !formulaOk }" list="init-presets" placeholder="Initiative: Perception (or a formula)" aria-label="Initiative formula" @change="saveFormula" />
      <datalist id="init-presets"><option v-for="[label, f] in PRESETS" :key="label" :value="f">{{ label }}</option></datalist>
    </div>
    <div v-if="picked.size" class="bulk">
      <span class="faint">{{ picked.size }} ticked</span>
      <button class="btn btn-icon" title="Show to players" @click="setVisible(true)"><Eye :size="14" /></button>
      <button class="btn btn-icon" title="Hide from players" @click="setVisible(false)"><EyeOff :size="14" /></button>
      <button class="btn btn-icon btn-danger" title="Remove" @click="removePicked(running)"><Trash2 :size="14" /></button>
    </div>
    <ol>
      <li v-for="(t, i) in [...order, ...others]" :key="t.id" class="row" :class="{ active: running && i === turnIndex && i < order.length, out: i >= order.length, sel: live.selectedId === t.id, hidden: !t.visible }" :data-turn="t.name" @click="live.selectedId = t.id" @dblclick="emit('edit', t.id)">
        <input type="checkbox" :checked="picked.has(t.id)" :aria-label="`Tick ${t.name}`" @click.stop @change="toggle(t.id)" />
        <input class="init num" :value="t.initiative ?? ''" :aria-label="`Initiative of ${t.name}`" placeholder="–" @click.stop @change="setInitiative(t, $event)" />
        <span class="name" :class="{ party: t.playerToken, ally: t.ally, dead: t.dead }">{{ t.name }}<EyeOff v-if="!t.visible" :size="11" /></span>
        <span class="conds" @click.stop="emit('conditions', t.id)">
          <i v-for="c in t.conditions" :key="c.name" :style="{ background: conditionColor(c) }" :class="{ gm: c.hidden }" :title="c.value != null ? `${c.name} ${c.value}` : c.name">{{ abbr(c.name) }}{{ c.value ?? '' }}</i>
          <i v-if="!t.conditions.length" class="add" title="Conditions">+</i>
        </span>
        <span v-if="t.hp.max !== null" class="hp num" :title="t.hp.temp ? `${t.hp.temp} temporary HP` : ''"><b :data-hp="t.name">{{ t.hp.current }}</b>/{{ t.hp.max }}<em v-if="t.hp.temp">+{{ t.hp.temp }}</em></span>
        <input v-if="t.hp.max !== null" v-model="hpDraft[t.id]" class="dmg num" :aria-label="`Damage to ${t.name}`" placeholder="±" title="Damage, or a negative number to heal; Enter applies" @click.stop @keydown.enter="hpEnter(t)" />
      </li>
    </ol>
    <p v-if="!live.tokens.length" class="faint empty-note">No tokens yet. Add creatures or drag tokens onto the map.</p>
  </section>
</template>

<style scoped>
.turns { display: flex; flex-direction: column; min-height: 0; }
header { display: flex; align-items: center; gap: .4rem; padding: .5rem .6rem; border-bottom: var(--frame); }
.grow { flex: 1; } .round { margin: 0 .2rem; }
.formula { padding: .4rem .6rem 0; } .formula .input { font-size: .82rem; } .bad { border-color: var(--danger); }
.bulk { display: flex; align-items: center; gap: .3rem; padding: .4rem .6rem 0; }
ol { list-style: none; margin: .4rem 0 0; padding: 0; overflow: auto; flex: 1; }
.row { display: flex; align-items: center; gap: .4rem; padding: .28rem .6rem; border-left: 3px solid transparent; cursor: default; }
.row:hover { background: var(--bg-hover); } .row.sel { background: var(--accent-soft); }
.row.active { border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.row.out { opacity: .55; } .row.hidden .name { font-style: italic; }
.init { width: 2.4rem; text-align: center; background: var(--bg-sunken); border: var(--frame); border-radius: var(--radius); padding: .1rem; }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: .3rem; }
.name.party { color: #3bbfa8; } .name.ally { color: #7fb2e6; } .name.dead { text-decoration: line-through; color: var(--text-faint); }
.conds { display: flex; gap: 2px; flex-wrap: wrap; justify-content: flex-end; max-width: 7rem; cursor: pointer; }
.conds i { font-style: normal; font-size: .62rem; font-weight: 700; padding: 0 .25rem; border-radius: 3px; color: #10101a; }
.conds i.gm { outline: 1px dashed var(--text); } .conds i.add { background: none; color: var(--text-faint); border: 1px dashed var(--line-strong); }
.hp { font-size: .82rem; color: var(--text-dim); white-space: nowrap; } .hp b { color: var(--text); } .hp em { color: #4a90d9; font-style: normal; }
.dmg { width: 2.6rem; text-align: center; background: var(--bg-sunken); border: var(--frame); border-radius: var(--radius); padding: .1rem; }
.empty-note { padding: 1rem .8rem; }
</style>
