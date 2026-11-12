<script setup lang="ts">
/** The shell: rail, top bar, the page, the peek dock and the tray. */
import { computed, onMounted, onUnmounted, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronsUpDown, Search } from 'lucide-vue-next'
import { campaigns as campaignRepo, settings as settingsRepo } from '@/data/repo'
import { backupIfDue } from '@/services/backup/folder'
import DialogHost from '@/ui/components/DialogHost.vue'
import { useLive } from '@/ui/useLive'
import { campaign, campaignId, campaigns, closeDock, commandBarOpen, dock, patchSettings, settings } from '@/ui/workbench'
import AppRail from './AppRail.vue'
import CommandBar from './CommandBar.vue'
import PeekDock from './PeekDock.vue'
import PinTray from './PinTray.vue'

const route = useRoute()
const router = useRouter()

const liveCampaigns = useLive(() => campaignRepo.list(), [])
watch(liveCampaigns, (list) => { campaigns.value = list }, { immediate: true })
const liveSettings = useLive(() => settingsRepo.get(), settings.value)
watch(liveSettings, (s) => { settings.value = s })

// The open campaign follows the address; pages without one keep the last
watch(() => route.params.campaignId, (id) => {
  if (typeof id === 'string' && id !== campaignId.value) {
    campaignId.value = id
    void patchSettings({ lastCampaignId: id })
  }
}, { immediate: true })
watch([liveSettings, liveCampaigns], ([s, list]) => {
  if (!campaignId.value && s.lastCampaignId && list.some(c => c.id === s.lastCampaignId)) campaignId.value = s.lastCampaignId
})

// The skin is the campaign's game; mode, accent and size are yours
const skin = computed(() => (campaign.value?.game === 'sf2e' ? 'star' : 'tome'))
watchEffect(() => {
  const root = document.documentElement
  root.dataset.skin = skin.value
  root.dataset.mode = settings.value.mode
  root.dataset.size = settings.value.size
  root.dataset.motion = settings.value.reduceMotion ? 'reduced' : 'full'
  if (settings.value.accent) root.style.setProperty('--user-accent', settings.value.accent)
  else root.style.removeProperty('--user-accent')
})

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); commandBarOpen.value = !commandBarOpen.value; return }
  if (e.key === 'Escape' && dock.open && !commandBarOpen.value && !document.querySelector('dialog[open]')) closeDock()
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  void navigator.storage?.persist?.()
  void backupIfDue(__APP_VERSION__).catch(err => console.warn('automatic backup skipped', err))
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

function switchCampaign(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  void router.push(id ? { name: 'tonight', params: { campaignId: id } } : { name: 'welcome' })
}
</script>

<template>
  <div class="shell" :class="{ docked: dock.open }">
    <AppRail />
    <header class="top">
      <label class="switch" title="Switch campaign">
        <span class="game">{{ campaign ? (campaign.game === 'sf2e' ? 'SF2e' : 'PF2e') : '—' }}</span>
        <select :value="campaignId ?? ''" aria-label="Campaign" @change="switchCampaign">
          <option value="">All campaigns…</option>
          <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <ChevronsUpDown :size="13" />
      </label>
      <button class="find" @click="commandBarOpen = true"><Search :size="14" /> <span>Go to, find, look up…</span> <span class="kbd">Ctrl K</span></button>
      <span class="preview chip">rework preview · your live data is in v0.42</span>
    </header>
    <main class="main"><RouterView :key="String(route.params.campaignId ?? '')" /></main>
    <PeekDock />
    <PinTray />
    <CommandBar />
    <DialogHost />
  </div>
</template>

<style scoped>
.shell { height: 100%; display: grid; grid-template-columns: var(--rail-w) minmax(0, 1fr) auto; grid-template-rows: var(--bar-h) minmax(0, 1fr) var(--tray-h); }
.top { grid-column: 2 / -1; display: flex; align-items: center; gap: 1rem; padding: 0 1rem; border-bottom: var(--frame); background: var(--bg-sunken); }
.switch { display: flex; align-items: center; gap: .5rem; color: var(--text-faint); }
.switch select { appearance: none; background: none; border: 0; font-family: var(--font-title); font-size: 1.02rem; letter-spacing: var(--title-tracking); text-transform: var(--title-transform); font-weight: var(--title-weight); color: var(--text); max-width: 320px; cursor: pointer; }
.switch select option { background: var(--bg-raised); color: var(--text); font-family: var(--font-ui); text-transform: none; }
.game { font-family: var(--font-mono); font-size: .7rem; padding: .1em .45em; border: 1px solid var(--accent); color: var(--accent); border-radius: var(--radius); }
.find { flex: 1; max-width: 460px; margin: 0 auto; display: flex; align-items: center; gap: .6rem; padding: .32rem .7rem; background: var(--bg); border: var(--frame); border-radius: var(--radius); color: var(--text-faint); }
.find span:first-of-type { flex: 1; text-align: left; }
.find:hover { border-color: var(--line-strong); color: var(--text-dim); }
.preview { font-size: .72rem; color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, var(--line)); }
.main { grid-column: 2; min-height: 0; min-width: 0; }
.shell :deep(.dock) { grid-column: 3; grid-row: 2; }
</style>
