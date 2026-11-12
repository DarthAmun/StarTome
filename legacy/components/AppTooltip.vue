<template>
  <TooltipRoot :delay-duration="delay">
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent class="app-tip" :side="side" :side-offset="6" :collision-padding="8">
        {{ text }}
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>

<script setup lang="ts">
/**
 * A hint on hover and keyboard focus (Reka UI's Tooltip, our look), for
 * icon-only buttons where the hint is the label. Wrap one element; give it an
 * aria-label with the same words instead of a title, so the browser's own
 * tooltip doesn't show as well. Needs the TooltipProvider in app.vue.
 */
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'

withDefaults(defineProps<{
  text: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  delay?: number
}>(), { side: 'top', delay: 300 })
</script>

<style>
.app-tip {
  z-index: calc(var(--z-modal-top) + 100);
  max-width: 280px;
  padding: 5px 9px;
  border-radius: var(--r1);
  background: var(--surface-solid);
  border: 1px solid var(--border-hi);
  box-shadow: var(--sh-md);
  color: var(--text);
  font-family: var(--fb, inherit);
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
  animation: fadeIn 0.12s;
}
</style>
