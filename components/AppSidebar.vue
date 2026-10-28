<template>
  <aside class="sidebar no-print" :class="{ collapsed }">

    <!-- ── Top bar ── -->
    <div class="sb-top">
      <img
        v-if="!collapsed"
        src="/icons/icon-192.png"
        alt=""
        width="22"
        height="22"
        class="sb-logo-img"
        @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
      />
      <NuxtLink v-if="!collapsed" to="/" class="sb-wordmark" title="StarTome">
        StarTome
      </NuxtLink>

      <!-- Collapse toggle -->
      <button
        class="sb-icon-btn sb-collapse-btn"
        :title="collapsed ? 'Expand sidebar (B)' : 'Collapse sidebar (B)'"
        @click="collapsed = !collapsed"
      >
        {{ collapsed ? '›' : '‹' }}
      </button>
    </div>

    <!-- Logo below the toggle button, only in collapsed mode -->
    <NuxtLink v-if="collapsed" to="/" class="sb-logo-below" title="StarTome">
      <img src="/icons/icon-192.png" alt="" width="24" height="24" class="sb-logo-img"
        @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'" />
    </NuxtLink>

    <!-- ── Collapsed view ── -->
    <template v-if="collapsed">
      <div class="sb-scroll" style="padding-top:4px">
        <!-- Campaigns -->
        <div v-for="c in campaigns" :key="c.id!">
          <div
            class="sb-campaign-header"
            :class="{ active: activeCampaignId === c.id }"
            :data-tip="c.name"
            @click="expandedCampaigns.has(c.id!) ? toggleExpand(c) : navigateToCampaign(c)"
          >
            <span class="sb-campaign-dot" :style="{ background: campaignColor(c.id!) }" />
          </div>
          <!-- Entity type icon rail under active/expanded campaign -->
          <div v-if="expandedCampaigns.has(c.id!)" class="sb-icon-rail">
            <NuxtLink
              v-for="et in ENTITY_TYPES"
              :key="et.key"
              :to="`/campaign/${c.id}/${et.segment}`"
              class="sb-icon-link"
              :class="{ active: isChildActive(c.id!, et.segment) }"
              :data-tip="et.label"
            >
              <OhVueIcon :name="et.icon" scale="0.75" :style="{ color: et.color }" />
            </NuxtLink>
            <NuxtLink
              :to="`/campaign/${c.id}/encounters`"
              class="sb-icon-link"
              :class="{ active: route.path === `/campaign/${c.id}/encounters` || (route.path.startsWith('/encounter') && activeCampaignId === c.id) }"
              data-tip="Encounters"
            >
              <OhVueIcon name="gi-crossed-swords" scale="0.75" style="color: #e05555" />
            </NuxtLink>
            <NuxtLink
              :to="`/campaign/${c.id}/graphs`"
              class="sb-icon-link"
              :class="{ active: route.path.startsWith(`/campaign/${c.id}/graph`) }"
              data-tip="Graphs"
            >
              <OhVueIcon name="gi-all-seeing-eye" scale="0.75" style="color: #7cc44e" />
            </NuxtLink>
            <NuxtLink
              :to="`/campaign/${c.id}/gm-screen`"
              class="sb-icon-link"
              :class="{ active: route.path === `/campaign/${c.id}/gm-screen` }"
              data-tip="GM Screen"
            >
              <OhVueIcon name="gi-crystal-ball" scale="0.75" style="color: #b87de8" />
            </NuxtLink>
          </div>
        </div>

        <div class="sb-divider" />

        <!-- Compendium -->
        <NuxtLink to="/compendium/items" class="sb-icon-link sb-compendium-icon" :class="{ active: route.path.startsWith('/compendium') }" data-tip="Compendium">
          <OhVueIcon name="gi-bookshelf" scale="0.85" style="color: #e8c44a" />
        </NuxtLink>

        <div class="sb-divider" />

        <!-- Systems -->
        <div v-for="sys in systems" :key="sys.id!">
          <div
            class="sb-system"
            :class="{ active: activeSystemId === sys.id }"
            :data-tip="sys.name"
            @click="expandedSystems.has(sys.id!) ? toggleExpandSystem(sys) : navigateToSystem(sys)"
          >
            <div class="sb-system-icon">{{ (sys.shortId || sys.name).slice(0, 2).toUpperCase() }}</div>
          </div>
          <!-- System entity type icons when expanded -->
          <div v-if="expandedSystems.has(sys.id!) && sys.entityTypes?.length" class="sb-icon-rail">
            <NuxtLink
              v-for="et in sys.entityTypes"
              :key="et.id"
              :to="`/system/${sys.id}/${et.id}`"
              class="sb-icon-link"
              :class="{ active: route.path.includes(`/system/${sys.id}/${et.id}`) }"
              :data-tip="et.name"
            >
              <OhVueIcon :name="et.icon" scale="0.75" :style="{ color: et.color }" />
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Collapsed bottom: sounds + settings -->
      <div class="sb-footer-collapsed">
        <NuxtLink to="/sounds" class="sb-bottom-row" :class="{ active: route.path.startsWith('/sounds') }" data-tip="Sounds">
          <span class="sb-bottom-icon"><OhVueIcon name="gi-sound-waves" scale="0.85" /></span>
        </NuxtLink>
        <NuxtLink to="/settings" class="sb-bottom-row" :class="{ active: route.path === '/settings' }" data-tip="Settings">
          <span class="sb-bottom-icon"><OhVueIcon name="md-settings" scale="0.85" /></span>
        </NuxtLink>
      </div>
    </template>

    <!-- ── Expanded view ── -->
    <template v-else>
      <div class="sb-scroll">

        <!-- CAMPAIGNS section -->
        <div class="sb-section-row">
          <span class="sb-section-label">Campaigns</span>
          <button class="sb-section-add" title="New campaign" @click="showNewCampaign = true">+</button>
        </div>

        <div v-for="c in campaigns" :key="c.id!" class="sb-campaign">
          <!-- Campaign header: click navigates, arrow toggles expand -->
          <div
            class="sb-campaign-header"
            :class="{ active: activeCampaignId === c.id }"
            :style="campaignHeaderStyle(c)"
            @click="navigateToCampaign(c)"
          >
            <!-- Arrow only toggles expand/collapse, does not navigate -->
            <span
              class="sb-campaign-arrow"
              :class="{ open: expandedCampaigns.has(c.id!) }"
              @click.stop="toggleExpand(c)"
            >›</span>
            <span class="sb-campaign-dot" :style="{ background: campaignColor(c.id!) }" />
            <span class="sb-campaign-name" :class="{ 'sb-campaign-name--banner': hasBanner(c) }">{{ c.name }}</span>
          </div>

          <!-- Entity type children -->
          <Transition name="sb-children" :css="false"
            @before-enter="onBeforeEnter" @enter="onEnter" @after-enter="onAfterEnter"
            @before-leave="onBeforeLeave" @leave="onLeave" @after-leave="onAfterLeave"
          >
            <div v-if="expandedCampaigns.has(c.id!)" class="sb-children">
              <NuxtLink
                v-for="et in ENTITY_TYPES"
                :key="et.key"
                :to="`/campaign/${c.id}/${et.segment}`"
                class="sb-child"
                :class="{ active: isChildActive(c.id!, et.segment) }"
                :style="{ '--child-color': et.color }"
              >
                <OhVueIcon :name="et.icon" scale="0.7" :style="{ color: et.color, flexShrink: 0, width: '14px' }" />
                <span class="sb-child-label">{{ et.label }}</span>
                <span class="sb-child-count">{{ entityCounts[c.id!]?.[et.key] ?? '' }}</span>
              </NuxtLink>

              <div class="sb-child-sep" />

              <NuxtLink
                :to="`/campaign/${c.id}/encounters`"
                class="sb-child-tool"
                :class="{ active: route.path === `/campaign/${c.id}/encounters` || (route.path.startsWith('/encounter') && activeCampaignId === c.id) }"
              >
                <OhVueIcon name="gi-crossed-swords" scale="0.65" style="color:#e05555;width:14px;flex-shrink:0" />
                <span>Encounters</span>
              </NuxtLink>
              <NuxtLink
                :to="`/campaign/${c.id}/graphs`"
                class="sb-child-tool"
                :class="{ active: route.path.startsWith(`/campaign/${c.id}/graph`) }"
              >
                <OhVueIcon name="gi-all-seeing-eye" scale="0.65" style="color:#7cc44e;width:14px;flex-shrink:0" />
                <span>Graphs</span>
              </NuxtLink>
              <NuxtLink
                :to="`/campaign/${c.id}/gm-screen`"
                class="sb-child-tool"
                :class="{ active: route.path === `/campaign/${c.id}/gm-screen` }"
              >
                <OhVueIcon name="gi-crystal-ball" scale="0.65" style="color:#b87de8;width:14px;flex-shrink:0" />
                <span>GM Screen</span>
              </NuxtLink>
            </div>
          </Transition>
        </div>

        <div v-if="!campaigns.length" class="sb-empty">
          <span>No campaigns yet</span>
        </div>

        <div class="sb-divider" />

        <!-- COMPENDIUM section -->
        <div class="sb-section-row">
          <span class="sb-section-label">Compendium</span>
        </div>
        <div class="sb-children sb-compendium">
          <NuxtLink
            v-for="k in COMPENDIUM_KINDS"
            :key="k.kind"
            :to="`/compendium/${k.segment}`"
            class="sb-child"
            :class="{ active: route.path === `/compendium/${k.segment}` }"
            :style="{ '--child-color': k.color }"
          >
            <OhVueIcon :name="k.icon" scale="0.7" :style="{ color: k.color, flexShrink: 0, width: '14px' }" />
            <span class="sb-child-label">{{ k.plural }}</span>
            <span class="sb-child-count">{{ compendiumCounts[k.kind] || '' }}</span>
          </NuxtLink>
          <div class="sb-child-sep" />
          <NuxtLink to="/compendium/sync" class="sb-child-tool" :class="{ active: route.path === '/compendium/sync' }">
            <OhVueIcon name="md-autorenew" scale="0.65" style="color:#e8c44a;width:14px;flex-shrink:0" />
            <span>Foundry sync</span>
          </NuxtLink>
        </div>

        <div class="sb-divider" />

        <!-- SYSTEMS section -->
        <div class="sb-section-row">
          <span class="sb-section-label">Systems</span>
          <button class="sb-section-add" title="New system" @click="showNewSystem = true">+</button>
        </div>

        <div v-for="sys in systems" :key="sys.id!" class="sb-campaign">
          <div
            class="sb-campaign-header"
            :class="{ active: activeSystemId === sys.id }"
            @click="navigateToSystem(sys)"
          >
            <span
              class="sb-campaign-arrow"
              :class="{ open: expandedSystems.has(sys.id!) }"
              @click.stop="toggleExpandSystem(sys)"
            >›</span>
            <div class="sb-system-icon sb-system-icon--sm">{{ (sys.shortId || sys.name).slice(0, 2).toUpperCase() }}</div>
            <span class="sb-campaign-name">{{ sys.name }}</span>
            <span class="sb-system-version">v{{ sys.version }}</span>
          </div>

          <Transition name="sb-children" :css="false"
            @before-enter="onBeforeEnter" @enter="onEnter" @after-enter="onAfterEnter"
            @before-leave="onBeforeLeave" @leave="onLeave" @after-leave="onAfterLeave"
          >
            <div v-if="expandedSystems.has(sys.id!)" class="sb-children">
              <NuxtLink
                v-for="et in (sys.entityTypes ?? [])"
                :key="et.id"
                :to="`/system/${sys.id}/${et.id}`"
                class="sb-child"
                :class="{ active: route.path.includes(`/system/${sys.id}/${et.id}`) }"
                :style="{ '--child-color': et.color }"
              >
                <OhVueIcon :name="et.icon" scale="0.7" :style="{ color: et.color, flexShrink: 0, width: '14px' }" />
                <span class="sb-child-label">{{ et.name }}</span>
                <span class="sb-child-count">{{ recordCounts[sys.id!]?.[et.id] ?? '' }}</span>
              </NuxtLink>
              <div v-if="!sys.entityTypes?.length" class="sb-empty" style="font-size:11px;padding:4px 12px">No entity types</div>
              <div class="sb-child-sep" />
              <NuxtLink :to="`/system/${sys.id}/library`" class="sb-child-tool" :class="{ active: route.path === `/system/${sys.id}/library` }">
                <OhVueIcon name="gi-bookshelf" scale="0.65" style="color:#6b9fe8;width:14px;flex-shrink:0" />
                <span>Library</span>
              </NuxtLink>
              <NuxtLink :to="`/system/${sys.id}/builder`" class="sb-child-tool" :class="{ active: route.path.includes(`/system/${sys.id}/builder`) }">
                <OhVueIcon name="gi-anvil" scale="0.65" style="color:#e8924a;width:14px;flex-shrink:0" />
                <span>Builder</span>
              </NuxtLink>
            </div>
          </Transition>
        </div>

        <div v-if="!systems.length" class="sb-empty">
          <span>No systems yet</span>
        </div>

      </div>

      <!-- Bottom nav (expanded) -->
      <div class="sb-footer">
        <div class="sb-divider" style="margin:0" />
        <NuxtLink to="/sounds" class="sb-bottom-row" :class="{ active: route.path.startsWith('/sounds') }">
          <span class="sb-bottom-icon"><OhVueIcon name="gi-sound-waves" scale="0.85" /></span>
          <span class="sb-bottom-label">Sounds</span>
        </NuxtLink>
        <NuxtLink to="/settings" class="sb-bottom-row" :class="{ active: route.path === '/settings' }">
          <span class="sb-bottom-icon"><OhVueIcon name="md-settings" scale="0.85" /></span>
          <span class="sb-bottom-label">Settings</span>
        </NuxtLink>
      </div>
    </template>

  </aside>
</template>

<script setup lang="ts">
import { lsKey } from '~/utils/appNamespace'
import { rulesCounts, useRulesRevision } from '~/composables/useRules'
import { RULES_KIND_CONFIG, RULES_KINDS, type RulesKind } from '~/types/rules'
import { dbApi, getDb } from '~/composables/useDb'
import { useSystems } from '~/composables/useSystems'
import { useEntities } from '~/composables/useEntities'
import { useAppDialogs } from '~/composables/useAppDialogs'
import type { DbCampaign } from '~/composables/useDb'
import { ENTITY_TYPE_LIST } from '~/types/entities'
import { useEncounterStore } from '~/stores/encounter'

const { showNewCampaign, showNewSystem } = useAppDialogs()

const route = useRoute()
const router = useRouter()
const systemsStore = useSystems()
const notesStore = useEntities()
const encounterStore = useEncounterStore()

// ── Collapse state ─────────────────────────────────────────────────────────
const collapsed = ref(false)
if (import.meta.client) {
  collapsed.value = localStorage.getItem(lsKey('sidebar.collapsed')) === '1'
}
watch(collapsed, v => {
  if (import.meta.client) localStorage.setItem(lsKey('sidebar.collapsed'), v ? '1' : '0')
})

// Keyboard shortcut B
if (import.meta.client) {
  const onKeydown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
    if (e.key === 'b' || e.key === 'B') collapsed.value = !collapsed.value
  }
  onMounted(() => document.addEventListener('keydown', onKeydown))
  onUnmounted(() => document.removeEventListener('keydown', onKeydown))
}

// ── Campaigns ─────────────────────────────────────────────────────────────
const campaigns = ref<DbCampaign[]>([])
async function loadCampaigns() {
  campaigns.value = await dbApi.campaigns.list()
}
onMounted(loadCampaigns)
defineExpose({ reload: loadCampaigns })

// ── Compendium ─────────────────────────────────────────────────────────────
const COMPENDIUM_KINDS = RULES_KINDS.map(kind => ({ kind, ...RULES_KIND_CONFIG[kind] }))
const compendiumCounts = ref<Partial<Record<RulesKind, number>>>({})
const rulesRevision = useRulesRevision()
async function loadCompendiumCounts() { compendiumCounts.value = await rulesCounts() }
onMounted(loadCompendiumCounts)
watch(rulesRevision, loadCompendiumCounts)

// ── Systems ────────────────────────────────────────────────────────────────
const systems = computed(() => systemsStore.systems)
onMounted(() => { if (!systems.value.length) systemsStore.loadAll() })

// ── Active context ─────────────────────────────────────────────────────────
const activeCampaignId = computed(() => {
  if (route.path.startsWith('/encounter')) {
    // Encounter store is loaded asynchronously by the encounter page;
    // once it resolves, this computed updates and the watcher auto-expands the campaign.
    return encounterStore.current?.campaignId ?? null
  }
  if (route.path.startsWith('/campaign/')) {
    const id = route.params.id
    return id ? Number(id) : null
  }
  return null
})

const activeSystemId = computed(() => {
  const id = route.params.id
  if (!route.path.startsWith('/system/')) return null
  return id ? Number(id) : null
})

// ── Expanded campaigns ─────────────────────────────────────────────────────
const expandedCampaigns = ref<Set<number>>(new Set())
const expandedSystems = ref<Set<number>>(new Set())

// Route-driven expand: navigating to a campaign collapses systems and vice versa
watch([activeCampaignId, activeSystemId], ([campId, sysId]) => {
  if (campId) {
    expandedCampaigns.value = new Set([campId])
    expandedSystems.value = new Set()
  } else if (sysId) {
    expandedSystems.value = new Set([sysId])
    expandedCampaigns.value = new Set()
  }
}, { immediate: true })

function toggleExpand(c: DbCampaign) {
  if (!c.id) return
  const next = new Set(expandedCampaigns.value)
  if (next.has(c.id)) next.delete(c.id)
  else { next.clear(); next.add(c.id) }
  expandedCampaigns.value = next
  expandedSystems.value = new Set()
}

function navigateToCampaign(c: DbCampaign) {
  if (c.id) {
    expandedCampaigns.value = new Set([c.id])
    expandedSystems.value = new Set()
  }
  router.push(`/campaign/${c.id}`)
}

// ── Systems expand ─────────────────────────────────────────────────────────

function toggleExpandSystem(sys: any) {
  if (!sys.id) return
  const next = new Set(expandedSystems.value)
  if (next.has(sys.id)) next.delete(sys.id)
  else { next.clear(); next.add(sys.id) }
  expandedSystems.value = next
  expandedCampaigns.value = new Set()
}

function navigateToSystem(sys: any) {
  if (sys.id) {
    expandedSystems.value = new Set([sys.id])
    expandedCampaigns.value = new Set()
  }
  router.push(`/system/${sys.id}/library`)
}

// ── Accordion animation hooks ──────────────────────────────────────────────
function onBeforeEnter(el: Element) {
  const e = el as HTMLElement
  e.style.height = '0'
  e.style.opacity = '0'
  e.style.overflow = 'hidden'
}
function onEnter(el: Element, done: () => void) {
  const e = el as HTMLElement
  requestAnimationFrame(() => {
    e.style.transition = 'height 0.22s ease, opacity 0.18s ease'
    e.style.height = e.scrollHeight + 'px'
    e.style.opacity = '1'
    e.addEventListener('transitionend', done, { once: true })
  })
}
function onAfterEnter(el: Element) {
  const e = el as HTMLElement
  e.style.height = ''
  e.style.overflow = ''
  e.style.opacity = ''
  e.style.transition = ''
}
function onBeforeLeave(el: Element) {
  const e = el as HTMLElement
  e.style.height = e.scrollHeight + 'px'
  e.style.overflow = 'hidden'
}
function onLeave(el: Element, done: () => void) {
  const e = el as HTMLElement
  requestAnimationFrame(() => {
    e.style.transition = 'height 0.2s ease, opacity 0.15s ease'
    e.style.height = '0'
    e.style.opacity = '0'
    e.addEventListener('transitionend', done, { once: true })
  })
}
function onAfterLeave(el: Element) {
  const e = el as HTMLElement
  e.style.height = ''
  e.style.overflow = ''
  e.style.opacity = ''
  e.style.transition = ''
}

// ── Campaign banner ────────────────────────────────────────────────────────
const BANNER_COLORS = [
  ['oklch(45% 0.22 295)', 'oklch(35% 0.18 260)'],
  ['oklch(45% 0.22 20)', 'oklch(35% 0.18 350)'],
  ['oklch(45% 0.18 158)', 'oklch(35% 0.14 190)'],
  ['oklch(45% 0.20 60)', 'oklch(35% 0.16 30)'],
  ['oklch(45% 0.20 200)', 'oklch(35% 0.16 230)'],
]
function hasBanner(c: DbCampaign): boolean {
  return !!((c as any).banner_source)
}
function campaignHeaderStyle(c: DbCampaign): Record<string, string> {
  const src = (c as any).banner_source as string | null
  if (src) {
    return {
      backgroundImage: `url(${src})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  if (c.id != null && activeCampaignId.value === c.id) {
    const [a, b] = BANNER_COLORS[c.id % BANNER_COLORS.length]
    return { background: `linear-gradient(135deg, ${a}, ${b})` }
  }
  return {}
}

// ── Entity types list ──────────────────────────────────────────────────────
const ENTITY_TYPES = ENTITY_TYPE_LIST

function isChildActive(campaignId: number, segment: string): boolean {
  return activeCampaignId.value === campaignId && route.path.includes(`/${segment}`)
}

// ── Entity counts (campaign) ───────────────────────────────────────────────
const entityCounts = computed(() => {
  const result: Record<number, Record<string, number>> = {}
  for (const e of notesStore.entities) {
    if (!result[e.campaignId]) result[e.campaignId] = {}
    result[e.campaignId][e.type] = (result[e.campaignId][e.type] ?? 0) + 1
  }
  return result
})

// ── Record counts (system) ─────────────────────────────────────────────────
const recordCounts = ref<Record<number, Record<string, number>>>({})

async function loadRecordCountsForSystems(systemIds: number[]) {
  if (!systemIds.length) return
  const allRecs = await Promise.all(systemIds.map(id => dbApi.records.list(id)))
  allRecs.forEach((recs, i) => {
    recordCounts.value[systemIds[i]] = recs.reduce<Record<string, number>>((acc, r) => {
      acc[r.entityTypeId] = (acc[r.entityTypeId] ?? 0) + 1
      return acc
    }, {})
  })
}

watch(expandedSystems, (newSet, oldSet) => {
  const newlyExpanded = [...newSet].filter(id => !oldSet?.has(id))
  loadRecordCountsForSystems(newlyExpanded)
}, { immediate: true })

// ── Campaign color ─────────────────────────────────────────────────────────
const CAMPAIGN_COLORS = [
  '#7c6fe8', '#e87c6f', '#6fe8c0', '#e8c46f', '#6fa8e8',
  '#e86fa8', '#a8e86f', '#e86f6f', '#6fe8a8', '#c46fe8',
]
function campaignColor(id: number): string {
  return CAMPAIGN_COLORS[id % CAMPAIGN_COLORS.length]
}
</script>

<style scoped>
.sb-logo-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
  flex-shrink: 0;
  opacity: 0.85;
}

.sb-empty {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text3);
  font-style: italic;
}

.sb-footer {
  flex-shrink: 0;
  padding: 4px 6px 8px;
}

/* Collapsed bottom section */
.sb-footer-collapsed {
  flex-shrink: 0;
  padding: 4px 6px 8px;
  border-top: 1px solid var(--border);
}

/* Campaign header with banner */
.sb-campaign-header {
  position: relative;
  overflow: hidden;
}
.sb-campaign-header::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, oklch(0% 0 0 / 0.45) 0%, oklch(0% 0 0 / 0.25) 100%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
}
.sb-campaign-header[style*="url("]::after {
  opacity: 1;
}
.sb-campaign-name--banner {
  color: rgba(255,255,255,0.95) !important;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
}
.sb-campaign-header[style*="background"]:not([style*="var("]) .sb-campaign-arrow,
.sb-campaign-header[style*="url("] .sb-campaign-arrow {
  color: rgba(255,255,255,0.8);
}
.sb-campaign-header[style*="url("] .sb-campaign-dot {
  box-shadow: 0 0 0 1px rgba(255,255,255,0.3);
}

/* Children accordion: animation driven by JS hooks (css: false on Transition) */

/* Logo below the collapse button in collapsed mode */
.sb-logo-below {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 0 8px;
  opacity: 0.7;
  flex-shrink: 0;
  text-decoration: none;
  transition: opacity 0.15s;
}
.sb-logo-below:hover { opacity: 1; }

/* Collapsed icon rail — entity type icons under a campaign/system dot */
.sb-icon-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 2px 0 4px;
}
.sb-icon-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 26px;
  border-radius: 5px;
  cursor: pointer;
  text-decoration: none;
  color: var(--text2);
  transition: background 0.12s;
}
.sb-icon-link:hover { background: var(--surface); color: var(--text); }
.sb-icon-link.active { background: var(--accent-bg); color: var(--accent); }
.sb-compendium-icon { margin: 2px auto; }

/* Smaller system icon variant inside campaign-style header */
.sb-system-icon--sm {
  width: 22px;
  height: 22px;
  font-size: 8px;
  border-radius: 4px;
  flex-shrink: 0;
}

/* Tooltip on hover (collapsed mode) */
.sidebar.collapsed [data-tip]:hover::after {
  opacity: 1;
}
</style>
