<template>
    <div class="rnp">
        <input
            class="pv-input"
            :value="modelValue ?? ''"
            :list="listId"
            :placeholder="placeholder"
            autocomplete="off"
            @input="emit('update:modelValue', inputValue($event))"
        />
        <datalist :id="listId">
            <option v-for="n in suggestions" :key="n" :value="n" />
        </datalist>
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

// The browser filters the list as you type; this keeps it to 50 names that match
const listId = useId();
const suggestions = computed(() => {
    const q = (props.modelValue ?? "").trim().toLowerCase();
    return (q ? names.value.filter((n) => n.toLowerCase().includes(q)) : names.value).slice(0, 50);
});
</script>

<style scoped>
.rnp { position: relative; }
.rnp .pv-input { width: 100%; }
.rnp-custom {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none;
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text2);
    border: 1px dashed var(--border-hi); border-radius: 3px; padding: 0 4px;
}
</style>
