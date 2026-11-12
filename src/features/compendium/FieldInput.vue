<script setup lang="ts">
/** One field of the entry editor: an input fitting its codec. Writes on change (blur or Enter), not per keystroke. */
import { computed, ref } from 'vue'
import { read, show, type Field } from './editorFields'

const props = defineProps<{ field: Field; value: unknown; game: string }>()
const emit = defineEmits<{ set: [value: unknown] }>()

const error = ref('')
const shown = computed(() => show(props.field, props.value, props.game))
const multiline = computed(() => ['area', 'json', 'jsonObject', 'facts', 'features'].includes(props.field.codec))
const numeric = computed(() => ['number', 'optNumber', 'nullNumber', 'price'].includes(props.field.codec))
const rows = computed(() => Math.min(14, Math.max(2, String(shown.value).split('\n').length + 1)))

function change(raw: string | boolean) {
  try { error.value = ''; emit('set', read(props.field, raw, props.game, props.value)) }
  catch (err) { error.value = `Not saved: ${err instanceof Error ? err.message : String(err)}` }
}
const text = (e: Event) => (e.target as HTMLInputElement).value
</script>

<template>
  <label class="fi" :class="[`span-${field.span ?? 1}`, { tick: field.codec === 'bool' }]">
    <template v-if="field.codec === 'bool'">
      <input type="checkbox" :checked="shown === true" @change="change(($event.target as HTMLInputElement).checked)" /> <span>{{ field.label }}</span>
    </template>
    <template v-else>
      <span class="label">{{ field.label }} <em v-if="field.hint">{{ field.hint }}</em></span>
      <select v-if="field.options" class="input" :value="shown" @change="change(text($event))">
        <option v-for="[v, l] in field.options" :key="v" :value="v">{{ l }}</option>
      </select>
      <textarea v-else-if="multiline" class="input" :class="{ mono: field.codec.startsWith('json') }" :rows="rows" :value="String(shown)" spellcheck="false" @change="change(text($event))" />
      <input v-else class="input" :type="numeric ? 'number' : 'text'" :step="field.codec === 'price' ? 'any' : undefined" :value="shown" @change="change(text($event))" />
      <span v-if="error" class="error">{{ error }}</span>
    </template>
  </label>
</template>

<style scoped>
.fi { display: block; min-width: 0; }
.span-2 { grid-column: span 2; } .span-3 { grid-column: 1 / -1; }
.tick { display: flex; align-items: center; gap: .45rem; align-self: end; padding-bottom: .45em; }
.label { margin-bottom: .2em; }
.label em { text-transform: none; letter-spacing: 0; font-style: normal; opacity: .75; margin-left: .4em; }
.mono { font-family: var(--font-mono); font-size: .85rem; }
textarea { resize: vertical; }
.error { color: var(--danger); font-size: .8rem; }
</style>
