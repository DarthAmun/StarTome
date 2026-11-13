<script setup lang="ts">
/** The threat of an encounter against the party: XP, the budgets, and what does not count. */
import { computed } from 'vue'
import { THREAT_LABEL, THREATS } from '@/domain/rules/encounter'
import type { Rated } from './difficulty'

const props = defineProps<{ rated: Rated; override: number | null }>()
const emit = defineEmits<{ level: [value: number | null]; clearDefeated: [] }>()
const max = computed(() => Math.max(props.rated.rating.budgets.extreme * 1.25, props.rated.rating.xp, 1))
const defeated = computed(() => props.rated.difficulty.rows.filter(r => r.defeated).length)
function setLevel(e: Event) { const v = (e.target as HTMLInputElement).value.trim(); emit('level', v === '' ? null : Math.max(1, Math.min(20, Number(v) || 1))) }
</script>

<template>
  <div class="meter" data-test="difficulty">
    <div class="head">
      <b class="threat" :class="rated.rating.threat" data-test="threat">{{ THREAT_LABEL[rated.rating.threat] }}</b>
      <span class="num">{{ rated.rating.xp }} XP</span><span class="grow" />
      <label class="faint">Party level <input class="input num lvl" :value="override ?? ''" :placeholder="String(rated.party.level ?? 1)" aria-label="Party level for this encounter" @change="setLevel" /></label>
    </div>
    <div class="bar"><i class="fill" :class="rated.rating.threat" :style="{ width: `${Math.min(100, (rated.rating.xp / max) * 100)}%` }" /><i v-for="t in THREATS" :key="t" class="tick" :style="{ left: `${(rated.rating.budgets[t] / max) * 100}%` }" :title="`${THREAT_LABEL[t]}: ${rated.rating.budgets[t]} XP`" /></div>
    <p class="faint">
      {{ rated.party.size || 4 }} characters<template v-if="!rated.party.size"> (no party yet: counted as four at level 1)</template><template v-if="rated.party.mixed && override === null"> · levels {{ rated.party.min }}–{{ rated.party.max }}</template>
      <template v-if="rated.difficulty.unlinked"> · {{ rated.difficulty.unlinked }} token{{ rated.difficulty.unlinked === 1 ? '' : 's' }} without a stat block add no XP</template>
      <template v-if="rated.difficulty.rows.some(r => r.tooStrong)"> · {{ rated.difficulty.rows.filter(r => r.tooStrong).map(r => r.name).join(', ') }}: far above the lowest level</template>
    </p>
    <p v-if="defeated" class="faint">{{ defeated }} removed {{ defeated === 1 ? 'enemy still counts' : 'enemies still count' }}. <button class="linkish" @click="emit('clearDefeated')">Forget them</button></p>
  </div>
</template>

<style scoped>
.meter { display: flex; flex-direction: column; gap: .35rem; } .head { display: flex; align-items: baseline; gap: .6rem; } .grow { flex: 1; }
.lvl { width: 3.2rem; display: inline-block; padding: .1em .3em; } p { margin: 0; font-size: .8rem; }
.bar { position: relative; height: 8px; background: var(--bg-sunken); border: var(--frame); border-radius: 99px; overflow: hidden; }
.fill { position: absolute; inset: 0 auto 0 0; background: var(--accent); } .tick { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--text-faint); }
.threat.trivial, .fill.trivial { color: #7fa37f; } .threat.low { color: #9bd17a; } .threat.moderate { color: #d9c34a; } .threat.severe { color: #e8924a; } .threat.extreme, .threat.beyond { color: var(--danger); }
.fill.trivial { background: #7fa37f; } .fill.low { background: #9bd17a; } .fill.moderate { background: #d9c34a; } .fill.severe { background: #e8924a; } .fill.extreme, .fill.beyond { background: var(--danger); }
.linkish { background: none; border: 0; padding: 0; color: var(--accent); }
</style>
