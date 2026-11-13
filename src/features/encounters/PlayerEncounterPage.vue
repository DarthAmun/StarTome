<script setup lang="ts">
/**
 * The players' window of an encounter: the map with fog, what their tokens
 * see, tokens with health as a shade, areas, pings, and the turn order. It
 * shows only what the GM's window sends, and asks for it again after a reload.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { PlayerScene } from '@/domain/rules/playerView'
import { onPlayerMessage, sendToPlayers } from '@/services/playerLink'
import { imageUrlOf } from '@/ui/imageUrl'
import TokenThumb from './TokenThumb.vue'
import { MapEngine } from './vtt/engine/engine'
import { conditionColor, hexNumber, toSceneTokens } from './vtt/scene'

const host = ref<HTMLElement | null>(null)
const scene = shallowRef<PlayerScene | null>(null)
let engine: MapEngine | null = null
let observer: ResizeObserver | null = null
let shownMap: string | null | undefined
const offs: (() => void)[] = []

const byId = computed(() => new Map((scene.value?.tokens ?? []).map(t => [t.id, t])))

async function draw(s: PlayerScene | null) {
  scene.value = s
  if (!engine || !s) return
  engine.setGrid(s.grid)
  const mapKey = JSON.stringify(s.map)
  if (mapKey !== shownMap) { shownMap = mapKey; await engine.setMap(await imageUrlOf(s.map, true)); engine.fit() }
  engine.setFog(s.fog)
  engine.setAreas(s.areas.map(a => ({ id: a.id, cells: a.cells, color: hexNumber(a.color) })))
  engine.setFov({ lit: s.lit, outlines: [] })
  engine.setTokens(await toSceneTokens(s.tokens.map(t => ({
    id: t.id, name: t.name, image: t.image, x: t.x, y: t.y, size: t.size, visible: true, dead: t.dead, party: t.party, hp: t.hp, health: t.health,
    conditions: t.conditions, timers: t.timers.map(x => x.remaining), elevation: t.elevation,
  }))), s.running ? s.activeId : null)
}

onMounted(async () => {
  document.title = 'StarTome · Players'
  if (!host.value) return
  const e = new MapEngine(host.value, false, { tool: () => 'select' })
  await e.init()
  engine = e
  observer = new ResizeObserver(() => e.resize())
  observer.observe(host.value)
  offs.push(onPlayerMessage('encounter', m => void draw(m.scene)))
  offs.push(onPlayerMessage('ping', (m) => { e.ping(m.col, m.row); if (m.focus) e.centerOn(m.col, m.row) }))
  sendToPlayers({ type: 'hello', channel: 'encounter' })
})
onBeforeUnmount(() => { offs.forEach(off => off()); observer?.disconnect(); engine?.destroy() })
</script>

<template>
  <div class="players" :class="scene ? [`rail-${scene.prefs.railPosition}`, `size-${scene.prefs.railSize}`] : []">
    <div ref="host" class="map" />
    <p v-if="!scene" class="wait">Waiting for the GM to open an encounter…</p>
    <ol v-else-if="scene.running && scene.turns.length" class="rail" data-test="player-turns">
      <li class="round">Round {{ scene.round }}</li>
      <li v-for="t in scene.turns" :key="t.id" :class="{ active: t.id === scene.activeId, dead: t.dead, party: t.party }">
        <span v-if="t.mystery" class="mystery">?</span>
        <TokenThumb v-else :image="t.image" :name="t.name" :size="scene.prefs.railSize === 'small' ? 30 : scene.prefs.railSize === 'large' ? 56 : 42" />
        <span v-if="scene.prefs.railNames && !t.mystery" class="who">
          <b>{{ t.name }}</b>
          <span class="conds"><i v-for="c in byId.get(t.id)?.conditions ?? []" :key="c.name" :style="{ background: conditionColor(c) }">{{ c.name }}{{ c.value != null ? ` ${c.value}` : '' }}</i></span>
        </span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.players { position: fixed; inset: 0; background: #0e0e1a; color: #e8e6f0; font-family: var(--font-ui); }
.map { position: absolute; inset: 0; }
.wait { position: absolute; inset: 0; display: grid; place-items: center; color: #8a88a0; margin: 0; }
.rail { position: absolute; list-style: none; margin: 0; padding: .5rem; display: flex; gap: .4rem; background: rgb(10 10 22 / .72); border-radius: 8px; max-height: 96vh; max-width: 96vw; overflow: hidden; }
.rail-right .rail { right: .6rem; top: .6rem; flex-direction: column; } .rail-left .rail { left: .6rem; top: .6rem; flex-direction: column; } .rail-top .rail { top: .6rem; left: 50%; transform: translateX(-50%); align-items: center; }
.round { font-family: var(--font-title); font-size: .8rem; letter-spacing: .12em; text-transform: uppercase; color: #c9b27a; padding: 0 .2rem; white-space: nowrap; }
.rail li:not(.round) { display: flex; align-items: center; gap: .5rem; padding: .2rem .4rem; border-radius: 6px; border: 1px solid transparent; }
.rail li.active { border-color: #ffd700; background: rgb(255 215 0 / .12); } .rail li.dead { opacity: .45; }
.who { display: flex; flex-direction: column; min-width: 0; } .party b { color: #3bbfa8; } .size-large b { font-size: 1.15rem; } .size-small b { font-size: .82rem; }
.conds { display: flex; gap: 3px; flex-wrap: wrap; } .conds i { font-style: normal; font-size: .68rem; font-weight: 600; padding: 0 .3rem; border-radius: 3px; color: #10101a; }
.mystery { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: #23233a; font-size: 1.3rem; color: #8a88a0; }
</style>
