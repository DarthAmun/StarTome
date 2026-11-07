<template>
  <div v-if="info" class="ssp" :class="{ 'ssp--collapsed': collapsed }">
    <div class="ssp-head" @click="collapsed = !collapsed">
      <OhVueIcon name="gi-spaceship" scale="0.8" style="color: #4ab8e8" />
      <b>{{ ship?.name ?? 'Starship' }}</b>
      <span class="ssp-dim">{{ info.role === 'interior' ? 'interior map' : `level ${level}` }}</span>
      <span class="ssp-spacer" />
      <span class="ssp-dim">{{ collapsed ? '▸' : '▾' }}</span>
    </div>
    <template v-if="!collapsed">
      <div v-if="!ship" class="ssp-warn">The starship of this encounter is gone.</div>
      <template v-else>
        <div v-if="info.role === 'battle'" class="ssp-stats" title="With the helmed stations' bonuses">
          AC {{ sheet.ac }} · Fort {{ signed(sheet.saves.fort) }} · Ref {{ signed(sheet.saves.ref) }} · Will {{ signed(sheet.saves.will) }}
          · HP {{ ship.hp_current ?? sheet.hp }}/{{ sheet.hp }} · SP {{ ship.sp_current ?? sheet.sp }}/{{ sheet.sp }}
        </div>

        <!-- The station of whoever's turn it is -->
        <div v-if="turnStation" class="ssp-turn">
          <div class="ssp-turn-head">
            <span class="ssp-slot">{{ turnStation.slot.slot }}</span>
            <b>{{ turnStation.station?.name }}</b>
            <span class="ssp-grade">{{ turnStation.grade?.grade }}</span>
          </div>
          <div class="ssp-dim">{{ turnTokenName }} is helming · initiative skill: {{ skillName }}</div>
          <div v-for="a in turnStation.actions" :key="a.name" class="ssp-action">
            <details>
              <summary><b>{{ a.name }}</b> <span class="ssp-glyph">{{ formatActionCost(a.cost) }}</span><template v-if="a.frequency"> · {{ a.frequency }}</template></summary>
              <div class="ssp-md" v-html="md(a.text)" />
            </details>
          </div>
          <div v-if="!turnStation.actions.length" class="ssp-dim">No station actions at this grade.</div>
        </div>

        <div class="ssp-list">
          <div v-for="r in rows" :key="r.slot" class="ssp-row" :class="{ 'ssp-row--turn': turnStation?.slot.slot === r.slot }">
            <span class="ssp-slot" :style="{ background: colorOf(r.slot) }">{{ r.slot }}</span>
            <span class="ssp-name">{{ r.name }}</span>
            <span class="ssp-dim">{{ r.helm ?? (r.marker ? 'nobody' : 'not on the map') }}</span>
            <button class="ssp-btn" :class="{ active: placing === r.slot }" :title="r.marker ? 'Move the station: click a square' : 'Place the station: click a square'"
              @click="emit('place', placing === r.slot ? null : r.slot)">{{ r.marker ? 'Move' : 'Place' }}</button>
            <button v-if="r.marker" class="ssp-btn" title="Take the station off the map" @click="clearMarker(r.slot)">×</button>
          </div>
        </div>
        <div v-if="info.role === 'battle'" class="ssp-foot">
          <button class="ssp-btn" title="Who stands at which station now becomes the ship's crew roster (activities stay)" @click="saveCrew">Save positions as crew</button>
          <span v-if="saved" class="ssp-dim">Saved</span>
        </div>
        <div v-else class="ssp-dim ssp-foot">Markers placed here are the ship's; each starship battle copies them.</div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useEncounterStore } from '~/stores/encounter'
import { useParty } from '~/composables/useParty'
import { useStarship } from '~/composables/useStarship'
import { useEntityMarkdown } from '~/composables/useEntityMarkdown'
import {
  assignCrew, helmingTokens, starshipLevel, starshipSheet, STATION_INITIATIVE_SKILL, stationKey, type StationMarker,
} from '~/rules/playerStarship'
import { formatActionCost, signed } from '~/rules/format'

const props = defineProps<{ placing: number | null; turnTokenId: number | null }>()
const emit = defineEmits<{ place: [slot: number | null] }>()

const store = useEncounterStore()
const st = useStarship()
const party = useParty()
const { renderMarkdown } = useEntityMarkdown()
const md = (t: string) => renderMarkdown(t)
const collapsed = ref(false)
const saved = ref(false)

const info = computed(() => store.current?.starship ?? null)
const ship = computed(() => st.ships.value.find(s => s.id === info.value?.shipId) ?? null)

async function ensureLoaded() {
  const cid = store.current?.campaignId
  if (!cid || !info.value) return
  if (st.loadedCampaign.value !== cid) await st.load(cid)
  if (party.loadedCampaign.value !== cid) await party.load(cid)
}
onMounted(ensureLoaded)
watch(() => store.current?.id, ensureLoaded)

const lookup = computed(() => st.lookupFor(ship.value))
const level = computed(() => starshipLevel(ship.value?.level_pinned, party.party.value.level))

/** The markers this map uses: the ship's for its interior, the encounter's own for a battle. */
const markers = computed<StationMarker[]>(() => {
  if (!info.value) return []
  if (info.value.role === 'battle') return info.value.markers
  return (ship.value?.stations ?? []).filter(s => s.marker && s.stationId)
    .map(s => ({ slot: s.slot, x: s.marker!.x, y: s.marker!.y, name: lookup.value.stations.get(s.stationId!)?.name ?? 'Station' }))
})
const helm = computed(() => helmingTokens(markers.value, (store.current?.tokens ?? []).filter(t => t.sensorZone == null)))
const tokenName = (id: number | undefined) => store.current?.tokens.find(t => t.id === id)?.label || store.current?.tokens.find(t => t.id === id)?.name

const rows = computed(() => (ship.value?.stations ?? []).filter(s => s.stationId).map(s => ({
  slot: s.slot,
  name: lookup.value.stations.get(s.stationId!)?.name ?? 'Station',
  marker: markers.value.find(m => m.slot === s.slot) ?? null,
  helm: helm.value.has(s.slot) ? tokenName(helm.value.get(s.slot)) : null,
})))

const sheet = computed(() => starshipSheet(
  { stations: ship.value?.stations ?? [], bays: ship.value?.bays ?? [] }, lookup.value, level.value, new Set(helm.value.keys()),
))
const turnStation = computed(() => {
  if (props.turnTokenId == null) return null
  for (const [slot, id] of helm.value) if (id === props.turnTokenId) return sheet.value.stations.find(r => r.slot.slot === slot) ?? null
  return null
})
const turnTokenName = computed(() => tokenName(props.turnTokenId ?? undefined))
const skillName = computed(() => STATION_INITIATIVE_SKILL[stationKey(turnStation.value?.station?.name ?? '')] ?? 'Perception')

const COLORS = ['#4ab8e8', '#e8c44a', '#5fc98a', '#e0803a', '#a87de8', '#e05555', '#6bc0c8', '#c86fa8']
const colorOf = (slot: number) => COLORS[(slot - 1) % COLORS.length]

/** Saves a marker: on the ship for its interior, on the encounter for a battle. */
async function setMarker(slot: number, at: { x: number; y: number } | null) {
  if (!info.value || !ship.value) return
  if (info.value.role === 'interior') {
    await st.setMarker(ship.value.id!, slot, at)
    return
  }
  const name = rows.value.find(r => r.slot === slot)?.name ?? 'Station'
  const rest = info.value.markers.filter(m => m.slot !== slot)
  await store.setStarship({ ...info.value, markers: at ? [...rest, { slot, x: at.x, y: at.y, name }] : rest })
}
const clearMarker = (slot: number) => setMarker(slot, null)

/** Battle: the crew roster becomes who stands where (tokens are matched to characters by their library token). */
async function saveCrew() {
  if (!ship.value) return
  let crew = ship.value.crew ?? []
  for (const c of party.characters.value) {
    const placed = store.current?.tokens.find(t => t.tokenId != null && t.tokenId === c.tokenId)
    if (!placed) continue
    const slot = [...helm.value].find(([, id]) => id === placed.id)?.[0] ?? null
    crew = assignCrew(crew, c.id, slot)
  }
  for (const a of crew) await st.assign(ship.value.id!, a.characterId, a.slot)
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}

defineExpose({ setMarker, markers, colorOf })
</script>

<style scoped>
.ssp { position: absolute; left: 12px; bottom: 76px; z-index: 30; width: 300px; max-height: 60vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; box-shadow: 0 6px 20px #0006; }
.ssp--collapsed { width: auto; }
.ssp-head { display: flex; gap: 6px; align-items: center; cursor: pointer; }
.ssp-spacer { flex: 1; }
.ssp-dim { color: var(--text3); font-size: 11.5px; }
.ssp-warn { color: #e0a040; }
.ssp-stats { margin: 6px 0; color: var(--text2); }
.ssp-turn { border: 1px solid #4ab8e866; border-radius: 6px; padding: 6px 8px; margin: 6px 0; display: flex; flex-direction: column; gap: 3px; }
.ssp-turn-head { display: flex; gap: 6px; align-items: center; }
.ssp-grade { margin-left: auto; font-size: 10.5px; text-transform: uppercase; color: #6bc0c8; }
.ssp-action summary { cursor: pointer; }
.ssp-md { font-size: 12px; color: var(--text2); padding: 2px 0 4px 10px; }
.ssp-list { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
.ssp-row { display: flex; gap: 6px; align-items: center; }
.ssp-row--turn .ssp-name { color: #4ab8e8; font-weight: 600; }
.ssp-slot { width: 18px; height: 18px; border-radius: 50%; background: #4ab8e8; color: #10141c; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.ssp-name { flex: 1; }
.ssp-btn { background: none; border: 1px solid var(--border); color: var(--text2); border-radius: 4px; font-size: 11.5px; padding: 1px 7px; cursor: pointer; }
.ssp-btn.active { border-color: #4ab8e8; color: #4ab8e8; }
.ssp-foot { margin-top: 6px; display: flex; gap: 8px; align-items: center; }
</style>
