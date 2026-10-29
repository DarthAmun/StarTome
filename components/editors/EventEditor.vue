<template>
    <div class="event-editor">
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
                type="event"
                :model-value="draftAttributes"
                @update:model-value="onAttributesChange"
            />
        </div>

        <MarkdownEditor
            v-if="entity"
            :entity-id="props.entityId"
            :campaign-id="props.campaignId"
            :content="draftContent"
            show-tab-bar
            @update:content="onContentUpdate"
            @navigate="(t, n) => $emit('navigate', t, n)"
        >
            <template #below-content>
                <LinkBar
                    :entity-id="props.entityId"
                    :campaign-id="props.campaignId"
                    entity-type="event"
                    @navigate="(t, n) => $emit('navigate', t, n)"
                />
            </template>
        </MarkdownEditor>
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

const draftContent = ref("");
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
        draftContent.value = entity.value?.content ?? "";
        attrDraft.reset(entity.value?.attributes);
    },
    { immediate: true },
);

function onContentUpdate(value: string) {
    store.updateEntity(props.entityId, { content: value });
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
.event-editor {
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
.hdr-btn {
    display: flex; align-items: center; gap: 5px; padding: 4px 10px;
    border-radius: var(--r1); background: var(--bg2); border: 1px solid var(--border);
    color: var(--text2); font-size: 12px; cursor: pointer; transition: all 0.12s;
}
.hdr-btn:hover { border-color: var(--border-hi); background: var(--surface-hi); }
.hdr-btn.active { background: var(--accent-bg); border-color: var(--accent); color: var(--accent-l); }
</style>
