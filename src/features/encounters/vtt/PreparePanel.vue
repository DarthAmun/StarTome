<script setup lang="ts">
/** Preparing an encounter: its map and grid, sight, music, how hard it is, its loot, what players will see, and who is in it. */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { parseDefeated } from '@/domain/rules/advancement'
import type { Creature, RulesEntity } from '@/domain/rules/types'
import type { Actor } from '@/domain/schema'
import { playlistNames, statLinkOf } from '@/data/encounters'
import { partyOf } from '@/data/party'
import { rulesGetMany } from '@/data/rules'
import { ArrowDown, ArrowUp, ImageUp } from 'lucide-vue-next'
import { reorderFloors } from '@/data/encounters'
import { pickImage, pickImages, storeImage } from '@/services/images'
import { reportError } from '@/ui/dialogs'
import { lootPrompt } from '@/ui/partyPrompts'
import { useLive } from '@/ui/useLive'
import CreaturePicker from '../CreaturePicker.vue'
import DifficultyMeter from '../DifficultyMeter.vue'
import { rate } from '../difficulty'
import TokenLibrary from '../TokenLibrary.vue'
import { currentFloor, floors, flushSaves, live, placeActor, placeCreature, reloadMap, saveEncounter, saveFloor, saveMap, showFloor, tokensOn } from './live'
import { offerImages } from './floorImages'
import { DEFAULT_GRID_LOOK, type GridLook } from '@/domain/rules/gridLabels'
import { playerPrefs, setPlayerPrefs } from './playerSync'

const emit = defineEmits<{ unlinked: [id: string] }>()
const router = useRouter()
const enc = computed(() => live.encounter)
const party = useLive(() => (enc.value ? partyOf(enc.value.campaignId) : Promise.resolve([])), [], [() => enc.value?.campaignId])
const playlists = useLive(() => playlistNames(), [])
const linkIds = computed(() => [...new Set(live.tokens.map(t => statLinkOf(t)?.rulesId).filter((id): id is string => !!id))])
const entries = useLive(async () => new Map<string, RulesEntity>((await rulesGetMany(linkIds.value)).map(e => [e.id, e])), new Map<string, RulesEntity>(), [() => linkIds.value.join('|')])
const rated = computed(() => (enc.value ? rate(live.game, live.tokens, parseDefeated(enc.value.defeated), entries.value, party.value, enc.value.partyLevel) : null))

async function chooseMap() {
  await offerImages(await pickImages())
}
/** Floors top to bottom, for the list. */
const floorList = computed(() => [...floors()].reverse())
/** Moves a floor up or down one place, or makes it the ground floor; levels follow. */
async function arrange(id: string, by: number, ground?: string) {
  if (!enc.value) return
  const ids = floors().map(f => f.id), at = ids.indexOf(id), to = at + by
  if (to < 0 || to >= ids.length) return
  ;[ids[at], ids[to]] = [ids[to]!, ids[at]!]
  try {
    await flushSaves()
    await reorderFloors(enc.value.id, ids, ground ?? floors().find(f => f.level === 0)?.id)
    await reloadMap()
  } catch (err) { reportError('Reordering the floors', err) }
}
async function replaceImage(id: string) {
  const file = await pickImage()
  if (file) saveFloor({ image: await storeImage(file) }, true, id)
}
/** The floor the map section works on: the one shown. */
const floor = computed(() => currentFloor())
function mapUrl(e: Event) { const url = (e.target as HTMLInputElement).value.trim(); if (url) saveFloor({ image: { url } }) }
function grid(field: 'size' | 'offsetX' | 'offsetY', e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (floor.value && Number.isFinite(v)) saveFloor({ grid: { ...floor.value.grid, [field]: field === 'size' ? Math.max(8, v) : v } })
}
/** The grid's look is the map's, for all its floors and both windows. */
const gridLook = computed<GridLook>(() => live.map?.gridLook ?? DEFAULT_GRID_LOOK)
function setLook(patch: Partial<GridLook>) { saveMap({ gridLook: { ...gridLook.value, ...patch } }) }
async function addCreature(e: RulesEntity) { await placeCreature(e.id, 10, 5, null, { spread: true }).catch(err => reportError('Placing the creature', err)) }
async function addActor(a: Actor) {
  const { token, unlinked } = await placeActor(a.id, 4, 5, { spread: true })
  if (token && unlinked) emit('unlinked', token.id)
}
function openLoot() {
  if (!enc.value) return
  // What the enemies carry, as suggestions
  const gear = live.tokens.filter(t => !t.playerToken && !t.ally).flatMap((t) => { const l = statLinkOf(t), e = l ? entries.value.get(l.rulesId) : undefined; return e?.kind === 'creature' ? (e as Creature).inventory : [] })
  lootPrompt.value = { campaignId: enc.value.campaignId, encounterId: enc.value.id, name: enc.value.name, gear }
}
</script>

<template>
  <div v-if="enc" class="prep">
    <section>
      <span class="eyebrow">Map<template v-if="floors().length > 1"> · {{ floor?.name }}</template></span>
      <div class="row">
        <button class="btn" data-test="choose-map" @click="chooseMap">Choose image…</button>
        <button v-if="floor?.main !== false" class="btn" data-test="open-map-maker" @click="router.push({ name: 'map-maker', params: { campaignId: enc.campaignId, encounterId: enc.id } })">Map maker</button>
        <button v-if="floor?.image" class="btn btn-ghost" @click="saveFloor({ image: null })">Remove</button>
      </div>
      <ol v-if="floors().length > 1" class="floor-list" data-test="floor-list">
        <li v-for="f in floorList" :key="f.id" :class="{ on: f.id === floor?.id }" :data-floor="f.name">
          <button class="name" :title="`Show ${f.name}`" @click="showFloor(f.id)">{{ f.name }}<span v-if="tokensOn(f.id).length" class="faint"> · {{ tokensOn(f.id).length }}</span></button>
          <label class="faint" :title="`Make ${f.name} the ground floor: the others are counted from it`"><input type="radio" name="ground-floor" :checked="f.level === 0" :aria-label="`Ground floor: ${f.name}`" @change="arrange(f.id, 0, f.id)" /> ground</label>
          <button class="btn btn-ghost btn-icon" :title="f.image ? 'Replace its image' : 'Choose its image'" :aria-label="`Image for ${f.name}`" @click="replaceImage(f.id)"><ImageUp :size="14" /></button>
          <button class="btn btn-ghost btn-icon" title="Up a floor" :aria-label="`Move ${f.name} up`" :disabled="f.id === floorList[0]?.id" @click="arrange(f.id, 1)"><ArrowUp :size="14" /></button>
          <button class="btn btn-ghost btn-icon" title="Down a floor" :aria-label="`Move ${f.name} down`" :disabled="f.id === floorList.at(-1)?.id" @click="arrange(f.id, -1)"><ArrowDown :size="14" /></button>
        </li>
      </ol>
      <input class="input" placeholder="…or a web address of an image" :value="floor?.image && 'url' in floor.image ? floor.image.url : ''" aria-label="Map image address" @change="mapUrl" />
      <p class="faint">An image dropped on the map works too. Several images at once make one floor each.</p>
      <div class="row">
        <label><span class="label">Square (px)</span><input class="input num" type="number" min="8" :value="floor?.grid.size" aria-label="Grid square size" @change="grid('size', $event)" /></label>
        <label><span class="label">Offset X</span><input class="input num" type="number" :value="floor?.grid.offsetX" @change="grid('offsetX', $event)" /></label>
        <label><span class="label">Offset Y</span><input class="input num" type="number" :value="floor?.grid.offsetY" @change="grid('offsetY', $event)" /></label>
      </div>
      <div class="row grid-look">
        <label><span class="label">Grid colour</span><input type="color" :value="gridLook.color" aria-label="Grid colour" data-test="grid-color" @input="setLook({ color: ($event.target as HTMLInputElement).value })" /></label>
        <label class="grow"><span class="label">Strength</span><input type="range" min="0.05" max="1" step="0.05" :value="gridLook.alpha" aria-label="Grid strength" @input="setLook({ alpha: Number(($event.target as HTMLInputElement).value) })" /></label>
        <button v-if="gridLook.color !== DEFAULT_GRID_LOOK.color || gridLook.alpha !== DEFAULT_GRID_LOOK.alpha" class="btn btn-ghost" title="The default colour and strength" @click="setLook({ color: DEFAULT_GRID_LOOK.color, alpha: DEFAULT_GRID_LOOK.alpha })">Reset</button>
      </div>
      <label class="dim"><input type="checkbox" :checked="gridLook.major" data-test="grid-major" @change="setLook({ major: !gridLook.major })" /> A stronger line every 5 squares</label>
      <label class="dim" title="Column letters along the top, row numbers down the left, in the players' window too"><input type="checkbox" :checked="gridLook.rulers" data-test="grid-rulers-switch" @change="setLook({ rulers: !gridLook.rulers })" /> Square names along the edges (A, B … and 1, 2 …)</label>
      <label class="dim" title="The square each token stands on, beside its name: Goblin · D5"><input type="checkbox" :checked="gridLook.tokenCells" data-test="grid-token-cells" @change="setLook({ tokenCells: !gridLook.tokenCells })" /> Each token's square beside its name</label>
      <label class="dim"><input type="checkbox" :checked="enc.fovEnabled" data-test="fov-switch" @change="saveEncounter({ fovEnabled: !enc.fovEnabled })" /> Sight and walls: tokens see only what walls allow</label>
      <label v-if="playlists.length"><span class="label">Music</span>
        <select class="input" :value="enc.playlistId ?? ''" @change="saveEncounter({ playlistId: ($event.target as HTMLSelectElement).value || null })"><option value="">None</option><option v-for="p in playlists" :key="p.id" :value="p.id">{{ p.name }}</option></select>
      </label>
    </section>
    <section>
      <span class="eyebrow">Difficulty</span>
      <DifficultyMeter v-if="rated" :rated="rated" :override="enc.partyLevel" @level="saveEncounter({ partyLevel: $event })" @clear-defeated="saveEncounter({ defeated: [] })" />
      <button class="btn" data-test="open-loot" @click="openLoot">Loot…</button>
    </section>
    <section>
      <span class="eyebrow">Add</span>
      <CreaturePicker :game="live.game" @pick="addCreature" />
      <TokenLibrary compact @pick="addActor" />
    </section>
    <section>
      <span class="eyebrow">Players' window</span>
      <div class="row">
        <label><span class="label">Turn order</span><select class="input" :value="playerPrefs.railPosition" @change="setPlayerPrefs(enc.campaignId, { railPosition: ($event.target as HTMLSelectElement).value as 'top' })"><option value="top">Top</option><option value="left">Left</option><option value="right">Right</option></select></label>
        <label><span class="label">Size</span><select class="input" :value="playerPrefs.railSize" @change="setPlayerPrefs(enc.campaignId, { railSize: ($event.target as HTMLSelectElement).value as 'small' })"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
      </div>
      <label class="dim"><input type="checkbox" :checked="playerPrefs.railNames" @change="setPlayerPrefs(enc.campaignId, { railNames: !playerPrefs.railNames })" /> Names beside the portraits</label>
      <label class="dim"><input type="checkbox" :checked="playerPrefs.hiddenTurns === 'mystery'" @change="setPlayerPrefs(enc.campaignId, { hiddenTurns: playerPrefs.hiddenTurns === 'mystery' ? 'omit' : 'mystery' })" /> Hidden combatants' turns show as “?”</label>
    </section>
  </div>
</template>

<style scoped>
.prep { display: flex; flex-direction: column; flex: none; }
section { display: flex; flex-direction: column; gap: .45rem; padding: .6rem .7rem; border-bottom: var(--frame); }
.row { display: flex; gap: .5rem; align-items: end; flex-wrap: wrap; } .grid-look .grow { flex: 1; display: flex; flex-direction: column; } input[type=color] { width: 3rem; height: 1.9rem; padding: 0; border: var(--frame); border-radius: var(--radius); background: none; } .num { width: 5.2rem; } p { margin: 0; font-size: .8rem; }
.floor-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; border: var(--frame); border-radius: var(--radius); }
.floor-list li { display: flex; align-items: center; gap: .3rem; padding: .1rem .3rem; } .floor-list li + li { border-top: var(--frame); }
.floor-list li.on { background: var(--accent-soft); } .floor-list label { font-size: .78rem; display: flex; gap: .2rem; align-items: center; }
.floor-list .name { flex: 1; background: none; border: 0; text-align: left; padding: .2rem; color: var(--text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
