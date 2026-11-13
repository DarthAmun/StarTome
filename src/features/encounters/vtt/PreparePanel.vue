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
import { pickImage, storeImage } from '@/services/images'
import { reportError } from '@/ui/dialogs'
import { lootPrompt } from '@/ui/partyPrompts'
import { useLive } from '@/ui/useLive'
import CreaturePicker from '../CreaturePicker.vue'
import DifficultyMeter from '../DifficultyMeter.vue'
import { rate } from '../difficulty'
import TokenLibrary from '../TokenLibrary.vue'
import { live, placeActor, placeCreature, saveEncounter } from './live'
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
  const file = await pickImage()
  if (file) saveEncounter({ map: await storeImage(file) })
}
function mapUrl(e: Event) { const url = (e.target as HTMLInputElement).value.trim(); if (url) saveEncounter({ map: { url } }) }
function grid(field: 'size' | 'offsetX' | 'offsetY', e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (enc.value && Number.isFinite(v)) saveEncounter({ grid: { ...enc.value.grid, [field]: field === 'size' ? Math.max(8, v) : v } })
}
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
      <span class="eyebrow">Map</span>
      <div class="row">
        <button class="btn" data-test="choose-map" @click="chooseMap">Choose image…</button>
        <button class="btn" data-test="open-map-maker" @click="router.push({ name: 'map-maker', params: { campaignId: enc.campaignId, encounterId: enc.id } })">Map maker</button>
        <button v-if="enc.map" class="btn btn-ghost" @click="saveEncounter({ map: null })">Remove</button>
      </div>
      <input class="input" placeholder="…or a web address of an image" :value="enc.map && 'url' in enc.map ? enc.map.url : ''" aria-label="Map image address" @change="mapUrl" />
      <p class="faint">An image dropped on the map works too.</p>
      <div class="row">
        <label><span class="label">Square (px)</span><input class="input num" type="number" min="8" :value="enc.grid.size" aria-label="Grid square size" @change="grid('size', $event)" /></label>
        <label><span class="label">Offset X</span><input class="input num" type="number" :value="enc.grid.offsetX" @change="grid('offsetX', $event)" /></label>
        <label><span class="label">Offset Y</span><input class="input num" type="number" :value="enc.grid.offsetY" @change="grid('offsetY', $event)" /></label>
      </div>
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
.row { display: flex; gap: .5rem; align-items: end; flex-wrap: wrap; } .num { width: 5.2rem; } p { margin: 0; font-size: .8rem; }
</style>
