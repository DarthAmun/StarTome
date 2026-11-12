<script setup lang="ts">
/** The tray: what you pinned for this campaign, one click away. Saved with the campaign and in every backup. */
import { Command, Dices } from 'lucide-vue-next'
import { dice } from '@/ui/dice'
import { ENTRY_TYPE_INFO, isEntryType } from '@/ui/entryTypes'
import { commandBarOpen, peek, pins, togglePin } from '@/ui/workbench'
</script>

<template>
  <footer class="tray">
    <button class="btn btn-ghost dice-btn" :class="{ on: dice.open }" title="Dice" @click="dice.open = !dice.open"><Dices :size="15" /> Dice</button>
    <span class="eyebrow">Tray</span>
    <span v-if="!pins.length" class="faint hint">Pin an entry from the dock to keep it here.</span>
    <button v-for="p in pins" :key="`${p.kind}:${p.id}`" class="pin" :style="{ '--c': isEntryType(p.type) ? ENTRY_TYPE_INFO[p.type].color : 'var(--accent-2)' }"
      :title="`${p.label} · right-click to unpin`" @click="peek({ kind: p.kind, id: p.id })" @contextmenu.prevent="togglePin(p)">
      <component :is="ENTRY_TYPE_INFO[p.type].icon" v-if="isEntryType(p.type)" :size="13" /> {{ p.label }}
    </button>
    <span class="grow" />
    <button class="btn btn-ghost search" @click="commandBarOpen = true"><Command :size="13" /> Search <span class="kbd">Ctrl K</span></button>
  </footer>
</template>

<style scoped>
.tray { grid-column: 2 / -1; display: flex; align-items: center; gap: .4rem; padding: 0 .8rem; border-top: var(--frame); background: var(--bg-sunken); overflow-x: auto; white-space: nowrap; }
.hint { font-size: .85rem; }
.pin { display: inline-flex; align-items: center; gap: .35rem; padding: .15rem .6rem; background: none; border: 1px solid color-mix(in srgb, var(--c) 45%, var(--line)); border-radius: var(--radius); color: var(--text-dim); }
.pin :deep(svg) { color: var(--c); }
.pin:hover { color: var(--text); border-color: var(--c); }
.grow { flex: 1; }
.search, .dice-btn { font-size: .85rem; }
.dice-btn.on { color: var(--accent); }
</style>
