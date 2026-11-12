<script setup lang="ts">
/**
 * One graph: entries as nodes, their text links as thin "mention" lines and
 * hand-drawn connections with labels. Shared by the GM page and the players'
 * window (which shows no hidden nodes or facts and changes nothing).
 */
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { MarkerType, VueFlow, type Connection, type Edge, type Node, type NodeTypesObject } from '@vue-flow/core'
import { computed, markRaw, ref } from 'vue'
import type { Entry, Graph, GraphEdge } from '@/domain/schema'
import { graphs } from '@/data/graphs'
import { entries } from '@/data/repo'
import { useLive } from '@/ui/useLive'
import { peek } from '@/ui/workbench'
import GraphNode, { type GraphNodeData } from './GraphNode.vue'

const props = withDefaults(defineProps<{ graph: Graph; player?: boolean; mentions?: boolean; facts?: boolean }>(), { player: false, mentions: true, facts: false })
const emit = defineEmits<{ edge: [edge: GraphEdge]; connect: [sourceEntryId: string, targetEntryId: string] }>()
// Vue Flow types node components by its own NodeProps; ours takes only `data`
const nodeTypes = { entry: markRaw(GraphNode) } as unknown as NodeTypesObject

const shown = computed(() => props.graph.nodes.filter(n => !props.player || !n.playerHidden))
const ids = computed(() => shown.value.map(n => n.entryId))
const rows = useLive(async () => new Map((await Promise.all(ids.value.map(id => entries.get(id)))).filter((e): e is Entry => !!e).map(e => [e.id, e])), new Map<string, Entry>(), [() => ids.value.join('|')])
const manual = useLive(() => graphs.edges(props.graph.campaignId), [], [() => props.graph.campaignId])
const mentionLinks = useLive(() => graphs.mentions(ids.value), [], [() => ids.value.join('|')])

const nodes = computed<Node<GraphNodeData>[]>(() => shown.value.flatMap((n) => {
  const entry = rows.value.get(n.entryId)
  if (!entry) return []
  return [{
    id: n.entryId, type: 'entry', position: { x: n.x, y: n.y }, draggable: !props.player, connectable: !props.player,
    data: {
      entry, player: props.player, facts: props.facts, playerHidden: n.playerHidden, hiddenAttrs: n.hiddenAttrs,
      onOpen: () => { if (!props.player) peek({ kind: 'entry', id: entry.id }) },
      onRemove: () => void graphs.patch(props.graph.id, (g) => { g.nodes = g.nodes.filter(x => x.entryId !== entry.id) }),
      onToggleHidden: () => void graphs.patch(props.graph.id, (g) => { for (const x of g.nodes) if (x.entryId === entry.id) x.playerHidden = !x.playerHidden }),
      onToggleAttr: (label: string) => void graphs.patch(props.graph.id, (g) => {
        for (const x of g.nodes) if (x.entryId === entry.id) x.hiddenAttrs = x.hiddenAttrs.includes(label) ? x.hiddenAttrs.filter(a => a !== label) : [...x.hiddenAttrs, label]
      }),
    },
  }]
}))

const STYLE = { default: 'default', straight: 'straight', step: 'step', smoothstep: 'smoothstep' } as const
const edges = computed<Edge[]>(() => {
  const on = new Set(ids.value)
  const out: Edge[] = manual.value.filter(e => on.has(e.sourceEntryId) && on.has(e.targetEntryId)).map(e => ({
    id: e.id, source: e.sourceEntryId, target: e.targetEntryId, label: e.label || undefined, type: STYLE[e.style],
    style: { stroke: e.color ?? 'var(--text-dim)', strokeWidth: 2 }, data: e,
    markerEnd: e.direction === 'none' ? undefined : MarkerType.ArrowClosed, markerStart: e.direction === 'two-way' ? MarkerType.ArrowClosed : undefined,
  }))
  if (props.mentions) {
    const seen = new Set(out.map(e => [e.source, e.target].sort().join('|')))
    for (const l of mentionLinks.value) {
      const key = [l.sourceId, l.targetEntryId].sort().join('|')
      if (seen.has(key) || !l.targetEntryId) continue
      seen.add(key)
      out.push({ id: `m:${key}`, source: l.sourceId, target: l.targetEntryId, style: { stroke: 'var(--line-strong)', strokeDasharray: '4 4' }, selectable: false })
    }
  }
  return out
})

const flow = ref<InstanceType<typeof VueFlow> | null>(null)
function onDragStop(e: { nodes: Node[] }) {
  const moved = new Map(e.nodes.map(n => [n.id, n.position]))
  void graphs.patch(props.graph.id, (g) => { for (const n of g.nodes) { const p = moved.get(n.entryId); if (p) { n.x = p.x; n.y = p.y } } })
}
function onMoveEnd(e: { flowTransform: { x: number; y: number; zoom: number } }) {
  if (!props.player) void graphs.patch(props.graph.id, (g) => { g.viewport = { x: e.flowTransform.x, y: e.flowTransform.y, zoom: e.flowTransform.zoom } })
}
const onConnect = (c: Connection) => { if (c.source && c.target && c.source !== c.target) emit('connect', c.source, c.target) }
const onEdgeClick = (e: { edge: Edge }) => { if (!props.player && e.edge.data) emit('edge', e.edge.data as GraphEdge) }
</script>

<template>
  <VueFlow ref="flow" class="graph" :nodes="nodes" :edges="edges" :node-types="nodeTypes" :default-viewport="graph.viewport" :min-zoom="0.1" :max-zoom="2.5"
    :nodes-connectable="!player" :elements-selectable="!player" @node-drag-stop="onDragStop" @move-end="onMoveEnd" @connect="onConnect" @edge-click="onEdgeClick" />
</template>

<style>
.graph { background: var(--bg-sunken); }
.graph .vue-flow__edge-textbg { fill: var(--bg-raised); }
.graph .vue-flow__edge-text { fill: var(--text); font-size: 11px; }
.graph .vue-flow__handle { width: 9px; height: 9px; background: var(--line-strong); border-color: var(--bg); }
</style>
