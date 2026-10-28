<template>
    <LocationEditor
        v-if="entryId"
        :entity-id="entryId"
        :campaign-id="campaignId"
        @navigate="onNavigate"
        @deleted="goToList"
    />
</template>

<script setup lang="ts">
import { rulesRefRoute } from '~/composables/useRules'
import { useEntities } from "~/composables/useEntities";

const route = useRoute();
const router = useRouter();
const store = useEntities();

const campaignId = computed(() => Number(route.params.id));
const entryId = computed(() => Number(route.params.entryId));

const TYPE_PLURAL_ROUTE: Record<string, string> = {
    npc: "npcs", location: "locations", faction: "factions",
    quest: "quests", event: "events", session: "sessions", note: "notes",
};

async function onNavigate(type: string, name: string) {
    const entry = store.findByTypeAndName(type, name);
    if (!entry) {
        const rulesRoute = await rulesRefRoute(type, name);
        if (rulesRoute) router.push(rulesRoute);
        return;
    }
    router.push(`/campaign/${campaignId.value}/${TYPE_PLURAL_ROUTE[type] ?? type + "s"}/${entry.id}`);
}

function goToList() {
    router.push(`/campaign/${campaignId.value}/locations`);
}
</script>
