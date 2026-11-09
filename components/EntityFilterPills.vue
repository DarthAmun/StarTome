<template>
  <div ref="rootRef" class="efp" :class="`efp--${size}`">
    <div v-for="f in browse.def.filters" :key="f.key" class="efp-wrap">
      <button
        class="efp-pill"
        :class="{ active: (browse.state.filters[f.key]?.length ?? 0) > 0 }"
        @click="openKey = openKey === f.key ? null : f.key"
      >
        {{ f.label }}
        <span v-if="browse.state.filters[f.key]?.length" class="efp-badge">{{ browse.state.filters[f.key].length }}</span>
        <OhVueIcon v-if="size === 'md'" name="md-arrowdropdown" scale="0.8" class="efp-caret" />
      </button>
      <div v-if="openKey === f.key" class="efp-menu">
        <button
          v-for="o in openOptions"
          :key="o.value"
          class="efp-opt"
          :class="{ dim: !o.count }"
          @click="browse.toggleFilter(f.key, o.value)"
        >
          <span class="efp-box" :class="{ on: o.selected }">{{ o.selected ? '✓' : '' }}</span>
          <span class="efp-label">{{ o.value }}</span>
          <span class="efp-count">{{ o.count }}</span>
        </button>
        <p v-if="!openOptions.length" class="efp-empty">No values yet</p>
      </div>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { useEntityBrowse } from '~/composables/useEntityBrowse'

const props = withDefaults(defineProps<{ browse: ReturnType<typeof useEntityBrowse>; size?: 'sm' | 'md' }>(), { size: 'md' })

const rootRef = ref<HTMLElement | null>(null)
const openKey = ref<string | null>(null)
// Options only for the open menu, computed once per change
const openOptions = computed(() => openKey.value ? props.browse.filterOptions(openKey.value) : [])

onClickOutside(rootRef, () => { openKey.value = null })
onKeyStroke('Escape', () => { openKey.value = null })
</script>

<style scoped>
.efp { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
/* In the overview header the pills flow inline with the search field */
.efp--md { display: contents; }
.efp-wrap { position: relative; }
.efp-pill {
  display: flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 8px 0 12px;
  border: 1px solid var(--border-hi); border-radius: 15px;
  background: transparent; color: var(--text2);
  font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap;
}
.efp-pill:hover { border-color: var(--text3); }
.efp-pill.active { background: var(--accent-bg); border-color: color-mix(in srgb, var(--accent) 60%, transparent); color: var(--text); }
.efp-badge { min-width: 16px; height: 16px; border-radius: 8px; background: var(--accent); color: white; font-size: 10px; font-weight: 700; display: grid; place-items: center; }
.efp-caret { opacity: .6; }
.efp-menu {
  position: absolute; left: 0; top: calc(100% + 6px); z-index: 40;
  min-width: 210px; max-height: 320px; overflow: auto; padding: 5px;
  background: var(--surface-solid); border: 1px solid var(--border-hi); border-radius: 10px;
  box-shadow: var(--sh-lg);
}
.efp-opt {
  display: flex; align-items: center; gap: 9px; width: 100%; height: 30px; padding: 0 8px;
  border: 0; border-radius: 6px; background: transparent; color: var(--text);
  font: inherit; font-size: 12.5px; cursor: pointer; text-align: left;
}
.efp-opt:hover { background: var(--accent-bg); }
.efp-opt.dim { color: var(--text3); }
.efp-box { width: 14px; height: 14px; flex: none; border-radius: 4px; border: 1px solid var(--text3); display: grid; place-items: center; font-size: 10px; color: white; }
.efp-box.on { background: var(--accent); border-color: var(--accent); }
.efp-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.efp-count { font-size: 11px; color: var(--text3); font-variant-numeric: tabular-nums; }
.efp-empty { margin: 0; padding: 8px; color: var(--text3); font-size: 12px; }

/* Compact variant for the list column */
.efp--sm { gap: 5px; }
.efp--sm .efp-pill { height: 22px; padding: 0 8px; border-radius: 11px; font-size: 11px; gap: 5px; }
.efp--sm .efp-badge { min-width: 0; height: auto; background: none; color: var(--accent-l); }
.efp--sm .efp-menu { min-width: 180px; max-height: 280px; padding: 4px; border-radius: 9px; top: calc(100% + 5px); }
.efp--sm .efp-opt { height: 27px; font-size: 12px; gap: 8px; padding: 0 7px; }
.efp--sm .efp-box { width: 13px; height: 13px; border-radius: 3px; font-size: 9px; }
.efp--sm .efp-count { font-size: 10.5px; }
</style>
