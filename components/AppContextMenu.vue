<template>
  <DropdownMenuRoot :open="open" :modal="false" @update:open="v => !v && emit('close')">
    <!-- A point at the cursor for the menu to open from; in body, as a transformed
         ancestor (a canvas, a board) would shift a fixed element -->
    <Teleport to="body">
      <DropdownMenuTrigger as-child>
        <span class="app-ctx-anchor" :style="{ left: `${x}px`, top: `${y}px` }" aria-hidden="true" />
      </DropdownMenuTrigger>
    </Teleport>
    <DropdownMenuPortal>
      <DropdownMenuContent
        v-bind="{ ...scope, ...$attrs }"
        class="app-menu"
        side="bottom"
        align="start"
        :side-offset="2"
        :collision-padding="8"
        @contextmenu.prevent
      >
        <slot />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
/**
 * A right-click menu at a screen point (Reka UI's DropdownMenu anchored to
 * the cursor). For canvases that decide themselves what was right-clicked:
 * set x / y from the event's clientX / clientY and open it. Rows are
 * DropdownMenuItem; picking one, Escape or a click outside closes it (emits
 * `close`). class / style land on the menu box with the caller's scope id.
 */
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { getCurrentInstance } from 'vue'

defineOptions({ inheritAttrs: false })

defineProps<{ open: boolean; x: number; y: number }>()
const emit = defineEmits<{ close: [] }>()

const scopeId = getCurrentInstance()?.vnode.scopeId
const scope = scopeId ? { [scopeId]: '' } : {}
</script>

<style>
.app-ctx-anchor { position: fixed; width: 0; height: 0; pointer-events: none; }
</style>
