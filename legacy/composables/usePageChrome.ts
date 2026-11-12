/**
 * Lets child pages signal the parent layout to hide the spine nav.
 * Used when a child takes over the full viewport (e.g. world map active location).
 */
const _hideSpine = ref(false)

export function usePageChrome() {
  function hideSpine() { _hideSpine.value = true }
  function showSpine() { _hideSpine.value = false }
  return { spineHidden: readonly(_hideSpine), hideSpine, showSpine }
}
