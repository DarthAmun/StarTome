<template>
    <div class="attr-editor">
        <!-- NPC -->
        <template v-if="type === 'npc'">
            <div class="field">
                <label class="f-label">Portrait</label>
                <div class="input-row">
                    <InputText
                        :model-value="attrs.portraitSource || ''"
                        placeholder="URL or file path"
                        class="flex-1"
                        @update:model-value="
                            (v) => {
                                set('portraitSource', v);
                                set('portraitType', 'url');
                            }
                        "
                    />
                    <button
                        class="icon-btn-sq"
                        @click="browseImage('portraitSource', 'portraitType')"
                    >
                        <OhVueIcon name="fa-folder-open" scale="0.9" />
                    </button>
                </div>
            </div>
            <div class="field-row">
                <div class="field">
                    <label class="f-label">Title</label>
                    <InputText
                        :model-value="attrs.title || ''"
                        placeholder="High Priest, General…"
                        @update:model-value="(v) => set('title', v)"
                    />
                </div>
                <div class="field">
                    <label class="f-label">Level</label>
                    <InputText
                        :model-value="attrs.level || ''"
                        placeholder="5, 12…"
                        @update:model-value="(v) => set('level', v)"
                    />
                </div>
            </div>
            <div class="field-row">
                <div class="field">
                    <label class="f-label">Race / Ancestry</label>
                    <InputText
                        :model-value="attrs.race || ''"
                        placeholder="Human, Elf…"
                        @update:model-value="(v) => set('race', v)"
                    />
                </div>
                <div class="field">
                    <label class="f-label">Class / Role</label>
                    <InputText
                        :model-value="attrs.role || ''"
                        placeholder="Guard, Merchant…"
                        @update:model-value="(v) => set('role', v)"
                    />
                </div>
            </div>
            <div class="field">
                <label class="f-label">Current Status</label>
                <InputText
                    :model-value="attrs.status || ''"
                    placeholder="At court, Imprisoned…"
                    @update:model-value="(v) => set('status', v)"
                />
            </div>
            <div class="field">
                <label class="f-label">Vital Status</label>
                <div class="toggle-row">
                    <button
                        class="toggle-opt"
                        :class="{ on: attrs.isAlive !== false }"
                        @click="set('isAlive', true)"
                    >
                        <OhVueIcon name="gi-health-potion" scale="0.9" /> Alive
                    </button>
                    <button
                        class="toggle-opt"
                        :class="{ on: attrs.isAlive === false }"
                        @click="set('isAlive', false)"
                    >
                        <OhVueIcon name="gi-candle-skull" scale="0.9" /> Dead
                    </button>
                    <button
                        class="toggle-opt"
                        :class="{ on: attrs.isPlayerCharacter }"
                        @click="
                            set('isPlayerCharacter', !attrs.isPlayerCharacter)
                        "
                    >
                        <OhVueIcon name="gi-deadly-strike" scale="0.9" /> Player
                        Character
                    </button>
                </div>
            </div>
        </template>

        <!-- Location -->
        <template v-else-if="type === 'location'">
            <div class="field">
                <label class="f-label">Logo / Banner</label>
                <div class="input-row">
                    <InputText
                        :model-value="attrs.logoSource || ''"
                        placeholder="URL or file path"
                        class="flex-1"
                        @update:model-value="
                            (v) => {
                                set('logoSource', v);
                                set('logoType', 'url');
                            }
                        "
                    />
                    <button
                        class="icon-btn-sq"
                        @click="browseImage('logoSource', 'logoType')"
                    >
                        <OhVueIcon name="fa-folder-open" scale="0.9" />
                    </button>
                </div>
            </div>
            <div class="field">
                <label class="f-label">Map Image</label>
                <div class="input-row">
                    <InputText
                        :model-value="attrs.imageSource || ''"
                        placeholder="URL or file path"
                        class="flex-1"
                        @update:model-value="
                            (v) => {
                                set('imageSource', v);
                                set('imageType', 'url');
                            }
                        "
                    />
                    <button
                        class="icon-btn-sq"
                        @click="browseImage('imageSource', 'imageType')"
                    >
                        <OhVueIcon name="fa-folder-open" scale="0.9" />
                    </button>
                </div>
            </div>
            <div class="field-row">
                <div class="field">
                    <label class="f-label">Type</label>
                    <Select
                        :model-value="attrs.locationType || null"
                        :options="locationTypes"
                        option-label="label"
                        option-value="value"
                        placeholder="— select —"
                        @update:model-value="(v) => set('locationType', v)"
                    />
                </div>
                <div class="field">
                    <label class="f-label">Status</label>
                    <Select
                        :model-value="attrs.status || null"
                        :options="locationStatuses"
                        option-label="label"
                        option-value="value"
                        placeholder="— select —"
                        @update:model-value="(v) => set('status', v)"
                    />
                </div>
            </div>
        </template>

        <!-- Faction -->
        <template v-else-if="type === 'faction'">
            <div class="field">
                <label class="f-label">Symbol / Banner</label>
                <div class="input-row">
                    <InputText
                        :model-value="attrs.imageSource || ''"
                        placeholder="URL or file path"
                        class="flex-1"
                        @update:model-value="
                            (v) => {
                                set('imageSource', v);
                                set('imageType', 'url');
                            }
                        "
                    />
                    <button
                        class="icon-btn-sq"
                        @click="browseImage('imageSource', 'imageType')"
                    >
                        <OhVueIcon name="fa-folder-open" scale="0.9" />
                    </button>
                </div>
            </div>
            <div class="field-row">
                <div class="field">
                    <label class="f-label">Type</label>
                    <Select
                        :model-value="attrs.factionType || null"
                        :options="factionTypes"
                        option-label="label"
                        option-value="value"
                        placeholder="— select —"
                        @update:model-value="(v) => set('factionType', v)"
                    />
                </div>
                <div class="field">
                    <label class="f-label">Size</label>
                    <Select
                        :model-value="attrs.size || null"
                        :options="factionSizes"
                        option-label="label"
                        option-value="value"
                        placeholder="— select —"
                        @update:model-value="(v) => set('size', v)"
                    />
                </div>
            </div>
            <div class="field">
                <button
                    class="toggle-opt"
                    :class="{ on: attrs.isSecret }"
                    @click="set('isSecret', !attrs.isSecret)"
                >
                    <OhVueIcon name="gi-all-seeing-eye" scale="0.9" /> Secret
                    Organisation
                </button>
            </div>
        </template>

        <!-- Session -->
        <template v-else-if="type === 'session'">
            <div class="field">
                <label class="f-label">Status</label>
                <Select
                    :model-value="attrs.mode || null"
                    :options="sessionModes"
                    option-label="label"
                    option-value="value"
                    placeholder="— select —"
                    @update:model-value="(v) => set('mode', v)"
                />
            </div>
            <div class="field">
                <label class="f-label">Icon</label>
                <div class="icon-picker">
                    <button
                        v-for="ico in noteIcons"
                        :key="ico.name"
                        class="icon-opt"
                        :class="{ active: attrs.icon === ico.name }"
                        :title="ico.label"
                        @click="set('icon', ico.name)"
                    >
                        <OhVueIcon :name="ico.name" scale="1.2" />
                    </button>
                </div>
            </div>
        </template>

        <!-- Quest -->
        <template v-else-if="type === 'quest'">
            <div class="field">
                <label class="f-label">Status</label>
                <Select
                    :model-value="attrs.status || null"
                    :options="questStatuses"
                    option-label="label"
                    option-value="value"
                    placeholder="— select —"
                    @update:model-value="(v) => set('status', v)"
                />
            </div>
            <div class="field">
                <label class="f-label">Milestone</label>
                <div class="toggle-row">
                    <button
                        class="toggle-opt"
                        :class="{ on: attrs.milestone }"
                        title="In milestone campaigns, completing this quest offers to level up the party"
                        @click="set('milestone', !attrs.milestone)"
                    >
                        <OhVueIcon name="gi-upgrade" scale="0.9" /> Level-up milestone
                    </button>
                </div>
            </div>
            <div class="field-row">
                <div class="field">
                    <label class="f-label">Quest Giver</label>
                    <!-- Linked entity chip -->
                    <div v-if="attrs.questGiverId" class="giver-chip">
                        <span
                            class="giver-type-badge"
                            :style="{
                                color: giverTypeColor,
                                borderColor: giverTypeColor + '55',
                            }"
                        >
                            {{
                                attrs.questGiverType === "npc"
                                    ? "NPC"
                                    : "FACTION"
                            }}
                        </span>
                        <span class="giver-name">{{ attrs.questGiver }}</span>
                        <button class="giver-clear" @click="clearQuestGiver">
                            ×
                        </button>
                    </div>
                    <!-- Search + free-text picker -->
                    <div ref="giverAnchorRef" v-else class="giver-picker">
                        <input
                            v-model="giverSearch"
                            class="giver-input"
                            placeholder="Search NPC or Faction…"
                            @focus="openGiverPicker"
                            @blur="onGiverBlur"
                        />
                        <Teleport to="body">
                            <div
                                v-if="giverOpen && filteredGivers.length"
                                class="giver-dropdown"
                                :style="giverDropdownStyle"
                            >
                                <button
                                    v-for="ent in filteredGivers"
                                    :key="ent.id"
                                    class="giver-item"
                                    @mousedown.prevent="selectGiver(ent)"
                                >
                                    <span
                                        class="giver-type-badge"
                                        :style="{
                                            color:
                                                ent.type === 'npc'
                                                    ? '#7cc44e'
                                                    : '#e05555',
                                            borderColor:
                                                (ent.type === 'npc'
                                                    ? '#7cc44e'
                                                    : '#e05555') + '55',
                                        }"
                                    >
                                        {{
                                            ent.type === "npc"
                                                ? "NPC"
                                                : "FACTION"
                                        }}
                                    </span>
                                    {{ ent.name }}
                                </button>
                            </div>
                        </Teleport>
                    </div>
                </div>
                <div class="field">
                    <label class="f-label">Reward</label>
                    <InputText
                        :model-value="attrs.reward || ''"
                        placeholder="Gold, items, favor…"
                        @update:model-value="(v) => set('reward', v)"
                    />
                </div>
            </div>
        </template>

        <!-- Note -->
        <template v-else>
            <div class="field">
                <label class="f-label">Icon</label>
                <div class="icon-picker">
                    <button
                        v-for="ico in noteIcons"
                        :key="ico.name"
                        class="icon-opt"
                        :class="{ active: attrs.icon === ico.name }"
                        :title="ico.label"
                        @click="set('icon', ico.name)"
                    >
                        <OhVueIcon :name="ico.name" scale="1.2" />
                    </button>
                </div>
            </div>
            <div class="field">
                <label class="f-label">Tags</label>
                <div class="tag-area">
                    <span
                        v-for="(tag, i) in currentTags"
                        :key="tag"
                        class="tag-chip"
                    >
                        {{ tag }}
                        <button @click="removeTag(i)">×</button>
                    </span>
                    <input
                        v-model="newTag"
                        class="tag-input"
                        placeholder="Add tag…"
                        @keyup.enter="addTag"
                        @keyup="(e) => e.key === ',' && addTag()"
                    />
                </div>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import type { EntityType, EntityAttributes } from "~/types/entities";
import { NOTE_ICONS } from "~/types/entities";
import { useEntities } from "~/composables/useEntities";
import { dbApi } from "~/composables/useDb";

const props = defineProps<{ type: EntityType; modelValue: EntityAttributes }>();
const emit = defineEmits<{ "update:modelValue": [EntityAttributes] }>();

const noteIcons = NOTE_ICONS;
const newTag = ref("");
const attrs = computed(() => props.modelValue as any);

// ── Quest giver entity picker ─────────────────────────────────────────────────
const notesStore = useEntities();
const giverSearch = ref(
    (props.modelValue as any).questGiverId
        ? ""
        : (props.modelValue as any).questGiver || "",
);
const giverOpen = ref(false);

watch(
    () => (props.modelValue as any).questGiverId,
    (id) => {
        giverSearch.value = id
            ? ""
            : (props.modelValue as any).questGiver || "";
    },
);

const filteredGivers = computed(() => {
    const q = giverSearch.value.toLowerCase();
    return notesStore.entities
        .filter(
            (e) =>
                (e.type === "npc" || e.type === "faction") &&
                (!q || e.name.toLowerCase().includes(q)),
        )
        .slice(0, 15);
});

const giverTypeColor = computed(() =>
    (props.modelValue as any).questGiverType === "npc" ? "#7cc44e" : "#e05555",
);

function selectGiver(ent: any) {
    emit("update:modelValue", {
        ...props.modelValue,
        questGiver: ent.name,
        questGiverId: ent.id,
        questGiverType: ent.type,
    });
    giverSearch.value = "";
    giverOpen.value = false;
    giverDropdownStyle.value = {};
}

function clearQuestGiver() {
    emit("update:modelValue", {
        ...props.modelValue,
        questGiver: undefined,
        questGiverId: undefined,
        questGiverType: undefined,
    });
    giverSearch.value = "";
}

function onGiverBlur() {
    setTimeout(() => {
        giverOpen.value = false;
        giverDropdownStyle.value = {};
        const current = (props.modelValue as any).questGiver || "";
        if (giverSearch.value !== current) {
            emit("update:modelValue", {
                ...props.modelValue,
                questGiver: giverSearch.value || undefined,
                questGiverId: undefined,
                questGiverType: undefined,
            });
        }
    }, 150);
}
const currentTags = computed(() => (attrs.value.tags ?? []) as string[]);

const locationTypes = [
    { label: "City", value: "city" },
    { label: "Dungeon", value: "dungeon" },
    { label: "Wilderness", value: "wilderness" },
    { label: "Building", value: "building" },
    { label: "Region", value: "region" },
    { label: "Other", value: "other" },
];
const locationStatuses = [
    { label: "Discovered", value: "discovered" },
    { label: "Undiscovered", value: "undiscovered" },
    { label: "Destroyed", value: "destroyed" },
];
const factionTypes = [
    { label: "Criminal", value: "criminal" },
    { label: "Religious", value: "religious" },
    { label: "Political", value: "political" },
    { label: "Mercenary", value: "mercenary" },
    { label: "Arcane", value: "arcane" },
    { label: "Other", value: "other" },
];
const factionSizes = [
    { label: "Small", value: "small" },
    { label: "Medium", value: "medium" },
    { label: "Large", value: "large" },
    { label: "Massive", value: "massive" },
];
const sessionModes = [
    { label: "Planning", value: "planning" },
    { label: "Running", value: "running" },
    { label: "Finished", value: "finished" },
];
const questStatuses = [
    { label: "Active", value: "active" },
    { label: "Dormant", value: "dormant" },
    { label: "Completed", value: "completed" },
    { label: "Failed", value: "failed" },
];

function set(key: string, value: any) {
    emit("update:modelValue", { ...props.modelValue, [key]: value });
}
function addTag() {
    const tag = newTag.value.replace(",", "").trim();
    if (!tag) return;
    const tags = [...currentTags.value];
    if (!tags.includes(tag)) tags.push(tag);
    set("tags", tags);
    newTag.value = "";
}
function removeTag(i: number) {
    set(
        "tags",
        currentTags.value.filter((_, idx) => idx !== i),
    );
}
async function browseImage(sourceKey: string, typeKey: string) {
    const dataUrl = await dbApi.system.openFileDialog();
    if (dataUrl)
        emit("update:modelValue", {
            ...props.modelValue,
            [sourceKey]: dataUrl,
            [typeKey]: "file",
        });
}
</script>

<style scoped>
.attr-editor {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

.input-row {
    display: flex;
    gap: 6px;
    align-items: center;
}

.icon-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    flex-shrink: 0;
    background: var(--parch-dark);
    border: 1px solid var(--parch-line);
    color: var(--ink-faded);
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.icon-btn:hover {
    color: var(--ink);
    border-color: var(--ink-ghost);
}

.toggle-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}

.toggle-opt {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-family: "DM Sans", sans-serif;
    font-weight: 500;
    background: var(--parch-dark);
    border: 1px solid var(--parch-line);
    color: var(--ink-faded);
    cursor: pointer;
    transition: all 0.15s;
}

.toggle-opt:hover {
    color: var(--ink);
    border-color: var(--ink-ghost);
}

.toggle-opt.on {
    background: var(--gold-pale);
    border-color: rgba(235, 189, 52, 0.4);
    color: var(--gold);
}

.toggle-opt--danger.on {
    background: rgba(224, 85, 85, 0.12);
    border-color: rgba(224, 85, 85, 0.35);
    color: var(--blood);
}

.icon-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.icon-opt {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--parch-dark);
    border: 1px solid var(--parch-line);
    color: var(--ink-faded);
    cursor: pointer;
    transition: all 0.15s;
}

.icon-opt:hover {
    color: var(--ink);
    border-color: var(--ink-ghost);
}

.icon-opt.active {
    background: var(--gold-pale);
    border-color: rgba(235, 189, 52, 0.45);
    color: var(--gold);
}

.tag-area {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: center;
    padding: 6px 10px;
    background: var(--parch-dark);
    border: 1px solid var(--parch-line);
    border-radius: 8px;
    min-height: 38px;
    transition: border-color 0.15s;
}

.tag-area:focus-within {
    border-color: var(--gold);
}

.tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(28, 20, 16, 0.06);
    border: 1px solid var(--ink-ghost);
    font-size: 12px;
    color: var(--ink);
    font-family: "DM Sans", sans-serif;
}

.tag-chip button {
    background: none;
    border: none;
    color: var(--ink-ghost);
    cursor: pointer;
    font-size: 12px;
    padding: 0;
    line-height: 1;
}

.tag-input {
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    color: var(--ink);
    font-family: "DM Sans", sans-serif;
    min-width: 80px;
    flex: 1;
}

/* ── Quest giver picker ───────────────────────────────────────────────────── */
.giver-chip {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px;
    background: var(--parch-dark);
    border: 1px solid var(--parch-line);
    border-radius: 8px;
    min-height: 38px;
}

.giver-type-badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid;
    flex-shrink: 0;
}

.giver-name {
    flex: 1;
    font-size: 13px;
    color: var(--ink);
    font-family: "DM Sans", sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.giver-clear {
    background: none;
    border: none;
    color: var(--ink-ghost);
    cursor: pointer;
    font-size: 16px;
    padding: 0 2px;
    line-height: 1;
    flex-shrink: 0;
    transition: color 0.12s;
}
.giver-clear:hover {
    color: var(--blood);
}

.giver-picker {
    position: relative;
}

.giver-input {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 10px;
    background: var(--parch-dark);
    border: 1px solid var(--parch-line);
    border-radius: 8px;
    font-size: 13px;
    color: var(--ink);
    font-family: "DM Sans", sans-serif;
    outline: none;
    transition: border-color 0.15s;
}
.giver-input:focus {
    border-color: var(--gold);
}
.giver-input::placeholder {
    color: var(--ink-ghost);
}

.giver-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--parch);
    border: 1px solid var(--parch-line);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    z-index: 100;
    max-height: 200px;
    overflow-y: auto;
}

.giver-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 12px;
    background: none;
    border: none;
    border-bottom: 1px solid var(--parch-line);
    text-align: left;
    font-size: 13px;
    color: var(--ink);
    font-family: "DM Sans", sans-serif;
    cursor: pointer;
    transition: background 0.12s;
}
.giver-item:last-child {
    border-bottom: none;
}
.giver-item:hover {
    background: var(--parch-dark);
}
</style>
