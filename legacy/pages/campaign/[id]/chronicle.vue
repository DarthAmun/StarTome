<template>
  <div class="chronicle-folio">
    <div class="open-book">

      <!-- LEFT PAGE -->
      <div class="book-stack book-stack--left">
        <div class="book-sheet-3"></div>
        <div class="book-sheet-2"></div>
        <div class="book-sheet-1"></div>
        <div class="book-leaf book-leaf--left">
          <div class="page-header">
            <div class="page-chapter-num">{{ campaignName }}</div>
            <h1 class="page-title">The Chronicle</h1>
            <div class="page-rule" />
          </div>
          <div class="leaf-inner">
            <div class="et-grid">
              <div v-for="et in entityTypes" :key="et.type"
                class="et-card"
                :style="{ '--et-color': et.color }"
                @click="navigate(et.type)">
                <OhVueIcon :name="et.defaultIcon" :scale="2.5"
                  :style="{ color: et.color, opacity: 0.85 }" />
                <span class="et-name">{{ et.plural }}</span>
                <span class="et-count">{{ counts[et.type] ?? 0 }} entries</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="book-binding"></div>

      <!-- RIGHT PAGE -->
      <div class="book-stack book-stack--right">
        <div class="book-sheet-3"></div>
        <div class="book-sheet-2"></div>
        <div class="book-sheet-1"></div>
        <div class="book-leaf book-leaf--right">
          <div class="leaf-inner chr-right">
            <div class="chr-campaign-name">{{ campaignName }}</div>
            <p v-if="campaignDesc" class="chr-desc">{{ campaignDesc }}</p>
            <div class="chr-rule" />
            <p class="chr-total">
              <span class="chr-total-num">{{ totalEntries }}</span>
              <span class="chr-total-label">entries across 7 chronicles</span>
            </p>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>


<script setup lang="ts">
import { useEntities } from '~/composables/useEntities'
import { ENTITY_TYPE_CONFIG } from '~/types/entities'
import type { EntityType } from '~/types/entities'
import { dbApi } from '~/composables/useDb'

const TYPE_PLURAL_ROUTE: Record<string, string> = {
  npc: 'npcs', location: 'locations',
  faction: 'factions', quest: 'quests', event: 'events',
  session: 'sessions', note: 'notes',
}

const route = useRoute()
const router = useRouter()
const store = useEntities()

const campaignId = Number(route.params.id)
const campaignName = ref('')
const campaignDesc = ref('')

const entityTypes = Object.entries(ENTITY_TYPE_CONFIG).map(([type, cfg]) => ({
  type: type as EntityType,
  ...cfg,
}))

const counts = computed(() =>
  Object.keys(ENTITY_TYPE_CONFIG).reduce((acc, type) => {
    acc[type] = store.byType[type as EntityType]?.length ?? 0
    return acc
  }, {} as Record<string, number>)
)

const totalEntries = computed(() =>
  Object.values(counts.value).reduce((sum, n) => sum + n, 0)
)

function navigate(type: EntityType) {
  const segment = TYPE_PLURAL_ROUTE[type] ?? type + 's'
  router.push(`/campaign/${campaignId}/${segment}`)
}

onMounted(async () => {
  const [camp] = await Promise.all([
    dbApi.campaigns.get(campaignId),
    store.loadAll(campaignId),
  ])
  campaignName.value = camp?.name ?? ''
  campaignDesc.value = camp?.description ?? ''
})
</script>


<style scoped>
.chronicle-folio {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: visible;
}

/* ── Entity type grid ── */
.et-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 4px 2px;
}

.et-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 16px;
  background: var(--parch-dark);
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}

.et-card:hover {
  border-color: color-mix(in srgb, var(--et-color, var(--ink-ghost)) 50%, transparent);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.et-name {
  font-family: 'Cinzel', var(--font-head);
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
  text-align: center;
  line-height: 1.2;
}

.et-count {
  font-size: 10px;
  font-family: var(--font-head);
  letter-spacing: 0.08em;
  color: var(--ink-ghost);
  text-align: center;
}

/* ── Right page ── */
.chr-right {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0;
}

.chr-campaign-name {
  font-family: 'Cinzel Decorative', var(--font-deco);
  font-size: 26px;
  font-weight: 700;
  color: var(--ink);
  opacity: 0.18;
  line-height: 1.2;
  margin-bottom: 20px;
  word-break: break-word;
}

.chr-desc {
  font-family: 'IM Fell English', var(--font-body);
  font-size: 15px;
  font-style: italic;
  color: var(--ink-faded);
  line-height: 1.7;
  max-width: 320px;
  margin-bottom: 28px;
}

.chr-rule {
  width: 60%;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--ink-ghost), transparent);
  opacity: 0.35;
  margin-bottom: 24px;
}

.chr-total {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--ink-ghost);
}

.chr-total-num {
  font-family: var(--font-deco);
  font-size: 42px;
  font-weight: 700;
  color: var(--blood);
  opacity: 0.45;
  line-height: 1;
}

.chr-total-label {
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-ghost);
}
</style>
