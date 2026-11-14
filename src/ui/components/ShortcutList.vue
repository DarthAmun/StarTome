<script setup lang="ts">
/** The shortcut list, in columns. */
import { SHORTCUTS } from '@/ui/shortcuts'
</script>

<template>
  <div class="groups">
    <section v-for="g in SHORTCUTS" :key="g.where">
      <h3>{{ g.where }}</h3>
      <dl>
        <template v-for="[keys, does] in g.keys" :key="keys"><dt><span class="kbd">{{ keys }}</span></dt><dd>{{ does }}</dd></template>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.groups { columns: 2 320px; column-gap: 2rem; }
section { break-inside: avoid; margin-bottom: 1.1rem; }
h3 { color: var(--accent); margin-bottom: .4rem; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: .3rem .8rem; margin: 0; align-items: baseline; }
dd { margin: 0; color: var(--text-dim); font-size: .92rem; }
.kbd { white-space: nowrap; }
</style>
