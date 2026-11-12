<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <slot name="trigger" :open="open" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        v-bind="{ ...scope, ...$attrs }"
        class="app-popover"
        :side="side"
        :align="align"
        :side-offset="sideOffset"
        :collision-padding="8"
      >
        <slot :close="() => (open = false)" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
/**
 * A floating panel under a button (Reka UI's Popover, our look) for content
 * that isn't a plain list of choices: buttons, fields, rows with their own
 * actions. Escape and a click outside close it, focus moves in and back, and
 * it flips to stay on screen. The default slot gets `close`. class / style
 * land on the panel, which carries the caller's scope id.
 */
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { getCurrentInstance } from 'vue'

defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
}>(), { side: 'bottom', align: 'end', sideOffset: 6 })

const open = defineModel<boolean>('open', { default: false })

const scopeId = getCurrentInstance()?.vnode.scopeId
const scope = scopeId ? { [scopeId]: '' } : {}
</script>

<style>
.app-popover { z-index: calc(var(--z-modal-top) + 50); outline: none; }
</style>
