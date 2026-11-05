<template>
    <div class="rnp">
        <AutoComplete
            :model-value="modelValue ?? ''"
            :suggestions="suggestions"
            complete-on-focus
            :show-empty-message="false"
            :placeholder="placeholder"
            @complete="onComplete"
            @update:model-value="(v) => emit('update:modelValue', typeof v === 'string' ? v : String(v ?? ''))"
        />
        <span
            v-if="custom"
            class="rnp-custom"
            :title="`No ${kindLabel} of this name in the compendium`"
        >custom</span>
    </div>
</template>

<script setup lang="ts">
/**
 * Free text with compendium names as suggestions: an NPC's ancestry or class
 * can be one the compendium doesn't have.
 */
import { rulesNameList, useRulesRevision } from "~/composables/useRules";
import { RULES_KIND_CONFIG, type RulesKind } from "~/types/rules";

const props = defineProps<{ modelValue?: string; kind: RulesKind; placeholder?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const kindLabel = computed(() => RULES_KIND_CONFIG[props.kind].label.toLowerCase());
const names = ref<string[]>([]);
const rulesRevision = useRulesRevision();
watch(
    () => [props.kind, rulesRevision.value] as const,
    async ([kind]) => {
        // Both games: the same name in each is one suggestion
        const rows = await rulesNameList(kind);
        names.value = [...new Set(rows.map((r) => r.name))].sort((a, b) => a.localeCompare(b));
    },
    { immediate: true },
);

const custom = computed(() => {
    const v = props.modelValue?.trim().toLowerCase();
    return !!v && names.value.length > 0 && !names.value.some((n) => n.toLowerCase() === v);
});

const suggestions = ref<string[]>([]);
function onComplete(e: { query: string }) {
    const q = e.query.trim().toLowerCase();
    suggestions.value = (q ? names.value.filter((n) => n.toLowerCase().includes(q)) : names.value).slice(0, 50);
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
