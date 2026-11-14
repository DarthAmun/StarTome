<script setup lang="ts">
/** Starfinder starship kinds: enemy starship, frame, battle station, station upgrade, expansion bay. */
import { computed } from 'vue'
import type { GameId } from '@/domain/game'
import { signed, titleCase } from '@/domain/rules/format'
import type { AbilityKey, BattleStation, ExpansionBay, RulesEntity, Starship, StarshipFrame, StationAction, StationAdvancement, StationUpgrade } from '@/domain/rules/types'
import { useStatRolls } from '@/ui/dice'
import ActionLine from './ActionLine.vue'
import StrikeLine from './StrikeLine.vue'
import { formatIwr, humanize, md, zonesText } from './statText'

const props = defineProps<{ entity: RulesEntity; game?: GameId }>()
const { roll, canZoneArea, zoneArea } = useStatRolls(() => props.game ?? 'sf2e')

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const SAVES = [['fort', 'Fort', 'Fortitude'], ['ref', 'Ref', 'Reflex'], ['will', 'Will', 'Will']] as const
const starship = computed(() => (props.entity.kind === 'starship' ? props.entity as Starship : null))
const frame = computed(() => (props.entity.kind === 'starshipFrame' ? props.entity as StarshipFrame : null))
const station = computed(() => (props.entity.kind === 'battleStation' ? props.entity as BattleStation : null))
const upgrade = computed(() => (props.entity.kind === 'stationUpgrade' ? props.entity as StationUpgrade : null))
const bay = computed(() => (props.entity.kind === 'expansionBay' ? props.entity as ExpansionBay : null))

const skills = computed(() => Object.entries(starship.value?.skills ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ key: k, label: titleCase(humanize(k)), mod: v })))

/** Only the columns a station's table uses. */
const stationColumns = computed(() => {
  const rows = station.value?.advancement ?? []
  const helmed = (k: 'ac' | 'fort' | 'ref' | 'will', label: string) => ({ label, used: (r: StationAdvancement) => r.helmed?.[k] !== undefined, value: (r: StationAdvancement) => signed(r.helmed?.[k] ?? 0) })
  const cols = [
    helmed('ac', 'Helmed AC'), helmed('fort', 'Helmed Fort'), helmed('ref', 'Helmed Ref'), helmed('will', 'Helmed Will'),
    { label: 'Sensors', used: (r: StationAdvancement) => r.sensors !== undefined, value: (r: StationAdvancement) => `+${r.sensors ?? 0} zones` },
    { label: 'Damage dice', used: (r: StationAdvancement) => r.damageDice !== undefined, value: (r: StationAdvancement) => String(r.damageDice ?? 1) },
    { label: 'Tracking', used: (r: StationAdvancement) => r.tracking !== undefined, value: (r: StationAdvancement) => (r.tracking ? `+${r.tracking}` : '—') },
    { label: 'Drones', used: (r: StationAdvancement) => r.drones !== undefined, value: (r: StationAdvancement) => String(r.drones ?? 0) },
  ]
  return cols.filter(c => rows.some(c.used))
})
/** A station's actions by the grade they come at. */
const stationGrades = computed(() => {
  const order = ['commercial', 'tactical', 'advanced', 'superior', 'elite', 'ultimate', 'paragon']
  const by = new Map<string, StationAction[]>()
  for (const a of station.value?.actions ?? []) by.set(a.grade ?? 'commercial', [...(by.get(a.grade ?? 'commercial') ?? []), a])
  return order.filter(g => by.has(g)).map(g => ({ grade: g, actions: by.get(g) ?? [] }))
})

function check(label: string, modifier: number) {
  roll({ kind: 'check', label: `${props.entity.name}: ${label}`, modifier })
}
</script>

<template>
  <template v-if="starship">
    <p class="line"><b>Perception</b> <button class="roll" title="Roll Perception" @click.stop="check('Perception', starship.perception)">{{ signed(starship.perception) }}</button>; <b>Sensor Range</b> {{ zonesText(starship.sensorRange) }}</p>
    <p v-if="skills.length" class="line"><b>Skills</b>{{ ' ' }}<template v-for="(sk, i) in skills" :key="sk.key">{{ i ? ', ' : '' }}{{ sk.label }}{{ ' ' }}<button class="roll" :title="`Roll ${sk.label}`" @click.stop="check(sk.label, sk.mod)">{{ signed(sk.mod) }}</button></template></p>
    <p v-if="starship.battleStations.length" class="line">
      <b>Battle Stations</b>{{ ' ' }}<template v-for="(b, i) in starship.battleStations" :key="i">{{ i ? ', ' : '' }}{{ b.station }}<template v-if="b.actions.length || b.weapons?.length"> ({{ [...(b.weapons ?? []), ...b.actions].join(', ') }})</template></template>
    </p>
    <p class="line abilities"><span v-for="k in ABILITY_KEYS" :key="k"><b>{{ titleCase(k) }}</b> {{ signed(starship.abilities[k]) }}</span></p>
    <hr />
    <p class="line">
      <b>AC</b> {{ starship.ac }};
      <template v-for="([k, short, long], i) in SAVES" :key="k"><b>{{ short }}</b> <button class="roll" :title="`Roll ${long}`" @click.stop="check(`${long} save`, starship.saves[k])">{{ signed(starship.saves[k]) }}</button>{{ i < 2 ? ', ' : '' }}</template>
    </p>
    <p class="line">
      <b>HP</b> {{ starship.hp }}<template v-if="starship.shields">; <b>SP</b> {{ starship.shields.max }}<template v-if="starship.shields.fortify"> (fortify {{ starship.shields.fortify }})</template></template>
      <template v-if="starship.immunities.length">; <b>Immunities</b> {{ starship.immunities.join(', ') }}</template>
      <template v-if="starship.weaknesses.length">; <b>Weaknesses</b> {{ starship.weaknesses.map(formatIwr).join(', ') }}</template>
      <template v-if="starship.resistances.length">; <b>Resistances</b> {{ starship.resistances.map(formatIwr).join(', ') }}</template>
    </p>
    <hr />
    <p class="line"><b>Speed</b> {{ zonesText(starship.speed) }}</p>
    <StrikeLine v-for="(s, i) in starship.strikes" :key="'ss' + i" :strike="s" :owner="entity.name" @roll="roll" />
    <ActionLine v-for="a in starship.actions" :key="a.name" :action="a" :owner="entity.name" :can-zone-area="canZoneArea" @zone="zoneArea" />
  </template>

  <template v-if="frame">
    <p class="line"><b>Sensor Range</b> {{ zonesText(frame.sensorRange) }}; <b>Expansion Bays</b> {{ frame.expansionBays }}</p>
    <p class="line"><b>Battle Stations</b> {{ frame.customSlots }} customizable slots<template v-if="frame.defaultStations.length"> plus {{ frame.defaultStations.map(d => d.upgrades.length ? `${d.station} (${d.upgrades.join(', ')})` : d.station).join(' and ') }}</template></p>
    <table v-if="frame.stats.length" class="stat-table">
      <thead><tr><th>Level</th><th>HP</th><th>SP</th><th>AC</th><th>Fort</th><th>Ref</th><th>Will</th><th>Speed</th></tr></thead>
      <tbody>
        <tr v-for="r in [...frame.stats].sort((a, b) => a.level - b.level)" :key="r.level">
          <td>{{ r.level }}</td><td>{{ r.hp }}</td><td>{{ r.sp }}</td><td>{{ r.ac }}</td><td>{{ signed(r.fort) }}</td><td>{{ signed(r.ref) }}</td><td>{{ signed(r.will) }}</td><td>{{ zonesText(r.speed) }}</td>
        </tr>
      </tbody>
    </table>
  </template>

  <template v-if="station">
    <!-- eslint-disable vue/no-v-html -- sanitised by renderMarkdown -->
    <div v-if="station.benefits" class="prose line" v-html="md(`**Benefits** ${station.benefits}`)" />
    <div v-if="station.helmedBenefits" class="prose line" v-html="md(`**Helmed Benefits** ${station.helmedBenefits}`)" />
    <!-- eslint-enable vue/no-v-html -->
    <table v-if="station.advancement.length" class="stat-table">
      <thead><tr><th>Grade</th><th>Level</th><th>Upgrades</th><th v-for="c in stationColumns" :key="c.label">{{ c.label }}</th></tr></thead>
      <tbody>
        <tr v-for="r in station.advancement" :key="r.grade"><td>{{ titleCase(r.grade) }}</td><td>{{ r.level }}</td><td>{{ r.upgrades }}</td><td v-for="c in stationColumns" :key="c.label">{{ c.value(r) }}</td></tr>
      </tbody>
    </table>
    <template v-for="g in stationGrades" :key="g.grade">
      <p class="line subhead"><b>{{ titleCase(g.grade) }}</b></p>
      <ActionLine v-for="a in g.actions" :key="a.name" :action="a" :owner="entity.name" />
    </template>
  </template>

  <template v-if="upgrade">
    <p class="line"><b>Usage</b> installed in {{ upgrade.station === 'any' ? 'any battle station' : `a ${upgrade.station}` }}</p>
    <p v-if="upgrade.weapon" class="line">
      <b>{{ titleCase(upgrade.weapon.category) }} ranged starship weapon</b>; <b>Damage</b> {{ upgrade.weapon.damage.dice }}{{ upgrade.weapon.damage.die }} {{ upgrade.weapon.damage.type }};
      <b>Range</b> {{ zonesText(upgrade.weapon.range) }}; <b>Upgrades</b> {{ upgrade.weapon.upgrades }}<template v-if="upgrade.weapon.group">; <b>Group</b> {{ upgrade.weapon.group }}</template>
    </p>
    <ActionLine v-for="a in upgrade.actions" :key="a.name" :action="a" :owner="entity.name" />
    <p v-for="g in upgrade.grades ?? []" :key="g.grade" class="line"><b>Type</b> {{ g.grade }}; <b>Level</b> {{ g.level }}<template v-if="g.text">; {{ g.text }}</template></p>
  </template>

  <template v-if="bay">
    <p class="line">{{ bay.takesSlot ? 'Takes an expansion bay slot.' : "Doesn't take an expansion bay slot." }}</p>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown -->
    <p v-for="o in bay.options ?? []" :key="o.name" class="line"><b>{{ o.name }}</b> <span class="prose inline" v-html="md(o.text)" /></p>
  </template>
</template>
