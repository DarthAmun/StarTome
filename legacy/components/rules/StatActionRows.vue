<template>
  <div class="sar">
    <div v-for="(a, i) in rows" :key="i" class="sar-item">
      <div class="sar-row">
        <input class="sar-input sar-name" :value="a.name" placeholder="Name" @change="edit(i, 'name', val($event))" />
        <input class="sar-input sar-cost" :value="costText(a.cost)" placeholder="◆ / 2 / reaction" title="Actions" @change="edit(i, 'cost', parseActionCost(val($event)))" />
        <select v-if="withSection" class="sar-input sar-section" :value="a.section" @change="edit(i, 'section', val($event))">
          <option value="interaction">Interaction</option>
          <option value="defensive">Defensive</option>
          <option value="offensive">Offensive</option>
        </select>
        <input class="sar-input sar-traits" :value="a.traits.join(', ')" placeholder="traits" @change="edit(i, 'traits', parseTraits(val($event)))" />
        <button class="sar-x" title="Remove" @click="emit('update', rows.filter((_, j) => j !== i))">✕</button>
      </div>
      <textarea class="sar-input" rows="2" :value="a.text" placeholder="What it does (markdown)" @change="edit(i, 'text', val($event))" />
    </div>
    <button class="btn btn-ghost btn-sm" @click="emit('update', [...rows, { name: '', cost: 1, section: 'offensive', traits: [], text: '' }])">+ Action</button>
  </div>
</template>

<script setup lang="ts">
import { formatActionCost, parseActionCost } from '~/rules/format'
import { parseTraits } from '~/rules/parse'
import type { ActionCost, StatAction } from '~/types/rules'

const props = defineProps<{ rows: StatAction[]; withSection?: boolean }>()
const emit = defineEmits<{ update: [rows: StatAction[]] }>()

const val = (e: Event) => (e.target as HTMLInputElement).value

function edit(i: number, key: keyof StatAction, value: unknown) {
  emit('update', props.rows.map((r, j) => j === i ? { ...r, [key]: value } : r))
}

function costText(cost: ActionCost) {
  if (cost === null || cost === undefined || cost === 'passive') return ''
  if (typeof cost === 'object' && 'text' in cost) return cost.text
  return formatActionCost(cost)
}
</script>

<style scoped>
.sar { display: flex; flex-direction: column; gap: 6px; }
.sar-item { display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--border); border-radius: 6px; }
.sar-row { display: flex; gap: 6px; align-items: center; }
.sar-input {
  background: var(--parch-dark); border: 1px solid var(--border-hi); border-radius: 5px;
  padding: 5px 8px; color: var(--text); font-size: 13px; font-family: var(--fu); min-width: 0;
}
.sar-input:focus { outline: none; border-color: var(--accent); }
textarea.sar-input { resize: vertical; width: 100%; }
.sar-name { flex: 1.3; }
.sar-cost { flex: 0 0 110px; }
.sar-section { flex: 0 0 120px; }
.sar-traits { flex: 1; }
.sar-x { background: none; border: none; color: var(--text3); cursor: pointer; padding: 4px 6px; }
.sar-x:hover { color: var(--danger, #e05555); }
</style>
