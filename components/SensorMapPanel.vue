<template>
  <div class="smp" :class="{ 'smp--collapsed': collapsed }">
    <div class="smp-head">
      <button class="smp-toggle" @click="collapsed = !collapsed">
        <OhVueIcon name="gi-radar-sweep" scale="0.8" style="color: #4ab8e8" /> <b>Sensors</b> {{ collapsed ? '▸' : '▾' }}
      </button>
      <template v-if="!collapsed">
        <label class="smp-field">Zones <input class="smp-input smp-num" type="number" min="3" max="30" :value="zones" @change="setZones(Number(val($event)))" /></label>
        <button v-if="!playerShip && shipRow" class="smp-btn" @click="addPlayerShip">+ {{ shipRow.name }}</button>
        <input v-model="query" class="smp-input smp-search" placeholder="Add a starship or starship hazard…" />
        <select v-model.number="addZone" class="smp-input" title="Zone"><option v-for="z in zones" :key="z" :value="z - 1">zone {{ z }}</option></select>
        <select v-model.number="addHeading" class="smp-input" title="Heading"><option :value="1">▶ right</option><option :value="-1">◀ left</option></select>
      </template>
    </div>
    <div v-if="!collapsed && results.length" class="smp-results">
      <button v-for="r in results" :key="r.id" class="smp-result" @click="add(r)">
        {{ r.name }} <span class="smp-dim">{{ r.kind === 'starship' ? 'Starship' : 'Hazard' }} {{ r.level }}</span>
      </button>
    </div>

    <template v-if="!collapsed">
      <SensorTrack :zones="zones" :tokens="track" :selected-id="selectedId" :turn-id="turnTokenId" :highlight="areaZoneList" :range="rangeZones" :rear="rearZones"
        :border="area.kind === 'burst' && area.size > 0 && areaOpen ? area.border : null" draggable
        @select="id => selectedId = selectedId === id ? null : id" @move="(id, z) => store.moveSensorToken(id, z)"
        @zone="onZoneClick" @border="b => area.border = b" />

      <!-- Selected ship -->
      <div v-if="selected" class="smp-bar">
        <b>{{ selected.label || selected.name }}</b>
        <button class="smp-btn" title="Turn around" @click="store.moveSensorToken(selected.id, null, (selected.sensorHeading === -1 ? 1 : -1))">⇄ Turn</button>
        <button class="smp-btn" title="One zone left" @click="store.moveSensorToken(selected.id, (selected.sensorZone ?? 0) - 1)">◀</button>
        <button class="smp-btn" title="One zone right" @click="store.moveSensorToken(selected.id, (selected.sensorZone ?? 0) + 1)">▶</button>
        <label class="smp-field">HP <input class="smp-input smp-num" type="number" :value="selected.hpCurrent ?? ''" @change="store.updateToken(selected.id, { hpCurrent: Number(val($event)) })" /> / {{ selected.hpMax ?? '—' }}</label>
        <label v-if="selected.shieldMax" class="smp-field">SP <input class="smp-input smp-num" type="number" :value="selected.shieldPoints ?? 0" @change="store.setShields(selected.id, Number(val($event)))" /> / {{ selected.shieldMax }}</label>
        <span class="smp-dim">sensor range {{ rangeOf(selected) }} zones</span>
        <button v-if="selected.linkedRulesId" class="smp-btn" @click="emit('stat', selected.id)">Stat block</button>
        <label class="smp-field" title="Players don't see it"><input type="checkbox" :checked="!selected.isVisible" @change="store.updateToken(selected.id, { isVisible: !checked($event), actsWhileHidden: true })" /> hidden</label>
        <button class="smp-btn" :class="{ active: areaOpen }" title="An area from this ship's zone" @click="areaOpen = !areaOpen">Area…</button>
        <span class="smp-spacer" />
        <button class="smp-btn smp-danger" title="Remove from the sensor map" @click="remove(selected.id)">Remove</button>
      </div>

      <!-- Zone area from the selected ship -->
      <div v-if="selected && areaOpen" class="smp-bar smp-area">
        <select v-model="area.kind" class="smp-input">
          <option value="cone">Cone</option><option value="line">Line</option><option value="emanation">Emanation</option><option value="burst">Burst</option>
        </select>
        <label class="smp-field"><input v-model.number="area.size" class="smp-input smp-num" type="number" min="0" /> zones</label>
        <select v-if="area.kind === 'cone' || area.kind === 'line'" v-model.number="area.direction" class="smp-input">
          <option :value="1">▶ right</option><option :value="-1">◀ left</option>
        </select>
        <span v-if="area.kind === 'burst'" class="smp-dim">{{ area.size > 0 ? 'click a border ┃ below the zones' : 'click a zone' }}<template v-if="!burstOk"> · out of range {{ area.range }}</template></span>
        <label v-if="area.kind === 'burst'" class="smp-field">range <input v-model.number="area.range" class="smp-input smp-num" type="number" min="0" /></label>
        <select v-model="area.save" class="smp-input"><option value="ref">Reflex</option><option value="fort">Fortitude</option><option value="will">Will</option></select>
        <label class="smp-field">DC <input v-model.number="area.dc" class="smp-input smp-num" type="number" /></label>
        <label class="smp-field"><input v-model="area.basic" type="checkbox" /> basic</label>
        <input v-model="area.damage" class="smp-input" placeholder="2d8+5 fire" />
        <span class="smp-dim">{{ targets.length }} target{{ targets.length === 1 ? '' : 's' }}: {{ targets.map(t => t.label || t.name).join(', ') || '—' }}</span>
        <button class="smp-btn" :disabled="!targets.length || !area.dc" @click="rollSaves">Roll saves</button>
      </div>
      <div v-if="area.kind === 'line' && selected && areaOpen && lineConflicts" class="smp-dim smp-note">Line: one target per zone. Untick the ones it doesn't hit in the save prompt.</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useEncounterStore, type EncounterToken } from '~/stores/encounter'
import { useStarship } from '~/composables/useStarship'
import { useParty } from '~/composables/useParty'
import { rulesGet, rulesQuery } from '~/composables/useRules'
import { areaZones, burstInRange, clampZone, DEFAULT_ZONES, fromBehind, inRange, tokensInZones, type Heading, type ZoneArea, type ZoneAreaKind } from '~/rules/sensorMap'
import { starshipLevel, starshipSheet } from '~/rules/playerStarship'
import type { AreaOverlay, AreaSave } from '~/rules/areas'
import type { RulesEntity, Starship } from '~/types/rules'
import type { TrackToken } from '~/components/SensorTrack.vue'

const props = defineProps<{ turnTokenId: number | null }>()
const emit = defineEmits<{ stat: [tokenId: number] }>()

const store = useEncounterStore()
const st = useStarship()
const party = useParty()
const collapsed = ref(false)
const val = (ev: Event) => (ev.target as HTMLInputElement).value
const checked = (ev: Event) => (ev.target as HTMLInputElement).checked

const zones = computed(() => store.current?.sensorMap?.zones ?? DEFAULT_ZONES)
function setZones(n: number) {
  if (!Number.isFinite(n)) return
  store.setSensorMap({ ...(store.current?.sensorMap ?? { zones: DEFAULT_ZONES }), zones: Math.max(3, Math.min(30, Math.round(n))) })
}

const sensorTokens = computed(() => (store.current?.tokens ?? []).filter(t => t.sensorZone != null))
const entries = ref<Map<string, RulesEntity>>(new Map())
watch(() => sensorTokens.value.map(t => t.linkedRulesId).join('|'), async () => {
  const next = new Map(entries.value)
  for (const t of sensorTokens.value) if (t.linkedRulesId && !next.has(t.linkedRulesId)) { const e = await rulesGet(t.linkedRulesId); if (e) next.set(e.id, e) }
  entries.value = next
}, { immediate: true })

const sideOf = (t: EncounterToken): TrackToken['side'] => (t.sensorRole === 'player-ship' ? 'party' : t.sensorRole === 'hazard' ? 'hazard' : t.isAlly ? 'ally' : 'enemy')
const track = computed<TrackToken[]>(() => sensorTokens.value.map(t => ({
  id: t.id, name: t.label || t.name, zone: t.sensorZone!, heading: t.sensorHeading ?? 1, side: sideOf(t),
  hp: t.hpCurrent, hpMax: t.hpMax, sp: t.shieldPoints, spMax: t.shieldMax, hidden: !t.isVisible,
  conditions: t.conditions.map(c => (c.value != null ? `${c.name} ${c.value}` : c.name)),
})))

const selectedId = ref<number | null>(null)
const selected = computed(() => sensorTokens.value.find(t => t.id === selectedId.value) ?? null)

// ── The party's ship ──
const shipRow = computed(() => st.ships.value.find(s => s.id === store.current?.starship?.shipId) ?? null)
const playerShip = computed(() => sensorTokens.value.find(t => t.sensorRole === 'player-ship') ?? null)
const sheet = computed(() => shipRow.value
  ? starshipSheet({ stations: shipRow.value.stations, bays: shipRow.value.bays }, st.lookupFor(shipRow.value), starshipLevel(shipRow.value.level_pinned, party.party.value.level))
  : null)
async function addPlayerShip() {
  if (!shipRow.value || !sheet.value) return
  await store.addSensorToken({
    rulesId: null, zone: addZone.value, heading: addHeading.value, role: 'player-ship', name: shipRow.value.name,
    hp: shipRow.value.hp_current ?? sheet.value.hp, hpMax: sheet.value.hp, sp: shipRow.value.sp_current ?? sheet.value.sp, spMax: sheet.value.sp, ac: sheet.value.ac,
  })
}

function rangeOf(t: EncounterToken): number {
  if (t.sensorRole === 'player-ship') return sheet.value?.sensorRange ?? 0
  const e = t.linkedRulesId ? entries.value.get(t.linkedRulesId) : undefined
  return e?.kind === 'starship' ? (e as Starship).sensorRange : 0
}
const rangeZones = computed(() => {
  const t = selected.value
  if (!t || t.sensorZone == null) return []
  const r = rangeOf(t)
  return Array.from({ length: zones.value }, (_, z) => z).filter(z => inRange(t.sensorZone!, z, r))
})
const rearZones = computed(() => {
  const t = selected.value
  if (!t || t.sensorZone == null) return []
  return Array.from({ length: zones.value }, (_, z) => z).filter(z => fromBehind({ id: t.id, zone: t.sensorZone!, heading: t.sensorHeading ?? 1 }, z))
})

// ── Adding ──
const query = ref('')
const addZone = ref(0)
const addHeading = ref<Heading>(1)
const results = ref<RulesEntity[]>([])
let seq = 0
watch(query, async (q) => {
  const mine = ++seq
  if (!q.trim()) { results.value = []; return }
  const [ships, hazards] = await Promise.all([
    rulesQuery({ kind: 'starship', text: q, limit: 12, sort: 'name' }),
    rulesQuery({ kind: 'hazard', text: q, limit: 30, sort: 'name' }),
  ])
  if (mine !== seq) return
  results.value = [...ships.items, ...hazards.items.filter(h => h.traits.includes('starship'))].slice(0, 15)
})
async function add(r: RulesEntity) {
  const t = await store.addSensorToken({ rulesId: r.id, zone: clampZone(addZone.value, zones.value), heading: addHeading.value, role: r.kind === 'hazard' ? 'hazard' : 'ship' })
  if (t) selectedId.value = t.id
  query.value = ''
}
async function remove(id: number) {
  await store.removeToken(id)
  if (selectedId.value === id) selectedId.value = null
}

function onZoneClick(z: number) {
  if (areaOpen.value && area.kind === 'burst' && area.size === 0) area.zone = z
  else addZone.value = z
}

// ── Zone areas ──
const areaOpen = ref(false)
const area = reactive({ kind: 'cone' as ZoneAreaKind, size: 1, direction: 1 as Heading, border: 1, zone: 0, range: 6, save: 'ref' as AreaSave, dc: 0, basic: true, damage: '' })
watch(selected, t => { if (t) { area.direction = t.sensorHeading ?? 1; area.zone = t.sensorZone ?? 0; area.border = (t.sensorZone ?? 0) + 1 } })
const zoneArea = computed<ZoneArea | null>(() => selected.value?.sensorZone == null ? null : {
  kind: area.kind, origin: selected.value.sensorZone, direction: area.direction, size: area.size, border: area.border, zone: area.zone,
})
const areaZoneList = computed(() => (areaOpen.value && zoneArea.value ? areaZones(zoneArea.value, zones.value) : []))
const burstOk = computed(() => !zoneArea.value || burstInRange(zoneArea.value, area.range))
const targets = computed(() => {
  if (!zoneArea.value || !areaOpen.value) return []
  const list = sensorTokens.value.filter(t => !t.isDead).map(t => ({ ...t, zone: t.sensorZone!, heading: (t.sensorHeading ?? 1) as Heading }))
  return tokensInZones(zoneArea.value, areaZoneList.value, list, selected.value?.id ?? null)
})
const lineConflicts = computed(() => new Set(targets.value.map(t => t.zone)).size < targets.value.length)

async function rollSaves() {
  if (!selected.value || !targets.value.length) return
  const dmg = area.damage.trim().match(/^(\S+)\s*(.*)$/)
  const id = crypto.randomUUID()
  const overlay: AreaOverlay = {
    id, kind: 'burst', originX: -1000, originY: -1000, sizeFt: 0, hidden: true, color: '#e8a040',
    label: `${selected.value.label || selected.value.name}: ${area.size}-zone ${area.kind}`,
    effect: { save: area.save, dc: area.dc, basic: area.basic, damage: dmg ? { formula: dmg[1], type: dmg[2] || '' } : null },
  }
  await store.addArea(overlay)
  store.openAreaPrompt(id, targets.value.map(t => t.id), overlay.label)
  areaOpen.value = false
}

/** From a stat block: an area ability of the selected ship (P7 fills it from "3-zone cone … DC 16"). */
function startArea(spec: { kind: ZoneAreaKind; size: number; dc?: number; save?: AreaSave; basic?: boolean; damage?: string }) {
  Object.assign(area, { kind: spec.kind, size: spec.size, ...(spec.dc ? { dc: spec.dc } : {}), ...(spec.save ? { save: spec.save } : {}), ...(spec.basic != null ? { basic: spec.basic } : {}), ...(spec.damage ? { damage: spec.damage } : {}) })
  areaOpen.value = true
}
function select(id: number | null) { selectedId.value = id }
defineExpose({ startArea, select })
</script>

<style scoped>
.smp { position: absolute; top: 8px; left: 12px; right: 12px; z-index: 32; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; box-shadow: 0 6px 20px #0006; display: flex; flex-direction: column; gap: 6px; max-height: 55vh; overflow-y: auto; }
.smp--collapsed { right: auto; }
.smp-head, .smp-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.smp-toggle { background: none; border: none; color: var(--text); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
.smp-field { display: inline-flex; gap: 4px; align-items: center; color: var(--text2); }
.smp-input { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-size: 12.5px; }
.smp-num { width: 56px; }
.smp-search { width: 240px; }
.smp-btn { background: none; border: 1px solid var(--border); color: var(--text2); border-radius: 4px; font-size: 12px; padding: 2px 8px; cursor: pointer; }
.smp-btn.active { border-color: #4ab8e8; color: #4ab8e8; }
.smp-danger { color: #e05555; }
.smp-spacer { flex: 1; }
.smp-dim { color: var(--text3); font-size: 11.5px; }
.smp-note { margin-top: -2px; }
.smp-results { display: flex; flex-wrap: wrap; gap: 4px; }
.smp-result { background: #ffffff0d; border: 1px solid var(--border); color: var(--text); border-radius: 4px; font-size: 12px; padding: 2px 8px; cursor: pointer; }
.smp-area { border-top: 1px dashed var(--border); padding-top: 6px; }
</style>
