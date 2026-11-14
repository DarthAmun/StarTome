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
/** A linked player's own number (Play Buddy) is used as it is. */
const shares = (c: Character) => { const m = c.link?.mirror, k = skillKey(c); return k === 'perception' ? !!m?.defenses : typeof m?.skills?.skills[k] === 'number' }
const presetName = ref('')

// Seating by dragging: a name onto a station, onto "Free crew", or off the ship
const dragging = ref<string | null>(null)
const over = ref<string | null>(null)
const seated = (slot: number | null) => props.characters.filter(c => crew.value.has(c.id) && (crew.value.get(c.id)?.slot ?? null) === slot && (slot !== null || !stationOf(c)))
const ashore = computed(() => props.characters.filter(c => !crew.value.has(c.id)))
function dragStart(e: DragEvent, c: Character) { dragging.value = c.id; e.dataTransfer?.setData('text/plain', c.name); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move' }
function dropOn(target: number | null | 'off') {
  const id = dragging.value
  dragging.value = null; over.value = null
  if (!id) return
  if (target === 'off') void unassign(props.ship.id, id)
  else void assign(props.ship.id, id, target)
}

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
    <div v-if="characters.length" class="seats" data-test="crew-seats" @dragend="dragging = null; over = null">
      <div v-for="r in stations" :key="r.slot.slot" class="seat" :class="{ over: over === `s${r.slot.slot}` }" :data-seat="r.station?.name" @dragover.prevent="over = `s${r.slot.slot}`" @dragleave="over = null" @drop.prevent="dropOn(r.slot.slot)">
        <span class="seat-name">{{ r.slot.slot }} · {{ r.station?.name }}</span>
        <span v-for="c in seated(r.slot.slot)" :key="c.id" class="chip who-chip" draggable="true" :data-crew-chip="c.name" @dragstart="dragStart($event, c)">{{ c.name }}</span>
        <span v-if="!seated(r.slot.slot).length" class="faint none">empty</span>
      </div>
      <div class="seat free" :class="{ over: over === 'free' }" data-seat="Free crew" @dragover.prevent="over = 'free'" @dragleave="over = null" @drop.prevent="dropOn(null)">
        <span class="seat-name">Free crew</span>
        <span v-for="c in seated(null)" :key="c.id" class="chip who-chip" draggable="true" :data-crew-chip="c.name" @dragstart="dragStart($event, c)">{{ c.name }}</span>
      </div>
      <div class="seat off" :class="{ over: over === 'off' }" data-seat="Not aboard" @dragover.prevent="over = 'off'" @dragleave="over = null" @drop.prevent="dropOn('off')">
        <span class="seat-name">Not aboard</span>
        <span v-for="c in ashore" :key="c.id" class="chip who-chip" draggable="true" :data-crew-chip="c.name" @dragstart="dragStart($event, c)">{{ c.name }}</span>
      </div>
    </div>
    <p v-if="characters.length" class="faint">Drag a name onto a station, or choose below.</p>
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
           <input class="input num" :value="crewSkill(c, skillKey(c)) ?? ''" placeholder="+0" :disabled="shares(c)" :title="shares(c) ? 'From their Play Buddy' : undefined" :aria-label="`${skillOf(c)} of ${c.name}`" @change="setSkill(c, $event)" /></label>
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
.seats { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: .4rem; }
.seat { display: flex; flex-wrap: wrap; align-content: start; gap: .25rem; min-height: 3.6rem; padding: .35rem .5rem; border: 1px dashed var(--line-strong); border-radius: var(--radius); } .seat.over { border-style: solid; border-color: var(--accent); background: var(--accent-soft); }
.seat-name { width: 100%; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); } .seat.free, .seat.off { background: var(--bg-sunken); } .who-chip { cursor: grab; background: var(--bg-raised); color: var(--text); } .none { font-size: .8rem; }
.row { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; } .who { width: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .row .input { width: auto; padding: .2em .4em; }
.skill { display: flex; align-items: center; gap: .3rem; } .num { width: 3.6rem !important; } .presets { margin-top: .4rem; border-top: var(--frame); padding-top: .5rem; } .presets .chip { background: none; cursor: pointer; } .name { width: 13rem !important; } p { margin: 0; }
</style>
