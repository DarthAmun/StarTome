<template>
  <div class="wel-body">

    <!-- Encounter selected: show link -->
    <template v-if="encounterId && selectedName">
      <NuxtLink :to="`/encounter/${encounterId}`" class="wel-link">
        <span class="wel-icon">⚔</span>
        <div class="wel-text">
          <div class="wel-title">{{ selectedName }}</div>
          <div class="wel-sub">Open encounter map</div>
        </div>
        <span class="wel-arrow">›</span>
      </NuxtLink>
      <button class="wel-change" @click="$emit('update:encounterId', null)" title="Pick a different encounter">↺ Change</button>
    </template>

    <!-- No encounter selected: show picker -->
    <template v-else>
      <div class="wel-pick-label">Pick an encounter</div>
      <div v-if="loading" class="wel-loading">
        <OhVueIcon name="md-autorenew" scale="1" class="wel-spin" />
      </div>
      <div v-else-if="encounters.length" class="wel-list">
        <button v-for="e in encounters" :key="e.id!" class="wel-list-item" @click="$emit('update:encounterId', e.id ?? null)">
          <span class="wel-list-icon">⚔</span>
          <span class="wel-list-name">{{ e.name }}</span>
          <span class="wel-list-status" :class="`status-${e.status ?? 'prepared'}`">{{ e.status ?? 'prepared' }}</span>
        </button>
      </div>
      <div v-else class="wel-empty">No encounters yet for this campaign.</div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { getDb } from '~/composables/useDb'
import type { DbEncounter } from '~/composables/useDb'

const props = defineProps<{ campaignId: number; encounterId?: number | null }>()
defineEmits<{ 'update:encounterId': [id: number | null] }>()

const loading = ref(false)
const encounters = ref<DbEncounter[]>([])

const selectedName = computed(() =>
  encounters.value.find(e => e.id === props.encounterId)?.name ?? null
)

onMounted(async () => {
  loading.value = true
  try {
    const db = getDb()
    encounters.value = await db.encounters.where('campaign_id').equals(props.campaignId).reverse().sortBy('created_at')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.wel-body { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; flex: 1; overflow-y: auto; }

.wel-link {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 10px;
  background: var(--accent-bg); border: 1px solid color-mix(in oklch, var(--accent) 22%, transparent);
  text-decoration: none; transition: all 0.14s;
}
.wel-link:hover { background: var(--accent-bhi); border-color: color-mix(in oklch, var(--accent) 40%, transparent); }
.wel-icon { font-size: 18px; flex-shrink: 0; color: var(--accent-l); }
.wel-text { flex: 1; min-width: 0; }
.wel-title { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wel-sub { font-size: 11px; color: var(--text3); }
.wel-arrow { font-size: 18px; color: var(--text3); flex-shrink: 0; transition: transform 0.12s; }
.wel-link:hover .wel-arrow { transform: translateX(3px); }

.wel-change {
  align-self: center; font-size: 10.5px; color: var(--text3);
  background: none; cursor: pointer; transition: color 0.12s;
}
.wel-change:hover { color: var(--accent-l); }

.wel-pick-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.09em; color: var(--text3); }

.wel-loading { display: flex; justify-content: center; padding: 16px; color: var(--text3); }
.wel-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.wel-list { display: flex; flex-direction: column; gap: 3px; }
.wel-list-item {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 10px; border-radius: 7px; cursor: pointer; text-align: left;
  background: var(--surface); border: 1px solid var(--border);
  transition: all 0.12s;
}
.wel-list-item:hover { background: var(--accent-bg); border-color: color-mix(in oklch, var(--accent) 25%, transparent); }
.wel-list-icon { font-size: 13px; flex-shrink: 0; }
.wel-list-name { flex: 1; font-size: 12.5px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wel-list-status { font-size: 9px; font-family: var(--fm); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; flex-shrink: 0; }
.status-active   { color: var(--success); }
.status-prepared { color: var(--text3); }

.wel-empty { font-size: 12px; color: var(--text3); font-style: italic; text-align: center; padding: 16px 0; }
</style>
