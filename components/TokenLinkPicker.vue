<template>
  <div>
    <label class="f-label">{{ label }} <span class="tlp-hint">{{ hint }}</span></label>
    <div v-if="selected" class="tlp-row">
      <span class="tlp-badge" :style="accent ? { color: accent } : undefined">{{ selected }}</span>
      <button class="tlp-clear" @click="$emit('clear')">× Clear</button>
    </div>
    <div v-else>
      <InputText
        :model-value="search"
        :placeholder="placeholder"
        style="width:100%"
        @update:model-value="$emit('update:search', $event ?? '')"
        @focus="$emit('focus')"
      />
      <div v-if="results.length" class="tlp-dropdown">
        <button v-for="r in results" :key="r.id" class="tlp-option" @click="$emit('select', r.id)">
          <span class="tlp-tag">{{ r.tag }}</span>
          {{ r.name }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Linked-entry picker for the token library modals: shows the linked name
 *  with a clear button, or a search field with a result dropdown. */
defineProps<{
  label: string
  hint: string
  placeholder: string
  selected: string | null
  search: string
  results: Array<{ id: number | string; name: string; tag: string }>
  accent?: string
}>()
defineEmits<{ 'update:search': [value: string]; focus: []; select: [id: number | string]; clear: [] }>()
</script>

<style scoped>
.tlp-hint {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--ink-ghost);
  font-style: italic;
}
.tlp-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 4px 0; }
.tlp-badge { flex: 1; font-family: var(--font-body); font-size: 13px; color: var(--ink); font-style: italic; }
.tlp-clear {
  background: none;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 2px 7px;
  cursor: pointer;
  color: var(--ink-ghost);
  transition: color 0.15s, border-color 0.15s;
}
.tlp-clear:hover { color: var(--blood); border-color: var(--blood); }
.tlp-dropdown {
  border: 1px solid var(--parch-line);
  border-top: none;
  background: var(--parch);
  border-radius: 0 0 2px 2px;
  max-height: 140px;
  overflow-y: auto;
}
.tlp-option {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 10px;
  background: none; border: none; text-align: left;
  font-family: var(--font-body); font-size: 13px; color: var(--ink); cursor: pointer;
}
.tlp-option:hover { background: var(--accent-bg); }
.tlp-tag { font-size: 10px; color: var(--ink-ghost); text-transform: uppercase; letter-spacing: 0.05em; }
</style>
