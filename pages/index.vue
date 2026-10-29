<template>
    <div class="home-page page-enter">
        <!-- Greeting -->
        <div class="home-header">
            <div class="home-greeting">
                <h1 class="home-greeting-title">
                    {{ greeting }}, Game Master.
                </h1>
                <p class="home-greeting-sub">
                    {{ campaigns.length }} campaign{{
                        campaigns.length !== 1 ? "s" : ""
                    }}
                    · {{ totalEntities }} entries ·
                    {{ compendiumTotal.toLocaleString() }} compendium entries
                </p>
            </div>
        </div>

        <div class="home-content">
            <!-- ── Campaigns ── -->
            <div class="home-section">
                <div class="home-section-head">
                    <span class="home-section-label">Campaigns</span>
                    <button
                        class="home-new-btn"
                        @click="showNewCampaign = true"
                    >
                        + New
                    </button>
                </div>

                <div v-if="campaigns.length" class="home-camp-grid">
                    <div
                        v-for="c in campaigns"
                        :key="c.id"
                        class="home-camp-card"
                        @click="openCampaign(c)"
                    >
                        <!-- Gradient banner -->
                        <div
                            class="home-camp-banner"
                            :style="{ background: campBanner(c) }"
                        >
                            <div class="home-camp-banner-text">
                                <div class="home-camp-banner-name">
                                    {{ c.name }}
                                </div>
                                <div class="home-camp-banner-sys">
                                    {{ GAME_CONFIG[campaignGame(c)].label }}
                                </div>
                            </div>
                            <div class="home-camp-card-actions" @click.stop>
                                <button
                                    class="home-camp-act"
                                    title="Edit"
                                    @click.stop="startEditCampaign(c)"
                                >
                                    <OhVueIcon name="md-editnote" scale="0.7" />
                                </button>
                                <button
                                    class="home-camp-act"
                                    title="Clone"
                                    :disabled="cloningId === c.id"
                                    @click.stop="cloneCampaign(c)"
                                >
                                    <OhVueIcon name="md-contentcopy" scale="0.7" />
                                </button>
                                <button
                                    class="home-camp-act home-camp-act--del"
                                    title="Delete"
                                    @click.stop="deleteCampaign(c.id!)"
                                >
                                    <OhVueIcon name="md-delete" scale="0.7" />
                                </button>
                            </div>
                        </div>

                        <!-- Body -->
                        <div class="home-camp-body">
                            <div v-if="c.description" class="home-camp-desc">
                                {{ c.description }}
                            </div>

                            <!-- Entity type pills -->
                            <div class="home-camp-pills">
                                <span
                                    v-for="et in entityTypesFor(c.id)"
                                    :key="et.type"
                                    class="home-camp-pill"
                                    :style="{
                                        color: et.color,
                                        borderColor: et.color + '40',
                                        background: et.color + '10',
                                    }"
                                    @click.stop="openCampaign(c, et.type)"
                                    >{{ et.count }} {{ et.plural }}</span
                                >
                            </div>

                            <!-- Footer meta -->
                            <div class="home-camp-meta">
                                <span
                                    class="home-camp-meta-dot"
                                    :style="{ background: campHue(c) }"
                                />
                                <span class="home-camp-meta-label"
                                    >{{ campEntityCount(c.id) }} entries</span
                                >
                                <span class="home-camp-meta-date">{{
                                    formatDate(c.updated_at)
                                }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- New card -->
                    <button
                        class="home-camp-card home-camp-card--new"
                        @click="showNewCampaign = true"
                    >
                        <span class="home-camp-new-icon">+</span>
                        <span class="home-camp-new-label">New Campaign</span>
                    </button>
                </div>

                <!-- Empty state -->
                <div v-else class="home-empty">
                    <div class="home-empty-icon">
                        <OhVueIcon name="gi-broadsword" scale="3" />
                    </div>
                    <h2 class="home-empty-title">No campaigns yet</h2>
                    <p class="home-empty-sub">
                        Create your first campaign to begin your chronicle.
                    </p>
                    <button
                        class="home-empty-btn"
                        @click="showNewCampaign = true"
                    >
                        Begin a Campaign
                    </button>
                </div>
            </div>

            <!-- ── Two-column: Recent Activity + Active Quests ── -->
            <div v-if="campaigns.length" class="home-two-col">
                <!-- Recent Activity -->
                <div>
                    <div class="home-section-label" style="margin-bottom: 10px">
                        Recent Activity
                    </div>
                    <div class="home-card">
                        <div class="home-card-head">
                            <span class="home-card-title"
                                >Recently Updated</span
                            >
                        </div>
                        <div
                            v-if="!recentActivity.length"
                            class="home-card-empty"
                        >
                            No entries yet
                        </div>
                        <div
                            v-for="a in recentActivity"
                            :key="a.id"
                            class="home-act-row"
                            @click="
                                openCampaign(
                                    campaigns.find(
                                        (c) => c.id === a.campaignId,
                                    ),
                                )
                            "
                        >
                            <div
                                class="home-act-dot"
                                :style="{ background: a.color }"
                            />
                            <div class="home-act-body">
                                <div class="home-act-name">{{ a.name }}</div>
                                <div class="home-act-sub">
                                    {{ a.sub }} · {{ a.campName }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Active Quests -->
                <div>
                    <div class="home-section-label" style="margin-bottom: 10px">
                        Active Quests
                    </div>
                    <div class="home-card">
                        <div class="home-card-head">
                            <span class="home-card-title">Open Threads</span>
                        </div>
                        <div
                            v-if="!activeQuests.length"
                            class="home-card-empty"
                        >
                            No active quests
                        </div>
                        <div
                            v-for="q in activeQuests"
                            :key="q.id"
                            class="home-quest-row"
                            @click="
                                openCampaign(
                                    campaigns.find(
                                        (c) => c.id === q.campaignId,
                                    ),
                                    'quests',
                                )
                            "
                        >
                            <div class="home-quest-dot" />
                            <div class="home-quest-name">{{ q.name }}</div>
                            <div class="home-quest-camp">{{ q.campName }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Compendium ── -->
            <div class="home-section" style="margin-top: 8px">
                <div class="home-section-head">
                    <span class="home-section-label">Compendium</span>
                </div>
                <div class="home-sys-list">
                    <NuxtLink
                        v-for="k in compendiumKinds"
                        :key="k.kind"
                        :to="`/compendium/${k.segment}`"
                        class="home-sys-row"
                    >
                        <div class="home-sys-icon" :style="{ color: k.color }">
                            <OhVueIcon :name="k.icon" scale="0.85" />
                        </div>
                        <div class="home-sys-body">
                            <div class="home-sys-name">{{ k.plural }}</div>
                            <div class="home-sys-meta">{{ k.count.toLocaleString() }} entries</div>
                        </div>
                        <OhVueIcon name="md-chevronright" scale="0.85" class="home-sys-arrow" />
                    </NuxtLink>
                    <NuxtLink to="/compendium/sync" class="home-sys-row home-sys-row--add">
                        <div class="home-sys-icon home-sys-icon--add">↻</div>
                        <span style="color: var(--text2)">{{ compendiumTotal ? 'Update from Foundry' : 'Sync the PF2e/SF2e compendium from Foundry' }}</span>
                    </NuxtLink>
                </div>
            </div>
        </div>

        <!-- ── Edit Campaign Dialog ── -->
        <Teleport to="body">
            <div
                v-if="editingCamp"
                class="pv-dialog-mask"
                @click.self="editingCamp = null"
            >
                <div class="pv-dialog">
                    <div class="pv-dialog-header">
                        <span class="pv-dialog-title">Edit Campaign</span>
                        <button
                            class="pv-dialog-close"
                            @click="editingCamp = null"
                        >
                            <OhVueIcon name="md-close" scale="0.85" />
                        </button>
                    </div>
                    <div class="pv-dialog-content">
                        <div class="dlg-field">
                            <label class="f-label">Title</label>
                            <input
                                class="f-input-box"
                                v-model="editCampForm.name"
                                @keyup.enter="saveEditCampaign"
                                autofocus
                            />
                        </div>
                        <div class="dlg-field">
                            <label class="f-label">Description</label>
                            <textarea
                                class="f-input-box f-textarea"
                                v-model="editCampForm.description"
                                rows="3"
                            />
                        </div>
                        <div class="dlg-field">
                            <label class="f-label">Game</label>
                            <select
                                class="f-input-box f-select"
                                v-model="editCampForm.game"
                            >
                                <option v-for="g in GAME_IDS" :key="g" :value="g">
                                    {{ GAME_CONFIG[g].label }}
                                </option>
                            </select>
                        </div>
                        <div class="dlg-field">
                            <label class="f-label">Advancement</label>
                            <select
                                class="f-input-box f-select"
                                v-model="editCampForm.advancement"
                            >
                                <option value="xp">Experience points</option>
                                <option value="milestone">Milestones</option>
                            </select>
                        </div>
                    </div>
                    <div class="pv-dialog-footer">
                        <button class="ghost-btn" @click="editingCamp = null">
                            Cancel
                        </button>
                        <button class="seal-btn" @click="saveEditCampaign">
                            Save
                        </button>
                    </div>
                </div>
            </div>

        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { rulesCounts } from "~/composables/useRules";
import { RULES_KIND_CONFIG, RULES_KINDS } from "~/types/rules";
import { GAME_CONFIG, GAME_IDS, campaignGame, campaignRules, type AdvancementMode, type GameId } from "~/types/game";
import { dbApi } from "~/composables/useDb";
import { useFormatters } from "~/composables/useFormatters";
import { useAppDialogs } from "~/composables/useAppDialogs";
import { ENTITY_TYPE_CONFIG } from "~/types/entities";
import type { EntityType } from "~/types/entities";

const { showNewCampaign } = useAppDialogs();
const { formatDate } = useFormatters();
const router = useRouter();

// Compendium summary: the main kinds that have entries
const counts = ref<Partial<Record<string, number>>>({});
const compendiumTotal = computed(() => Object.values(counts.value).reduce<number>((n, c) => n + (c ?? 0), 0));
const compendiumKinds = computed(() =>
    RULES_KINDS
        .map((kind) => ({ kind, ...RULES_KIND_CONFIG[kind], count: counts.value[kind] ?? 0 }))
        .filter((k) => k.count > 0),
);

const campaigns = ref<any[]>([]);
const entityMap = ref<Record<number, any[]>>({});

onMounted(async () => {
    rulesCounts().then((c) => { counts.value = c; });
    campaigns.value = await dbApi.campaigns.list();
    // Load entities for each campaign
    const results = await Promise.all(
        campaigns.value.map((c) =>
            dbApi.entities
                .list(c.id)
                .then((ents: any[]) => ({ id: c.id, ents })),
        ),
    );
    const map: Record<number, any[]> = {};
    results.forEach((r) => {
        map[r.id] = r.ents;
    });
    entityMap.value = map;
});

// ── Greeting ──────────────────────────────────────────────────────────────────
const greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
});

const totalEntities = computed(() =>
    Object.values(entityMap.value).reduce((sum, ents) => sum + ents.length, 0),
);

// ── Campaign helpers ──────────────────────────────────────────────────────────
const ENTITY_TYPES = Object.entries(ENTITY_TYPE_CONFIG).map(([type, cfg]) => ({
    type: type as EntityType,
    plural: cfg.plural,
    color: cfg.color,
}));

function nameHue(name: string): number {
    let h = 0;
    for (let i = 0; i < name.length; i++)
        h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
}

function campHue(c: any): string {
    const hue = nameHue(c.name);
    return `hsl(${hue}, 55%, 50%)`;
}

function campBanner(c: any): string {
    const hue = nameHue(c.name);
    return `linear-gradient(135deg, hsl(${hue},52%,22%) 0%, hsl(${(hue + 50) % 360},58%,14%) 100%)`;
}

function campEntityCount(id: number): number {
    return entityMap.value[id]?.length ?? 0;
}

function entityTypesFor(id: number) {
    const ents = entityMap.value[id] ?? [];
    const counts: Record<string, number> = {};
    ents.forEach((e) => {
        counts[e.type] = (counts[e.type] ?? 0) + 1;
    });
    return ENTITY_TYPES.filter((et) => counts[et.type]).map((et) => ({
        ...et,
        count: counts[et.type],
    }));
}

// ── Recent Activity ───────────────────────────────────────────────────────────
const ENTITY_COLORS: Partial<Record<EntityType, string>> = {
    session: "#6b9fe8",
    npc: "#5db870",
    location: "#7eaacc",
    faction: "#e86fa8",
    quest: "#e8924a",
    event: "#ebbd34",
    note: "var(--text3)",
};

const recentActivity = computed(() =>
    campaigns.value
        .flatMap((c) =>
            (entityMap.value[c.id] ?? []).map((e) => ({
                id: e.id,
                name: e.name,
                sub: ENTITY_TYPE_CONFIG[e.type as EntityType]?.label ?? e.type,
                campName: c.name,
                color: ENTITY_COLORS[e.type as EntityType] ?? "var(--text3)",
                campaignId: c.id,
                updatedAt: e.updated_at as string,
            }))
        )
        .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
        .slice(0, 8)
)

// ── Active Quests ─────────────────────────────────────────────────────────────
const activeQuests = computed(() =>
    campaigns.value
        .flatMap((c) =>
            (entityMap.value[c.id] ?? [])
                .filter((e) => {
                    if (e.type !== "quest") return false
                    const attr = e.attributes ?? "{}"
                    if (!attr.includes('"active"')) return false
                    try {
                        return JSON.parse(attr).status === "active"
                    } catch {
                        return false
                    }
                })
                .map((e) => ({ id: e.id, name: e.name, campName: c.name, campaignId: c.id }))
        )
        .slice(0, 8)
)

// ── Navigation ────────────────────────────────────────────────────────────────
const TYPE_PLURAL_ROUTE: Record<string, string> = {
    npc: "npcs",
    location: "locations",
    faction: "factions",
    quest: "quests",
    event: "events",
    session: "sessions",
    note: "notes",
};

function openCampaign(c: any, type?: string) {
    if (!c) return;
    const route = type
        ? `/campaign/${c.id}/${TYPE_PLURAL_ROUTE[type] ?? type}`
        : `/campaign/${c.id}`;
    router.push(route);
}

async function deleteCampaign(id: number) {
    if (!confirm("Delete this campaign and all its data?")) return;
    await dbApi.campaigns.delete(id);
    campaigns.value = campaigns.value.filter((c) => c.id !== id);
    delete entityMap.value[id];
}

// ── Clone campaign ────────────────────────────────────────────────────────────
const cloningId = ref<number | null>(null);

async function cloneCampaign(c: any) {
    if (cloningId.value) return;
    cloningId.value = c.id;
    try {
        const clone = await dbApi.campaigns.clone(c.id);
        if (!clone) return;
        campaigns.value = [clone, ...campaigns.value];
        entityMap.value[clone.id!] = await dbApi.entities.list(clone.id!);
    } finally {
        cloningId.value = null;
    }
}

// ── Edit campaign ─────────────────────────────────────────────────────────────
const editingCamp = ref<any>(null);
const editCampForm = ref({
    name: "",
    description: "",
    game: 'pf2e' as GameId,
    advancement: 'xp' as AdvancementMode,
});

function startEditCampaign(c: any) {
    editingCamp.value = c;
    editCampForm.value = {
        name: c.name,
        description: c.description ?? "",
        game: campaignGame(c),
        advancement: campaignRules(c).advancement,
    };
}

async function saveEditCampaign() {
    if (!editingCamp.value || !editCampForm.value.name.trim()) return;
    const updated = await dbApi.campaigns.update(editingCamp.value.id, {
        name: editCampForm.value.name,
        description: editCampForm.value.description,
        game: editCampForm.value.game,
        rules: { ...campaignRules(editingCamp.value), advancement: editCampForm.value.advancement },
    });
    const idx = campaigns.value.findIndex((c) => c.id === editingCamp.value.id);
    if (idx !== -1 && updated) campaigns.value[idx] = updated;
    editingCamp.value = null;
}

</script>

<style scoped>
.home-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
}

/* ── Header / Greeting ── */
.home-header {
    padding: 26px 32px 18px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.home-greeting-title {
    font-family: var(--fh);
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.02em;
}

.home-greeting-sub {
    font-size: 13px;
    color: var(--text3);
    margin-top: 3px;
}

/* ── Scrollable content ── */
.home-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px 60px;
    display: flex;
    flex-direction: column;
    gap: 28px;
}

/* ── Section ── */
.home-section {
    display: flex;
    flex-direction: column;
}

.home-section-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
}

.home-section-label {
    font-family: var(--fh);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text3);
}

.home-new-btn {
    padding: 3px 10px;
    border-radius: var(--r1);
    border: 1px solid var(--border);
    background: none;
    color: var(--text2);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s;
}
.home-new-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-bg);
}

/* ── Campaign grid ── */
.home-camp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
}

.home-camp-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r3);
    overflow: hidden;
    cursor: pointer;
    transition:
        border-color 0.15s,
        box-shadow 0.15s,
        transform 0.15s;
    display: flex;
    flex-direction: column;
}
.home-camp-card:hover {
    border-color: var(--border-hi);
    box-shadow: var(--sh-md);
    transform: translateY(-2px);
}

/* Gradient banner */
.home-camp-banner {
    position: relative;
    padding: 16px 14px 14px;
    display: flex;
    align-items: flex-end;
    min-height: 80px;
}
.home-camp-banner-text {
    position: relative;
    z-index: 1;
    flex: 1;
}
.home-camp-banner-name {
    font-size: 15px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
    line-height: 1.2;
    margin-bottom: 2px;
}
.home-camp-banner-sys {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.55);
    font-weight: 500;
}

.home-camp-card-actions {
    position: relative;
    z-index: 2;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s;
}
.home-camp-card:hover .home-camp-card-actions {
    opacity: 1;
}

.home-camp-act {
    width: 24px;
    height: 24px;
    border-radius: var(--r1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(0, 0, 0, 0.3);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s;
}
.home-camp-act:hover {
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
}
.home-camp-act--del:hover {
    background: rgba(180, 40, 40, 0.7);
    border-color: transparent;
}

/* Card body */
.home-camp-body {
    padding: 12px 14px 12px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 9px;
}

.home-camp-desc {
    font-size: 12px;
    color: var(--text3);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.home-camp-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.home-camp-pill {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid;
    cursor: pointer;
    transition: opacity 0.12s;
}
.home-camp-pill:hover {
    opacity: 0.75;
}

.home-camp-meta {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: auto;
}
.home-camp-meta-dot {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    flex-shrink: 0;
}
.home-camp-meta-label {
    font-size: 12px;
    color: var(--text3);
}
.home-camp-meta-date {
    font-family: var(--fm);
    font-size: 10px;
    color: var(--text3);
    margin-left: auto;
}

/* New campaign card */
.home-camp-card--new {
    border-style: dashed;
    background: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 120px;
    cursor: pointer;
    color: var(--text3);
    transition: all 0.15s;
}
.home-camp-card--new:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-bg);
}
.home-camp-new-icon {
    font-size: 26px;
    line-height: 1;
}
.home-camp-new-label {
    font-size: 12px;
    font-weight: 500;
}

/* ── Two-column ── */
.home-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: start;
}
@media (max-width: 800px) {
    .home-two-col {
        grid-template-columns: 1fr;
    }
}

/* ── Shared card ── */
.home-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r3);
    overflow: hidden;
}
.home-card-head {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--bg2);
}
.home-card-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text2);
}
.home-card-empty {
    padding: 20px 14px;
    font-size: 12px;
    color: var(--text3);
    font-style: italic;
    text-align: center;
}

/* ── Recent activity rows ── */
.home-act-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.1s;
}
.home-act-row:last-child {
    border-bottom: none;
}
.home-act-row:hover {
    background: var(--surface-hi);
}

.home-act-dot {
    width: 8px;
    height: 8px;
    border-radius: 3px;
    flex-shrink: 0;
}
.home-act-body {
    flex: 1;
    min-width: 0;
}
.home-act-name {
    font-size: 13px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.home-act-sub {
    font-size: 11px;
    color: var(--text3);
    margin-top: 1px;
}

/* ── Active quest rows ── */
.home-quest-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.1s;
}
.home-quest-row:last-child {
    border-bottom: none;
}
.home-quest-row:hover {
    background: var(--surface-hi);
}

.home-quest-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #e8924a;
    flex-shrink: 0;
}
.home-quest-name {
    font-size: 13px;
    color: var(--text);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.home-quest-camp {
    font-size: 11px;
    color: var(--text3);
    flex-shrink: 0;
}

/* ── Compendium list ── */
.home-sys-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.home-sys-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: var(--r2);
    background: var(--surface);
    border: 1px solid var(--border);
    cursor: pointer;
    text-decoration: none;
    color: var(--text);
    transition:
        border-color 0.12s,
        background 0.12s;
}
.home-sys-row:hover {
    border-color: var(--border-hi);
    background: var(--surface-hi);
}

.home-sys-icon {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--accent-bg);
    border: 1px solid oklch(58% 0.24 295 / 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--fh);
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    flex-shrink: 0;
}
.home-sys-icon--add {
    background: none;
    border-style: dashed;
    color: var(--text3);
    font-size: 18px;
}

.home-sys-body {
    flex: 1;
    min-width: 0;
}
.home-sys-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
}
.home-sys-meta {
    font-size: 11px;
    color: var(--text3);
    margin-top: 2px;
}
.home-sys-arrow {
    color: var(--text3);
    flex-shrink: 0;
}

.home-sys-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s;
}
.home-sys-row:hover .home-sys-actions {
    opacity: 1;
}

.home-sys-row--add {
    border-style: dashed;
    background: none;
    color: var(--text3);
    font-size: 13px;
}
.home-sys-row--add:hover {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-bg);
}
.home-sys-row--add:hover .home-sys-icon--add {
    color: var(--accent);
    border-color: var(--accent);
}

/* ── Action buttons (shared) ── */
.home-card-act {
    width: 24px;
    height: 24px;
    border-radius: var(--r1);
    border: 1px solid var(--border);
    background: var(--surface-hi);
    color: var(--text2);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s;
}
.home-card-act:hover {
    color: var(--text);
    border-color: var(--border-hi);
}
.home-card-act--del:hover {
    color: var(--danger);
    border-color: var(--danger);
    background: var(--danger-bg);
}

/* ── Empty state ── */
.home-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
    color: var(--text2);
}
.home-empty-icon {
    opacity: 0.12;
    margin-bottom: 20px;
    color: var(--text);
}
.home-empty-title {
    font-family: var(--fh);
    font-size: 18px;
    color: var(--text);
    margin-bottom: 8px;
}
.home-empty-sub {
    font-size: 13px;
    color: var(--text2);
    margin-bottom: 20px;
}
.home-empty-btn {
    padding: 10px 24px;
    border-radius: var(--r2);
    background: var(--accent);
    color: #fff;
    border: none;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
}
.home-empty-btn:hover {
    opacity: 0.85;
}
</style>
