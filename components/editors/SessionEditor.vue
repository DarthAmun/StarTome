<template>
    <div class="session-editor">
        <EditorHeader
            v-if="entity"
            :entity="entity"
            @delete="onDelete"
            @rename="onRename"
        >
            <template #actions>
                <div class="mode-switch" role="radiogroup" aria-label="Session mode">
                    <button
                        v-for="m in MODES"
                        :key="m.value"
                        class="mode-btn"
                        role="radio"
                        :aria-checked="mode === m.value"
                        :class="{ active: mode === m.value }"
                        :style="mode === m.value ? { '--mode': SESSION_MODE_COLORS[m.value] } : {}"
                        @click="setMode(m.value)"
                    >{{ m.label }}</button>
                </div>
                <button
                    class="hdr-btn"
                    :class="{ active: showAttributes }"
                    @click="showAttributes = !showAttributes"
                >
                    <OhVueIcon name="md-editnote" scale="0.8" />
                    <span>Attributes</span>
                </button>
            </template>
        </EditorHeader>

        <div v-if="showAttributes && entity" class="attributes-pane">
            <AttributeEditor
                type="session"
                :model-value="draftAttributes"
                @update:model-value="onAttributesChange"
            />
        </div>

        <SessionBoard
            v-if="entity"
            :key="props.entityId"
            :session-id="props.entityId"
            :campaign-id="props.campaignId"
            @navigate="(t, n) => $emit('navigate', t, n)"
        />
    </div>
</template>

<script setup lang="ts">
import { useAttributeDraft } from "~/composables/useAttributeDraft";
import { useEntities } from "~/composables/useEntities";
import { SESSION_MODE_COLORS, type EntityAttributes, type SessionAttributes } from "~/types/entities";

const props = defineProps<{ entityId: number; campaignId: number }>();
const emit = defineEmits<{
    navigate: [type: string, name: string];
    deleted: [];
}>();

const MODES = [
    { value: "planning", label: "Planning" },
    { value: "running", label: "Running" },
    { value: "finished", label: "Finished" },
] as const;

const store = useEntities();

const entity = computed(
    () => store.entities.find((e) => e.id === props.entityId) ?? store.currentEntity,
);

// Follows the stored entity; a save writes only the keys edited here
const attrDraft = useAttributeDraft(entity, () => false);
const draftAttributes = attrDraft.draft;
const attrSave = useDebouncedSave(500);
const showAttributes = ref(false);

const mode = computed(() => (draftAttributes.value as SessionAttributes).mode ?? "planning");

watch(
    () => props.entityId,
    async (id) => {
        showAttributes.value = false;
        await store.loadEntity(id);
        attrDraft.reset(entity.value?.attributes);
    },
    { immediate: true },
);

function setMode(value: SessionAttributes["mode"]) {
    const next: SessionAttributes = { ...(draftAttributes.value as SessionAttributes), mode: value };
    // Starting the session: it's played today unless a date was set
    if (value === "running" && !next.date) next.date = new Date().toISOString().slice(0, 10);
    onAttributesChange(next as EntityAttributes);
    attrSave.flush();
}

function onAttributesChange(attrs: EntityAttributes) {
    attrDraft.edit(attrs);
    attrSave.schedule(() => {
        store.updateEntity(props.entityId, { attributes: attrDraft.takePatch() });
    });
}

async function onRename(name: string) {
    await store.updateEntity(props.entityId, { name });
}

async function onDelete() {
    await store.deleteEntity(props.entityId);
    emit("deleted");
}
</script>

<style scoped>
.session-editor {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}
.attributes-pane {
    flex-shrink: 0;
    overflow-y: auto;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border);
    max-height: 40vh;
}
.mode-switch {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--r1);
    overflow: hidden;
    background: var(--bg2);
}
.mode-btn {
    --mode: var(--accent);
    padding: 4px 11px;
    font-size: 12px;
    color: var(--text3);
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    cursor: pointer;
    transition: all 0.12s;
}
.mode-btn:last-child { border-right: none; }
.mode-btn:hover { color: var(--text); }
.mode-btn.active {
    color: var(--text);
    background: color-mix(in oklch, var(--mode) 20%, transparent);
    box-shadow: inset 0 -2px 0 var(--mode);
}
.hdr-btn {
    display: flex; align-items: center; gap: 5px; padding: 4px 10px;
    border-radius: var(--r1); background: var(--bg2); border: 1px solid var(--border);
    color: var(--text2); font-size: 12px; cursor: pointer; transition: all 0.12s;
}
.hdr-btn:hover { border-color: var(--border-hi); background: var(--surface-hi); }
.hdr-btn.active { background: var(--accent-bg); border-color: var(--accent); color: var(--accent-l); }
</style>
