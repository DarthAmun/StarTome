/**
 * Shared state and handlers for opening the ConditionPanel slide-in.
 * Replaces the identical trio of refs + openConditionPanel duplicated in
 * pages/encounter/[id]/index.vue and pages/campaign/[id]/notes.vue.
 */
export function useConditionPanel() {
  const conditionPanelOpen = ref(false)
  const conditionPanelName = ref('')
  const conditionPanelValue = ref<number | null>(null)

  function openCondition(name: string, value: number | null = null) {
    conditionPanelName.value = name
    conditionPanelValue.value = value
    conditionPanelOpen.value = true
  }

  function closeCondition() {
    conditionPanelOpen.value = false
  }

  return {
    conditionPanelOpen,
    conditionPanelName,
    conditionPanelValue,
    openCondition,
    closeCondition,
  }
}
