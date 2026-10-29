<template>
  <div class="emb" :class="{ 'emb--compact': compact }">
    <div class="emb-head">
      <span class="emb-xp">{{ rating.xp }} XP</span>
      <span class="emb-threat" :style="{ color: THREAT_COLOR[rating.threat] }">{{ THREAT_LABEL[rating.threat] }}</span>
      <span v-if="!compact" class="emb-budget">
        moderate {{ rating.budgets.moderate }} · {{ partySize > 0 ? partySize : DEFAULT_PARTY_SIZE }} PCs
      </span>
    </div>
    <div class="emb-bar" role="meter" :aria-valuenow="rating.xp" :aria-valuemax="scaleMax" :aria-label="`Encounter XP: ${THREAT_LABEL[rating.threat]}`">
      <div class="emb-fill" :style="{ width: pct(rating.xp), background: THREAT_COLOR[rating.threat] }" />
      <div v-for="t in THREATS" :key="t" class="emb-tick" :style="{ left: pct(rating.budgets[t]) }"
        :title="`${THREAT_LABEL[t]}: ${rating.budgets[t]} XP`">
        <span class="emb-tick-label">{{ THREAT_LABEL[t].charAt(0) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DEFAULT_PARTY_SIZE, rateEncounter, THREAT_LABEL, THREATS, type ThreatRating } from '~/rules/encounter'
import type { GameId } from '~/types/game'

const props = defineProps<{ game: GameId; xp: number; partySize: number; compact?: boolean }>()

const THREAT_COLOR: Record<ThreatRating, string> = {
  trivial: 'var(--text3)', low: '#7cc44e', moderate: '#e8c44a', severe: '#e8873a', extreme: '#e05555', beyond: '#b04ad0',
}

const rating = computed(() => rateEncounter(props.game, props.xp, props.partySize))
const scaleMax = computed(() => Math.max(rating.value.budgets.extreme * 1.25, props.xp))

function pct(v: number) {
  return `${Math.min(100, (v / scaleMax.value) * 100)}%`
}
</script>

<style scoped>
.emb { display: flex; flex-direction: column; gap: 6px; }
.emb-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.emb-xp { font-family: var(--fm); font-size: 18px; font-weight: 700; color: var(--text); }
.emb--compact .emb-xp { font-size: 15px; }
.emb-threat { font-family: var(--fh, serif); font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; }
.emb-budget { margin-left: auto; font-size: 11px; color: var(--text3); }
.emb-bar { position: relative; height: 8px; border-radius: 4px; background: var(--surface-hi); margin-bottom: 12px; }
.emb-fill { position: absolute; inset: 0 auto 0 0; border-radius: 4px; transition: width 0.2s, background 0.2s; }
.emb-tick { position: absolute; top: -2px; bottom: -2px; width: 1px; background: var(--border-hi); }
.emb-tick-label { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); font-size: 9px; color: var(--text3); }
</style>
