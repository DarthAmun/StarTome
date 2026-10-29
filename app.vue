<template>
  <div id="app-root" @click="onMagicClick">

    <template v-if="!isPlayerRoute">
      <AppSidebar ref="sidebarRef" />
      <div class="content-area">
        <BookmarkRibbon />
        <NuxtPage />
      </div>
    </template>

    <template v-else>
      <NuxtPage />
    </template>

    <LazyGlobalSearch v-if="!isPlayerRoute" />
    <LazyDiceRoller v-if="!isPlayerRoute" />
    <LazyAppSoundBar v-if="!isPlayerRoute" />
    <LevelUpDialog v-if="!isPlayerRoute" />
    <AwardXpDialog v-if="!isPlayerRoute" />
    <div id="spark-layer" class="no-print" aria-hidden="true" />

    <!-- New Campaign dialog -->
    <Teleport to="body">
      <div v-if="showNewCampaign" class="pv-dialog-mask" @click.self="showNewCampaign = false">
        <div class="pv-dialog">
          <div class="pv-dialog-header">
            <span class="pv-dialog-title">Begin a New Campaign</span>
            <button class="pv-dialog-close" @click="showNewCampaign = false">
              <OhVueIcon name="md-close" scale="0.85" />
            </button>
          </div>
          <div class="pv-dialog-content">
            <div class="dlg-field">
              <label class="f-label">Title</label>
              <input class="f-input-box" v-model="newCamp.name" placeholder="Abomination Vaults…"
                @keyup.enter="createCampaign" autofocus />
            </div>
            <div class="dlg-field">
              <label class="f-label">Description</label>
              <textarea class="f-input-box f-textarea" v-model="newCamp.description" placeholder="A dark tale of…" rows="3" />
            </div>
            <div class="dlg-field">
              <label class="f-label">Game</label>
              <select class="f-input-box f-select" v-model="newCamp.game">
                <option v-for="g in GAME_IDS" :key="g" :value="g">{{ GAME_CONFIG[g].label }}</option>
              </select>
            </div>
          </div>
          <div class="pv-dialog-footer">
            <button class="ghost-btn" @click="showNewCampaign = false">Cancel</button>
            <button class="seal-btn" @click="createCampaign">Begin</button>
          </div>
        </div>
      </div>

    </Teleport>

    <Transition name="install">
      <button v-if="installPrompt" class="install-pill no-print" @click="installApp" title="Install StarTome">
        <OhVueIcon name="md-install-mobile" scale="0.9" />
        Install App
      </button>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { useSettings } from '~/composables/useSettings'
import { useBookmarks } from '~/composables/useBookmarks'
import { useAppDialogs } from '~/composables/useAppDialogs'
import { dbApi } from '~/composables/useDb'
import { GAME_CONFIG, GAME_IDS, type GameId } from '~/types/game'
const { settings } = useSettings()
useBookmarks()

const route = useRoute()
const router = useRouter()
const isPlayerRoute = computed(() =>
  route.path.endsWith('/player') || route.path.endsWith('/map-player') || route.path.endsWith('/graph-player')
)

const sidebarRef = ref<{ reload: () => void } | null>(null)
const { showNewCampaign } = useAppDialogs()

// ── New Campaign ─────────────────────────────────────────────────
const newCamp = ref({ name: '', description: '', game: 'pf2e' as GameId })

async function createCampaign() {
  if (!newCamp.value.name.trim()) return
  const c = await dbApi.campaigns.create({ name: newCamp.value.name, description: newCamp.value.description, game: newCamp.value.game })
  newCamp.value = { name: '', description: '', game: 'pf2e' }
  showNewCampaign.value = false
  sidebarRef.value?.reload()
  router.push(`/campaign/${c.id}/sessions`)
}

// ── Ink write animation ──────────────────────────────────────────
const INK_SELECTORS = [
  '.entry-name', '.leaf-type', '.leaf-new-label', '.page-title',
  '.right-hint', '.folio-chapter-name', '.folio-chapter-sub',
  '.sys-stat-num', '.loc-detail-name',
]

function inkWritePage() {
  const targets = document.querySelectorAll(INK_SELECTORS.join(','))
  let t = 0
  targets.forEach((el: Element) => {
    const htmlEl = el as HTMLElement
    htmlEl.style.opacity = ''
    const nodes = Array.from(htmlEl.childNodes)
    interface Part { ch: string; tag: string | null }
    const parts: Part[] = []
    nodes.forEach(node => {
      if (node.nodeType === Node.COMMENT_NODE) return
      if (node.nodeType === Node.TEXT_NODE) {
        (node.textContent || '').split('').forEach(ch => parts.push({ ch, tag: null }))
      } else if ((node as Element).tagName === 'EM') {
        (node.textContent || '').split('').forEach(ch => parts.push({ ch, tag: 'em' }))
      } else {
        (node.textContent || '').split('').forEach(ch => parts.push({ ch, tag: null }))
      }
    })
    const n = parts.length
    if (n === 0) return
    const stagger = Math.min(14, Math.max(3, 220 / n))
    htmlEl.innerHTML = parts.map((p, i) => {
      const delay = (t + i * stagger).toFixed(1)
      const ch = p.ch === ' ' ? '&nbsp;' : p.ch.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      const span = `<span class="ink-c" style="animation-delay:${delay}ms">${ch}</span>`
      return p.tag ? `<${p.tag}>${span}</${p.tag}>` : span
    }).join('')
    t += n * stagger * 0.55
    if (t > 320) t = 320
  })
}

// ── PWA install prompt ───────────────────────────────────────────
const installPrompt = ref<Event | null>(null)

if (import.meta.client) {
  const onBeforeInstall = (e: Event) => { e.preventDefault(); installPrompt.value = e }
  const onAppInstalled = () => { installPrompt.value = null }
  onMounted(() => {
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onAppInstalled)
  })
  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    window.removeEventListener('appinstalled', onAppInstalled)
  })
}

async function installApp() {
  const prompt = installPrompt.value as any
  if (!prompt) return
  prompt.prompt()
  const { outcome } = await prompt.userChoice
  if (outcome === 'accepted') installPrompt.value = null
}

router.afterEach(() => {
  nextTick(() => {
    if (!settings.value.inkWrite) return
    document.querySelectorAll(INK_SELECTORS.join(',')).forEach(el => {
      (el as HTMLElement).style.opacity = '0'
    })
    setTimeout(inkWritePage, 60)
  })
})

function onMagicClick(e: MouseEvent) {
  if (!settings.value.sparkEffects) return
  const el = e.target as HTMLElement
  if (!el.closest('button, a, .ink-card, .v6-card, .ink-card-new, .entry, .home-card')) return
  const layer = document.getElementById('spark-layer')
  if (!layer) return
  const palette = ['var(--accent)', 'var(--accent-l)', '#f0bc2a', '#c05000', '#e8dcc5', '#7c3aed']
  const n = 5 + Math.floor(Math.random() * 6)
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div')
    s.className = 'arcane-spark'
    s.style.left = e.clientX + 'px'
    s.style.top = e.clientY + 'px'
    const col = palette[Math.floor(Math.random() * palette.length)]
    s.style.background = col
    s.style.boxShadow = `0 0 4px ${col}`
    const a = (Math.PI * 2 * i / n) + (Math.random() - 0.5)
    const d = 15 + Math.random() * 45
    s.style.setProperty('--sx', (Math.cos(a) * d) + 'px')
    s.style.setProperty('--sy', (Math.sin(a) * d - 15) + 'px')
    s.style.animationDuration = (0.35 + Math.random() * 0.35) + 's'
    layer.appendChild(s)
    s.addEventListener('animationend', () => s.remove(), { once: true })
  }
}
</script>

<style>
#app-root {
  height: 100vh;
  overflow: hidden;
  display: flex;
  background: var(--bg);
  position: relative;
  z-index: 1;
}

#spark-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: var(--z-top);
  overflow: hidden;
}

</style>
