<script setup lang="ts">
/**
 * A starship's battle stations on this map: where each stands, who helms it,
 * the ship's defenses with the helmed bonuses, what the acting crew member's
 * station lets them do, and the hull integrity check of a compromised ship.
 */
import { computed, ref } from 'vue'
import { checkDegree } from '@/domain/rules/dcs'
import { formatActionCost, signed } from '@/domain/rules/format'
import { EXPLORATION_ACTIVITIES, STATION_INITIATIVE_SKILL, stationKey, type CrewAssignment } from '@/domain/rules/playerStarship'
import { DEGREE_LABEL } from '@/domain/rules/rolls'
import { hullIntegrityDc } from '@/domain/rules/starshipCombat'
import { setCrew, stationsOf } from '@/data/starships'
import ProseText from '@/features/shared/ProseText.vue'
import { notify } from '@/ui/dialogs'
import { getToken, live, mapTokens } from './live'
import { defenses, helm, hullIntegrity, info, loadShip, malfunctioning, markers, pilotDc, placeMarker, setMalfunctioning, sheet, ship, shipState, shipToken } from './starshipLive'

/** The slot whose marker the next click on the map places; the page watches it. */
const placing = defineModel<number | null>('placing', { default: null })
const rows = computed(() => (ship.row ? stationsOf(ship.row) : []).filter(s => s.stationId).map(s => ({
  slot: s.slot, name: ship.lookup?.stations.get(s.stationId ?? '')?.name ?? 'Station', marker: markers.value.find(m => m.slot === s.slot) ?? null, helm: getToken(helm.value.get(s.slot))?.name ?? null,
})))
/** The station of whoever acts now. */
const turnStation = computed(() => { for (const [slot, id] of helm.value) if (id === live.activeId) return sheet.value?.stations.find(r => r.slot.slot === slot) ?? null; return null })
const startEffects = computed(() => (ship.row?.crew ?? []).filter(c => c.activity).map((c) => { const a = EXPLORATION_ACTIVITIES.find(x => x.key === c.activity); return { who: ship.party.find(p => p.id === c.characterId)?.name ?? '?', name: a?.name ?? '', summary: a?.summary ?? '' } }))
const lastHull = ref('')

function rollHull() {
  const dc = hullIntegrityDc(shipState.value.compromised ?? 0), d20 = Math.floor(Math.random() * 20) + 1, degree = checkDegree(d20, 0, dc)
  lastHull.value = `${d20} vs DC ${dc}: ${DEGREE_LABEL[degree]}`
  hullIntegrity(degree)
}
/** The crew as they stand now becomes the ship's roster: who is on a station, the rest free crew. */
async function saveAsCrew() {
  if (!ship.row) return
  const old = new Map((ship.row.crew as CrewAssignment[]).map(c => [c.characterId, c]))
  const crew: CrewAssignment[] = []
  for (const t of mapTokens()) {
    if (t.ref.kind !== 'character') continue
    const slot = [...helm.value].find(([, id]) => id === t.id)?.[0] ?? null
    crew.push({ characterId: t.ref.characterId, slot, activity: old.get(t.ref.characterId)?.activity ?? null })
  }
  await setCrew(ship.row.id, crew)
  await loadShip()
  notify('Saved as the ship\'s crew roster.', 'ok')
}
</script>

<template>
  <section v-if="info && ship.row" class="stations" data-test="stations-panel">
    <header><span class="eyebrow">{{ ship.row.name }} · stations</span><span class="chip">{{ info.role === 'interior' ? 'interior map' : 'battle' }}</span></header>
    <p v-if="defenses" class="def" :title="pilotDc != null ? `With the helmed stations' bonuses; the pilot's Piloting DC ${pilotDc} if higher` : `With the helmed stations' bonuses; no Piloting modifier entered for the pilot`">
      AC <b class="num">{{ defenses.ac }}</b> · Fort <b class="num">{{ signed(defenses.saves.fort) }}</b> · Ref <b class="num">{{ signed(defenses.saves.ref) }}</b> · Will <b class="num">{{ signed(defenses.saves.will) }}</b>
    </p>
    <div v-if="shipToken && shipState.compromised != null" class="hull">
      <b>Compromised {{ shipState.compromised }}</b><button class="btn btn-primary" data-test="hull-check" @click="rollHull">Hull integrity check (DC {{ hullIntegrityDc(shipState.compromised) }})</button><span class="faint">{{ lastHull }}</span>
    </div>
    <ul>
      <li v-for="r in rows" :key="r.slot" :class="{ off: malfunctioning(r.slot), placing: placing === r.slot }" :data-station-row="r.name">
        <b class="num n">{{ r.slot }}</b><span class="name">{{ r.name }}</span>
        <span v-if="r.helm" class="helm">{{ r.helm }}</span><span v-else-if="r.marker" class="faint">nobody</span>
        <span class="grow" />
        <button v-if="info.role === 'battle' && r.marker" class="btn btn-ghost" :title="malfunctioning(r.slot) ? 'Repaired (Repair Station)' : 'No station actions until repaired'" @click="setMalfunctioning([r.slot], !malfunctioning(r.slot))">{{ malfunctioning(r.slot) ? 'malfunctioning' : 'ok' }}</button>
        <button class="btn btn-ghost" :title="r.marker ? 'Click a square to move it; right-click here removes it' : 'Click a square of the map'" :data-place="r.slot" @click="placing = placing === r.slot ? null : r.slot" @contextmenu.prevent="placeMarker(r.slot, null)">{{ placing === r.slot ? 'click the map…' : r.marker ? 'move' : 'place' }}</button>
      </li>
    </ul>
    <p v-if="!rows.length" class="faint">This ship has no stations yet: give it a frame on the Starship page.</p>
    <div v-if="turnStation?.station" class="turn">
      <span class="eyebrow">{{ getToken(live.activeId)?.name }} at the {{ turnStation.station.name }}</span>
      <p v-if="malfunctioning(turnStation.slot.slot)" class="warn">Malfunctioning: no station actions until it is repaired.</p>
      <p class="faint">Initiative here: {{ STATION_INITIATIVE_SKILL[stationKey(turnStation.station.name)] ?? 'Perception' }}</p>
      <div v-for="a in turnStation.actions" :key="a.name"><b>{{ a.name }}</b> <span class="faint">{{ formatActionCost(a.cost) }}</span><ProseText :text="a.text" :campaign-id="live.encounter?.campaignId ?? ''" /></div>
    </div>
    <div v-if="info.role === 'battle' && startEffects.length && (live.encounter?.turn.round ?? 1) === 1" class="start">
      <span class="eyebrow">When initiative is rolled</span>
      <p v-for="e in startEffects" :key="e.who + e.name"><b>{{ e.who }}</b>: {{ e.name }}. <span class="faint">{{ e.summary }}</span></p>
    </div>
    <button class="btn" title="Who stands on which station becomes the ship's crew roster" @click="saveAsCrew">Save positions as crew</button>
  </section>
</template>

<style scoped>
.stations { display: flex; flex-direction: column; gap: .4rem; padding: .5rem .6rem; border-bottom: var(--frame); } header { display: flex; align-items: center; gap: .5rem; } .eyebrow { color: var(--accent); }
ul { list-style: none; margin: 0; padding: 0; } li { display: flex; align-items: center; gap: .4rem; padding: .1rem 0; } li.off .name { color: #e0803a; } li.placing { background: var(--accent-soft); }
.n { color: #4ab8e8; width: 1.1rem; } .helm { color: #3bbfa8; } .grow { flex: 1; } li .btn { padding: .05em .45em; font-size: .8rem; }
.def, p { margin: 0; } .hull { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; color: #d0503a; } .warn { color: var(--warn); }
.turn, .start { border-top: var(--frame); padding-top: .4rem; display: flex; flex-direction: column; gap: .3rem; font-size: .9rem; }
</style>
