<script setup lang="ts">
/** Who is at which station, what each does while travelling, and their skill modifiers where they matter. Crews you use again are saved by name. */
import { computed, ref } from 'vue'
import { activitiesFor, crewSkill, STATION_INITIATIVE_SKILL, stationKey, type CrewAssignment, type StarshipSheet } from '@/domain/rules/playerStarship'
import type { Character, Starship } from '@/domain/schema'
import { updateCharacter } from '@/data/party'
import { applyPreset, assign, deletePreset, savePreset, setActivity, unassign } from '@/data/starships'

const props = defineProps<{ ship: Starship; sheet: StarshipSheet; characters: Character[] }>()
const crew = computed(() => new Map((props.ship.crew as CrewAssignment[]).map(c => [c.characterId, c])))
const stations = computed(() => props.sheet.stations.filter(r => r.station))
const stationOf = (c: Character) => stations.value.find(r => r.slot.slot === crew.value.get(c.id)?.slot)?.station ?? null
const skillOf = (c: Character) => { const s = stationOf(c); return s ? STATION_INITIATIVE_SKILL[stationKey(s.name)] ?? 'Perception' : 'Perception' }
/** The one word a hand-entered modifier is stored under ("Piloting"; the magic conduit's is whichever the character uses). */
const skillKey = (c: Character) => (/^[A-Za-z]+$/.test(skillOf(c)) ? skillOf(c).toLowerCase() : 'tradition')
const presetName = ref('')

function place(c: Character, e: Event) {
  const v = (e.target as HTMLSelectElement).value
  if (v === 'off') void unassign(props.ship.id, c.id)
  else void assign(props.ship.id, c.id, v === '' ? null : Number(v))
}
function setSkill(c: Character, e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim(), skills = { ...(c.skills ?? {}) }
  if (raw === '' || !Number.isFinite(Number(raw))) delete skills[skillKey(c)]
  else skills[skillKey(c)] = Number(raw)
  void updateCharacter(c.id, { skills })
}
</script>

<template>
  <section class="panel block" data-test="ship-crew">
    <span class="eyebrow">Crew</span>
    <div v-for="c in characters" :key="c.id" class="row" :data-crew="c.name">
      <b class="who">{{ c.name }}</b>
      <select class="input" :value="crew.has(c.id) ? (crew.get(c.id)?.slot ?? '') : 'off'" :aria-label="`Station of ${c.name}`" @change="place(c, $event)">
        <option value="off">Not aboard</option><option value="">Free crew</option><option v-for="r in stations" :key="r.slot.slot" :value="r.slot.slot">{{ r.slot.slot }} · {{ r.station?.name }}</option>
      </select>
      <template v-if="crew.has(c.id)">
        <select class="input" :value="crew.get(c.id)?.activity ?? ''" :aria-label="`Activity of ${c.name}`" :title="activitiesFor(stationOf(c)?.name).find(a => a.key === crew.get(c.id)?.activity)?.summary" @change="setActivity(ship.id, c.id, ($event.target as HTMLSelectElement).value || null)">
          <option value="">No exploration activity</option><option v-for="a in activitiesFor(stationOf(c)?.name)" :key="a.key" :value="a.key">{{ a.name }}</option>
        </select>
        <label class="faint skill" :title="`Rolled for initiative at this station: ${skillOf(c)}`">{{ skillKey(c) === 'tradition' ? 'Tradition skill' : skillOf(c) }}
          <input class="input num" :value="crewSkill(c, skillKey(c)) ?? ''" placeholder="+0" :aria-label="`${skillOf(c)} of ${c.name}`" @change="setSkill(c, $event)" /></label>
      </template>
    </div>
    <p v-if="!characters.length" class="faint">No party members yet. Add them on the Party page.</p>
    <div class="row presets">
      <button v-for="p in ship.presets" :key="p.name" class="chip" :title="`Seat the crew as “${p.name}”; right-click deletes it`" @click="applyPreset(ship.id, p.name)" @contextmenu.prevent="deletePreset(ship.id, p.name)">{{ p.name }}</button>
      <input v-model="presetName" class="input name" placeholder="Save this seating as…" aria-label="Crew preset name" @keydown.enter="savePreset(ship.id, presetName); presetName = ''" />
    </div>
  </section>
</template>

<style scoped>
.block { padding: .9rem 1.1rem; display: flex; flex-direction: column; gap: .45rem; } .eyebrow { color: var(--accent); }
.row { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; } .who { width: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .row .input { width: auto; padding: .2em .4em; }
.skill { display: flex; align-items: center; gap: .3rem; } .num { width: 3.6rem !important; } .presets { margin-top: .4rem; border-top: var(--frame); padding-top: .5rem; } .presets .chip { background: none; cursor: pointer; } .name { width: 13rem !important; } p { margin: 0; }
</style>
