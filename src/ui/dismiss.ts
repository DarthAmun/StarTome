/** A small menu that closes on a click outside it or on Escape. */
import { onMounted, onUnmounted, type Ref } from 'vue'

export function useDismiss(open: Ref<boolean>, box: Ref<HTMLElement | null>): void {
  const down = (e: PointerEvent) => { if (open.value && box.value && !box.value.contains(e.target as Node)) open.value = false }
  const key = (e: KeyboardEvent) => { if (open.value && e.key === 'Escape') open.value = false }
  onMounted(() => { document.addEventListener('pointerdown', down, true); document.addEventListener('keydown', key) })
  onUnmounted(() => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key) })
}
