<template>
  <div class="app-notices no-print" aria-live="polite">
    <div v-for="n in notices" :key="n.id" class="app-notice" :class="`app-notice--${n.kind}`" role="status">
      <span class="app-notice-msg">{{ n.message }}</span>
      <button v-if="n.action" class="app-notice-btn" @click="n.action.run()">{{ n.action.label }}</button>
      <button class="app-notice-close" title="Dismiss" @click="dismiss(n.id)">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNotices } from '~/composables/useNotices'
const { notices, dismiss } = useNotices()
</script>

<style scoped>
.app-notices {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}
.app-notice {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--surface2, #2a2020);
  color: var(--text, #eee);
  border-left: 4px solid var(--text3, #888);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  font-size: 0.85rem;
  line-height: 1.35;
}
.app-notice--error { border-left-color: var(--danger, #e05555); }
.app-notice--warning { border-left-color: var(--gold, #e8c44a); }
.app-notice--info { border-left-color: var(--success, #7cc44e); }
.app-notice-msg { flex: 1; }
.app-notice-btn {
  background: none;
  border: 1px solid currentColor;
  border-radius: 4px;
  color: inherit;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
}
.app-notice-close {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
}
.app-notice-close:hover { opacity: 1; }
</style>
