<template>
  <div class="chronicle screen-in" :style="{ '--type-color': typeConfig?.color }">

    <!-- ── Rail: list folded while the overview is showing ── -->
    <nav v-if="railShown" class="erail">
      <button class="erail-btn erail-btn--boxed" title="Show list column" @click="browse.state.listCollapsed = false">
        <OhVueIcon name="md-chevronright" scale="0.9" />
      </button>
      <button class="erail-btn" title="Search (/)" @click="browse.state.focusSearchTick++">
        <OhVueIcon name="fa-search" scale="0.75" />
      </button>
      <div class="erail-sep" />
      <span class="erail-star" title="Favorites">★</span>
      <button
        v-for="f in browse.favorites.value.slice(0, 12)"
        :key="f.id"
        class="erail-fav"
        :title="f.name"
        @click="openEntry(f.entity)"
      >
        <EntityOverviewThumb :item="f" :media="browse.def.media" :size="32" />
      </button>
      <div class="erail-spacer" />
      <button v-if="browse.def.creatable" class="erail-btn erail-btn--new" :title="`New ${typeConfig?.label}`" @click="createEntry">
        <OhVueIcon name="md-add" scale="0.9" />
      </button>
    </nav>

    <!-- ── Left panel: entity list ── -->
    <div v-else class="elist">

      <div class="elist-head">
        <div class="elist-head-title" :style="{ color: typeConfig?.color }">
          {{ typeConfig?.plural }}
        </div>
        <div v-if="hasViewToggle" class="elist-vtabs">
          <button class="elist-vbtn" :class="{ active: type === 'location' ? !route.path.endsWith('/map') : !route.path.endsWith('/log') && !route.path.endsWith('/timeline') }" @click="setView('list')">{{ type === 'location' ? 'Entry' : 'List' }}</button>
          <button v-if="type === 'event'" class="elist-vbtn" :class="{ active: route.path.endsWith('/timeline') }" @click="setView('timeline')">Timeline</button>
          <button v-if="type === 'session'" class="elist-vbtn" :class="{ active: route.path.endsWith('/log') }" @click="setView('log')">Log</button>
          <button v-if="type === 'location'" class="elist-vbtn" :class="{ active: route.path.endsWith('/map') }" :disabled="!activeEntryId" @click="setView('map')">Map</button>
        </div>
        <button class="elist-icon-btn" :class="{ active: isOverview }" title="Gallery overview" @click="goToList()">
          <OhVueIcon name="md-viewmodule" scale="0.8" />
        </button>
        <button v-if="isOverview" class="elist-icon-btn" title="Collapse to rail" @click="browse.state.listCollapsed = true">
          <OhVueIcon name="md-chevronleft" scale="0.8" />
        </button>
        <button class="elist-export-btn" title="Export as JSON" @click="exportEntries">↓ JSON</button>
        <button v-if="browse.def.creatable" class="btn-accent-sm" @click="createEntry">+ New</button>
      </div>

      <div class="elist-search">
        <span class="elist-search-icon">⌕</span>
        <input
          v-model="browse.state.query"
          class="elist-search-input"
          :placeholder="`Search ${typeConfig?.plural?.toLowerCase() ?? ''}…`"
        />
      </div>

      <!-- Filter pills (shared with the overview) -->
      <EntityFilterPills v-if="browse.def.filters.length" :browse="browse" size="sm" class="elist-pills">
        <button v-if="browse.isFiltered.value" class="elist-chip-clear" @click="browse.clearAll()">Clear</button>
      </EntityFilterPills>
      <div class="elist-countline">
        {{ browse.isFiltered.value
          ? `${browse.items.value.length} of ${browse.allItems.value.length} shown`
          : `${browse.allItems.value.length} ${typeConfig?.plural}` }}
      </div>

      <div class="elist-body">
        <div v-if="!browse.items.value.length" class="elist-empty">
          <div :style="{ color: typeConfig?.color, fontSize: '28px', opacity: 0.15 }">
            {{ typeConfig?.plural?.charAt(0) }}
          </div>
          <span>{{ browse.isFiltered.value ? 'No results' : `No ${typeConfig?.plural?.toLowerCase()} yet` }}</span>
          <button v-if="browse.def.creatable" class="btn-accent-sm" style="margin-top: 8px" @click="createEntry">Create one</button>
          <span v-else style="font-size:11px;color:var(--ink-ghost);margin-top:6px">Draw regions on the World Map</span>
        </div>

        <div
          v-for="i in browse.items.value"
          :key="i.id"
          class="erow"
          :class="{ active: activeForList === i.id, dim: browse.state.archiveMode === 'dim' && i.archived }"
        >
          <component
            :is="ENTRY_COMPONENTS[type]"
            :entry="i.entity"
            :deletable="true"
            @open="route.path.endsWith('/map') && type === 'location' ? selectMapLocation(i.entity) : openEntry(i.entity)"
            @delete="deleteEntry"
          />
        </div>
      </div>
    </div>

    <!-- ── Right panel: special view or child route ── -->
    <div class="edetail">

      <!-- Child route (entry detail, map, log, timeline, etc.) -->
      <NuxtPage />
    </div>

  </div>
</template>

<script setup lang="ts">
import { exportFilename } from '~/utils/appNamespace'
import { useCampaignEntity } from '~/composables/useCampaignEntity'
import { useEntityBrowse } from '~/composables/useEntityBrowse'
import type { EntityType } from '~/types/entities'
import type { Entity } from '~/composables/useEntities'
import NpcEntry         from '~/components/notes/NpcEntry.vue'
import LocationEntry    from '~/components/notes/LocationEntry.vue'
import FactionEntry     from '~/components/notes/FactionEntry.vue'
import QuestEntry       from '~/components/notes/QuestEntry.vue'
import EventEntry       from '~/components/notes/EventEntry.vue'
import SessionEntry     from '~/components/notes/SessionEntry.vue'
import NoteEntry        from '~/components/notes/NoteEntry.vue'
import RandomTableEntry from '~/components/notes/RandomTableEntry.vue'
import RumorEntry       from '~/components/notes/RumorEntry.vue'
import RegionEntry      from '~/components/notes/RegionEntry.vue'

const ENTRY_COMPONENTS: Record<EntityType, any> = {
  npc: NpcEntry, location: LocationEntry, faction: FactionEntry,
  quest: QuestEntry, event: EventEntry, session: SessionEntry, note: NoteEntry,
  'random-table': RandomTableEntry, rumor: RumorEntry, region: RegionEntry,
}

const props = defineProps<{ type: EntityType }>()

const route = useRoute()
const router = useRouter()
const {
  typeConfig, entries, openEntry, createEntry, deleteEntry, ensureLoaded, goToList,
} = useCampaignEntity(props.type)

const campaignId = computed(() => Number(route.params.id))

// The list shows the same ordered, filtered set the overview is browsing
const browse = useEntityBrowse(props.type)

const activeEntryId = computed(() =>
  route.params.entryId ? Number(route.params.entryId) : null
)

// Overview = the type's index route (no entry, no log/timeline view)
const isOverview = computed(() => !activeEntryId.value && !/\/(log|timeline)$/.test(route.path))
const railShown = computed(() => isOverview.value && browse.state.listCollapsed)

// ── View mode ─────────────────────────────────────────────────────────────────
const hasViewToggle = props.type === 'event' || props.type === 'session' || props.type === 'location'

function setView(m: string) {
  if (props.type === 'session') {
    if (m === 'log') router.push(`/campaign/${campaignId.value}/sessions/log`)
    else if (route.path.endsWith('/log')) router.push(`/campaign/${campaignId.value}/sessions`)
    return
  }
  if (props.type === 'event') {
    if (m === 'timeline') router.push(`/campaign/${campaignId.value}/events/timeline`)
    else if (route.path.endsWith('/timeline')) router.push(`/campaign/${campaignId.value}/events`)
    return
  }
  if (props.type === 'location') {
    if (m === 'map' && activeEntryId.value) {
      router.push(`/campaign/${campaignId.value}/locations/${activeEntryId.value}/map`)
    } else if (m === 'list' && route.path.endsWith('/map')) {
      router.push(`/campaign/${campaignId.value}/locations/${activeEntryId.value}`)
    }
  }
}

const activeForList = computed(() => activeEntryId.value)

function selectMapLocation(e: Entity) {
  router.push(`/campaign/${campaignId.value}/locations/${e.id}/map`)
}

function exportEntries() {
  const data = {
    version: 1,
    type: props.type,
    campaignId: campaignId.value,
    exportedAt: new Date().toISOString(),
    entries: entries.value,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFilename(`${props.type}s-${campaignId.value}-${new Date().toISOString().slice(0, 10)}.json`)
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(() => ensureLoaded())
</script>

<style scoped>
/* ── Rail (list folded while the overview shows) ─────────────────────────── */
.erail {
  width: 52px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow-y: auto;
}
.erail-btn {
  width: 34px; height: 34px; flex: none;
  display: grid; place-items: center;
  border: 0; border-radius: 8px;
  background: transparent; color: var(--text2); cursor: pointer;
}
.erail-btn:hover { background: var(--surface-hi); color: var(--text); }
.erail-btn--boxed { border: 1px solid var(--border-hi); background: var(--bg2); }
.erail-btn--new { background: var(--accent-bg); color: var(--accent-l); }
.erail-btn--new:hover { background: var(--accent-bhi); color: var(--accent-l); }
.erail-sep { width: 22px; height: 1px; background: var(--border-hi); margin: 4px 0; flex: none; }
.erail-star { color: var(--fav); font-size: 12px; line-height: 1; }
.erail-fav { border: 0; padding: 0; background: transparent; cursor: pointer; border-radius: 50%; flex: none; }
.erail-fav:hover :deep(.eot) { box-shadow: 0 0 0 2px var(--accent); }
.erail-spacer { flex: 1; }

/* ── List head icon buttons ──────────────────────────────────────────────── */
.elist-icon-btn {
  width: 24px; height: 24px; flex: none;
  display: grid; place-items: center;
  border: 0; border-radius: var(--r1);
  background: transparent; color: var(--text3); cursor: pointer;
}
.elist-icon-btn:hover { color: var(--text); background: var(--surface-hi); }
.elist-icon-btn.active { background: var(--accent-bg); color: var(--accent-l); }

/* ── Filter pills (shared with the overview) ─────────────────────────────── */
.elist-pills { padding: 7px 12px 2px; }
.elist-countline { padding: 4px 14px 6px; font-size: 10.5px; color: var(--text3); border-bottom: 1px solid var(--border); }
.erow.dim { opacity: .5; }
.erow.dim:hover, .erow.dim.active { opacity: 1; }

/* ── Export button ───────────────────────────────────────────────────────── */
.elist-export-btn {
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text3);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r1);
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
  white-space: nowrap;
}
.elist-export-btn:hover { color: var(--text2); border-color: var(--border-hi); }

/* ── View toggle in list head ────────────────────────────────────────────── */
.elist-vtabs {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--r1);
  overflow: hidden;
  background: var(--bg);
}
.elist-vbtn {
  padding: 2px 9px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text3);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.12s;
}
.elist-vbtn + .elist-vbtn { border-left: 1px solid var(--border); }
.elist-vbtn:hover { color: var(--text2); background: var(--surface-hi); }
.elist-vbtn.active { background: var(--accent-bg); color: var(--accent-l); }

/* ── Entry-card row wrapper ──────────────────────────────────────────────── */
/* Override the global .erow flex layout — the entry component owns its layout */
.erow {
  display: block;
  padding: 0;
  gap: 0;
  border-radius: var(--r2);
  margin-bottom: 2px;
}

/* Active accent bleeds into the entry card */
.erow.active :deep(.entry) {
  background: var(--accent-bg);
}

/* Suppress the entry component's own hover padding-shift inside the erow border */
.erow :deep(.entry:hover) {
  padding-left: 10px;
}
.erow :deep(.entry:hover::before) {
  display: none;
}

</style>
