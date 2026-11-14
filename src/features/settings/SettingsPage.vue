<script setup lang="ts">
/** Settings: light or dark, accent, interface size, motion. The skin follows the open campaign's game. */
import { onMounted, ref } from 'vue'
import ShortcutList from '@/ui/components/ShortcutList.vue'
import { notify } from '@/ui/dialogs'
import { canInstall, checkForUpdate, installApp, installed, offline, reloadForUpdate, updateReady } from '@/ui/pwa'
import { patchSettings, settings } from '@/ui/workbench'

const ACCENTS = ['#c9973a', '#4cc9f0', '#a3423a', '#86c06a', '#a98be0', '#e59a55', '#d182b4', '#5fe0a0']
const version = __APP_VERSION__

const storage = ref<{ usage: number; quota: number; persisted: boolean } | null>(null)
async function readStorage() {
  const est = await navigator.storage?.estimate?.()
  if (est) storage.value = { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted: await navigator.storage.persisted?.() ?? false }
}
onMounted(readStorage)
const size = (bytes: number) => (bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(1)} GB` : `${Math.round(bytes / 1048576).toLocaleString()} MB`)

async function keepData() {
  const ok = await navigator.storage?.persist?.()
  notify(ok ? 'The browser will keep this app’s data.' : 'The browser did not agree. Installing the app usually settles it.', ok ? 'ok' : 'info')
  await readStorage()
}

const checking = ref(false)
async function check() {
  checking.value = true
  try {
    if (!await checkForUpdate()) notify('This copy has no offline cache to update (it runs from a development server).')
    else setTimeout(() => { if (!updateReady.value) notify('You have the newest version.', 'ok') }, 1500)
  } catch { notify('Could not reach the server to look for a new version.', 'error') } finally { checking.value = false }
}
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
    <h2 class="sec">This app</h2>
    <div class="panel block" data-test="settings-app">
      <div class="row">
        <div><div class="name">Version {{ version }}</div><div class="faint">{{ updateReady ? 'A new version is downloaded and waits for a reload.' : 'A new version is fetched in the background and waits for your reload; it never replaces the app under a running session.' }}</div></div>
        <button v-if="updateReady" class="btn btn-primary" @click="reloadForUpdate">Reload now</button>
        <button v-else class="btn" :disabled="checking" @click="check">Look for a new version</button>
      </div>
      <div class="row">
        <div><div class="name">Works offline</div><div class="faint">{{ offline === 'ready' ? 'The whole app is stored on this device. Only the Foundry release check, pictures and sounds given as web addresses, and Play Buddy use a connection.' : offline === 'preparing' ? 'Storing the app on this device…' : 'Not in this copy: it runs from a development server.' }}</div></div>
        <span class="chip" :class="offline">{{ offline === 'ready' ? 'Ready' : offline === 'preparing' ? 'Preparing' : 'Off' }}</span>
      </div>
      <div class="row">
        <div><div class="name">Install</div><div class="faint">{{ installed ? 'Running as an installed app.' : canInstall ? 'Gives StarTome its own window and keeps its data safe from the browser’s clean-ups.' : 'Chrome offers this once the app is stored for offline use (or use “Install StarTome” in the address bar).' }}</div></div>
        <button v-if="!installed" class="btn" :class="{ 'btn-primary': canInstall }" :disabled="!canInstall" data-test="install" @click="installApp">Install StarTome</button>
        <span v-else class="chip ready">Installed</span>
      </div>
      <div v-if="storage" class="row">
        <div><div class="name">Storage</div><div class="faint">{{ size(storage.usage) }} used of {{ size(storage.quota) }} the browser allows. {{ storage.persisted ? 'The browser has promised not to clear it.' : 'The browser may clear it when the disk runs full.' }}</div></div>
        <button v-if="!storage.persisted" class="btn" @click="keepData">Ask the browser to keep it</button>
        <span v-else class="chip ready">Kept</span>
      </div>
    </div>
    <h2 class="sec">Keyboard shortcuts <span class="faint hint">press <span class="kbd">?</span> anywhere</span></h2>
    <div class="panel block keys"><ShortcutList /></div>
    <p class="faint about">StarTome {{ version }}. Pathfinder campaigns wear the Tome skin, Starfinder campaigns the Star skin.<br>
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
.sec { margin: 1.6rem 0 .7rem; }
.hint { font-family: var(--font-ui); font-size: .8rem; letter-spacing: 0; text-transform: none; margin-left: .6rem; }
.keys { padding: 1.1rem 1.2rem .2rem; max-width: 980px; }
.chip.ready { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, var(--line)); }
</style>
