<script setup lang="ts">
/**
 * The sensor map of a starship battle: a row of zones with the ships and
 * hazards in them, each facing left or right. Pick one to move or turn it,
 * damage it (shields first), see its sensor range and where it is off-guard
 * from, and lay a zone area over the row to ask for saves.
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ArrowLeftRight, ChevronLeft, ChevronRight, Eye, EyeOff, Trash2 } from 'lucide-vue-next'
import { newId } from '@/domain/ids'
import type { AreaOverlay, AreaSave } from '@/domain/rules/areas'
import { rollExpression } from '@/domain/rules/rolls'
import { areaZones, burstInRange, fromBehind, inRange, tokensInZones, type Heading, type ZoneArea, type ZoneAreaKind, type ZoneAreaSpec } from '@/domain/rules/sensorMap'
import { generateShieldsDice, repairSelfHp } from '@/domain/rules/starshipCombat'
import type { RulesEntity } from '@/domain/rules/types'
import { statLinkOf, type Token } from '@/data/encounters'
import { rulesGetMany, rulesQuery } from '@/data/rules'
import { activeRollContext, type RollContext } from '@/ui/dice'
import { notify } from '@/ui/dialogs'
import { useLive } from '@/ui/useLive'
import { peek } from '@/ui/workbench'
import { addArea, openAreaPrompt } from './areasLive'
import { applyDamage, live, removeTokens, updateToken } from './live'
import { encounterRolls } from './rolls'
import { addSensorToken, info, moveSensor, sensorTokens, setShields, setZones, sheet, ship, shipToken, zones } from './starshipLive'

const entries = useLive(async () => new Map<string, RulesEntity>((await rulesGetMany(sensorTokens.value.map(t => statLinkOf(t)?.rulesId).filter((id): id is string => !!id))).map(e => [e.id, e])), new Map<string, RulesEntity>(), [() => sensorTokens.value.map(t => statLinkOf(t)?.rulesId).join('|')])
const entryOf = (t: Token) => entries.value.get(statLinkOf(t)?.rulesId ?? '')
const side = (t: Token) => (t.sensor?.role === 'player-ship' ? 'party' : t.sensor?.role === 'hazard' ? 'hazard' : t.ally ? 'ally' : 'enemy')
const selected = computed(() => sensorTokens.value.find(t => t.id === live.selectedId) ?? null)
const zoneList = computed(() => Array.from({ length: zones.value }, (_, z) => z))
const inZone = (z: number) => sensorTokens.value.filter(t => t.sensor?.zone === z)

function rangeOf(t: Token): number {
  if (t.sensor?.role === 'player-ship') return sheet.value?.sensorRange ?? 0
  const e = entryOf(t)
  return e?.kind === 'starship' ? e.sensorRange : 0
}
const rangeZones = computed(() => { const t = selected.value; return t?.sensor ? zoneList.value.filter(z => inRange(t.sensor?.zone ?? 0, z, rangeOf(t))) : [] })
const rearZones = computed(() => { const t = selected.value, s = t?.sensor; return t && s ? zoneList.value.filter(z => fromBehind({ id: t.id, zone: s.zone, heading: (s.heading ?? 1) as Heading }, z)) : [] })

// ── Adding ──
const query = ref('')
const addZone = ref(0)
const found = useLive(async () => {
  if (!query.value.trim()) return []
  const [ships, hazards] = await Promise.all([rulesQuery({ kind: 'starship', text: query.value, limit: 12, sort: 'name' }), rulesQuery({ kind: 'hazard', text: query.value, limit: 30, sort: 'name' })])
  return [...ships.items, ...hazards.items.filter(h => (h as { traits?: string[] }).traits?.includes('starship'))].slice(0, 15)
}, [], [query])
async function add(r: RulesEntity | null) {
  // Enemies come in facing the party, from wherever you clicked last
  await addSensorToken({ rulesId: r?.id ?? null, zone: addZone.value, heading: r ? -1 : 1, role: !r ? 'player-ship' : r.kind === 'hazard' ? 'hazard' : 'ship' })
  query.value = ''
}
function zoneClick(z: number) {
  if (areaOpen.value && area.kind === 'burst') { if (area.size === 0) area.zone = z; else area.border = z; return }
  if (selected.value) moveSensor(selected.value, z)
  else addZone.value = z
}

// ── Damage and repairs ──
const amount = ref<number | null>(null)
const flags = reactive({ critical: false, bypassing: false, nonlethal: false })
function damage() {
  if (selected.value && amount.value) applyDamage(selected.value.id, amount.value, { ...flags })
  amount.value = null
  Object.assign(flags, { critical: false, bypassing: false, nonlethal: false })
}
function repair() { const t = selected.value; if (t && amount.value) applyDamage(t.id, -Math.abs(amount.value)); amount.value = null }
/** Generate Shields (the party's generator): 1d4 per two levels. Fortify (other ships): their fortify value. Repair Self: Hull Points equal to their level. */
function shields() {
  const t = selected.value, s = t?.sensor
  if (!t || !s) return
  const e = entryOf(t)
  const gain = s.role === 'player-ship' ? rollExpression(`${generateShieldsDice(ship.level)}d4`)?.total ?? 0 : e?.kind === 'starship' ? e.shields?.fortify ?? 0 : 0
  setShields(t, (s.shields ?? 0) + gain)
}
function repairSelf() { const t = selected.value; if (t) applyDamage(t.id, -repairSelfHp(entryOf(t)?.level ?? 1)) }

// ── Zone areas ──
const areaOpen = ref(false)
const area = reactive({ kind: 'cone' as ZoneAreaKind, size: 1, direction: 1 as Heading, border: 1, zone: 0, range: 6, save: 'ref' as AreaSave, dc: 0, basic: true, damage: '' })
watch(selected, (t) => { if (t?.sensor) Object.assign(area, { direction: t.sensor.heading ?? 1, zone: t.sensor.zone, border: t.sensor.zone + 1 }) })
const zoneArea = computed<ZoneArea | null>(() => (selected.value?.sensor ? { kind: area.kind, origin: selected.value.sensor.zone, direction: area.direction, size: Number(area.size) || 0, border: area.border, zone: area.zone } : null))
const covered = computed(() => (areaOpen.value && zoneArea.value ? areaZones(zoneArea.value, zones.value) : []))
const burstOk = computed(() => !zoneArea.value || burstInRange(zoneArea.value, Number(area.range) || 0))
const targets = computed(() => {
  if (!zoneArea.value || !areaOpen.value) return []
  const list = sensorTokens.value.filter(t => !t.dead).map(t => ({ id: t.id, name: t.name, zone: t.sensor?.zone ?? 0, heading: (t.sensor?.heading ?? 1) as Heading }))
  return tokensInZones(zoneArea.value, covered.value, list, selected.value?.id ?? null)
})
function askSaves() {
  const from = selected.value
  if (!from || !targets.value.length) return
  const dmg = /^(\S+)\s*(.*)$/.exec(area.damage.trim())
  // The save prompt works on areas: this one is kept off the battle map and only names who is hit
  const overlay: AreaOverlay = {
    id: newId(), kind: 'burst', originX: -1000, originY: -1000, sizeFt: 0, hidden: true, color: '#e8a040', label: `${from.name}: ${area.size}-zone ${area.kind}`,
    effect: { save: area.save, dc: Number(area.dc) || 0, basic: area.basic, damage: dmg?.[1] ? { formula: dmg[1], type: dmg[2] ?? '' } : null },
  }
  addArea(overlay)
  openAreaPrompt(overlay.id, targets.value.map(t => t.id), overlay.label)
  areaOpen.value = false
}
/** From a starship's stat block: its ability's zone area, ready to aim. */
function openZoneArea(spec: ZoneAreaSpec) {
  if (!selected.value?.sensor) { notify('Select the ship that uses it on the sensor map, then press “Zone area” again.'); return }
  Object.assign(area, { kind: spec.kind, size: spec.size, ...(spec.dc ? { dc: spec.dc } : {}), ...(spec.save ? { save: spec.save } : {}), ...(spec.basic !== undefined ? { basic: spec.basic } : {}), ...(spec.damage ? { damage: spec.damage } : {}) })
  areaOpen.value = true
}
// While the sensor map is on screen, a starship's stat block (in the dock) offers "Zone area" on its abilities
const withZones: RollContext = { ...encounterRolls, zoneArea: openZoneArea }
onMounted(() => { activeRollContext.value = withZones })
onUnmounted(() => { if (activeRollContext.value === withZones) activeRollContext.value = encounterRolls })
const stat = (t: Token) => { const l = statLinkOf(t); if (l) peek({ kind: 'rules', id: l.rulesId, adjustment: l.adjustment }) }
</script>

<template>
  <section class="sensor" data-test="sensor-panel">
    <header><span class="eyebrow">Sensor map</span><label class="faint">zones <input class="input num" type="number" min="3" max="30" :value="zones" aria-label="Number of zones" @change="setZones(Number(($event.target as HTMLInputElement).value))" /></label></header>
    <div class="track" :style="{ gridTemplateColumns: `repeat(${zones}, minmax(0, 1fr))` }">
      <div v-for="z in zoneList" :key="z" class="zone" :class="{ range: rangeZones.includes(z), rear: rearZones.includes(z), area: covered.includes(z), add: !selected && addZone === z }" :data-zone="z" :title="`Zone ${z + 1}`" @click="zoneClick(z)">
        <span class="zn">{{ z + 1 }}</span>
        <button v-for="t in inZone(z)" :key="t.id" class="ship" :class="[side(t), { sel: t.id === live.selectedId, dead: t.dead, hidden: !t.visible }]" :title="`${t.name}${t.hp.max ? ` · ${t.hp.current}/${t.hp.max} HP` : ''}${t.sensor?.shieldsMax ? ` · ${t.sensor.shields}/${t.sensor.shieldsMax} SP` : ''}`" :data-ship="t.name" @click.stop="live.selectedId = t.id === live.selectedId ? null : t.id">
          {{ (t.sensor?.heading ?? 1) > 0 ? '▶' : '◀' }}
        </button>
      </div>
    </div>
    <p class="faint key">Outlined: in sensor range · shaded red: attacks from there catch it off-guard{{ covered.length ? ' · amber: the area' : '' }}</p>

    <div v-if="selected && selected.sensor" class="sel" data-test="sensor-selected">
      <div class="row"><b>{{ selected.name }}</b><span class="chip">{{ side(selected) }}</span><span class="grow" />
        <button class="btn btn-icon" title="One zone left" @click="moveSensor(selected, selected.sensor.zone - 1)"><ChevronLeft :size="14" /></button>
        <button class="btn btn-icon" title="Turn around" @click="moveSensor(selected, null, (selected.sensor.heading ?? 1) > 0 ? -1 : 1)"><ArrowLeftRight :size="14" /></button>
        <button class="btn btn-icon" title="One zone right" @click="moveSensor(selected, selected.sensor.zone + 1)"><ChevronRight :size="14" /></button>
        <button class="btn btn-icon" :title="selected.visible ? 'Hide from players' : 'Show to players'" @click="updateToken(selected.id, { visible: !selected.visible })"><EyeOff v-if="!selected.visible" :size="14" /><Eye v-else :size="14" /></button>
        <button v-if="statLinkOf(selected)" class="btn" @click="stat(selected)">Stat block</button>
        <button class="btn btn-icon btn-danger" aria-label="Remove from the sensor map" @click="removeTokens([selected.id], live.encounter?.status === 'active')"><Trash2 :size="14" /></button>
      </div>
      <div class="row">
        <span>Hull <b class="num" data-test="ship-hull">{{ selected.hp.current }}</b>/{{ selected.hp.max }}</span>
        <label>Shields <input class="input num" :value="selected.sensor.shields ?? ''" aria-label="Shield Points" @change="setShields(selected, Number(($event.target as HTMLInputElement).value) || 0)" />/{{ selected.sensor.shieldsMax ?? '–' }}</label>
        <span class="dim">{{ selected.conditions.map(c => (c.value != null ? `${c.name} ${c.value}` : c.name)).join(', ') }}</span>
      </div>
      <div class="row">
        <input v-model.number="amount" type="number" min="0" class="input num" placeholder="amount" aria-label="Starship damage amount" @keydown.enter="damage" />
        <button class="btn btn-danger" data-test="ship-damage" @click="damage">Damage</button><button class="btn" @click="repair">Repair</button>
        <label class="dim"><input v-model="flags.critical" type="checkbox" /> critical</label>
        <label class="dim" title="Ignores Shield Points"><input v-model="flags.bypassing" type="checkbox" /> bypassing</label>
        <label v-if="selected.sensor.role === 'player-ship'" class="dim" title="At 0 Hull Points the ship is inoperable instead of compromised"><input v-model="flags.nonlethal" type="checkbox" /> nonlethal</label>
      </div>
      <div class="row">
        <button class="btn" @click="shields">{{ selected.sensor.role === 'player-ship' ? `Generate Shields (${generateShieldsDice(ship.level)}d4)` : 'Fortify' }}</button>
        <button v-if="selected.sensor.role === 'ship'" class="btn" :title="`Regains Hull Points equal to its level`" @click="repairSelf">Repair Self</button>
        <button class="btn" :class="{ 'btn-primary': areaOpen }" data-test="zone-area" @click="areaOpen = !areaOpen">Zone area…</button>
      </div>
      <div v-if="areaOpen" class="areabox">
        <div class="row">
          <select v-model="area.kind" class="input" aria-label="Zone area shape"><option value="cone">cone</option><option value="line">line</option><option value="emanation">emanation</option><option value="burst">burst</option></select>
          <label><input v-model.number="area.size" type="number" min="0" class="input num" aria-label="Zone area size" /> zones</label>
          <button v-if="area.kind === 'cone' || area.kind === 'line'" class="btn" @click="area.direction = area.direction > 0 ? -1 : 1">{{ area.direction > 0 ? 'to the right ▶' : '◀ to the left' }}</button>
          <span v-if="area.kind === 'burst'" class="faint">click a zone: {{ area.size === 0 ? 'the one it fills' : 'the one right of its border' }} · range <input v-model.number="area.range" type="number" class="input num" aria-label="Burst range" /></span>
        </div>
        <div class="row">
          <select v-model="area.save" class="input" aria-label="Save"><option value="ref">Reflex</option><option value="fort">Fortitude</option><option value="will">Will</option></select>
          <label>DC <input v-model.number="area.dc" type="number" class="input num" aria-label="Zone area DC" /></label>
          <label class="dim"><input v-model="area.basic" type="checkbox" /> basic</label>
          <input v-model="area.damage" class="input dmg" placeholder="2d10 piercing" aria-label="Zone area damage" />
        </div>
        <p v-if="!burstOk" class="warn">The burst's border is out of range.</p>
        <p>Hits: <b>{{ targets.map(t => t.name).join(', ') || 'nobody' }}</b><span v-if="area.kind === 'line' && new Set(targets.map(t => t.zone)).size < targets.length" class="faint"> · a line hits one target per zone: leave the others out of the saves</span></p>
        <button class="btn btn-primary" :disabled="!targets.length" data-test="zone-saves" @click="askSaves">Ask for saves</button>
      </div>
    </div>
    <p v-else class="faint">Click a ship to select it, then a zone to move it there. With nothing selected, a click picks the zone new ships arrive in ({{ addZone + 1 }}).</p>

    <div class="row">
      <input v-model="query" class="input grow" placeholder="Add a starship or starship hazard…" aria-label="Add to the sensor map" />
      <button v-if="info && !shipToken && ship.row" class="btn" @click="add(null)">+ {{ ship.row.name }}</button>
    </div>
    <button v-for="r in found" :key="r.id" class="hit" :data-add-ship="r.name" @click="add(r)"><span class="num lvl">{{ r.level }}</span> {{ r.name }} <span class="faint">{{ r.kind === 'hazard' ? 'hazard' : 'starship' }}</span></button>
  </section>
</template>

<style scoped>
.sensor { display: flex; flex-direction: column; gap: .4rem; padding: .5rem .6rem; border-bottom: var(--frame); } header, .row { display: flex; align-items: center; gap: .45rem; flex-wrap: wrap; } header { justify-content: space-between; } .eyebrow { color: var(--accent); } .grow { flex: 1; }
.num.input { width: 4.6rem; display: inline-block; padding: .15em .3em; } .row .input:not(.num):not(.grow) { width: auto; padding: .15em .3em; } .dmg { width: 9rem !important; }
.track { display: grid; gap: 2px; } .zone { min-height: 3.4rem; border: 1px solid var(--line); border-radius: 3px; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 1px; cursor: pointer; background: var(--bg-sunken); }
.zone.range { border-color: var(--accent-2); } .zone.rear { background: color-mix(in srgb, var(--danger) 16%, var(--bg-sunken)); } .zone.area { background: color-mix(in srgb, #e8a040 38%, var(--bg-sunken)); } .zone.add { border-style: dashed; border-color: var(--text-dim); }
.zn { font-size: .6rem; color: var(--text-faint); } .ship { border: 1px solid; border-radius: 3px; background: none; font-size: .7rem; line-height: 1; padding: 2px 3px; }
.ship.party { color: #3bbfa8; } .ship.ally { color: #7fb2e6; } .ship.enemy { color: #e05555; } .ship.hazard { color: #d9c34a; } .ship.sel { background: currentColor; } .ship.sel::first-letter { color: #10101a; } .ship.dead { opacity: .4; } .ship.hidden { border-style: dashed; }
.key, p { margin: 0; font-size: .78rem; } .sel, .areabox { display: flex; flex-direction: column; gap: .35rem; } .areabox { border: var(--frame); border-radius: var(--radius); padding: .4rem; } .warn { color: var(--warn); }
.hit { background: none; border: 0; text-align: left; padding: .15rem .3rem; border-radius: var(--radius); } .hit:hover { background: var(--bg-hover); } .lvl { color: var(--accent); }
</style>
