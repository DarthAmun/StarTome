<template>
  <Transition name="sbp-slide">
    <aside v-if="token" class="sbp" :aria-label="`Stat block: ${tokenName}`">
      <header class="sbp-head">
        <div class="sbp-title">
          <span class="sbp-name">{{ tokenName }}</span>
          <button class="sbp-close" title="Close" @click="emit('close')">✕</button>
        </div>
        <div class="sbp-stats">
          <span v-if="token.hpMax" class="sbp-hp" :style="{ color: hpColor(hpFraction) }">
            HP {{ token.hpCurrent ?? 0 }}/{{ token.hpMax }}<span v-if="token.tempHp" class="sbp-temp" title="Temporary HP"> +{{ token.tempHp }}</span>
          </span>
          <span v-if="token.ac !== null" class="sbp-ac">AC {{ token.ac }}</span>
          <span v-if="token.adjustment" class="sbp-adjust">{{ ADJUSTMENT_LABEL[token.adjustment] }}</span>
          <span v-if="token.isDead" class="sbp-dead">Defeated</span>
        </div>
        <label v-if="targetOptions.length" class="sbp-target" title="Attacks roll against its AC; damage can be applied to it">
          <span>Target</span>
          <select v-model="targetId">
            <option :value="null">None</option>
            <option v-for="t in targetOptions" :key="t.id" :value="t.id">{{ t.label || t.name }}{{ t.ac !== null ? ` (AC ${t.ac})` : '' }}</option>
          </select>
        </label>
        <div v-if="token.conditions.length" class="sbp-conds">
          <span
            v-for="c in token.conditions" :key="c.name" class="sbp-cond"
            :style="{ borderColor: c.color || getConditionColor(c.name) }"
            :title="c.hidden ? 'Hidden from players' : ''"
          >{{ c.value ? `${c.name} ${c.value}` : c.name }}{{ c.hidden ? ' ·' : '' }}</span>
        </div>
      </header>

      <ol v-if="rolls.length" class="sbp-rolls" aria-label="Rolls">
        <li v-for="r in rolls" :key="r.id" class="sbp-roll" :class="r.degree ? `sbp-roll--${r.degree}` : ''">
          <div class="sbp-roll-top">
            <span class="sbp-roll-label">{{ r.label }}</span>
            <span class="sbp-roll-total">{{ r.total }}</span>
          </div>
          <div class="sbp-roll-detail">
            {{ r.breakdown }}
            <template v-if="r.targetName"> · vs {{ r.targetName }}</template>
            <b v-if="r.degree"> · {{ r.kind === 'attack' ? ATTACK_LABEL[r.degree] : DEGREE_LABEL[r.degree] }}</b>
            <template v-if="r.notes?.length"> · {{ r.notes.join(', ') }}</template>
          </div>
          <div v-if="r.kind === 'attack' && r.strike" class="sbp-roll-actions">
            <button @click="rollDamage(r)">{{ r.degree === 'critical-success' ? 'Roll critical damage' : 'Roll damage' }}</button>
          </div>
          <div v-else-if="r.kind === 'damage' && r.targetId !== null" class="sbp-roll-actions">
            <template v-if="r.applied === null">
              <button title="Apply the damage to the target" @click="apply(r, 1)">Apply {{ r.total }}</button>
              <button title="Apply half (rounded down)" @click="apply(r, 0.5)">½</button>
              <button title="Apply double" @click="apply(r, 2)">×2</button>
            </template>
            <span v-else class="sbp-applied">Applied {{ r.applied }} to {{ r.targetName }}</span>
          </div>
        </li>
      </ol>

      <div class="sbp-body">
        <template v-if="kind === 'rules'">
          <RulesStatBlock v-if="entry" :entity="entry" :game="game" />
          <p v-else-if="missing" class="sbp-hint">The linked stat block is missing from the compendium.</p>
        </template>

        <NpcCard v-else-if="kind === 'npc' && npc" :name="npc.name" :attrs="npc.attrs" />

        <template v-else-if="kind === 'playbuddy' && pbMirror">
          <p class="sbp-hint">Shared by {{ pbMirror.basic?.name ?? 'the player' }}'s Play Buddy, as of {{ formatAt(pbMirror.at) }}.</p>
          <dl v-if="pbMirror.defenses" class="sbp-defs">
            <div><dt>AC</dt><dd>{{ pbMirror.defenses.ac }}</dd></div>
            <div><dt>Fort</dt><dd>{{ signed(pbMirror.defenses.fort) }}</dd></div>
            <div><dt>Ref</dt><dd>{{ signed(pbMirror.defenses.ref) }}</dd></div>
            <div><dt>Will</dt><dd>{{ signed(pbMirror.defenses.will) }}</dd></div>
            <div><dt>Perception</dt><dd>{{ signed(pbMirror.defenses.perception) }}</dd></div>
            <div><dt>Speed</dt><dd>{{ pbMirror.defenses.speed }} ft</dd></div>
          </dl>
          <p v-else class="sbp-hint">The player doesn't share defenses.</p>
          <p v-if="pbMirror.basic" class="sbp-line">
            <b>HP</b> {{ pbMirror.basic.hp.value }}/{{ pbMirror.basic.hp.max }}<template v-if="pbMirror.basic.hp.temp"> +{{ pbMirror.basic.hp.temp }} temp</template>
          </p>
        </template>

        <div v-else class="sbp-empty">
          <p class="sbp-hint">This token has no stat block.</p>
          <button class="sbp-link-btn" @click="emit('link', token.id)">Link a stat block</button>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
/**
 * The stat block of a token in the fight (COMBAT_PLAN.md §3), opened from the
 * turn order or the token menu. The header follows the token live: HP, temp
 * HP, AC and conditions. GM only.
 */
import { computed, provide, ref, shallowRef, watch } from 'vue'
import { ROLL_CONTEXT, type AreaSpec, type StatRoll } from '~/composables/useDiceRoll'
import { getConditionColor, hpColor } from '~/composables/useConditions'
import { rulesGet } from '~/composables/useRules'
import type { CharacterMirror } from '~/partylink/port'
import { ADJUSTMENT_LABEL, applyAdjustment } from '~/rules/combat'
import { signed } from '~/rules/format'
import { GAME_RULES } from '~/rules/registry'
import { ATTACK_LABEL, DEGREE_LABEL, rollCheck, rollStrikeDamage } from '~/rules/rolls'
import type { Degree } from '~/rules/dcs'
import { useEncounterStore, type EncounterToken } from '~/stores/encounter'
import type { GameId } from '~/types/game'
import type { RulesEntity, Strike } from '~/types/rules'
import { statPanelKind } from '~/utils/statPanel'

const props = defineProps<{
  /** The token shown; null closes the panel. */
  token: EncounterToken | null
  game: GameId
  /** The campaign NPC the token stands for. */
  npc?: { name: string; attrs: Record<string, any> } | null
  /** Shared numbers of a Play Buddy-linked character. */
  pbMirror?: CharacterMirror | null
}>()

const emit = defineEmits<{
  close: []
  link: [tokenId: number]
  /** Damage for the target; the page routes it (Play Buddy characters get a request). */
  'apply-damage': [tokenId: number, amount: number, critical: boolean]
  /** An ability's area to put on the map, used by this token. */
  'place-area': [spec: AreaSpec, tokenId: number | null]
}>()

const store = useEncounterStore()

const tokenName = computed(() => props.token ? props.token.label || props.token.name : '')
const hpFraction = computed(() => props.token?.hpMax ? Math.max(0, (props.token.hpCurrent ?? 0) / props.token.hpMax) : 1)
const kind = computed(() => props.token
  ? statPanelKind(props.token, { npc: !!props.npc, playBuddy: !!props.pbMirror })
  : 'none')

const entry = shallowRef<RulesEntity | null>(null)
const missing = computed(() => !!props.token?.linkedRulesId && !entry.value && loaded.value)
const loaded = shallowRef(false)

let run = 0
watch(() => [props.token?.linkedRulesId, props.token?.adjustment] as const, async ([id, adj]) => {
  const mine = ++run
  loaded.value = false
  if (!id) { entry.value = null; return }
  const e = await rulesGet(id)
  if (mine !== run) return
  entry.value = e ? applyAdjustment(e, adj) : null
  loaded.value = true
}, { immediate: true })

// ── Rolls (COMBAT_PLAN.md §4) ───────────────────────────────────────────────
interface PanelRoll {
  id: number
  kind: StatRoll['kind']
  label: string
  total: number
  breakdown: string
  degree: Degree | null
  targetId: number | null
  targetName: string | null
  strike?: Strike
  notes?: string[]
  /** Damage applied to the target, null while not yet. */
  applied: number | null
  /** Damage of a critical hit: dying 2 when it knocks the target out. */
  critical?: boolean
}

const targetId = ref<number | null>(null)
const rolls = ref<PanelRoll[]>([])
let nextRollId = 1

const targetOptions = computed(() => (store.current?.tokens ?? [])
  .filter(t => t.id !== props.token?.id)
  .sort((a, b) => Number(a.isDead) - Number(b.isDead)))
const target = computed(() => targetId.value === null ? null : store.getToken(targetId.value) ?? null)

// A target that left the fight, or the token itself, is no target
watch([() => props.token?.id, targetOptions], () => {
  if (targetId.value !== null && !targetOptions.value.some(t => t.id === targetId.value)) targetId.value = null
})
// Each token's rolls stay with it
watch(() => props.token?.id, () => { rolls.value = [] })

function signedMod(n: number) {
  return `${n < 0 ? '−' : '+'} ${Math.abs(n)}`
}

function push(r: Omit<PanelRoll, 'id' | 'applied'>) {
  rolls.value = [{ ...r, id: nextRollId++, applied: null }, ...rolls.value].slice(0, 6)
  if (props.token) store.logRoll(props.token.id, { label: r.label, total: r.total, degree: r.kind === 'attack' ? r.degree : null, targetName: r.targetName, attack: r.kind === 'attack' })
}

function roll(r: StatRoll) {
  const t = target.value
  if (r.kind === 'damage') return pushDamage(r.label, r.strike, !!r.critical, t)
  const c = rollCheck(r.modifier, r.kind === 'attack' ? t?.ac ?? null : null)
  push({
    kind: r.kind, label: r.label, total: c.total, breakdown: `d20 [${c.d20}] ${signedMod(r.modifier)}`, degree: c.degree,
    targetId: r.kind === 'attack' ? t?.id ?? null : null, targetName: r.kind === 'attack' && t ? t.label || t.name : null,
    strike: r.kind === 'attack' ? r.strike : undefined,
  })
}

function pushDamage(label: string, strike: Strike, critical: boolean, t: EncounterToken | null) {
  const d = rollStrikeDamage(strike, critical, Math.random, GAME_RULES[props.game].critTraits)
  push({
    kind: 'damage', label: critical ? `${label} (critical)` : label, total: d.total, critical,
    breakdown: d.parts.map(p => `${p.breakdown} ${p.type}`).join(' + '), degree: null,
    targetId: t?.id ?? null, targetName: t ? t.label || t.name : null, notes: d.notes,
  })
}

/** Damage after an attack: doubled on a critical hit, against the attack's target. */
function rollDamage(r: PanelRoll) {
  if (!r.strike) return
  const t = r.targetId !== null ? store.getToken(r.targetId) ?? null : target.value
  pushDamage(`${r.label.replace(/ \((2nd|3rd) attack\)$/, '')} damage`, r.strike, r.degree === 'critical-success', t)
}

function apply(r: PanelRoll, factor: number) {
  if (r.targetId === null) return
  const amount = Math.floor(r.total * factor)
  r.applied = amount
  rolls.value = [...rolls.value]
  if (amount > 0) emit('apply-damage', r.targetId, amount, !!r.critical)
}

provide(ROLL_CONTEXT, { roll, placeArea: spec => emit('place-area', spec, props.token?.id ?? null) })

function formatAt(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<style scoped>
.sbp {
  position: absolute; top: 0; right: 0; bottom: 0; width: min(380px, 100%); z-index: 31;
  display: flex; flex-direction: column;
  background-color: var(--parch); background-image: var(--paper); background-blend-mode: multiply;
  border-left: 1px solid var(--parch-line);
  box-shadow: -4px 0 24px rgba(28, 20, 16, 0.3);
}
.sbp-head { padding: 12px 16px 10px; border-bottom: 1px solid var(--parch-line); }
.sbp-title { display: flex; align-items: baseline; gap: 8px; }
.sbp-name { flex: 1; min-width: 0; font-family: var(--font-head); font-size: 15px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbp-close { background: none; border: none; font-size: 14px; color: var(--ink-ghost); cursor: pointer; padding: 2px 4px; line-height: 1; }
.sbp-close:hover { color: var(--blood); }
.sbp-stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; font-family: var(--font-mono); font-size: 12px; color: var(--ink-faded); }
.sbp-hp { font-weight: 600; }
.sbp-temp { color: #4a90d9; }
.sbp-adjust { font-style: italic; font-family: var(--font-body); }
.sbp-dead { color: var(--blood); font-family: var(--font-body); }
.sbp-conds { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.sbp-cond { font-size: 11px; padding: 1px 6px; border: 1px solid var(--parch-line); border-left-width: 3px; border-radius: 2px; color: var(--ink); }
.sbp-body { flex: 1; overflow-y: auto; padding: 14px 16px 24px; }
.sbp-hint { font-size: 12px; font-style: italic; color: var(--ink-ghost); margin: 0 0 8px; }
.sbp-line { font-size: 13px; color: var(--ink); }
.sbp-defs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 12px; margin: 0 0 10px; }
.sbp-defs div { display: flex; flex-direction: column; }
.sbp-defs dt { font-family: var(--font-head); font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-ghost); }
.sbp-defs dd { margin: 0; font-family: var(--font-mono); font-size: 14px; color: var(--ink); }
.sbp-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.sbp-link-btn {
  font-family: var(--font-head); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
  padding: 5px 10px; border: 1px solid var(--gold); border-radius: 2px; background: rgba(184,134,11,0.08); color: var(--ink); cursor: pointer;
}
.sbp-target { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-family: var(--font-head); font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-ghost); }
.sbp-target select {
  flex: 1; min-width: 0; font-family: var(--font-body); font-size: 12px; letter-spacing: 0; text-transform: none;
  padding: 2px 4px; border: 1px solid var(--parch-line); border-radius: 2px; background: transparent; color: var(--ink);
}
.sbp-rolls { list-style: none; margin: 0; padding: 8px 16px; border-bottom: 1px solid var(--parch-line); max-height: 40%; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.sbp-roll { border-left: 3px solid var(--parch-line); padding: 3px 0 3px 8px; }
.sbp-roll--critical-success { border-left-color: var(--gold); }
.sbp-roll--success { border-left-color: var(--grass, #4a8a3a); }
.sbp-roll--failure { border-left-color: var(--ink-ghost); }
.sbp-roll--critical-failure { border-left-color: var(--blood); }
.sbp-roll-top { display: flex; align-items: baseline; gap: 8px; }
.sbp-roll-label { flex: 1; min-width: 0; font-size: 12px; color: var(--ink-faded); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbp-roll-total { font-family: var(--font-mono); font-size: 18px; font-weight: 700; color: var(--ink); }
.sbp-roll-detail { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-ghost); }
.sbp-roll-detail b { font-family: var(--font-body); color: var(--ink); }
.sbp-roll-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.sbp-roll-actions button {
  font-family: var(--font-head); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 3px 8px; border: 1px solid var(--parch-line); border-radius: 2px; background: transparent; color: var(--ink); cursor: pointer;
}
.sbp-roll-actions button:hover { border-color: var(--gold); background: rgba(184,134,11,0.08); }
.sbp-applied { font-size: 11px; font-style: italic; color: var(--ink-faded); }
.sbp-slide-enter-active, .sbp-slide-leave-active { transition: transform 0.2s ease; }
.sbp-slide-enter-from, .sbp-slide-leave-to { transform: translateX(100%); }
</style>
