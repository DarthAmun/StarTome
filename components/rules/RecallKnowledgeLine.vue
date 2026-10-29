<template>
  <p class="rk-line" title="GM only: Recall Knowledge to identify this">
    <b>Recall Knowledge</b> DC {{ rk.dc }}<template v-if="rk.rarity !== 'common'"> ({{ rk.rarity }})</template>;
    {{ rk.skills.length ? rk.skills.map(titleCase).join(', ') : "GM's choice" }};
    <b>Lore</b> DC {{ rk.loreDcs.specific }} / {{ rk.loreDcs.verySpecific }}
  </p>
</template>

<script setup lang="ts">
/** GM-only Recall Knowledge line for a creature or hazard (FEATURES_PLAN §10.1). */
import { recallKnowledge } from '~/rules/dcs'
import { titleCase } from '~/rules/format'
import type { GameId } from '~/types/game'
import type { RulesEntity } from '~/types/rules'

const props = defineProps<{ entity: RulesEntity; game?: GameId }>()

const rk = computed(() => recallKnowledge(props.entity, props.game))
</script>

<style scoped>
.rk-line {
  margin: 4px 0 8px; padding: 3px 8px; border-left: 3px solid #8b2030; border-radius: 0 4px 4px 0;
  background: oklch(54% 0.24 22 / 0.08); font-size: 12.5px;
}
.rk-line b { font-weight: 700; color: var(--text); }
</style>
