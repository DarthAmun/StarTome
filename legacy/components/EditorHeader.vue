<template>
    <div class="editor-header">
        <span
            class="entity-type-badge"
            :style="{
                background: typeColor + '1a',
                borderColor: typeColor + '55',
                color: typeColor,
            }"
        >{{ typeLabel }}</span>

        <input
            v-if="isEditingName"
            ref="nameInput"
            v-model="draftName"
            class="editor-name-input"
            @blur="saveName"
            @keyup.enter="saveName"
            @keyup.escape="isEditingName = false"
        />
        <h2
            v-else
            class="editor-name"
            @click="startEditName"
        >
            {{ effectiveDisplayName }}
        </h2>

        <div class="header-actions">
            <slot name="actions" />

            <button
                class="hdr-btn hdr-btn--fav"
                :class="{ active: isFavorite }"
                :title="isFavorite ? 'Remove from favorites' : 'Add to favorites'"
                @click="toggleFavorite"
            >
                <span class="fav-star">{{ isFavorite ? '★' : '☆' }}</span>
                <span>Favorite</span>
            </button>

            <button
                class="hdr-btn hdr-btn--danger"
                title="Delete"
                @click="confirmDelete"
            >
                <OhVueIcon name="md-delete" scale="0.8" />
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ENTITY_TYPE_CONFIG } from "~/types/entities";
import type { Entity } from "~/composables/useEntities";
import { useEntities } from "~/composables/useEntities";

const props = defineProps<{
    entity: Entity;
    displayName?: string;
}>();

const emit = defineEmits<{
    delete: [];
    rename: [name: string];
}>();

const entitiesStore = useEntities();
const isFavorite = computed(() => props.entity.isFavorite);
function toggleFavorite() {
    entitiesStore.setFavorite(props.entity.id, !isFavorite.value);
}

const typeColor = computed(
    () => ENTITY_TYPE_CONFIG[props.entity.type]?.color ?? "var(--accent)",
);
const typeLabel = computed(
    () => ENTITY_TYPE_CONFIG[props.entity.type]?.label ?? "",
);

const effectiveDisplayName = computed(
    () => props.displayName ?? props.entity.name,
);

const isEditingName = ref(false);
const draftName = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

function startEditName() {
    draftName.value = props.entity.name;
    isEditingName.value = true;
    nextTick(() => nameInput.value?.focus());
}

function saveName() {
    const newName = draftName.value.trim();
    isEditingName.value = false;
    if (!newName || newName === props.entity.name) return;
    emit("rename", newName);
}

function confirmDelete() {
    if (confirm(`Delete "${props.entity.name}"? This cannot be undone.`)) {
        emit("delete");
    }
}
</script>

<style scoped>
.editor-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    min-width: 0;
}

.entity-type-badge {
    padding: 2px 9px;
    border-radius: var(--r4);
    border: 1px solid;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    flex-shrink: 0;
}

.editor-name {
    flex: 1;
    min-width: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    margin: 0;
}
.editor-name:hover {
    color: var(--accent-l);
}

.editor-name-input {
    flex: 1;
    min-width: 0;
    font-size: 15px;
    font-weight: 600;
    background: var(--bg2);
    border: 1px solid var(--accent);
    border-radius: var(--r1);
    padding: 3px 8px;
    color: var(--text);
    outline: none;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}

.hdr-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: var(--r1);
    background: var(--bg2);
    border: 1px solid var(--border);
    color: var(--text2);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s;
}
.hdr-btn:hover {
    border-color: var(--border-hi);
    background: var(--surface-hi);
}
.hdr-btn.active {
    background: var(--accent-bg);
    border-color: var(--accent);
    color: var(--accent-l);
}
.hdr-btn--fav .fav-star { font-size: 13px; line-height: 1; }
.hdr-btn--fav.active { color: var(--fav); border-color: color-mix(in srgb, var(--fav) 45%, transparent); background: color-mix(in srgb, var(--fav) 10%, transparent); }
.hdr-btn--danger {
    color: var(--danger);
}
.hdr-btn--danger:hover {
    background: var(--danger-bg);
    border-color: var(--danger);
}
</style>
