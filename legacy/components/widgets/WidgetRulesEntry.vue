<template>
  <div class="wre-body">
    <div v-if="loading" class="wre-empty">
      <OhVueIcon name="md-autorenew" scale="1.1" class="wre-spin" />
    </div>
    <RulesStatBlock v-else-if="entry" :entity="entry" :game="game" />
    <em v-else class="wre-empty">Entry not found in the compendium.</em>
  </div>
</template>

<script setup lang="ts">
/** GM screen widget: one compendium entry's stat block. */
import { rulesGet, useRulesRevision } from '~/composables/useRules'
import type { GameId } from '~/types/game'
import type { RulesEntity } from '~/types/rules'

const props = defineProps<{ rulesId: string; game?: GameId }>()
const emit = defineEmits<{ loaded: [name: string] }>()

const loading = ref(true)
const entry = ref<RulesEntity | null>(null)
const revision = useRulesRevision()

async function load() {
  entry.value = (await rulesGet(props.rulesId)) ?? null
  loading.value = false
  if (entry.value) emit('loaded', entry.value.name)
}

onMounted(load)
watch([() => props.rulesId, revision], load)
</script>

<style scoped>
.wre-body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px; }
.wre-empty { display: flex; justify-content: center; padding: 16px; font-size: 12px; color: var(--text3); }
.wre-spin { animation: wre-spin 1s linear infinite; }
@keyframes wre-spin { to { transform: rotate(360deg); } }
</style>
