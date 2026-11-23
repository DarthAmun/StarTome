<script setup lang="ts">
/**
 * A compass rose in a corner of the map, as on printed maps. It sits on the
 * screen, not on the map: maps don't rotate, so north is always up. It only
 * shows; clicks go through it to the map.
 */
</script>

<template>
  <svg class="compass" viewBox="-50 -50 100 100" aria-hidden="true" data-test="map-compass">
    <circle r="31" class="ring" />
    <path d="M0,-34 L7,-7 L0,0 Z" class="lit" /><path d="M0,-34 L-7,-7 L0,0 Z" class="dark" />
    <path d="M34,0 L7,7 L0,0 Z" class="lit" /><path d="M34,0 L7,-7 L0,0 Z" class="dark" />
    <path d="M0,34 L-7,7 L0,0 Z" class="lit" /><path d="M0,34 L7,7 L0,0 Z" class="dark" />
    <path d="M-34,0 L-7,-7 L0,0 Z" class="lit" /><path d="M-34,0 L-7,7 L0,0 Z" class="dark" />
    <path d="M0,-34 L7,-7 L0,0 Z" class="north" />
    <text y="-38" class="n">N</text><text x="41" y="0">E</text><text y="41">S</text><text x="-41" y="0">W</text>
  </svg>
</template>

<style scoped>
.compass { position: absolute; right: .7rem; bottom: .7rem; z-index: 3; width: 76px; height: 76px; pointer-events: none; user-select: none; opacity: .82; filter: drop-shadow(0 1px 2px rgb(0 0 0 / .7)); }
.ring { fill: rgb(10 10 22 / .45); stroke: #c9b27a; stroke-width: 1.2; }
.lit { fill: #e8e2cc; } .dark { fill: #8a7a52; } .north { fill: #c94a3a; }
text { fill: #e8e2cc; font: 700 12px var(--font-title, serif); text-anchor: middle; dominant-baseline: central; }
text.n { fill: #f0d68a; }
</style>
