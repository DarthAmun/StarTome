<template>
  <DialogRoot :open="open" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay v-bind="scope" :class="maskClass" :style="top ? { zIndex: 'var(--z-modal-top)' } : undefined">
        <DialogContent
          ref="contentRef"
          :class="boxClass"
          v-bind="{ ...scope, ...$attrs }"
          :aria-describedby="undefined"
          @pointer-down-outside="onPointerDownOutside"
          @focus-outside.prevent
          @escape-key-down="onEscape"
          @open-auto-focus="onOpenAutoFocus"
        >
          <div v-if="!bare" class="pv-dialog-header">
            <DialogTitle class="pv-dialog-title"><slot name="title">{{ title }}</slot></DialogTitle>
            <DialogClose v-if="dismissable" class="pv-dialog-close" aria-label="Close">
              <OhVueIcon name="md-close" scale="0.85" />
            </DialogClose>
          </div>
          <VisuallyHidden v-else as-child><DialogTitle>{{ title }}</DialogTitle></VisuallyHidden>
          <slot />
        </DialogContent>
      </DialogOverlay>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
/**
 * The one modal dialog. Reka UI gives it a focus trap, Escape to close, a page
 * scroll lock and the dialog/title ARIA wiring; the look stays ours (the
 * pv-dialog classes in main.css, or the ones a caller passes).
 *
 * class / style / role on <AppDialog> land on the dialog box itself, and the
 * mask and box carry the caller's scope id, so its <style scoped> rules for
 * them still apply.
 * Clicking the dimmed mask closes it, as it always did; clicks on anything
 * else outside the box (a toast, a popup teleported to body) don't.
 */
import { getCurrentInstance } from 'vue'
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, VisuallyHidden } from 'reka-ui'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  open?: boolean
  /** The heading; with `bare` it's only read out to screen readers */
  title?: string
  /** The dialog draws its own header */
  bare?: boolean
  /** false while something is running: Escape, the mask and the × do nothing */
  dismissable?: boolean
  /** Above other dialogs (opened from one) */
  top?: boolean
  /** Keep focus where it is on open instead of moving it into the dialog */
  noAutoFocus?: boolean
  maskClass?: string
  boxClass?: string
}>(), {
  open: true,
  title: '',
  bare: false,
  dismissable: true,
  top: false,
  noAutoFocus: false,
  maskClass: 'pv-dialog-mask',
  boxClass: 'pv-dialog',
})
const emit = defineEmits<{ close: [] }>()

// The scope id of the template that wrote <AppDialog> (Vue sets it on the vnode)
const scopeId = getCurrentInstance()?.vnode.scopeId
const scope = scopeId ? { [scopeId]: '' } : {}

function onOpenChange(open: boolean) {
  if (!open && props.dismissable) emit('close')
}

function onPointerDownOutside(e: CustomEvent<{ originalEvent: PointerEvent }>) {
  const target = e.detail.originalEvent.target as HTMLElement | null
  if (!props.dismissable || !target?.matches(`.${props.maskClass.split(' ')[0]}`)) e.preventDefault()
}

function onEscape(e: KeyboardEvent) {
  if (!props.dismissable) e.preventDefault()
}

const contentRef = ref<{ $el: HTMLElement } | null>(null)

/** Focus goes to an [autofocus] field, else the first field, else the first button that isn't the × */
function onOpenAutoFocus(e: Event) {
  e.preventDefault()
  if (props.noAutoFocus) return
  const box = contentRef.value?.$el
  if (!box) return
  const usable = (el: HTMLElement) => !(el as HTMLInputElement).disabled && el.offsetParent !== null
  const pick = (sel: string) => [...box.querySelectorAll<HTMLElement>(sel)].find(usable)
  const el = pick('[autofocus]')
    ?? pick('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select')
    ?? pick('button:not(.pv-dialog-close), [href], input, [tabindex]:not([tabindex="-1"])')
    ?? box
  el.focus({ preventScroll: true })
}
</script>
