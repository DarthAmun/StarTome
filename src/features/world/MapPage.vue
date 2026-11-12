<script setup lang="ts">
/**
 * A location's map for the GM: pin entries, draw regions, step into the maps
 * of pinned locations, and show it to the players in their own window.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Eye, EyeOff, Hexagon, MapPin as PinIcon, Maximize, MonitorUp, Trash2, Upload } from 'lucide-vue-next'
import type { Entry, EntryOf, MapPin } from '@/domain/schema'
import { entriesNamed, saveEntry } from '@/data/entries'
import { maps } from '@/data/maps'
import { entries } from '@/data/repo'
import { pickImage, storeImage } from '@/services/images'
import { onPlayerMessage, openPlayerWindow, sendToPlayers } from '@/services/playerLink'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'
import { useLive } from '@/ui/useLive'
import { peek } from '@/ui/workbench'
import MapCanvas from './MapCanvas.vue'

const props = defineProps<{ campaignId: string; entryId: string }>()
const router = useRouter()
const canvas = ref<InstanceType<typeof MapCanvas> | null>(null)

const entry = useLive<Entry | undefined>(() => entries.get(props.entryId), undefined, [() => props.entryId])
const map = computed(() => (entry.value?.type === 'location' ? entry.value : null))
const parents = useLive(() => maps.parents(props.entryId), [], [() => props.entryId])
const unplaced = useLive(() => maps.unplacedRegions(props.campaignId), [], [() => props.campaignId])

// The players' window follows the map the GM has open
const announce = () => sendToPlayers({ type: 'map', mapEntryId: props.entryId })
watch(() => props.entryId, announce, { immediate: true })
let stopHello: (() => void) | null = null
onMounted(() => { stopHello = onPlayerMessage('hello', (m) => { if (m.channel === 'map') announce() }) })
onUnmounted(() => stopHello?.())

// ── Tools: one at a time ──
const tool = ref<'none' | 'pin' | 'region'>('none')
const candidates = ref<{ id: string; name: string; type: string }[]>([])
const pinName = ref('')
const draft = ref<{ x: number; y: number }[]>([])
const regionName = ref('')
const regionExisting = ref<string>('')
const regionColor = ref('#5fc98a')

async function startPin() {
  tool.value = tool.value === 'pin' ? 'none' : 'pin'
  candidates.value = await entriesNamed(props.campaignId, ['npc', 'location', 'faction', 'quest', 'event', 'note', 'rumor'])
}
function startRegion() {
  tool.value = tool.value === 'region' ? 'none' : 'region'
  draft.value = []
}

async function onClick(point: { x: number; y: number }) {
  if (!map.value) return
  if (tool.value === 'pin') {
    const hit = candidates.value.find(c => c.name.toLowerCase() === pinName.value.trim().toLowerCase())
    if (!hit) { notify('Choose an entry to pin first.'); return }
    await maps.addPin(map.value, hit.id, point.x, point.y)
    pinName.value = ''
  } else if (tool.value === 'region') {
    draft.value = [...draft.value, point]
  } else {
    menu.value = null
  }
}

async function finishRegion() {
  if (tool.value !== 'region' || !map.value) return
  // The double-click that finishes also added its two clicks as points: drop the repeat
  const pts = draft.value.filter((p, i, all) => i === 0 || Math.hypot(p.x - (all[i - 1]?.x ?? 0), p.y - (all[i - 1]?.y ?? 0)) > 0.002)
  if (pts.length < 3) { notify('A region needs at least three points.'); return }
  try {
    await maps.placeRegion(map.value, pts, regionExisting.value || null, regionName.value, regionColor.value)
    draft.value = []; regionName.value = ''; regionExisting.value = ''; tool.value = 'none'
  } catch (err) { reportError('Saving the region', err) }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && tool.value !== 'none') { tool.value = 'none'; draft.value = [] }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

// ── A pin's menu ──
const menu = ref<{ pin: MapPin; entry: Entry; x: number; y: number } | null>(null)
function onPin(pin: MapPin, target: Entry, e: MouseEvent) {
  if (tool.value !== 'none') return
  menu.value = { pin, entry: target, x: e.clientX, y: e.clientY }
}
const hasMap = (e: Entry): e is EntryOf<'location'> => e.type === 'location'
const openMapOf = (e: Entry) => void router.push({ name: 'map', params: { campaignId: e.campaignId, entryId: e.id } })

async function onRegion(r: EntryOf<'region'>) {
  if (tool.value === 'none') peek({ kind: 'entry', id: r.id })
}
async function unplace(r: EntryOf<'region'>) {
  if (await confirmDialog({ title: `Take “${r.name}” off this map?`, body: 'The region and its notes stay; only its shape here is removed.', confirmLabel: 'Take off' })) await maps.unplaceRegion(r.id)
}
const regions = useLive(async () => (map.value ? maps.regions(map.value) : []), [], [() => map.value?.id])

async function uploadMap() {
  const file = await pickImage()
  if (!file) return
  try { await saveEntry(props.entryId, { data: { map: await storeImage(file) } }) } catch (err) { reportError('Storing the map', err) }
}
</script>

<template>
  <div v-if="map" class="map-page">
    <header class="bar">
      <RouterLink :to="{ name: 'world', params: { campaignId } }" class="btn btn-ghost"><ArrowLeft :size="14" /> World</RouterLink>
      <span v-for="p in parents" :key="p.id" class="crumb"><RouterLink :to="{ name: 'map', params: { campaignId, entryId: p.id } }">{{ p.name }}</RouterLink> ›</span>
      <h2 class="clickable" @click="peek({ kind: 'entry', id: map.id })">{{ map.name }}</h2>
      <span class="grow" />
      <button class="btn" :class="{ on: tool === 'pin' }" @click="startPin"><PinIcon :size="14" /> Pin</button>
      <button class="btn" :class="{ on: tool === 'region' }" @click="startRegion"><Hexagon :size="14" /> Region</button>
      <button class="btn btn-icon" title="Fit the map" @click="canvas?.fit()"><Maximize :size="14" /></button>
      <button class="btn" title="Replace the map image" @click="uploadMap"><Upload :size="14" /> Image</button>
      <button class="btn" title="Open the map in a window for the players; it follows the map you have open" @click="openPlayerWindow('/player/map', 'map')"><MonitorUp :size="14" /> Player view</button>
    </header>

    <div v-if="tool === 'pin'" class="tool">
      <input v-model="pinName" class="input" list="pin-candidates" placeholder="Which entry? Then click the map" aria-label="Entry to pin" autofocus />
      <datalist id="pin-candidates"><option v-for="c in candidates" :key="c.id" :value="c.name">{{ c.type }}</option></datalist>
      <span class="faint">Esc stops.</span>
    </div>
    <div v-if="tool === 'region'" class="tool">
      <select v-model="regionExisting" class="input" aria-label="Region"><option value="">A new region</option><option v-for="r in unplaced" :key="r.id" :value="r.id">Place “{{ r.name }}”</option></select>
      <input v-if="!regionExisting" v-model="regionName" class="input" placeholder="Region name" aria-label="Region name" />
      <input v-if="!regionExisting" v-model="regionColor" type="color" aria-label="Colour" />
      <span class="faint">{{ draft.length }} points · click to add, double-click or</span>
      <button class="btn btn-primary" :disabled="draft.length < 3" @click="finishRegion">Finish</button>
      <span class="faint">· Esc cancels</span>
    </div>

    <div class="body">
      <MapCanvas ref="canvas" :map="map" :draft="draft" :draft-color="regionColor" @click="onClick" @pin="onPin" @region="onRegion" @finish="finishRegion" />
      <aside v-if="regions.length" class="side">
        <div class="eyebrow">Regions</div>
        <div v-for="r in regions" :key="r.id" class="region-row">
          <i :style="{ background: r.data.color }" /> <button class="name" @click="peek({ kind: 'entry', id: r.id })">{{ r.name }}</button>
          <button class="btn btn-ghost btn-icon" title="Take off this map" @click="unplace(r)"><Trash2 :size="13" /></button>
        </div>
      </aside>
    </div>

    <div v-if="menu" class="menu panel" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }">
      <div class="eyebrow" :style="{ color: ENTRY_TYPE_INFO[menu.entry.type].color }">{{ menu.entry.name }}</div>
      <button @click="peek({ kind: 'entry', id: menu.entry.id }); menu = null">Open beside</button>
      <button v-if="hasMap(menu.entry)" @click="openMapOf(menu.entry); menu = null">Open its map</button>
      <button @click="maps.setPinHidden(menu.pin.id, !menu.pin.hidden); menu = null"><component :is="menu.pin.hidden ? Eye : EyeOff" :size="13" /> {{ menu.pin.hidden ? 'Show to players' : 'Hide from players' }}</button>
      <button class="danger" @click="maps.removePin(menu.pin.id); menu = null"><Trash2 :size="13" /> Remove pin</button>
    </div>
  </div>
  <p v-else class="empty">Maps belong to locations. <RouterLink :to="{ name: 'world', params: { campaignId } }">Back to World</RouterLink></p>
</template>

<style scoped>
.map-page { height: 100%; display: flex; flex-direction: column; }
.bar, .tool { display: flex; align-items: center; gap: .5rem; padding: .5rem 1rem; border-bottom: var(--frame); }
.tool { background: var(--bg-raised); }
.tool .input { width: auto; min-width: 220px; }
.crumb { color: var(--text-faint); }
.grow { flex: 1; }
.btn.on { border-color: var(--accent); color: var(--accent); }
.clickable { cursor: pointer; }
.body { flex: 1; min-height: 0; display: flex; }
.body > :first-child { flex: 1; }
.side { width: 210px; border-left: var(--frame); padding: .8rem; overflow: auto; }
.region-row { display: flex; align-items: center; gap: .5rem; padding: .15rem 0; }
.region-row i { width: 10px; height: 10px; border-radius: 2px; flex: none; }
.region-row .name { flex: 1; text-align: left; background: none; border: 0; padding: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu { position: fixed; z-index: 40; display: flex; flex-direction: column; min-width: 190px; padding: .4rem; box-shadow: var(--shadow); }
.menu .eyebrow { padding: .2rem .5rem .4rem; }
.menu button { display: flex; align-items: center; gap: .4rem; background: none; border: 0; text-align: left; padding: .35rem .5rem; border-radius: var(--radius); }
.menu button:hover { background: var(--bg-hover); }
.menu .danger { color: var(--danger); }
</style>
