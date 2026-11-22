<script setup lang="ts">
/**
 * A text input over a stored value that never loses typing: it keeps a local draft while focused,
 * saves a moment after the last keystroke and on blur or Enter (see useDraft). Pass `save` as a
 * function bound to its target (`:save="saveName(id)"`), so a save on unmount still goes to the
 * right row. Other attributes (class, aria-label, placeholder) go to the input.
 */
import { useDraft } from '@/ui/useDraft'

const props = withDefaults(defineProps<{ value: string; save: (value: string) => unknown; delay?: number }>(), { delay: 1500 })
const draft = useDraft(() => props.value, v => props.save(v), props.delay)
const text = draft.text
</script>

<template>
  <input
    :value="text"
    @input="draft.input(($event.target as HTMLInputElement).value)"
    @blur="draft.end"
    @keydown.enter="draft.commit"
  />
</template>
