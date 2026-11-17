<script setup lang="ts">
/**
 * The floor switcher on the GM's map: the floor shown, the ones above and
 * below (PgUp / PgDn), how many tokens stand on each, and adding, renaming
 * and removing floors. Players see the GM's floor unless it is locked.
 */
import { computed, nextTick, ref } from 'vue'
import { ChevronDown, ChevronUp, Layers, Lock, LockOpen } from 'lucide-vue-next'
import { removeFloorFrom } from '@/data/encounters'
import { storedFloorId } from '@/domain/rules/floors'
import { confirmDialog, reportError } from '@/ui/dialogs'
import { addFloorHere, areasOn, currentFloor, flushSaves, floors, live, reloadMap, saveFloor, showFloor, tokensOn } from './live'
import { tools } from './tools'

const open = ref(false)
const naming = ref(false)
const nameEl = ref<HTMLInputElement | null>(null)
const list = computed(() => [...floors()].reverse())
const at = computed(() => floors().findIndex(f => f.id === currentFloor()?.id))
const above = computed(() => floors()[at.value + 1])
const below = computed(() => (at.value > 0 ? floors()[at.value - 1] : undefined))
const count = (id: string) => tokensOn(id).length
const locked = computed(() => live.playerFloorId !== null)

function step(dir: 1 | -1) { const f = dir > 0 ? above.value : below.value; if (f) showFloor(f.id) }
async function add(belowIt: boolean) {
  open.value = false
  await addFloorHere(belowIt).catch(err => reportError('Adding a floor', err))
}
async function rename() {
  naming.value = true
  await nextTick()
  nameEl.value?.select()
}
function setName(e: Event) {
  const name = (e.target as HTMLInputElement).value.trim()
  if (name) saveFloor({ name }, true)
  naming.value = false
}
async function remove() {
  const f = currentFloor()
  if (!f || !live.encounter || floors().length < 2) return
  open.value = false
  const tokens = count(f.id), areas = areasOn(f.id).length
  const what = [tokens ? `${tokens} token${tokens === 1 ? '' : 's'}` : '', areas ? `${areas} area${areas === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')
  if (!await confirmDialog({ title: `Remove “${f.name}”?`, body: `Its map, walls and fog go${what ? `, with the ${what} on it` : ''}. Stairs to it are removed too. This cannot be undone.`, confirmLabel: 'Remove floor', danger: true })) return
  try {
    await flushSaves()
    await removeFloorFrom(live.encounter.id, storedFloorId(f.id))
    live.floorId = (below.value ?? above.value)?.id ?? live.floorId
    await reloadMap()
  } catch (err) { reportError('Removing the floor', err) }
}
function lock() { live.playerFloorId = locked.value ? null : live.floorId }
function key(e: KeyboardEvent) {
  if (e.key === 'Escape') { open.value = false; naming.value = false }
}
defineExpose({ step })
</script>

<template>
  <div class="floors" data-test="floor-bar" @keydown="key">
    <template v-if="floors().length > 1">
      <button class="btn btn-icon" title="Floor below (PgDn)" :disabled="!below" data-test="floor-down" @click="step(-1)"><ChevronDown :size="15" /></button>
      <input v-if="naming" ref="nameEl" class="input name" :value="currentFloor()?.name" aria-label="Floor name" @change="setName" @blur="naming = false" @keydown.enter="($event.target as HTMLInputElement).blur()" />
      <button v-else class="btn cur" title="All floors" data-test="floor-current" @click="open = !open">{{ currentFloor()?.name }}</button>
      <button class="btn btn-icon" title="Floor above (PgUp)" :disabled="!above" data-test="floor-up" @click="step(1)"><ChevronUp :size="15" /></button>
      <button class="btn btn-icon" :class="{ 'btn-primary': locked }" :title="locked ? `Players stay on ${floors().find(f => f.id === live.playerFloorId)?.name}: click to let them follow you` : 'Players see the floor you see: click to keep them on this one'" data-test="floor-lock" @click="lock"><component :is="locked ? Lock : LockOpen" :size="14" /></button>
    </template>
    <button v-else class="btn" title="Floors: add one above or below this map" data-test="floor-current" @click="open = !open"><Layers :size="14" /> Floors</button>

    <div v-if="open" class="menu panel" role="menu" data-test="floor-menu">
      <template v-if="floors().length > 1">
        <button v-for="f in list" :key="f.id" class="row" :class="{ on: f.id === currentFloor()?.id }" :data-floor="f.name" @click="showFloor(f.id); open = false">
          <span>{{ f.name }}</span><span class="faint">{{ count(f.id) || '' }}</span>
        </button>
        <hr />
      </template>
      <button data-test="floor-add-above" @click="add(false)">Add a floor on top</button>
      <button data-test="floor-add-below" @click="add(true)">Add a floor at the bottom</button>
      <template v-if="floors().length > 1">
        <button @click="open = false; rename()">Rename this floor</button>
        <hr />
        <button class="danger" data-test="floor-remove" @click="remove">Remove this floor…</button>
      </template>
    </div>
    <span v-if="tools.tool === 'stairs' && tools.stairStart && tools.stairStart.floorId !== currentFloor()?.id" class="chip">Click the other end</span>
  </div>
</template>

<style scoped>
.floors { position: absolute; top: .6rem; right: .6rem; z-index: 4; display: flex; gap: .25rem; align-items: center; padding: .25rem; background: color-mix(in srgb, var(--bg-raised) 92%, transparent); border: var(--frame); border-radius: var(--radius); }
.cur { min-width: 7rem; font-weight: 600; } .name { width: 9rem; padding: .2em .4em; }
.menu { position: absolute; top: calc(100% + .3rem); right: 0; width: 230px; padding: .3rem; display: flex; flex-direction: column; box-shadow: var(--shadow); }
.menu button { background: none; border: 0; text-align: left; padding: .3rem .5rem; border-radius: var(--radius); }
.menu button:hover { background: var(--bg-hover); } .menu button.danger { color: var(--danger); }
.row { display: flex; justify-content: space-between; } .row.on { background: var(--accent-soft) !important; font-weight: 600; }
hr { border: 0; border-top: var(--frame); margin: .25rem 0; width: 100%; }
</style>
