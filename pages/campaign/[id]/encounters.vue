<template>
  <div class="chronicle screen-in">

    <!-- Left panel: encounter list -->
    <div class="elist">
      <div class="elist-head">
        <div class="elist-head-title" style="color: #4ab8e8">Encounters</div>
        <NuxtLink class="btn-accent-sm elist-build" :to="`/campaign/${campaignId}/encounter-builder`" title="Build an encounter for the party">Build</NuxtLink>
        <button class="btn-accent-sm" @click="createEncounter">+ New</button>
      </div>

      <div class="elist-search">
        <span class="elist-search-icon">⌕</span>
        <input v-model="search" class="elist-search-input" placeholder="Search encounters…" />
      </div>

      <!-- Quick-filter pills by status -->
      <div v-if="qfStatuses.length" class="elist-qf">
        <span class="elist-qf-label">Status</span>
        <button
          v-for="val in qfStatuses"
          :key="val"
          class="elist-qf-pill"
          :class="{ active: activeQF === val }"
          @click="activeQF = activeQF === val ? null : val"
        >{{ val }}</button>
      </div>

      <div class="elist-body">
        <div v-if="!filtered.length" class="elist-empty">
          <div style="font-size:28px;opacity:0.15">⚔</div>
          <span>{{ search ? 'No results' : 'No encounters yet' }}</span>
          <button class="btn-accent-sm" style="margin-top:8px" @click="createEncounter">Create one</button>
        </div>

        <div
          v-for="enc in filtered"
          :key="enc.id"
          class="erow"
          :class="{ active: activeId === enc.id }"
          @click="selectEncounter(enc)"
        >
          <div class="erow-dot" :style="{ background: enc.status === 'active' ? '#4ab8e8' : activeId === enc.id ? '#4ab8e8' : 'var(--border-hi)' }" />
          <div class="erow-name">{{ enc.name }}</div>
          <span v-if="enc.status" class="erow-pill" :style="statusStyle(enc.status)">{{ enc.status }}</span>
          <span class="erow-date">{{ formatDate(enc.updatedAt) }}</span>
          <div class="enc-actions" @click.stop>
            <button class="enc-act" title="Clone" @click.stop="cloneEncounter(enc.id)">⎘</button>
            <button class="enc-act enc-act--del" title="Delete" @click.stop="deleteEncounter(enc.id)">✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right panel: encounter detail -->
    <div class="edetail">

      <!-- Selected encounter -->
      <div v-if="selectedEncounter" class="enc-detail">
        <div class="enc-detail-topbar">
          <div class="enc-detail-name">{{ selectedEncounter.name }}</div>
          <span v-if="selectedEncounter.status" class="erow-pill" :style="statusStyle(selectedEncounter.status)">
            {{ selectedEncounter.status }}
          </span>
          <span class="enc-detail-date">Updated {{ formatDate(selectedEncounter.updatedAt) }}</span>
        </div>

        <div class="enc-detail-body">
          <!-- Map preview -->
          <div class="enc-map-preview" :class="{ 'has-map': selectedEncounter.mapSource }">
            <img v-if="selectedEncounter.mapSource" :src="selectedEncounter.mapSource" class="enc-map-img" alt="" />
            <div v-else class="enc-map-placeholder">
              <span style="font-size:32px;opacity:0.15">🗺</span>
              <span style="font-size:12px;color:var(--text3)">No map set</span>
            </div>
          </div>

          <!-- Stats row -->
          <div class="enc-detail-stats">
            <div class="enc-stat">
              <div class="enc-stat-val">{{ selectedEncounter.tokenCount ?? 0 }}</div>
              <div class="enc-stat-label">Tokens</div>
            </div>
            <div class="enc-stat">
              <div class="enc-stat-val">{{ selectedEncounter.roundNumber ?? 0 }}</div>
              <div class="enc-stat-label">Round</div>
            </div>
            <div class="enc-stat">
              <div class="enc-stat-val" :style="{ color: selectedEncounter.fovEnabled ? 'var(--accent)' : 'var(--text3)' }">
                {{ selectedEncounter.fovEnabled ? 'On' : 'Off' }}
              </div>
              <div class="enc-stat-label">FOV</div>
            </div>
          </div>

          <!-- Open button -->
          <NuxtLink :to="`/encounter/${selectedEncounter.id}`" class="enc-open-btn">
            <span class="enc-open-btn-icon">⚔</span>
            Open Battlefield Editor
          </NuxtLink>

          <!-- Resolution -->
          <div v-if="selectedEncounter.status === 'resolved'" class="enc-resolved">
            <OhVueIcon name="gi-laurels" scale="0.9" />
            <span>
              Resolved {{ formatDate(selectedEncounter.resolvedAt) }} · {{ selectedEncounter.xpTotal ?? 0 }} XP at party level {{ selectedEncounter.partyLevelAtResolve ?? '?' }}
              · {{ selectedEncounter.xpAwarded ?? 0 }} XP each
            </span>
          </div>

          <!-- Actions -->
          <div class="enc-detail-actions">
            <button v-if="selectedEncounter.status === 'resolved'" class="btn btn-ghost btn-sm" title="Loot comes back from the stash, the XP award is taken back" @click="reopen(selectedEncounter.id)">↺ Re-open</button>
            <button v-else class="btn btn-ghost btn-sm" title="Move the loot to the party stash and award XP" @click="resolvingId = selectedEncounter.id">✓ Resolve</button>
            <button class="btn btn-ghost btn-sm" @click="cloneEncounter(selectedEncounter.id)">⎘ Clone</button>
            <button class="btn btn-danger btn-sm" @click="deleteEncounter(selectedEncounter.id)">Delete</button>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="edetail-empty">
        <span class="edetail-empty-icon">⚔</span>
        <span>Select an encounter or create a new one</span>
        <button class="btn-accent-sm" style="margin-top:10px" @click="createEncounter">+ New Encounter</button>
      </div>

      <ResolveEncounterDialog v-if="resolvingId" :encounter-id="resolvingId" @close="resolvingId = null" @resolved="onResolved" />

    </div>

  </div>
</template>

<script setup lang="ts">
import { resolveImage } from '~/rules/images'
import { dbApi, getDb } from '~/composables/useDb'
import { useFormatters } from '~/composables/useFormatters'
import { useResolution } from '~/composables/useResolution'

const { formatDateShort: formatDate } = useFormatters()
const route = useRoute()
const router = useRouter()
const campaignId = Number(route.params.id)

const encounters = ref<any[]>([])
const search = ref('')
const activeId = ref<number | null>(null)

const activeQF = ref<string | null>(null)

const qfStatuses = computed(() => {
  const seen = new Set<string>()
  for (const e of encounters.value) {
    if (e.status) seen.add(e.status)
  }
  return Array.from(seen).sort()
})

const filtered = computed(() => {
  let result = encounters.value
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(e => e.name.toLowerCase().includes(q))
  }
  if (activeQF.value) result = result.filter(e => e.status === activeQF.value)
  return result
})

const selectedEncounter = computed(() =>
  encounters.value.find(e => e.id === activeId.value) ?? null
)

onMounted(async () => {
  if (!campaignId || isNaN(campaignId)) { router.replace('/'); return }
  await loadEncounters()
})

async function loadEncounters() {
  const rows = await dbApi.encounters.list(campaignId)
  const db = getDb()
  const withTokens = await Promise.all(rows.map(async (r: any) => {
    const tokenCount = await db.encounterTokens.where('encounter_id').equals(r.id).count()
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      updatedAt: r.updated_at,
      mapSource: await resolveImage(r.map_source),
      roundNumber: r.round_number ?? 0,
      fovEnabled: !!r.fov_enabled,
      tokenCount,
      resolvedAt: r.resolved_at ?? null,
      xpTotal: r.xp_total ?? null,
      xpAwarded: r.xp_awarded ?? null,
      partyLevelAtResolve: r.party_level_at_resolve ?? null,
    }
  }))
  encounters.value = withTokens
}

function selectEncounter(enc: any) {
  activeId.value = enc.id
}

async function createEncounter() {
  const enc = await dbApi.encounters.create({ campaignId, name: 'New Encounter' })
  if (!enc?.id) return
  await loadEncounters()
  activeId.value = enc.id
}

async function cloneEncounter(id: number) {
  const source = await dbApi.encounters.get(id)
  if (!source) return
  const copy = await dbApi.encounters.create({ campaignId, name: `${source.name} (Copy)` })
  if (!copy?.id) return
  const copyId = copy.id
  await dbApi.encounters.update({
    id: copy.id,
    map_source: source.map_source,
    map_type: source.map_type,
    grid_size: source.grid_size,
    grid_offset_x: source.grid_offset_x,
    grid_offset_y: source.grid_offset_y,
    party_level: source.party_level ?? null,
  })
  const walls = await dbApi.walls.list(id)
  await Promise.all([
    ...((source as any).tokens ?? []).map((token: any) => dbApi.encounterTokens.add({
      encounterId: copy.id,
      tokenId: token.token_id,
      gridX: token.grid_x,
      gridY: token.grid_y,
      size: token.size,
      isVisible: token.is_visible ?? 1,
      linkedRulesId: token.linked_rules_id,
      adjustment: token.rules_adjustment,
      linkedEntityId: token.linked_entity_id,
      hpCurrent: token.hp_max,
      hpMax: token.hp_max,
      ac: token.ac,
      imageSource: token.image_source,
      imageType: token.image_type,
      isPlayerToken: token.is_player_token,
      visionRange: token.vision_range,
      isAlly: token.is_ally,
    })),
    ...walls.map(wall => dbApi.walls.add({
      encounter_id: copyId,
      points: wall.points,
      coverType: wall.coverType,
      isOpen: wall.isOpen,
    })),
  ])
  await loadEncounters()
}

async function deleteEncounter(id: number) {
  if (!confirm('Delete this encounter?')) return
  await dbApi.encounters.delete(id)
  if (activeId.value === id) activeId.value = null
  await loadEncounters()
}

const STATUS_COLORS: Record<string, string> = {
  active: '#4ab8e8',
  prepared: 'var(--text3)',
  finished: '#b87de8',
  resolved: '#7cc44e',
}

// ── Resolution ──
const resolvingId = ref<number | null>(null)

async function onResolved() {
  resolvingId.value = null
  await loadEncounters()
}

async function reopen(id: number) {
  if (!confirm('Re-open this encounter? Its loot comes back from the party stash (as far as it is still there) and the XP award is taken back. Level-ups stay; undo them on the Party page.')) return
  const short = await useResolution().reopenEncounter(id)
  await loadEncounters()
  if (short.names.length || short.cp) alert(`Not everything was still in the stash: ${short.names.join(', ')}${short.cp ? ' and some coins' : ''} stay there or are gone.`)
}
function statusStyle(status: string) {
  const c = STATUS_COLORS[status] ?? 'var(--text3)'
  return { color: c, borderColor: c + '44', background: c + '11' }
}
</script>

<style scoped>
.elist-build { text-decoration: none; }
.enc-resolved { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #7cc44e; }
.enc-actions {
  display: none;
  gap: 3px;
  flex-shrink: 0;
}
.erow:hover .enc-actions { display: flex; }

.enc-act {
  width: 20px;
  height: 20px;
  border-radius: var(--r1);
  background: none;
  border: 1px solid transparent;
  color: var(--text3);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
}
.enc-act:hover { background: var(--surface-hi); color: var(--text2); border-color: var(--border); }
.enc-act--del:hover { background: var(--danger-bg); color: var(--danger); border-color: var(--danger); }

/* Detail panel */
.enc-detail {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.enc-detail-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--surface);
}

.enc-detail-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.enc-detail-date {
  font-size: 11px;
  color: var(--text3);
  font-family: var(--fm);
  flex-shrink: 0;
}

.enc-detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: flex-start;
}

.enc-map-preview {
  width: 100%;
  border-radius: var(--r2);
  border: 1px solid var(--border);
  overflow: hidden;
  background: var(--bg2);
  max-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.enc-map-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 20px;
}
.enc-map-img {
  width: 100%;
  height: 240px;
  object-fit: cover;
  display: block;
}

.enc-detail-stats {
  display: flex;
  gap: 16px;
}
.enc-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 16px;
  border-radius: var(--r2);
  background: var(--surface);
  border: 1px solid var(--border);
  min-width: 64px;
}
.enc-stat-val {
  font-family: var(--fm);
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
}
.enc-stat-label { font-size: 11px; color: var(--text3); }

.enc-open-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 20px;
  border-radius: var(--r2);
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.12s, transform 0.1s;
  width: 100%;
  justify-content: center;
}
.enc-open-btn:hover { opacity: 0.88; transform: translateY(-1px); }
.enc-open-btn-icon { font-size: 16px; }

.enc-detail-actions {
  display: flex;
  gap: 8px;
}
</style>
