<template>
  <label class="red-field red-span-3 jsf">
    <span>{{ label }} <em v-if="hint">{{ hint }}</em></span>
    <textarea class="red-input jsf-input" :rows="rows" :value="text" spellcheck="false" @change="onChange(($event.target as HTMLTextAreaElement).value)" />
    <span v-if="error" class="jsf-error">{{ error }}</span>
  </label>
</template>

<script setup lang="ts">
/** A JSON editor for structured fields the form has no inputs for (tables, nested lists). */
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{ label: string; value: unknown; hint?: string; rows?: number; array?: boolean }>(), { rows: 6, array: true })
const emit = defineEmits<{ update: [value: unknown] }>()
const error = ref('')
const text = computed(() => JSON.stringify(props.value ?? (props.array ? [] : null), null, 1))

function onChange(raw: string) {
  try {
    const v = raw.trim() ? JSON.parse(raw) : (props.array ? [] : null)
    if (props.array && !Array.isArray(v)) throw new Error('should be a list ([ … ])')
    error.value = ''
    emit('update', v)
  } catch (err) {
    error.value = `Not saved: ${(err as Error).message}`
  }
}
</script>

<style scoped>
.jsf-input { font-family: var(--fm, monospace); font-size: 12px; }
.jsf-error { color: #e05555; font-size: 11.5px; }
</style>
