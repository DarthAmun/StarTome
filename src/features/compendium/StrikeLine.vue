<script setup lang="ts">
/** A Strike: three attack buttons with the multiple attack penalty, damage, critical and two-hand damage. */
import { computed } from 'vue'
import { formatTrait, signed } from '@/domain/rules/format'
import { strikeModifier, twoHandFormula, type MapStep } from '@/domain/rules/rolls'
import { areaFireDcFromStrike, weaponAreas, type WeaponArea } from '@/domain/rules/sf2eGear'
import type { AreaSpec, StatRoll } from '@/domain/rules/statRolls'
import type { StarshipStrike, Strike } from '@/domain/rules/types'
import { zonesText } from './statText'

const props = defineProps<{ strike: Strike | StarshipStrike; owner: string; canPlaceArea?: boolean }>()
const emit = defineEmits<{ roll: [r: StatRoll]; area: [spec: AreaSpec] }>()

const STEPS: MapStep[] = [0, 1, 2]
const TITLE: Record<MapStep, string> = { 0: 'First attack', 1: 'Second attack (multiple attack penalty)', 2: 'Third attack (multiple attack penalty)' }
const SUFFIX: Record<MapStep, string> = { 0: '', 1: ' (2nd attack)', 2: ' (3rd attack)' }

const s = computed(() => props.strike)
const twoHand = computed(() => twoHandFormula(s.value))
const zones = computed(() => ('rangeZones' in s.value && s.value.rangeZones ? [`range increment ${zonesText(s.value.rangeZones)}`] : []))
const notes = computed(() => [...s.value.traits.map(formatTrait), ...zones.value])
/** SF2e area and automatic weapons. */
const areas = computed<WeaponArea[]>(() => (props.canPlaceArea && s.value.range === 'ranged' ? weaponAreas(s.value.traits, s.value.rangeIncrement) : []))

function damageText(inTwoHands = false) {
  return s.value.damage.map((d, i) => `${i === 0 && inTwoHands ? twoHand.value ?? d.formula : d.formula} ${d.type}`).join(' plus ')
}
function attack(step: MapStep) {
  emit('roll', { kind: 'attack', label: `${props.owner}: ${s.value.name}${SUFFIX[step]}`, modifier: strikeModifier(s.value, step), strike: s.value })
}
function damage(critical = false, inTwoHands = false) {
  const how = [inTwoHands ? 'two-handed' : '', critical ? 'critical' : ''].filter(Boolean).join(', ')
  emit('roll', { kind: 'damage', label: `${props.owner}: ${s.value.name} damage${how ? ` (${how})` : ''}`, strike: s.value, critical, twoHand: inTwoHands })
}
function place(a: WeaponArea) {
  const first = s.value.damage[0]
  emit('area', {
    label: `${s.value.name} ${a.action} (${props.owner})`, kind: a.kind, sizeFt: a.sizeFt,
    effect: { save: 'ref', dc: areaFireDcFromStrike(s.value.bonus), basic: true, damage: first ? { formula: first.formula, type: first.type } : null },
  })
}
</script>

<template>
  <p class="line">
    <b>{{ s.range === 'melee' ? 'Melee' : 'Ranged' }}</b> <span class="glyph">◆</span> {{ s.name }}
    <button v-for="a in areas" :key="a.action + a.kind" class="place" :title="`${a.action}: place a ${a.sizeFt}-foot ${a.kind} and roll basic Reflex saves against DC ${areaFireDcFromStrike(s.bonus)} (10 + the Strike's bonus)`" @click.stop="place(a)">{{ a.action }}</button>
    <template v-for="step in STEPS" :key="step"><button class="roll" :title="TITLE[step]" @click.stop="attack(step)">{{ signed(strikeModifier(s, step)) }}</button><template v-if="step < 2">/</template></template>
    <template v-if="notes.length"> ({{ notes.join(', ') }})</template>,
    <b>Damage</b> <button class="roll" title="Roll damage" @click.stop="damage()">{{ damageText() }}</button>{{ ' ' }}<button class="roll crit" title="Roll critical damage: doubled, with deadly and fatal" @click.stop="damage(true)">crit</button><template v-if="twoHand">; two-handed <button class="roll" title="Roll damage wielded in two hands" @click.stop="damage(false, true)">{{ damageText(true) }}</button>{{ ' ' }}<button class="roll crit" title="Roll critical damage in two hands" @click.stop="damage(true, true)">crit</button></template><template v-if="s.effects?.length"> plus {{ s.effects.join(', ') }}</template>
  </p>
</template>
