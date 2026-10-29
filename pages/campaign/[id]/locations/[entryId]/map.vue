<template>
    <div class="loc-map-view">
        <div v-if="location" class="loc-map-header">
            <NuxtLink
                :to="`/campaign/${campaignId}/locations/${entryId}`"
                class="loc-map-back"
            >
                <OhVueIcon name="md-chevronleft" scale="0.85" />
                {{ location.name }}
            </NuxtLink>
            <span class="loc-map-title">Map</span>
        </div>

        <div v-if="hasMap" class="loc-map-body">
            <WorldMap
                :campaign-id="campaignId"
                :root-location-id="entryId"
                @navigate-entity="onNavigateEntity"
            />
        </div>
        <div v-else class="loc-map-empty">
            <OhVueIcon name="md-map" scale="3" style="opacity: 0.08; margin-bottom: 14px" />
            <p>No map image set for this location.</p>
            <NuxtLink
                :to="`/campaign/${campaignId}/locations/${entryId}`"
                class="loc-map-notes-link"
            >
                Go to Notes →
            </NuxtLink>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useEntities } from "~/composables/useEntities";
import { ENTITY_TYPE_ROUTE } from "~/types/entities";

const route = useRoute();
const router = useRouter();
const store = useEntities();

const campaignId = computed(() => Number(route.params.id));
const entryId = computed(() => Number(route.params.entryId));

const location = computed(() =>
    store.entities.find((e) => e.id === entryId.value),
);

const hasMap = computed(() => {
    const attrs = location.value?.attributes as any;
    return !!(attrs?.imageSource);
});

function onNavigateEntity(entity: any) {
    const segment = ENTITY_TYPE_ROUTE[entity.type as keyof typeof ENTITY_TYPE_ROUTE] ?? entity.type + "s";
    router.push(`/campaign/${campaignId.value}/${segment}/${entity.id}`);
}

onMounted(async () => {
    await store.loadAll(campaignId.value);
});
</script>

<style scoped>
.loc-map-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.loc-map-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg2);
}

.loc-map-back {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 13px;
    color: var(--text2);
    text-decoration: none;
    transition: color 0.12s;
}
.loc-map-back:hover {
    color: var(--accent-l);
}

.loc-map-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text3);
    margin-left: auto;
}

.loc-map-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.loc-map-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text3);
    font-size: 14px;
    gap: 8px;
    padding: 40px;
}

.loc-map-notes-link {
    color: var(--accent-l);
    text-decoration: none;
    font-size: 13px;
}
.loc-map-notes-link:hover {
    text-decoration: underline;
}
</style>
