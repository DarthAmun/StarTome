<template>
  <ComboboxRoot
    v-model:open="open"
    :model-value="null"
    class="acb"
    ignore-filter
    open-on-focus
    :reset-search-term-on-blur="false"
    :reset-search-term-on-select="false"
    @update:model-value="onPick"
  >
    <ComboboxAnchor as-child>
      <ComboboxInput
        v-bind="{ ...scope, ...$attrs }"
        :model-value="modelValue ?? ''"
        :class="inputClass"
        :placeholder="placeholder"
        autocomplete="off"
        @update:model-value="onType"
        @focus="emit('focus')"
        @blur="commitSoon"
        @keydown.enter="commitSoon"
      />
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent v-if="shown.length" position="popper" :side-offset="3" class="acb-content">
        <ComboboxViewport class="acb-viewport">
          <ComboboxItem v-for="o in shown" :key="String(o.value)" :value="o" class="acb-item">
            <span v-if="o.tag" class="acb-tag">{{ o.tag }}</span>
            <span class="acb-label">{{ o.label }}</span>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>

<script setup lang="ts">
/**
 * A text field with a suggestion list (Reka UI's Combobox, our look): arrow
 * keys and Enter pick, Escape closes, and the list works inside dialogs.
 *
 * - Free text: v-model is the text; picking a suggestion writes its label.
 * - Search and pick: pass `{ value, label, tag }` options and listen to
 *   `select`; with `:filter="false"` the caller filters (e.g. a database search).
 * `commit` fires on blur, Enter and picking a plain-text suggestion, for
 * callers that saved on @change.
 * Attributes (title, style, …) go to the input, and so does the caller's
 * scope id: its <style scoped> rules for `input-class` apply.
 */
import { getCurrentInstance } from 'vue'
import { ComboboxAnchor, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxPortal, ComboboxRoot, ComboboxViewport } from 'reka-ui'

defineOptions({ inheritAttrs: false })

export interface ComboOption { value: string | number; label: string; tag?: string; /** a plain-text suggestion */ text?: boolean }

const props = withDefaults(defineProps<{
  modelValue?: string | null
  options: readonly (string | ComboOption)[]
  placeholder?: string
  inputClass?: string
  /** Filter the options by the text (off when the caller already did) */
  filter?: boolean
  limit?: number
}>(), { modelValue: '', placeholder: '', inputClass: 'pv-input', filter: true, limit: 50 })
const emit = defineEmits<{
  'update:modelValue': [text: string]
  select: [value: string | number]
  commit: [text: string]
  focus: []
}>()

const open = ref(false)

// The scope id of the template that wrote <AppCombobox>
const scopeId = getCurrentInstance()?.vnode.scopeId
const scope = scopeId ? { [scopeId]: '' } : {}

const shown = computed<ComboOption[]>(() => {
  const all = props.options.map(o => (typeof o === 'string' ? { value: o, label: o, text: true } : o))
  const q = (props.modelValue ?? '').trim().toLowerCase()
  const hits = props.filter && q ? all.filter(o => o.label.toLowerCase().includes(q)) : all
  // Exactly what's typed: nothing left to suggest
  if (hits.length === 1 && hits[0]!.label.toLowerCase() === q) return []
  return hits.slice(0, props.limit)
})

function onType(text: string) {
  emit('update:modelValue', text)
  open.value = true
}

// Enter and blur keep typed text, unless they just picked a suggestion (Reka handles
// that Enter too, in an order we don't control): decide after both have run
let lastPick = 0
function commitSoon() {
  setTimeout(() => {
    if (performance.now() - lastPick < 100) return
    emit('commit', props.modelValue ?? '')
  }, 0)
}

function onPick(o: unknown) {
  if (!o) return
  lastPick = performance.now()
  const opt = o as ComboOption
  emit('update:modelValue', opt.label)
  emit('select', opt.value)
  if (opt.text) emit('commit', opt.label)
  open.value = false
}
</script>

<style>
/* Portalled to body, so not scoped */
.acb-content {
  z-index: calc(var(--z-modal-top) + 50);
  min-width: var(--reka-combobox-trigger-width);
  max-height: min(280px, var(--reka-combobox-content-available-height));
  overflow: hidden;
  background: var(--surface-solid);
  border: 1px solid var(--border-hi);
  border-radius: var(--r2);
  box-shadow: var(--sh-md);
}
.acb-viewport { padding: 4px; overflow-y: auto; max-height: inherit; }
.acb-item {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px; border-radius: var(--r1);
  font-size: 13px; color: var(--text); cursor: pointer; user-select: none; outline: none;
}
.acb-item[data-highlighted] { background: var(--accent-bhi); color: var(--text); }
.acb-tag {
  font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3);
  border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; flex-shrink: 0;
}
.acb-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
