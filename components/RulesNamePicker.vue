<template>
    <div class="rnp">
        <AutoComplete
            v-model="text"
            :suggestions="suggestions"
            option-label="name"
            complete-on-focus
            :show-empty-message="false"
            :placeholder="placeholder"
            @complete="onComplete"
            @option-select="onSelect"
            @blur="commit"
            @keydown.enter="commit"
        />
        <span v-if="custom" class="rnp-custom" title="Not in the compendium: kept on this entry only">custom</span>
    </div>
</template>

<script setup lang="ts">
/**
 * A compendium entry or a made-up name: suggestions come from `options`, and
 * text that matches none of them is kept as a custom name.
 */
const props = defineProps<{
    options: { id: string; name: string }[];
    id?: string;
    name?: string;
    placeholder?: string;
}>();
const emit = defineEmits<{ pick: [value: { id?: string; name?: string }] }>();

const label = () => props.options.find((o) => o.id === props.id)?.name ?? props.name ?? "";
const text = ref<string | { id: string; name: string }>(label());
watch(() => [props.id, props.name, props.options], () => { text.value = label(); });

const custom = computed(() => !props.id && !!props.name);
const suggestions = ref<{ id: string; name: string }[]>([]);

function onComplete(e: { query: string }) {
    const q = e.query.trim().toLowerCase();
    suggestions.value = (q ? props.options.filter((o) => o.name.toLowerCase().includes(q)) : props.options).slice(0, 50);
}

function onSelect(e: { value: { id: string; name: string } }) {
    if (e.value.id !== props.id) emit("pick", { id: e.value.id, name: e.value.name });
}

function commit() {
    // A suggestion was picked: onSelect handled it
    if (typeof text.value !== "string") return;
    const typed = text.value.trim();
    if (typed === label()) return;
    if (!typed) { emit("pick", {}); return; }
    const hit = props.options.find((o) => o.name.toLowerCase() === typed.toLowerCase());
    emit("pick", hit ? { id: hit.id, name: hit.name } : { name: typed });
}
</script>

<style scoped>
.rnp { position: relative; }
.rnp :deep(.pv-autocomplete) { width: 100%; }
.rnp :deep(.pv-input) { width: 100%; }
.rnp-custom {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none;
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text2);
    border: 1px dashed var(--border-hi); border-radius: 3px; padding: 0 4px;
}
</style>
