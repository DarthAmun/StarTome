<script setup lang="ts">
/** The stat lines of a creature, a hazard or a vehicle, with their rolls. */
import { computed } from 'vue'
import type { GameId } from '@/domain/game'
import { formatMoney, signed, titleCase } from '@/domain/rules/format'
import type { AbilityKey, Creature, Hazard, RulesEntity, StatAction, Vehicle } from '@/domain/rules/types'
import { useStatRolls } from '@/ui/dice'
import ActionLine from './ActionLine.vue'
import StrikeLine from './StrikeLine.vue'
import { formatIwr, formatSense, humanize, md, spellsByRank } from './statText'

const props = defineProps<{ entity: RulesEntity; game?: GameId }>()
const { roll, canPlaceArea, placeArea } = useStatRolls(() => props.game ?? (props.entity.game === 'sf2e' ? 'sf2e' : 'pf2e'))

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const creature = computed(() => (props.entity.kind === 'creature' ? props.entity as Creature : null))
const hazard = computed(() => (props.entity.kind === 'hazard' ? props.entity as Hazard : null))
const vehicle = computed(() => (props.entity.kind === 'vehicle' ? props.entity as Vehicle : null))

const skills = computed(() => Object.entries(creature.value?.skills ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ key: k, label: titleCase(humanize(k)), mod: v })))
const speedLine = computed(() => {
  const parts = Object.entries(creature.value?.speeds ?? {}).map(([k, v]) => (k === 'land' ? `${v} feet` : `${k} ${v} feet`))
  return parts.length ? parts.join(', ') : '—'
})
const actionsIn = (section: StatAction['section']) => creature.value?.actions.filter(a => a.section === section) ?? []
const SAVES = [['fort', 'Fort', 'Fortitude'], ['ref', 'Ref', 'Reflex'], ['will', 'Will', 'Will']] as const
const hazardSaves = computed(() => SAVES.filter(([k]) => hazard.value?.saves?.[k]).map(([k, short, long]) => ({ short, long, mod: hazard.value?.saves?.[k] ?? 0 })))

function check(label: string, modifier: number) {
  roll({ kind: 'check', label: `${props.entity.name}: ${label}`, modifier })
}
</script>

<template>
  <template v-if="creature">
    <p class="line"><b>Perception</b> <button class="roll" title="Roll Perception" @click.stop="check('Perception', creature.perception)">{{ signed(creature.perception) }}</button><template v-if="creature.senses.length">; {{ creature.senses.map(formatSense).join(', ') }}</template></p>
    <p v-if="creature.languages.length" class="line"><b>Languages</b> {{ creature.languages.join(', ') }}</p>
    <p v-if="skills.length" class="line"><b>Skills</b>{{ ' ' }}<template v-for="(sk, i) in skills" :key="sk.key">{{ i ? ', ' : '' }}{{ sk.label }}{{ ' ' }}<button class="roll" :title="`Roll ${sk.label}`" @click.stop="check(sk.label, sk.mod)">{{ signed(sk.mod) }}</button></template></p>
    <p v-if="creature.inventory.length" class="line">
      <b>Items</b>{{ ' ' }}
      <template v-for="(inv, ii) in creature.inventory" :key="ii"><a v-if="inv.itemId" class="ref" data-ref-type="item" :data-ref-name="inv.name">{{ inv.name }}</a><template v-else>{{ inv.name }}</template><template v-if="inv.quantity > 1"> ({{ inv.quantity }})</template><template v-if="ii < creature.inventory.length - 1">, </template></template>
    </p>
    <p class="line abilities"><span v-for="k in ABILITY_KEYS" :key="k"><b>{{ titleCase(k) }}</b> {{ signed(creature.abilities[k]) }}</span></p>
    <ActionLine v-for="a in actionsIn('interaction')" :key="a.name" :action="a" :owner="entity.name" :can-place-area="canPlaceArea" @area="placeArea" />
    <hr />
    <p class="line">
      <b>AC</b> {{ creature.ac }}<template v-if="creature.acNote"> ({{ creature.acNote }})</template>;
      <template v-for="([k, short, long], i) in SAVES" :key="k"><b>{{ short }}</b> <button class="roll" :title="`Roll ${long}`" @click.stop="check(`${long} save`, creature.saves[k])">{{ signed(creature.saves[k]) }}</button>{{ i < 2 ? ', ' : '' }}</template><template v-if="creature.saveNote">; {{ creature.saveNote }}</template>
    </p>
    <p class="line">
      <b>HP</b> {{ creature.hp }}<template v-if="creature.hpNote"> ({{ creature.hpNote }})</template>
      <template v-if="creature.hardness">; <b>Hardness</b> {{ creature.hardness }}</template>
      <template v-if="creature.immunities.length">; <b>Immunities</b> {{ creature.immunities.join(', ') }}</template>
      <template v-if="creature.weaknesses.length">; <b>Weaknesses</b> {{ creature.weaknesses.map(formatIwr).join(', ') }}</template>
      <template v-if="creature.resistances.length">; <b>Resistances</b> {{ creature.resistances.map(formatIwr).join(', ') }}</template>
    </p>
    <ActionLine v-for="a in actionsIn('defensive')" :key="a.name" :action="a" :owner="entity.name" :can-place-area="canPlaceArea" @area="placeArea" />
    <hr />
    <p class="line"><b>Speed</b> {{ speedLine }}</p>
    <StrikeLine v-for="(s, i) in creature.strikes" :key="'s' + i" :strike="s" :owner="entity.name" :can-place-area="canPlaceArea" @roll="roll" @area="placeArea" />
    <p v-for="(sc, i) in creature.spellcasting" :key="'sc' + i" class="line">
      <b>{{ sc.name }}</b> DC {{ sc.dc }}<template v-if="sc.attack !== undefined">, attack <button class="roll" title="Roll a spell attack" @click.stop="roll({ kind: 'attack', label: `${entity.name}: ${sc.name} spell attack`, modifier: sc.attack })">{{ signed(sc.attack) }}</button></template>;
      <template v-for="(group, gi) in spellsByRank(sc)" :key="gi">
        <b>{{ group.label }}</b>{{ ' ' }}
        <template v-for="(sp, si) in group.spells" :key="si"><a class="ref" data-ref-type="spell" :data-ref-name="sp.name">{{ sp.name }}</a><template v-if="sp.uses"> (×{{ sp.uses }})</template><template v-if="si < group.spells.length - 1">, </template></template><template v-if="gi < spellsByRank(sc).length - 1">; </template>
      </template>
    </p>
    <ActionLine v-for="a in actionsIn('offensive')" :key="a.name" :action="a" :owner="entity.name" :can-place-area="canPlaceArea" @area="placeArea" />
  </template>

  <template v-if="hazard">
    <p class="line"><b>Stealth</b> {{ hazard.stealth.bonus === null ? '—' : signed(hazard.stealth.bonus) }}<template v-if="hazard.stealth.note"> {{ hazard.stealth.note }}</template></p>
    <!-- eslint-disable vue/no-v-html -- sanitised by renderMarkdown -->
    <div v-if="entity.description" class="prose line" v-html="md(`**Description** ${entity.description}`)" />
    <hr />
    <div v-if="hazard.disable" class="prose line" v-html="md(`**Disable** ${hazard.disable}`)" />
    <p v-if="hazard.ac || hazardSaves.length || hazard.hp" class="line">
      <template v-if="hazard.ac"><b>AC</b> {{ hazard.ac }}; </template>
      <template v-for="(sv, i) in hazardSaves" :key="sv.short"><b>{{ sv.short }}</b> <button class="roll" :title="`Roll ${sv.long}`" @click.stop="check(`${sv.long} save`, sv.mod)">{{ signed(sv.mod) }}</button>{{ i < hazardSaves.length - 1 ? ', ' : '; ' }}</template>
      <template v-if="hazard.hardness"><b>Hardness</b> {{ hazard.hardness }}; </template>
      <template v-if="hazard.hp"><b>HP</b> {{ hazard.hp }}<template v-if="hazard.bt"> (BT {{ hazard.bt }})</template></template>
      <template v-if="hazard.immunities?.length">; <b>Immunities</b> {{ hazard.immunities.join(', ') }}</template>
      <template v-if="hazard.weaknesses?.length">; <b>Weaknesses</b> {{ hazard.weaknesses.map(formatIwr).join(', ') }}</template>
      <template v-if="hazard.resistances?.length">; <b>Resistances</b> {{ hazard.resistances.map(formatIwr).join(', ') }}</template>
    </p>
    <StrikeLine v-for="(s, i) in hazard.strikes ?? []" :key="'hs' + i" :strike="s" :owner="entity.name" :can-place-area="canPlaceArea" @roll="roll" @area="placeArea" />
    <ActionLine v-for="a in hazard.actions" :key="a.name" :action="a" :owner="entity.name" :can-place-area="canPlaceArea" @area="placeArea" />
    <div v-if="hazard.routine" class="prose line" v-html="md(`**Routine** ${hazard.routine}`)" />
    <div v-if="hazard.reset" class="prose line" v-html="md(`**Reset** ${hazard.reset}`)" />
    <!-- eslint-enable vue/no-v-html -->
  </template>

  <template v-if="vehicle">
    <p v-if="vehicle.price" class="line"><b>Price</b> {{ formatMoney(vehicle.price, entity.game) }}</p>
    <p class="line"><b>Space</b> {{ vehicle.space ? `${vehicle.space.long} feet long, ${vehicle.space.wide} feet wide, ${vehicle.space.high} feet high` : '—' }}</p>
    <p class="line"><b>Crew</b> {{ vehicle.crew || '—' }}<template v-if="vehicle.passengers">; <b>Passengers</b> {{ vehicle.passengers }}</template></p>
    <p v-if="vehicle.pilotingCheck" class="line"><b>Piloting Check</b> {{ vehicle.pilotingCheck }}</p>
    <hr />
    <p class="line"><b>AC</b> {{ vehicle.ac }}; <b>Fort</b> <button class="roll" title="Roll Fortitude" @click.stop="check('Fortitude save', vehicle.fort)">{{ signed(vehicle.fort) }}</button></p>
    <p class="line">
      <b>Hardness</b> {{ vehicle.hardness }}, <b>HP</b> {{ vehicle.hp }}<template v-if="vehicle.bt"> (BT {{ vehicle.bt }})</template>
      <template v-if="vehicle.immunities.length">; <b>Immunities</b> {{ vehicle.immunities.join(', ') }}</template>
      <template v-if="vehicle.weaknesses.length">; <b>Weaknesses</b> {{ vehicle.weaknesses.map(formatIwr).join(', ') }}</template>
      <template v-if="vehicle.resistances.length">; <b>Resistances</b> {{ vehicle.resistances.map(formatIwr).join(', ') }}</template>
    </p>
    <p v-if="vehicle.collision.dc || vehicle.collision.damage" class="line"><b>Collision</b> {{ vehicle.collision.damage }}<template v-if="vehicle.collision.dc"> (DC {{ vehicle.collision.dc }})</template></p>
    <hr />
    <p class="line"><b>Speed</b> {{ vehicle.speed || '—' }}</p>
    <ActionLine v-for="a in vehicle.actions" :key="a.name" :action="a" :owner="entity.name" :can-place-area="canPlaceArea" @area="placeArea" />
  </template>
</template>
