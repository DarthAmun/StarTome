<template>
    <div class="note-editor-simple">
        <EditorHeader
            v-if="entity"
            :entity="entity"
            @delete="onDelete"
            @rename="onRename"
        />

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
                    entity-type="note"
                    @navigate="(t, n) => $emit('navigate', t, n)"
                />
            </template>
        </MarkdownEditor>
    </div>
</template>

<script setup lang="ts">
import { useEntities } from "~/composables/useEntities";

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

watch(
    () => props.entityId,
    async (id) => {
        await store.loadEntity(id);
        draftContent.value = entity.value?.content ?? "";
    },
    { immediate: true },
);

function onContentUpdate(value: string) {
    store.updateEntity(props.entityId, { content: value });
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
.note-editor-simple {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}
</style>
