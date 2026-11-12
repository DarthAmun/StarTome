<template>
  <div class="wsearch-body">
    <button class="wsearch-btn" @click="open = true">
      <OhVueIcon name="fa-search" scale="0.85" class="wsearch-icon" />
      <span class="wsearch-label">Global Search</span>
      <span class="wsearch-hint">{{ isMac ? '⌘K' : 'Ctrl+K' }}</span>
    </button>
    <p class="wsearch-hint-text">Search campaigns, entities, records — or type <kbd>&gt;</kbd> for commands.</p>
  </div>
</template>

<script setup lang="ts">
import { useGlobalSearch } from '~/composables/useGlobalSearch'

const { open } = useGlobalSearch()
const isMac = import.meta.client && navigator.platform.includes('Mac')
</script>

<style scoped>
.wsearch-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; flex: 1; justify-content: center; }
.wsearch-btn {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 12px; border-radius: 8px; width: 100%;
  background: var(--surface); border: 1px solid var(--border-hi);
  text-align: left; cursor: pointer; transition: all 0.12s;
}
.wsearch-btn:hover { background: var(--surface-hi); border-color: color-mix(in oklch, var(--accent) 40%, transparent); }
.wsearch-icon { color: var(--text3); flex-shrink: 0; }
.wsearch-label { flex: 1; font-size: 13px; color: var(--text2); }
.wsearch-hint { font-family: var(--fm); font-size: 10px; color: var(--text3); flex-shrink: 0; }
.wsearch-hint-text { font-size: 11px; color: var(--text3); line-height: 1.5; text-align: center; }
.wsearch-hint-text kbd {
  background: var(--surface-hi); border: 1px solid var(--border);
  padding: 0 4px; border-radius: 3px; font-size: 10px; color: var(--text2);
}
</style>
