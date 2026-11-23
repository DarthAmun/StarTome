<script setup lang="ts">
/**
 * A spell's damage with the rank to cast it at: the formula follows the rank
 * (heightening), one click rolls it. In an encounter the roll goes to the
 * target like a Strike's damage; elsewhere to the dice panel.
 */
import { computed, ref, watch } from 'vue'
import type { GameId } from '@/domain/game'
import { parseExpression } from '@/domain/rules/rolls'
import { baseRank, damageText, heighteningOf, heightensAutomatically, MAX_RANK, spellDamageAt } from '@/domain/rules/spellDamage'
import { resolveStatRoll, type StatRoll } from '@/domain/rules/statRolls'
import type { Spell, Strike } from '@/domain/rules/types'
import { showRoll, useStatRolls } from '@/ui/dice'
import { ordinal } from './statText'

const props = defineProps<{ spell: Spell; game?: GameId; /** The rank it is cast at, e.g. from a creature's spell list. */ rank?: number }>()
const { roll } = useStatRolls(() => props.game ?? (props.spell.game === 'both' ? undefined : props.spell.game))

const from = computed(() => baseRank(props.spell))
const ranks = computed(() => Array.from({ length: MAX_RANK - from.value + 1 }, (_, i) => from.value + i))
const at = ref(from.value)
watch(() => [props.spell.id, props.rank] as const, () => { at.value = Math.max(from.value, Math.min(MAX_RANK, props.rank ?? from.value)) }, { immediate: true })

const auto = computed(() => heightensAutomatically(props.spell))
const grows = computed(() => !!heighteningOf(props.spell))
const parts = computed(() => spellDamageAt(props.spell, at.value))
const rollable = computed(() => parts.value.length > 0 && parts.value.every(p => parseExpression(p.formula)))
const healing = computed(() => parts.value.every(p => p.type === 'healing'))
const attack = computed(() => !!props.spell.defense && 'ac' in props.spell.defense)

function rankLabel(r: number): string {
  // Cantrips and focus spells: the caster levels that cast at this rank
  return auto.value ? `${ordinal(r)} (level ${r * 2 - 1}–${r * 2})` : ordinal(r)
}

function go(critical = false) {
  const strike: Strike = { name: props.spell.name, range: 'ranged', bonus: 0, traits: [], damage: parts.value }
  const what = healing.value ? 'healing' : 'damage'
  const r: StatRoll = { kind: 'damage', label: `${props.spell.name} ${what} (${ordinal(at.value)} rank${critical ? ', critical' : ''})`, strike, critical }
  // Healing isn't damage to apply to a target: it goes to the dice panel
  if (healing.value) showRoll(resolveStatRoll(r, props.game ?? 'pf2e'))
  else roll(r)
}
</script>

<template>
  <p class="line spell-damage" data-test="spell-damage">
    <b>{{ healing ? 'Healing' : 'Damage' }}</b>
    <select v-if="ranks.length > 1 && grows" v-model.number="at" class="rank" aria-label="Rank cast at" :title="auto ? 'Rank cast at: half the caster\'s level, rounded up' : 'Rank cast at'" data-test="spell-rank" @click.stop>
      <option v-for="r in ranks" :key="r" :value="r">{{ rankLabel(r) }}</option>
    </select>
    <button v-if="rollable" class="roll" :title="`Roll the ${healing ? 'healing' : 'damage'} at ${ordinal(at)} rank`" data-test="spell-damage-roll" @click.stop="go()">{{ damageText(parts) }}</button>
    <span v-else>{{ damageText(parts) }}</span>
    <template v-if="rollable && attack">{{ ' ' }}<button class="roll crit" title="Roll critical damage: doubled (a critical hit with a spell attack)" @click.stop="go(true)">crit</button></template>
  </p>
</template>

<style scoped>
.rank { font: inherit; font-size: .85em; padding: 0 .2em; margin-right: .3em; background: var(--bg-raised); color: var(--text); border: var(--frame); border-radius: var(--radius); }
</style>
