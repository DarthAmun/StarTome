<script setup lang="ts">
/** Settings: light or dark, accent, interface size, motion. The skin follows the open campaign's game. */
import { patchSettings, settings } from '@/ui/workbench'

const ACCENTS = ['#c9973a', '#4cc9f0', '#a3423a', '#86c06a', '#a98be0', '#e59a55', '#d182b4', '#5fe0a0']
const version = __APP_VERSION__
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>Settings</h1></div>
    <div class="panel block">
      <div class="row">
        <div><div class="name">Mode</div><div class="faint">Each skin has a dark and a light version.</div></div>
        <div class="seg">
          <button v-for="m in (['dark', 'light'] as const)" :key="m" class="btn" :class="{ on: settings.mode === m }" @click="patchSettings({ mode: m })">{{ m === 'dark' ? 'Dark' : 'Light' }}</button>
        </div>
      </div>
      <div class="row">
        <div><div class="name">Accent</div><div class="faint">Replaces the skin's own accent colour.</div></div>
        <div class="seg">
          <button class="btn" :class="{ on: settings.accent === null }" @click="patchSettings({ accent: null })">Skin's own</button>
          <button v-for="a in ACCENTS" :key="a" class="swatch" :class="{ on: settings.accent === a }" :style="{ background: a }" :aria-label="`Accent ${a}`" @click="patchSettings({ accent: a })" />
          <input type="color" class="swatch" :value="settings.accent ?? '#c9973a'" aria-label="Custom accent" @change="patchSettings({ accent: ($event.target as HTMLInputElement).value })" />
        </div>
      </div>
      <div class="row">
        <div><div class="name">Interface size</div><div class="faint">Scales text and spacing.</div></div>
        <div class="seg">
          <button v-for="s in (['compact', 'normal', 'large'] as const)" :key="s" class="btn" :class="{ on: settings.size === s }" @click="patchSettings({ size: s })">{{ s[0]?.toUpperCase() + s.slice(1) }}</button>
        </div>
      </div>
      <div class="row">
        <div><div class="name">Reduce motion</div><div class="faint">Turns transitions off.</div></div>
        <label class="check"><input type="checkbox" :checked="settings.reduceMotion" @change="patchSettings({ reduceMotion: ($event.target as HTMLInputElement).checked })" /> On</label>
      </div>
    </div>
    <p class="faint about">StarTome {{ version }} · rework preview. Pathfinder campaigns wear the Tome skin, Starfinder campaigns the Star skin.<br>
      StarTome is unofficial and not affiliated with Paizo Inc.</p>
  </div>
</template>

<style scoped>
.block { max-width: 760px; }
.row { display: flex; align-items: center; gap: 1.5rem; padding: 1rem 1.2rem; border-bottom: var(--frame); }
.row:last-child { border-bottom: 0; }
.row > :first-child { flex: 1; }
.name { font-weight: 600; }
.seg { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; }
.btn.on { border-color: var(--accent); color: var(--accent); }
.swatch { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 2px solid transparent; }
.swatch.on { border-color: var(--text); }
.check { display: flex; gap: .5rem; align-items: center; }
.about { margin-top: 1.2rem; font-size: .85rem; }
</style>
