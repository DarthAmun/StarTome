/** A counter that goes up whenever the compendium changes; watch it to reload lists and stat blocks. */
import { ref } from 'vue'
import { onRulesChanged } from '@/data/rules'

export const rulesRevision = ref(0)
onRulesChanged(() => { rulesRevision.value++ })
