<script setup lang="ts">
/** The right-click menu of the map: for a token, a wall, an area, or the bare map. */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { conditionInfo } from '@/domain/rules/conditions'
import { isDoorWall, WALL_KINDS, WALL_LABEL, type WallKind } from '@/domain/rules/walls'
import { statLinkOf, wallsOf } from '@/data/encounters'
import { peek } from '@/ui/workbench'
import { openAreaPrompt, removeArea } from './areasLive'
import type { Cell } from './engine/types'
import { applyDamage, areas, getToken, grantTempHp, live, removeTokens, saveMap, updateToken } from './live'

const props = defineProps<{ hit: { tokenId: string | null; wallId: string | null; areaId: string | null; cell: Cell }; x: number; y: number }>()
const emit = defineEmits<{ close: []; edit: [id: string]; conditions: [id: string]; area: [id: string]; add: [cell: Cell, kind: 'token' | 'creature'] }>()

const QUICK = ['Off-Guard', 'Prone', 'Frightened', 'Grabbed', 'Concealed', 'Hidden']
const token = computed(() => getToken(props.hit.tokenId))
const wall = computed(() => (live.map ? wallsOf(live.map).find(w => w.id === props.hit.wallId) : undefined))
const area = computed(() => areas().find(a => a.id === props.hit.areaId))
const amount = ref<number | null>(null)
const el = ref<HTMLElement | null>(null)
const style = computed(() => ({ left: `${Math.min(props.x, window.innerWidth - 250)}px`, top: `${Math.min(props.y, window.innerHeight - 420)}px` }))

function done(fn: () => unknown) { fn(); emit('close') }
function toggleCondition(name: string) {
  const t = token.value
  if (!t) return
  const info = conditionInfo(name)
  const has = t.conditions.some(c => c.name === name)
  updateToken(t.id, { conditions: has ? t.conditions.filter(c => c.name !== name) : [...t.conditions, { name, value: info?.valued ? 1 : null, color: info?.color, icon: info?.icon }] })
}
function setWalls(fn: (kind: WallKind, open: boolean) => { kind: WallKind; open: boolean } | null) {
  if (!live.map || !wall.value) return
  const id = wall.value.id
  saveMap({ walls: wallsOf(live.map).flatMap((w) => { if (w.id !== id) return [w]; const next = fn(w.kind, w.open); return next ? [{ ...w, ...next }] : [] }) }, true)
  emit('close')
}
function outside(e: MouseEvent) { if (el.value && !el.value.contains(e.target as Node)) emit('close') }
function key(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }
onMounted(() => { setTimeout(() => document.addEventListener('mousedown', outside), 0); document.addEventListener('keydown', key) })
onBeforeUnmount(() => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key) })
</script>

<template>
  <div ref="el" class="menu panel" :style="style" role="menu" data-test="map-menu" @contextmenu.prevent>
    <template v-if="token">
      <header>{{ token.name }}</header>
      <button @click="done(() => emit('edit', token!.id))">Edit…</button>
      <div class="quick"><button v-for="c in QUICK" :key="c" :class="{ on: token.conditions.some(x => x.name === c) }" @click="toggleCondition(c)">{{ c }}</button></div>
      <button @click="done(() => emit('conditions', token!.id))">All conditions…</button>
      <div class="amount">
        <input v-model.number="amount" type="number" min="0" class="input num" placeholder="amount" aria-label="Amount" @keydown.enter="done(() => amount && applyDamage(token!.id, amount))" />
        <button title="Damage" @click="done(() => amount && applyDamage(token!.id, amount))">Damage</button>
        <button title="Heal" @click="done(() => amount && applyDamage(token!.id, -amount))">Heal</button>
        <button title="Temporary HP" @click="done(() => amount && grantTempHp(token!.id, amount))">Temp</button>
      </div>
      <button v-if="statLinkOf(token)" @click="done(() => { const l = statLinkOf(token!); live.selectedId = token!.id; if (l) peek({ kind: 'rules', id: l.rulesId, adjustment: l.adjustment }) })">Stat block</button>
      <button v-if="token.ref.kind === 'entry'" @click="done(() => { const r = token!.ref; if (r.kind === 'entry') peek({ kind: 'entry', id: r.entryId }) })">Open NPC</button>
      <hr />
      <button @click="done(() => updateToken(token!.id, { visible: !token!.visible }))">{{ token.visible ? 'Hide from players' : 'Show to players' }}</button>
      <button @click="done(() => updateToken(token!.id, { actsWhileHidden: !token!.actsWhileHidden }))">{{ token.actsWhileHidden ? '✓ ' : '' }}Acts while hidden</button>
      <button @click="done(() => updateToken(token!.id, { dead: !token!.dead }))">{{ token.dead ? 'Not dead' : 'Dead' }}</button>
      <button @click="done(() => updateToken(token!.id, { playerToken: !token!.playerToken }))">{{ token.playerToken ? '✓ ' : '' }}Player token</button>
      <button @click="done(() => updateToken(token!.id, { ally: !token!.ally }))">{{ token.ally ? '✓ ' : '' }}Ally</button>
      <hr />
      <button class="danger" @click="done(() => removeTokens([token!.id], live.encounter?.status === 'active'))">Remove</button>
    </template>
    <template v-else-if="wall">
      <header>{{ WALL_LABEL[wall.kind] }}</header>
      <button v-if="isDoorWall(wall.kind)" @click="setWalls((kind, open) => ({ kind, open: !open }))">{{ wall.open ? 'Close' : 'Open' }}</button>
      <button v-for="k in WALL_KINDS.filter(k => k !== wall!.kind)" :key="k" @click="setWalls(() => ({ kind: k, open: false }))">Make it: {{ WALL_LABEL[k].toLowerCase() }}</button>
      <hr />
      <button class="danger" @click="setWalls(() => null)">Delete</button>
    </template>
    <template v-else-if="area">
      <header>{{ area.label }}</header>
      <button @click="done(() => emit('area', area!.id))">Effect…</button>
      <button v-if="area.effect" @click="done(() => openAreaPrompt(area!.id))">Ask for saves</button>
      <hr />
      <button class="danger" @click="done(() => removeArea(area!.id))">Remove</button>
    </template>
    <template v-else>
      <button data-test="menu-add-creature" @click="done(() => emit('add', hit.cell, 'creature'))">Add creature here…</button>
      <button data-test="menu-add-token" @click="done(() => emit('add', hit.cell, 'token'))">Add token here…</button>
    </template>
  </div>
</template>

<style scoped>
.menu { position: fixed; z-index: 40; width: 240px; padding: .3rem; display: flex; flex-direction: column; box-shadow: var(--shadow); max-height: 80vh; overflow: auto; }
header { padding: .2rem .5rem .3rem; font-family: var(--font-title); color: var(--accent); }
button { background: none; border: 0; text-align: left; padding: .3rem .5rem; border-radius: var(--radius); }
button:hover { background: var(--bg-hover); } button.danger { color: var(--danger); }
hr { border: 0; border-top: var(--frame); margin: .25rem 0; width: 100%; }
.quick { display: flex; flex-wrap: wrap; gap: 2px; padding: .15rem .4rem; } .quick button { font-size: .76rem; padding: .1rem .4rem; border: var(--frame); }
.quick button.on { background: var(--accent-soft); border-color: var(--accent); }
.amount { display: flex; gap: 2px; padding: .15rem .4rem; align-items: center; } .amount .num { width: 4.4rem; padding: .2em .4em; } .amount button { font-size: .8rem; padding: .2rem .35rem; border: var(--frame); }
</style>
