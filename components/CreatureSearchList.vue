<template>
  <div class="csl">
    <div class="csl-search">
      <InputText ref="inputRef" v-model="search" placeholder="Search creatures and hazards…" />
    </div>
    <div class="csl-adjust" role="radiogroup" aria-label="Weak/elite adjustment for placement">
      <button v-for="opt in ADJUSTMENT_OPTIONS" :key="opt.label" class="csl-adjust-btn"
        :class="{ 'csl-adjust-btn--active': adjustment === opt.value }"
        role="radio" :aria-checked="adjustment === opt.value"
        @click="adjustment = opt.value">{{ opt.label }}</button>
    </div>
    <div class="csl-list">
      <div
        v-for="rec in results"
        :key="rec.id"
        class="token-chip csl-chip"
        :class="{ 'csl-chip--static': !draggable }"
        :draggable="draggable"
        @dragstart="emit('dragstart', $event, rec)"
        @dragend="emit('dragend', $event)"
        @dblclick="emit('place', rec, adjustment)"
      >
        <div class="csl-thumb">
          <img v-if="rec.img" :src="rec.img" class="csl-img" />
          <span v-else class="csl-initial">{{ rec.name.charAt(0) }}</span>
        </div>
        <div class="csl-info">
          <span class="csl-name">{{ rec.name }}</span>
          <span class="csl-type">{{ rec.kind }} {{ rec.level }}{{ otherGameTag(rec.game, game) }}</span>
        </div>
        <button class="icon-btn-sq" :title="placeLabel" @click.stop="emit('place', rec, adjustment)">
          <OhVueIcon name="md-add" scale="0.75" />
        </button>
      </div>
      <p v-if="results.length === 0 && !loading" class="csl-hint" style="padding:12px 0">
        <template v-if="search">No matches</template>
        <template v-else>The compendium has no creatures yet. <NuxtLink to="/compendium/sync">Sync it from Foundry</NuxtLink>.</template>
      </p>
      <p v-else-if="total > results.length" class="csl-hint" style="padding:8px 0">
        {{ results.length }} of {{ total }} — search to narrow down
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Compendium creatures and hazards to put on the map, with the weak/elite
 * switch. The encounter's Creatures tab (Prepare) and the quick add (Run).
 */
import { nextTick, onMounted, ref, toRef } from 'vue'
import { useCreatureSearch, otherGameTag, type CreatureOption } from '~/composables/useCreatureSearch'
import type { Adjustment } from '~/rules/combat'
import type { GameId } from '~/types/game'

const props = withDefaults(defineProps<{ game: GameId; draggable?: boolean; placeLabel?: string; limit?: number }>(), {
  draggable: false, placeLabel: 'Place on map', limit: 60,
})
const emit = defineEmits<{
  place: [creature: CreatureOption, adjustment: Adjustment | null]
  dragstart: [e: DragEvent, creature: CreatureOption]
  dragend: [e: DragEvent]
}>()

const adjustment = defineModel<Adjustment | null>('adjustment', { default: null })

const ADJUSTMENT_OPTIONS: { value: Adjustment | null; label: string }[] = [
  { value: null, label: 'Normal' },
  { value: 'weak', label: 'Weak' },
  { value: 'elite', label: 'Elite' },
]

const { search, results, total, loading, refresh } = useCreatureSearch(toRef(props, 'game'), { limit: props.limit, hazards: true, emptyLists: true })

const inputRef = ref<any>(null)
async function focus() {
  await nextTick()
  inputRef.value?.$el?.focus()
}

onMounted(() => { refresh(); focus() })

defineExpose({ focus, refresh })
</script>

<style scoped>
.csl { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.csl-search { margin-bottom: 8px; }
.csl-search :deep(input) { width: 100%; }
.csl-adjust { display: flex; gap: 4px; padding: 0 0 8px; }
.csl-adjust-btn {
  flex: 1; font-family: var(--font-head); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
  padding: 3px 0; border: 1px solid var(--parch-line); border-radius: 2px; background: transparent; color: var(--ink-faded); cursor: pointer;
}
.csl-adjust-btn--active { border-color: var(--gold); color: var(--ink); background: rgba(184,134,11,0.08); }
.csl-list { display: flex; flex-direction: column; flex: 1; overflow-y: auto; min-height: 0; }
.csl-chip { border: none; cursor: grab; }
.csl-chip:active { cursor: grabbing; }
.csl-chip--static, .csl-chip--static:active { cursor: default; }
.csl-thumb {
  width: 26px; height: 26px; border-radius: 50%; background: var(--parch-dark);
  display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;
}
.csl-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.csl-initial { font-family: var(--font-head); font-size: 11px; color: var(--blood); }
.csl-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.csl-name { font-family: var(--font-body); font-size: 14px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.csl-type { font-family: var(--font-head); font-size: 8px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-ghost); }
.csl-hint { font-family: var(--font-ui); font-size: 10px; color: var(--ink-ghost); margin-top: 4px; line-height: 1.5; }
</style>
