<script setup lang="ts">
/** An entry on a graph: picture, name and its facts; the GM can hide the node or single facts from the players. */
import { Handle, Position } from '@vue-flow/core'
import { Eye, EyeOff, X } from 'lucide-vue-next'
import type { Entry } from '@/domain/schema'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'
import EntryThumb from './EntryThumb.vue'
import { entryFacts } from './facts'

export interface GraphNodeData {
  entry: Entry
  player: boolean
  /** Show the entry's facts under its name. */
  facts: boolean
  playerHidden: boolean
  hiddenAttrs: string[]
  onOpen: () => void
  onRemove: () => void
  onToggleHidden: () => void
  onToggleAttr: (label: string) => void
}

const props = defineProps<{ data: GraphNodeData }>()
const facts = () => (props.data.facts ? entryFacts(props.data.entry).slice(0, 4).filter(([k]) => !props.data.player || !props.data.hiddenAttrs.includes(k)) : [])
</script>

<template>
  <div class="node" :class="{ hidden: data.playerHidden }" :style="{ '--type': ENTRY_TYPE_INFO[data.entry.type].color }" @dblclick="data.onOpen">
    <Handle type="target" :position="Position.Top" />
    <div class="head">
      <EntryThumb :entry="data.entry" />
      <div class="name">{{ data.entry.name }}<div class="type">{{ ENTRY_TYPE_INFO[data.entry.type].label }}</div></div>
      <template v-if="!data.player">
        <button class="mini nodrag" :title="data.playerHidden ? 'Show to players' : 'Hide from players'" @click.stop="data.onToggleHidden"><component :is="data.playerHidden ? EyeOff : Eye" :size="12" /></button>
        <button class="mini nodrag" title="Take off this graph" @click.stop="data.onRemove"><X :size="12" /></button>
      </template>
    </div>
    <div v-for="[k, v] in facts()" :key="k" class="fact" :class="{ off: data.hiddenAttrs.includes(k) }">
      <span class="k">{{ k }}</span><span class="v">{{ v }}</span>
      <button v-if="!data.player" class="mini nodrag" :title="data.hiddenAttrs.includes(k) ? 'Show to players' : 'Hide from players'" @click.stop="data.onToggleAttr(k)"><component :is="data.hiddenAttrs.includes(k) ? EyeOff : Eye" :size="10" /></button>
    </div>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.node { width: 210px; background: var(--bg-raised); border: 1px solid color-mix(in srgb, var(--type) 55%, var(--line)); border-top: 3px solid var(--type); border-radius: var(--radius); box-shadow: var(--shadow); font-size: .85rem; }
.node.hidden { opacity: .5; border-style: dashed; }
.head { display: flex; align-items: center; gap: .5rem; padding: .45rem .5rem; }
.name { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.type { font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; color: var(--type); font-weight: 400; }
.fact { display: flex; gap: .5rem; padding: .12rem .5rem; border-top: var(--frame); align-items: center; }
.fact.off { opacity: .45; }
.k { color: var(--text-faint); font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; width: 64px; flex: none; }
.v { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini { background: none; border: 0; padding: 2px; color: var(--text-faint); display: grid; }
.mini:hover { color: var(--text); }
</style>
