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
import type { ZoneAreaSpec } from '~/rules/sensorMap'
import { computed, provide, ref, shallowRef, watch } from 'vue'
import { ROLL_CONTEXT, useDiceRoll, type AreaSpec, type RollAction, type StatRoll } from '~/composables/useDiceRoll'
import { getConditionColor, hpColor } from '~/composables/useConditions'
import { rulesGet } from '~/composables/useRules'
import type { CharacterMirror } from '~/partylink/port'
import { ADJUSTMENT_LABEL, applyAdjustment } from '~/rules/combat'
import { signed } from '~/rules/format'
import { GAME_RULES } from '~/rules/registry'
import { ATTACK_LABEL, rollCheck, rollStrikeDamage, twoHandFormula } from '~/rules/rolls'
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
  'place-zone-area': [spec: ZoneAreaSpec, tokenId: number | null]
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

// ── Rolls (COMBAT_PLAN.md §4): results go to the dice panel, with their buttons ──
const { showRoll } = useDiceRoll()
const targetId = ref<number | null>(null)

const targetOptions = computed(() => (store.current?.tokens ?? [])
  .filter(t => t.id !== props.token?.id)
  .sort((a, b) => Number(a.isDead) - Number(b.isDead)))
const target = computed(() => targetId.value === null ? null : store.getToken(targetId.value) ?? null)

// A target that left the fight, or the token itself, is no target
watch([() => props.token?.id, targetOptions], () => {
  if (targetId.value !== null && !targetOptions.value.some(t => t.id === targetId.value)) targetId.value = null
})

function signedMod(n: number) {
  return `${n < 0 ? '−' : '+'} ${Math.abs(n)}`
}

const nameOf = (t: EncounterToken) => t.label || t.name

function roll(r: StatRoll) {
  const t = target.value
  if (r.kind === 'damage') { rollDamage(r.label, r.strike, !!r.critical, !!r.twoHand, t); return }
  const attack = r.kind === 'attack'
  const c = rollCheck(r.modifier, attack ? t?.ac ?? null : null)
  const targetName = attack && t ? nameOf(t) : null
  if (props.token) store.logRoll(props.token.id, { label: r.label, total: c.total, degree: c.degree, targetName, attack })
  const actions: RollAction[] = []
  // After an attack: its damage, doubled on a critical hit, against the same target
  if (attack && r.strike) {
    const strike = r.strike
    const critical = c.degree === 'critical-success'
    const base = `${r.label.replace(/ \((2nd|3rd) attack\)$/, '')} damage`
    const hit = c.degree === 'success' || critical || c.degree === null
    if (hit) {
      actions.push({ label: critical ? 'Critical damage' : 'Damage', primary: true, run: () => rollDamage(base, strike, critical, false, t) })
      if (twoHandFormula(strike)) {
        actions.push({ label: critical ? 'Critical, two-handed' : 'Two-handed', title: 'Damage wielded in two hands', run: () => rollDamage(base, strike, critical, true, t) })
      }
    }
  }
  showRoll({
    label: r.label, total: c.total, breakdown: `d20 [${c.d20}] ${signedMod(r.modifier)}`,
    isCrit: c.d20 === 20, isFail: c.d20 === 1,
    outcome: c.degree ? ATTACK_LABEL[c.degree] : undefined, tone: c.degree ?? undefined,
    detail: t && attack ? `vs ${nameOf(t)}${t.ac !== null ? ` (AC ${t.ac})` : ''}` : undefined,
    actions,
  })
}

function rollDamage(label: string, strike: Strike, critical: boolean, twoHand: boolean, t: EncounterToken | null): string {
  const d = rollStrikeDamage(strike, critical, Math.random, GAME_RULES[props.game].critTraits, { twoHand })
  const how = [twoHand ? 'two-handed' : '', critical ? 'critical' : ''].filter(Boolean).join(', ')
  const fullLabel = how && !label.includes(`(${how})`) ? `${label} (${how})` : label
  if (props.token) store.logRoll(props.token.id, { label: fullLabel, total: d.total, targetName: t ? nameOf(t) : null })
  const actions: RollAction[] = t
    ? [
        { label: `Apply ${d.total}`, primary: true, title: `Damage ${nameOf(t)}`, run: () => apply(t.id, d.total, critical) },
        { label: '½', title: 'Apply half (rounded down)', run: () => apply(t.id, Math.floor(d.total / 2), critical) },
        { label: '×2', title: 'Apply double', run: () => apply(t.id, d.total * 2, critical) },
      ]
    : []
  showRoll({
    label: fullLabel, total: d.total,
    breakdown: d.parts.map(p => `${p.breakdown} ${p.type}`).join(' + '),
    outcome: critical ? 'Critical' : undefined, tone: critical ? 'critical-success' : undefined,
    detail: [t ? `vs ${nameOf(t)}` : '', ...d.notes].filter(Boolean).join(' · ') || undefined,
    actions,
  })
  return `${how ? `${how.charAt(0).toUpperCase()}${how.slice(1)} damage` : 'Damage'}: ${d.total}`
}

function apply(tokenId: number, amount: number, critical: boolean): string {
  const t = store.getToken(tokenId)
  if (amount > 0) emit('apply-damage', tokenId, amount, critical)
  return `Applied ${amount} to ${t ? nameOf(t) : 'the target'}`
}

provide(ROLL_CONTEXT, {
  roll, placeArea: spec => emit('place-area', spec, props.token?.id ?? null),
  ...(props.token?.sensorZone != null ? { placeZoneArea: (spec: ZoneAreaSpec) => emit('place-zone-area', spec, props.token?.id ?? null) } : {}),
})

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
.sbp-slide-enter-active, .sbp-slide-leave-active { transition: transform 0.2s ease; }
.sbp-slide-enter-from, .sbp-slide-leave-to { transform: translateX(100%); }
</style>
