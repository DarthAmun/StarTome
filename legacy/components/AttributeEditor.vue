<template>
    <div class="attr-editor">
        <!-- NPC -->
        <template v-if="type === 'npc'">
            <div class="field">
                <label class="f-label">Portrait</label>
                <div class="input-row">
                    <input
                        :value="urlText(attrs.portraitSource)"
                        :placeholder="sourcePlaceholder(attrs.portraitSource)"
                        class="pv-input flex-1"
                        @input="setUrl('portraitSource', 'portraitType', inputValue($event))"
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
                    <input
                        class="pv-input"
                        :value="attrs.title || ''"
                        placeholder="High Priest, General…"
                        @input="set('title', inputValue($event))"
                    />
                </div>
                <div class="field">
                    <label class="f-label">Level</label>
                    <input
                        class="pv-input"
                        :value="attrs.level || ''"
                        placeholder="5, 12…"
                        @input="set('level', inputValue($event))"
                    />
                </div>
            </div>
            <div class="field-row">
                <div class="field">
                    <label class="f-label">Ancestry</label>
                    <RulesNamePicker
                        :model-value="attrs.race"
                        kind="ancestry"
                        placeholder="Human, Elf…"
                        @update:model-value="(v) => set('race', v)"
                    />
                </div>
                <div class="field">
                    <label class="f-label">Class / Role</label>
                    <RulesNamePicker
                        :model-value="attrs.role"
                        kind="class"
                        placeholder="Fighter, Merchant…"
                        @update:model-value="(v) => set('role', v)"
                    />
                </div>
            </div>
            <div class="field">
                <label class="f-label" title="Dual-class variant rule: both classes' features and a class feat from each">Second class (dual-class)</label>
                <RulesNamePicker
                    :model-value="attrs.role2"
                    kind="class"
                    placeholder="None"
                    @update:model-value="(v) => set('role2', v)"
                />
            </div>
            <div class="field">
                <label class="f-label">Current Status</label>
                <input
                    class="pv-input"
                    :value="attrs.status || ''"
                    placeholder="At court, Imprisoned…"
                    @input="set('status', inputValue($event))"
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
                        title="Adds the NPC to the party as a player character (or removes them)"
                        @click="emit('toggle-pc', !attrs.isPlayerCharacter)"
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
                    <input
                        :value="urlText(attrs.logoSource)"
                        :placeholder="sourcePlaceholder(attrs.logoSource)"
                        class="pv-input flex-1"
                        @input="setUrl('logoSource', 'logoType', inputValue($event))"
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
                    <input
                        :value="urlText(attrs.imageSource)"
                        :placeholder="sourcePlaceholder(attrs.imageSource)"
                        class="pv-input flex-1"
                        @input="setUrl('imageSource', 'imageType', inputValue($event))"
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
                    <select
                        class="f-input f-select"
                        :value="attrs.locationType || ''"
                        @change="set('locationType', inputValue($event) || undefined)"
                    >
                        <option value="" disabled>— select —</option>
                        <option v-for="o in locationTypes" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                </div>
                <div class="field">
                    <label class="f-label">Status</label>
                    <select
                        class="f-input f-select"
                        :value="attrs.status || ''"
                        @change="set('status', inputValue($event) || undefined)"
                    >
                        <option value="" disabled>— select —</option>
                        <option v-for="o in locationStatuses" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                </div>
            </div>
        </template>

        <!-- Faction -->
        <template v-else-if="type === 'faction'">
            <div class="field">
                <label class="f-label">Symbol / Banner</label>
                <div class="input-row">
                    <input
                        :value="urlText(attrs.imageSource)"
                        :placeholder="sourcePlaceholder(attrs.imageSource)"
                        class="pv-input flex-1"
                        @input="setUrl('imageSource', 'imageType', inputValue($event))"
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
                    <select
                        class="f-input f-select"
                        :value="attrs.factionType || ''"
                        @change="set('factionType', inputValue($event) || undefined)"
                    >
                        <option value="" disabled>— select —</option>
                        <option v-for="o in factionTypes" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                </div>
                <div class="field">
                    <label class="f-label">Size</label>
                    <select
                        class="f-input f-select"
                        :value="attrs.size || ''"
                        @change="set('size', inputValue($event) || undefined)"
                    >
                        <option value="" disabled>— select —</option>
                        <option v-for="o in factionSizes" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
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
                <select
                    class="f-input f-select"
                    :value="attrs.mode || ''"
                    @change="set('mode', inputValue($event) || undefined)"
                >
                    <option value="" disabled>— select —</option>
                    <option v-for="o in sessionModes" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
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
                <select
                    class="f-input f-select"
                    :value="attrs.status || ''"
                    @change="set('status', inputValue($event) || undefined)"
                >
                    <option value="" disabled>— select —</option>
                    <option v-for="o in questStatuses" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
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
                    <div v-else class="giver-picker">
                        <AppCombobox
                            v-model="giverSearch"
                            :options="giverOptions"
                            :filter="false"
                            input-class="giver-input"
                            placeholder="Search NPC or Faction…"
                            @select="selectGiverId"
                            @commit="onGiverCommit"
                        />
                    </div>
                </div>
                <div class="field">
                    <label class="f-label">Reward</label>
                    <input
                        class="pv-input"
                        :value="attrs.reward || ''"
                        placeholder="Gold, items, favor…"
                        @input="set('reward', inputValue($event))"
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
import { pickImageFile } from "~/utils/image";
import { isImageRef, storeInlineImage } from "~/rules/images";

const props = defineProps<{ type: EntityType; modelValue: EntityAttributes }>();
// toggle-pc: "player character" belongs to the party, so the NPC editor asks it instead of setting the attribute
const emit = defineEmits<{ "update:modelValue": [EntityAttributes]; "toggle-pc": [boolean] }>();

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

const giverOptions = computed(() =>
    filteredGivers.value.map((e) => ({ value: e.id, label: e.name, tag: e.type === "npc" ? "NPC" : "Faction" })),
);
function selectGiverId(id: string | number) {
    const ent = filteredGivers.value.find((e) => e.id === id);
    if (ent) selectGiver(ent);
}

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

/** Typed text without picking: a quest giver that isn't an entry */
function onGiverCommit(text: string) {
    if ((props.modelValue as any).questGiverId && !text) return;
    const current = (props.modelValue as any).questGiver || "";
    if (text === current) return;
    emit("update:modelValue", {
        ...props.modelValue,
        questGiver: text || undefined,
        questGiverId: undefined,
        questGiverType: undefined,
    });
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
// One update for both keys: two set() calls in a row would each start from the old attributes
function setUrl(sourceKey: string, typeKey: string, url: string) {
    emit("update:modelValue", { ...props.modelValue, [sourceKey]: url, [typeKey]: "url" });
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
    const dataUrl = await pickImageFile();
    if (!dataUrl) return;
    // Stored once, here: the entry (and every autosave of the draft) keeps the ref
    const ref = await storeInlineImage(dataUrl);
    emit("update:modelValue", {
        ...props.modelValue,
        [sourceKey]: ref,
        [typeKey]: "file",
    });
}

/** The URL field shows typed URLs only; an uploaded image isn't text to edit. */
function urlText(src: string | undefined): string {
    if (!src || src.startsWith("data:")) return "";
    return isImageRef(src) ? "" : src;
}
function sourcePlaceholder(src: string | undefined): string {
    return src && !urlText(src) ? "Uploaded image · paste a URL to replace" : "URL or file path";
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

</style>
