<template>
    <div class="session-editor">
        <EditorHeader
            v-if="entity"
            :entity="entity"
            @delete="onDelete"
            @rename="onRename"
        >
            <template #actions>
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

        <div v-if="entity" class="session-split">
            <!-- Left: Script / Prep -->
            <div class="session-pane">
                <div class="session-pane-label" style="--pane-accent: #b87de8">
                    <span class="session-pane-label-text">Script / Prep</span>
                </div>
                <MarkdownEditor
                    :entity-id="props.entityId"
                    :campaign-id="props.campaignId"
                    :content="draftScript"
                    :show-tab-bar="false"
                    initial-view-mode="mixed"
                    @update:content="onScriptUpdate"
                    @navigate="(t, n) => $emit('navigate', t, n)"
                >
                    <template #below-content>
                        <LinkBar
                            :entity-id="props.entityId"
                            :campaign-id="props.campaignId"
                            entity-type="session"
                            @navigate="(t, n) => $emit('navigate', t, n)"
                        />
                    </template>
                </MarkdownEditor>
            </div>

            <div class="session-split-divider" />

            <!-- Right: Session Notes -->
            <div class="session-pane">
                <div class="session-pane-label" style="--pane-accent: var(--accent)">
                    <span class="session-pane-label-text">Session Notes</span>
                </div>
                <MarkdownEditor
                    :entity-id="props.entityId"
                    :campaign-id="props.campaignId"
                    :content="draftNotes"
                    :show-tab-bar="false"
                    initial-view-mode="mixed"
                    @update:content="onNotesUpdate"
                    @navigate="(t, n) => $emit('navigate', t, n)"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useAttributeDraft } from "~/composables/useAttributeDraft";
import { useEntities } from "~/composables/useEntities";
import type { EntityAttributes } from "~/types/entities";

const props = defineProps<{ entityId: number; campaignId: number }>();
const emit = defineEmits<{
    navigate: [type: string, name: string];
    deleted: [];
}>();

const store = useEntities();

const entity = computed(
    () => store.entities.find((e) => e.id === props.entityId) ?? store.currentEntity,
);

const draftScript = ref("");
const draftNotes = ref("");
// Follows the stored entity; a save writes only the keys edited here
const attrDraft = useAttributeDraft(entity, () => false);
const draftAttributes = attrDraft.draft;
const attrSave = useDebouncedSave(500);
const showAttributes = ref(false);

watch(
    () => props.entityId,
    async (id) => {
        showAttributes.value = false;
        await store.loadEntity(id);
        const attrs = entity.value?.attributes as any;
        draftScript.value = attrs?.scriptContent ?? "";
        draftNotes.value = attrs?.notesContent ?? entity.value?.content ?? "";
        attrDraft.reset(entity.value?.attributes);
    },
    { immediate: true },
);

function onScriptUpdate(value: string) {
    draftScript.value = value;
    store.updateEntity(props.entityId, {
        attributes: { ...(entity.value?.attributes as any), scriptContent: value },
    });
}

function onNotesUpdate(value: string) {
    draftNotes.value = value;
    store.updateEntity(props.entityId, {
        attributes: { ...(entity.value?.attributes as any), notesContent: value },
        content: value,
    });
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
.session-split {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
}
.session-split-divider {
    width: 1px;
    background: var(--border);
    flex-shrink: 0;
}
.session-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
}
.session-pane-label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg2);
}
.session-pane-label-text {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--pane-accent, var(--text3));
}
.hdr-btn {
    display: flex; align-items: center; gap: 5px; padding: 4px 10px;
    border-radius: var(--r1); background: var(--bg2); border: 1px solid var(--border);
    color: var(--text2); font-size: 12px; cursor: pointer; transition: all 0.12s;
}
.hdr-btn:hover { border-color: var(--border-hi); background: var(--surface-hi); }
.hdr-btn.active { background: var(--accent-bg); border-color: var(--accent); color: var(--accent-l); }
</style>
