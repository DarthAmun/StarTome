<script setup lang="ts">
/** The map tools and the settings of the one in use. */
import { CloudFog, Crosshair, MousePointer2, Radio, Ruler, Shapes } from 'lucide-vue-next'
import { BrickWall } from 'lucide-vue-next'
import type { Component } from 'vue'
import { AREA_KINDS } from '@/domain/rules/areas'
import { WALL_KINDS, WALL_LABEL } from '@/domain/rules/walls'
import type { Tool } from './engine/types'
import { live, saveMap } from './live'
import { tools } from './tools'

const TOOLS: { id: Tool; label: string; icon: Component; hint: string }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, hint: 'Move tokens, open doors; drag the map to pan; hold to ping' },
  { id: 'fog', label: 'Fog', icon: CloudFog, hint: 'Paint fog of war' },
  { id: 'measure', label: 'Ruler', icon: Ruler, hint: 'Click a start, move to measure, click again to clear' },
  { id: 'area', label: 'Area', icon: Shapes, hint: 'Burst, cone, line or emanation' },
  { id: 'wall', label: 'Walls', icon: BrickWall, hint: 'Click points, double-click or right-click to finish; Backspace removes the last point' },
  { id: 'ping', label: 'Ping', icon: Radio, hint: 'Click to ping the players\' window; Shift also centres it there' },
]
const pick = (id: Tool) => { tools.tool = id; if (id !== 'area') tools.pending = null }
</script>

<template>
  <div class="toolbar">
    <div class="tools" role="toolbar" aria-label="Map tools">
      <button v-for="t in TOOLS" :key="t.id" class="btn btn-icon" :class="{ 'btn-primary': tools.tool === t.id }" :title="`${t.label}: ${t.hint}`" :aria-label="t.label" :data-tool="t.id" @click="pick(t.id)"><component :is="t.icon" :size="16" /></button>
    </div>
    <div v-if="tools.tool === 'fog'" class="opts">
      <button class="btn" :class="{ 'btn-primary': tools.fogHide }" @click="tools.fogHide = true">Hide</button>
      <button class="btn" :class="{ 'btn-primary': !tools.fogHide }" @click="tools.fogHide = false">Reveal</button>
      <label class="faint">Brush <select v-model.number="tools.fogBrush" class="input sel"><option :value="1">1</option><option :value="3">3</option><option :value="5">5</option></select></label>
      <button class="btn" data-test="fog-cover" @click="saveMap({ fog: { _allHidden: 'hidden' } }, true)">Cover all</button>
      <button class="btn" @click="saveMap({ fog: {} }, true)">Clear all</button>
    </div>
    <div v-else-if="tools.tool === 'area'" class="opts">
      <select v-model="tools.areaKind" class="input sel" aria-label="Area shape"><option v-for="k in AREA_KINDS" :key="k" :value="k">{{ k }}</option></select>
      <label class="faint"><input v-model.number="tools.areaFt" type="number" min="5" step="5" class="input num" aria-label="Area size in feet" /> ft</label>
      <input v-model="tools.areaColor" type="color" aria-label="Area colour" />
      <span v-if="tools.pending" class="chip"><Crosshair :size="12" /> placing {{ tools.pending.label }}</span>
      <span class="faint">{{ tools.areaKind === 'cone' || tools.areaKind === 'line' ? 'Click where it starts (a token: from its edge), then aim.' : tools.areaKind === 'emanation' ? 'Click the creature it surrounds.' : 'Click a grid corner.' }}</span>
    </div>
    <div v-else-if="tools.tool === 'wall'" class="opts">
      <select v-model="tools.wallKind" class="input sel" aria-label="Wall kind"><option v-for="k in WALL_KINDS" :key="k" :value="k">{{ WALL_LABEL[k] }}</option></select>
      <span v-if="!live.encounter?.fovEnabled" class="faint">Walls block sight once “Sight and walls” is on.</span>
    </div>
  </div>
</template>

<style scoped>
.toolbar { position: absolute; top: .6rem; left: .6rem; z-index: 4; display: flex; gap: .5rem; align-items: flex-start; pointer-events: none; }
.tools, .opts { pointer-events: auto; display: flex; gap: .25rem; padding: .25rem; background: color-mix(in srgb, var(--bg-raised) 92%, transparent); border: var(--frame); border-radius: var(--radius); align-items: center; }
.tools { flex-direction: column; } .opts { flex-wrap: wrap; max-width: 38rem; }
.sel { width: auto; padding: .2em .4em; } .num { width: 4.4rem; display: inline-block; padding: .2em .4em; }
</style>
