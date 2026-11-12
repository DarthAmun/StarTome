<template>
    <div class="camp-overview screen-in">
        <!-- Body -->
        <div class="camp-body">
            <!-- Banner -->
            <div class="camp-banner" :style="bannerStyle">
                <div class="camp-banner-inner">
                    <div class="camp-banner-eyebrow">Campaign</div>
                    <h1 class="camp-banner-title">{{ name }}</h1>
                    <p v-if="desc" class="camp-banner-desc">{{ desc }}</p>
                </div>
                <!-- Banner edit controls -->
                <div class="camp-banner-actions">
                    <label class="camp-banner-btn" title="Upload banner image">
                        <input
                            type="file"
                            accept="image/*"
                            style="display: none"
                            @change="uploadBanner"
                        />
                        ↑ Banner
                    </label>
                    <button
                        v-if="bannerSource"
                        class="camp-banner-btn camp-banner-btn--clear"
                        title="Remove banner"
                        @click="clearBanner"
                    >
                        ✕
                    </button>
                </div>
            </div>

            <!-- Stats grid -->
            <div class="camp-section-label" style="margin-top: 24px">
                Chronicle
            </div>
            <div class="camp-stats">
                <NuxtLink
                    v-for="et in ENTITY_TYPES"
                    :key="et.key"
                    :to="`/campaign/${id}/${et.segment}`"
                    class="camp-stat-card"
                    :style="{ '--stat-color': et.color }"
                >
                    <div class="camp-stat-num">{{ counts[et.key] ?? 0 }}</div>
                    <div class="camp-stat-label">{{ et.label }}</div>
                </NuxtLink>
            </div>

            <!-- Active quests -->
            <template v-if="activeQuests.length">
              <div class="camp-section-label" style="margin-top: 24px">Active Quests</div>
              <div class="camp-quests">
                <NuxtLink
                  v-for="q in activeQuests"
                  :key="q.id"
                  :to="`/campaign/${id}/quests/${q.id}`"
                  class="camp-quest-row"
                >
                  <span class="camp-quest-icon">⚑</span>
                  <span class="camp-quest-name">{{ q.name }}</span>
                  <span v-if="(q.attributes as any)?.questGiver" class="camp-quest-sub">from {{ (q.attributes as any).questGiver }}</span>
                  <span class="camp-quest-arr">›</span>
                </NuxtLink>
              </div>
            </template>

            <!-- Quick access -->
            <div class="camp-section-label" style="margin-top: 24px">
                Quick Access
            </div>
            <div class="camp-chapters">
                <NuxtLink
                    :to="`/campaign/${id}/encounters`"
                    class="camp-chapter"
                >
                    <span class="camp-chapter-icon" style="color: #4ab8e8"
                        >⚔</span
                    >
                    <div class="camp-chapter-body">
                        <div class="camp-chapter-name">Encounters</div>
                        <div class="camp-chapter-sub">
                            Tactical maps, tokens &amp; fog of war
                        </div>
                    </div>
                    <span class="camp-chapter-arrow">›</span>
                </NuxtLink>

                <NuxtLink :to="`/campaign/${id}/graphs`" class="camp-chapter">
                    <span class="camp-chapter-icon" style="color: #7cc44e">⬡</span>
                    <div class="camp-chapter-body">
                        <div class="camp-chapter-name">Knowledge Graph</div>
                        <div class="camp-chapter-sub">
                            Entity connections and relationships
                        </div>
                    </div>
                    <span class="camp-chapter-arrow">›</span>
                </NuxtLink>
            </div>

        </div>
    </div>
</template>

<script setup lang="ts">
import { dbApi } from "~/composables/useDb";
import { fileToDataUrl } from "~/utils/image";
import { useEntities } from "~/composables/useEntities";
import { ENTITY_TYPE_LIST } from "~/types/entities";

const route = useRoute();
const id = Number(route.params.id);
const notesStore = useEntities();

const name = ref("");
const desc = ref("");
const bannerSource = ref<string | null>(null);

onMounted(async () => {
    const camps = await dbApi.campaigns.list();
    const c = camps.find((x: any) => x.id === id);
    name.value = c?.name ?? "";
    desc.value = c?.description ?? "";
    bannerSource.value = (c as any)?.banner_source ?? null;

    await notesStore.loadAll(id);
});

async function uploadBanner(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const src = await fileToDataUrl(file);
    bannerSource.value = src;
    await dbApi.campaigns.update(id, {
        banner_source: src,
        banner_type: "file",
    });
}

async function clearBanner() {
    bannerSource.value = null;
    await dbApi.campaigns.update(id, {
        banner_source: null,
        banner_type: undefined,
    });
}

const ENTITY_TYPES = ENTITY_TYPE_LIST;

const counts = computed(() => {
    const result: Record<string, number> = {};
    for (const e of notesStore.entities) {
        if (e.campaignId !== id) continue;
        result[e.type] = (result[e.type] ?? 0) + 1;
    }
    return result;
});

const activeQuests = computed(() =>
    notesStore.entities.filter(
        e => e.campaignId === id && e.type === 'quest' && (e.attributes as any)?.status === 'active'
    )
);

const BANNER_COLORS = [
    ["oklch(45% 0.22 295)", "oklch(35% 0.18 260)"],
    ["oklch(45% 0.22 20)", "oklch(35% 0.18 350)"],
    ["oklch(45% 0.18 158)", "oklch(35% 0.14 190)"],
    ["oklch(45% 0.20 60)", "oklch(35% 0.16 30)"],
    ["oklch(45% 0.20 200)", "oklch(35% 0.16 230)"],
];
const bannerStyle = computed(() => {
    if (bannerSource.value) {
        return {
            backgroundImage: `url(${bannerSource.value})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
        };
    }
    const [a, b] = BANNER_COLORS[id % BANNER_COLORS.length];
    return { background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` };
});
</script>

<style scoped>
.camp-overview {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
}

/* Banner */
.camp-banner {
    position: relative;
    min-height: 160px;
    flex-shrink: 0;
    overflow: hidden;
    border-radius: var(--r2);
}
.camp-banner-inner {
    position: relative;
    z-index: 1;
    padding: 32px 36px 28px;
}
.camp-banner-eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 6px;
}
.camp-banner-title {
    font-family: var(--fh);
    font-size: 28px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
    margin: 0 0 8px;
    letter-spacing: -0.01em;
}
.camp-banner-desc {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.65);
    margin: 0;
    max-width: 480px;
    line-height: 1.5;
}
.camp-banner-fade {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: linear-gradient(to bottom, transparent, var(--bg));
    z-index: 2;
}

.camp-banner-actions {
    position: absolute;
    top: 10px;
    right: 12px;
    display: flex;
    gap: 6px;
    z-index: 3;
    opacity: 0;
    transition: opacity 0.15s;
}
.camp-banner:hover .camp-banner-actions {
    opacity: 1;
}
.camp-banner-btn {
    padding: 4px 10px;
    border-radius: var(--r1);
    background: oklch(0% 0 0 / 0.4);
    border: 1px solid oklch(100% 0 0 / 0.2);
    color: rgba(255, 255, 255, 0.9);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: background 0.12s;
    white-space: nowrap;
}
.camp-banner-btn:hover {
    background: oklch(0% 0 0 / 0.55);
}
.camp-banner-btn--clear {
    color: rgba(255, 180, 160, 0.95);
}

/* Body */
.camp-body {
    padding: 20px 28px 32px;
}

.camp-section-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text3);
    margin-bottom: 10px;
}

/* Stats grid */
.camp-stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
}

.camp-stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px 10px;
    border-radius: var(--r2);
    background: var(--surface);
    border: 1px solid var(--border);
    text-decoration: none;
    cursor: pointer;
    transition:
        background 0.12s,
        border-color 0.12s,
        transform 0.1s;
}
.camp-stat-card:hover {
    background: oklch(from var(--stat-color) l c h / 0.08);
    border-color: oklch(from var(--stat-color) l c h / 0.4);
    transform: translateY(-1px);
}
.camp-stat-num {
    font-family: var(--fm);
    font-size: 24px;
    font-weight: 700;
    color: var(--stat-color);
    line-height: 1;
}
.camp-stat-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text3);
    text-align: center;
}

/* Chapters */
.camp-chapters {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.camp-chapter {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border-radius: var(--r2);
    background: var(--surface);
    border: 1px solid var(--border);
    text-decoration: none;
    cursor: pointer;
    transition:
        background 0.12s,
        border-color 0.12s;
}
.camp-chapter:hover {
    background: var(--surface-hi);
    border-color: var(--border-hi);
}
.camp-chapter-icon {
    font-size: 20px;
    flex-shrink: 0;
}
.camp-chapter-body {
    flex: 1;
    min-width: 0;
}
.camp-chapter-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
}
.camp-chapter-sub {
    font-size: 12px;
    color: var(--text3);
    margin-top: 2px;
}
.camp-chapter-arrow {
    font-size: 20px;
    color: var(--text3);
    flex-shrink: 0;
    transition: transform 0.12s;
}
.camp-chapter:hover .camp-chapter-arrow {
    transform: translateX(3px);
}


/* Active quests */
.camp-quests { display: flex; flex-direction: column; gap: 4px; }
.camp-quest-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: var(--r2);
  background: var(--surface); border: 1px solid var(--border);
  text-decoration: none; cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.camp-quest-row:hover { background: var(--surface-hi); border-color: rgba(232,146,74,0.4); }
.camp-quest-icon { font-size: 15px; color: #e8924a; flex-shrink: 0; }
.camp-quest-name { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.camp-quest-sub { font-size: 11px; color: var(--text3); flex-shrink: 0; }
.camp-quest-arr { font-size: 18px; color: var(--text3); flex-shrink: 0; }
</style>
