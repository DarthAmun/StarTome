<template>
    <!-- Non-session links -->
    <div
        v-if="
            entityType !== 'session' &&
            (outgoingLinks.length > 0 ||
                backlinks.length > 0 ||
                pinnedOn.length > 0 ||
                (entityType === 'event' && linkedSnapshots.length > 0))
        "
        class="links-panel"
    >
        <div v-if="pinnedOn.length > 0" class="links-section">
            <span class="links-label">Found in</span>
            <div class="links-list">
                <NuxtLink
                    v-for="p in pinnedOn"
                    :key="p.location.id"
                    :to="`/campaign/${campaignId}/map?locationId=${p.location.id}`"
                    class="link-chip"
                >
                    <template v-if="linkAvatar('location', p.location.name).imageUrl">
                        <img
                            :src="linkAvatar('location', p.location.name).imageUrl!"
                            class="link-avatar"
                        />
                    </template>
                    <OhVueIcon
                        v-else
                        name="gi-castle"
                        scale="0.75"
                        style="color: var(--accent); flex-shrink: 0"
                    />
                    <span>{{ p.location.name }}</span>
                    <span class="link-sub">map</span>
                </NuxtLink>
            </div>
        </div>

        <div v-if="outgoingLinks.length > 0" class="links-section">
            <span class="links-label">Links</span>
            <div class="links-list">
                <button
                    v-for="link in outgoingLinks"
                    :key="link.id"
                    class="link-chip"
                    :style="{
                        borderColor: (typeColorMap[link.targetType] ?? '#888') + '44',
                    }"
                    @click="$emit('navigate', link.targetType, link.targetName)"
                >
                    <template
                        v-if="linkAvatar(link.targetType, link.targetName).imageUrl"
                    >
                        <img
                            :src="linkAvatar(link.targetType, link.targetName).imageUrl!"
                            class="link-avatar"
                        />
                    </template>
                    <OhVueIcon
                        v-else
                        :name="linkAvatar(link.targetType, link.targetName).iconName"
                        scale="0.75"
                        :style="{
                            color: linkAvatar(link.targetType, link.targetName).color,
                            flexShrink: 0,
                        }"
                    />
                    <span>{{ link.targetName }}</span>
                    <span class="link-sub">{{ link.targetType }}</span>
                </button>
            </div>
        </div>

        <div v-if="backlinks.length > 0" class="links-section">
            <span class="links-label">Referenced by</span>
            <div class="links-list">
                <button
                    v-for="bl in backlinks"
                    :key="bl.sourceId"
                    class="link-chip"
                    @click="navigateToSource(bl.sourceId)"
                >
                    <OhVueIcon
                        :name="
                            linkAvatar(
                                entityById(bl.sourceId)?.type ?? '',
                                entityById(bl.sourceId)?.name ?? '',
                            ).iconName
                        "
                        scale="0.75"
                        :style="{
                            color: linkAvatar(
                                entityById(bl.sourceId)?.type ?? '',
                                entityById(bl.sourceId)?.name ?? '',
                            ).color,
                            flexShrink: 0,
                        }"
                    />
                    <span>{{ entityById(bl.sourceId)?.name }}</span>
                    <span class="link-sub">{{ entityById(bl.sourceId)?.type }}</span>
                </button>
            </div>
        </div>

        <!-- Event: linked historical states -->
        <div
            v-if="entityType === 'event' && linkedSnapshots.length > 0"
            class="links-section links-section--snapshots"
        >
            <div class="links-label links-label--icon">
                <OhVueIcon
                    name="gi-hourglass"
                    scale="0.75"
                    style="color: var(--gold)"
                />
                Historical States at this Event
            </div>
            <div
                v-for="snap in linkedSnapshots"
                :key="snap.id"
                class="snap-event-link"
                @click="navigateToSnapshot(snap)"
            >
                <OhVueIcon
                    :name="entityIconForSnapshot(snap)"
                    scale="0.8"
                    :style="{ color: entityColorForSnapshot(snap) }"
                />
                <div class="snap-event-link-body">
                    <span class="snap-event-link-name">{{ snap.name }}</span>
                    <span class="snap-event-link-label">{{ snap.label }}</span>
                </div>
                <OhVueIcon
                    name="md-chevronright"
                    scale="0.75"
                    style="color: var(--ink-ghost)"
                />
            </div>
        </div>
    </div>

    <!-- Session links -->
    <div
        v-else-if="
            entityType === 'session' && (scriptLinks.length > 0 || outgoingLinks.length > 0)
        "
        class="links-panel"
    >
        <div v-if="scriptLinks.length > 0" class="links-section">
            <span class="links-label">Script Links</span>
            <div class="links-list">
                <button
                    v-for="link in scriptLinks"
                    :key="`${link.type}:${link.name}`"
                    class="link-chip"
                    :style="{
                        borderColor: (typeColorMap[link.type] ?? '#888') + '44',
                    }"
                    @click="$emit('navigate', link.type, link.name)"
                >
                    <span>{{ link.name }}</span>
                    <span class="link-sub">{{ link.type }}</span>
                </button>
            </div>
        </div>
        <div v-if="outgoingLinks.length > 0" class="links-section">
            <span class="links-label">Notes Links</span>
            <div class="links-list">
                <button
                    v-for="link in outgoingLinks"
                    :key="link.id"
                    class="link-chip"
                    :style="{
                        borderColor: (typeColorMap[link.targetType] ?? '#888') + '44',
                    }"
                    @click="$emit('navigate', link.targetType, link.targetName)"
                >
                    <span>{{ link.targetName }}</span>
                    <span class="link-sub">{{ link.targetType }}</span>
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { resolveImage } from "~/rules/images";
import { useEntities } from "~/composables/useEntities";
import { isRulesKind, RULES_KIND_CONFIG } from "~/types/rules";
import { extractLinks } from "~/composables/useEntityParser";
import { getDb } from "~/composables/useDb";
import { ENTITY_TYPE_CONFIG, ENTITY_TYPE_ROUTE } from "~/types/entities";
import type { EntityType } from "~/types/entities";
import { ENCOUNTER_COLOR, typeColorMap as baseTypeColorMap } from "~/composables/useEntityRendering";

const props = defineProps<{
    entityId: number;
    campaignId: number;
    entityType: string;
}>();

const emit = defineEmits<{
    navigate: [type: string, name: string];
}>();

const store = useEntities();
const router = useRouter();

const entity = computed(
    () =>
        store.entities.find((e) => e.id === props.entityId) ??
        store.currentEntity,
);

// ── Campaign data (for linkAvatar) ────────────────────────────────────────────
const campaignEncounters = ref<{ id: number; name: string; mapSource?: string }[]>([]);

watch(
    () => props.campaignId,
    async (id) => {
        if (!id) return;
        campaignEncounters.value = await getDb()
            .encounters.where("campaign_id")
            .equals(id)
            .toArray()
            .then((rows) =>
                Promise.all(rows.map(async (r) => ({
                    id: r.id!,
                    name: r.name,
                    // Maps are stored as image refs; thumbnails use object URLs
                    mapSource: (await resolveImage(r.map_source)) ?? undefined,
                }))),
            );
    },
    { immediate: true },
);

// ── Type colors ───────────────────────────────────────────────────────────────
const typeColorMap: Record<string, string> = { ...baseTypeColorMap, snapshot: "var(--gold)" };

// ── linkAvatar ────────────────────────────────────────────────────────────────
function linkAvatar(type: string, name: string) {
    const typeKey = type.toLowerCase();
    if (typeKey === "encounter") {
        const enc = campaignEncounters.value.find(
            (e) => e.name.toLowerCase() === name.toLowerCase(),
        );
        return { imageUrl: enc?.mapSource ?? null, iconName: "gi-broadsword", color: ENCOUNTER_COLOR };
    }
    const ent = store.findByTypeAndName(typeKey, name);
    if (ent) {
        const attrs = ent.attributes as any;
        const imageUrl = attrs.portraitSource || attrs.logoSource || attrs.imageSource || null;
        const cfg = ENTITY_TYPE_CONFIG[ent.type as keyof typeof ENTITY_TYPE_CONFIG];
        return { imageUrl, iconName: cfg?.defaultIcon ?? "gi-scroll-unfurled", color: typeColorMap[ent.type] ?? "#888" };
    }
    if (isRulesKind(typeKey)) return { imageUrl: null, iconName: RULES_KIND_CONFIG[typeKey].icon, color: RULES_KIND_CONFIG[typeKey].color };
    const cfg = ENTITY_TYPE_CONFIG[typeKey as keyof typeof ENTITY_TYPE_CONFIG];
    return { imageUrl: null, iconName: cfg?.defaultIcon ?? "gi-scroll-unfurled", color: typeColorMap[typeKey] ?? "#888" };
}

// ── Link computeds ────────────────────────────────────────────────────────────
const outgoingLinks = computed(() => {
    const seen = new Set<string>();
    return store.linksFrom(props.entityId).filter((l) => {
        const key = `${l.targetType}:${l.targetName.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
});

const backlinks = computed(() => {
    if (!entity.value) return [];
    const seen = new Set<number>();
    return store
        .backlinksTo(entity.value.type, entity.value.name)
        .filter((l) => {
            if (seen.has(l.sourceId)) return false;
            seen.add(l.sourceId);
            return true;
        });
});

const pinnedOn = computed(() =>
    entity.value ? store.pinnedLocationsFor(entity.value.id) : [],
);

const scriptLinks = computed(() => {
    if (props.entityType !== "session") return [];
    const seen = new Set<string>();
    return extractLinks(
        (entity.value?.attributes as any)?.scriptContent ?? "",
    ).filter((l) => {
        const key = `${l.type}:${l.name.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
});

// ── Event: linked snapshots ───────────────────────────────────────────────────
const linkedSnapshots = ref<any[]>([]);

watch(
    () => [props.entityId, props.entityType] as const,
    async ([id, type]) => {
        if (!id || type !== "event") { linkedSnapshots.value = []; return; }
        linkedSnapshots.value = await getDb()
            .entitySnapshots.where("event_id")
            .equals(id)
            .toArray();
    },
    { immediate: true },
);

const entityMap = computed(() => new Map(store.entities.map(e => [e.id, e])))
function entityById(id: number) { return entityMap.value.get(id) ?? null }

function entityIconForSnapshot(snap: any): string {
    const ent = entityById(snap.entity_id)
    return ENTITY_TYPE_CONFIG[ent?.type as EntityType]?.defaultIcon ?? "gi-scroll-unfurled";
}

function entityColorForSnapshot(snap: any): string {
    const ent = entityById(snap.entity_id)
    return ENTITY_TYPE_CONFIG[ent?.type as EntityType]?.color ?? "var(--ink-ghost)";
}

function navigateToSnapshot(snap: any) {
    const ent = entityById(snap.entity_id)
    if (!ent) return;
    const segment = ENTITY_TYPE_ROUTE[ent.type as EntityType];
    if (!segment) return;
    router.push(`/campaign/${props.campaignId}/${segment}/${ent.id}?snapshot=${snap.id}`);
}

function navigateToSource(sourceId: number) {
    const e = entityById(sourceId);
    if (e) emit("navigate", e.type, e.name);
}
</script>

<style scoped>
.links-panel {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    padding: 8px 14px;
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    max-height: 108px;
    overflow-y: auto;
    background: var(--bg2);
}
.links-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 100px;
}
.links-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text3);
}
.links-label--icon {
    display: flex;
    align-items: center;
    gap: 5px;
}
.links-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
.link-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: var(--r4);
    background: var(--bg);
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all 0.12s;
    text-decoration: none;
    color: var(--text2);
    font-size: 12px;
}
.link-chip:hover {
    background: var(--surface-hi);
    border-color: var(--border-hi);
}
.link-avatar {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
}
.link-sub {
    font-size: 10px;
    color: var(--text3);
}
.links-section--snapshots {
    width: 100%;
}
.snap-event-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px dashed var(--parch-line);
    cursor: pointer;
    transition: all 0.15s;
}
.snap-event-link:last-child {
    border-bottom: none;
}
.snap-event-link:hover {
    padding-left: 8px;
}
.snap-event-link-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.snap-event-link-name {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--ink);
}
.snap-event-link-label {
    font-family: var(--font-head);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gold);
}
</style>
