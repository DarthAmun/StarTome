<template>
  <DropdownMenuRoot v-model:open="open" :modal="false">
    <DropdownMenuTrigger as-child>
      <slot name="trigger" :open="open" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        v-bind="{ ...scope, ...$attrs }"
        class="app-menu"
        :side="side"
        :align="align"
        :side-offset="sideOffset"
        :collision-padding="8"
      >
        <slot />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
/**
 * A dropdown menu (Reka UI's DropdownMenu, our look): the #trigger slot is the
 * button, the default slot holds DropdownMenuItem / DropdownMenuCheckboxItem
 * rows. Arrow keys move, Enter picks, Escape and a click outside close, and it
 * flips to stay on screen. class / style land on the menu box, which carries
 * the caller's scope id, so its <style scoped> rules apply. The box sets no
 * size or look of its own beyond stacking: the caller's class does that.
 */
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { getCurrentInstance } from 'vue'

defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
}>(), { side: 'bottom', align: 'start', sideOffset: 6 })

const open = defineModel<boolean>('open', { default: false })

const scopeId = getCurrentInstance()?.vnode.scopeId
const scope = scopeId ? { [scopeId]: '' } : {}
</script>

<style>
/* Portalled to body: above dialogs, so a menu inside one shows */
.app-menu { z-index: calc(var(--z-modal-top) + 50); outline: none; }
.app-menu [data-highlighted] { outline: none; }
</style>
