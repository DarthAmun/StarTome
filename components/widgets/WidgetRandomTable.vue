<template>
  <div class="wrt-body">
    <div class="wrt-header">
      <span class="wrt-title">{{ entity.name }}</span>
      <span v-if="attrs.die" class="wrt-die">{{ attrs.die }}</span>
      <button class="wrt-roll-btn" :disabled="!canRoll" @click="roll">🎲 Roll</button>
    </div>

    <div v-if="rollResult !== null" class="wrt-result" @click="onEntityClick">
      <span class="wrt-result-num">{{ rollResult.n }}</span>
      <span class="wrt-result-text" v-html="renderedResult" />
    </div>

    <div class="wrt-rows" @click="onEntityClick">
      <div v-if="!rows.length" class="wrt-empty">No rows defined.</div>
      <div v-for="(row, i) in rows" :key="i" :class="['wrt-row', { 'wrt-row--hit': rollResult && rollResult.n >= row.min && rollResult.n <= row.max }]">
        <span class="wrt-range">{{ row.min === row.max ? row.min : `${row.min}–${row.max}` }}</span>
        <span class="wrt-text" v-html="renderedRows[i]" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { rulesRefRoute } from '~/composables/useRules'
import type { Entity } from '~/composables/useEntities'
import type { RandomTableAttributes, RandomTableRow } from '~/types/entities'
import { ENTITY_TYPE_ROUTE } from '~/types/entities'
import { useEntities } from '~/composables/useEntities'
import { useEntityMarkdown } from '~/composables/useEntityMarkdown'
import { useEntityRendering } from '~/composables/useEntityRendering'

const props = defineProps<{ entity: Entity }>()

const store = useEntities()
const { renderInline } = useEntityMarkdown()
const { entityLookup, extraTypes, campaignSystemId, systemEntityTypes, campaignGameId } = useEntityRendering(() => props.entity.campaignId)
const router = useRouter()

async function onEntityClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('[data-entity-type]') as HTMLElement | null
  if (!el) return
  const type = el.dataset.entityType!
  const name = el.dataset.entityName!
  const ent = store.findByTypeAndName(type, name)
  if (ent) {
    const segment = ENTITY_TYPE_ROUTE[ent.type as keyof typeof ENTITY_TYPE_ROUTE]
    if (segment) router.push(`/campaign/${ent.campaignId}/${segment}/${ent.id}`)
    return
  }
  const rulesRoute = await rulesRefRoute(type, name, campaignGameId.value)
  if (rulesRoute) { router.push(rulesRoute); return }
  const sysType = systemEntityTypes.value.find(t => t.id.toLowerCase() === type.toLowerCase())
  if (sysType && campaignSystemId.value) {
    router.push(`/system/${campaignSystemId.value}/${sysType.id}?open=${encodeURIComponent(name)}`)
  }
}

const attrs = computed(() => (props.entity.attributes ?? {}) as RandomTableAttributes)
const rows = computed(() => attrs.value.rows ?? [] as RandomTableRow[])
const canRoll = computed(() => rows.value.length > 0)

const rollResult = ref<{ n: number; text: string } | null>(null)

const renderOpts = computed(() => ({ entityLookup, extraTypes: extraTypes.value }))
const renderedRows = computed(() => rows.value.map(r => renderInline(r.result, renderOpts.value)))
const renderedResult = computed(() => rollResult.value ? renderInline(rollResult.value.text, renderOpts.value) : '')

function roll() {
  const die = attrs.value.die ?? 'd20'
  const sides = parseInt(die.replace('d', ''))
  const n = Math.floor(Math.random() * sides) + 1
  const matched = rows.value.find(r => n >= r.min && n <= r.max)
  rollResult.value = { n, text: matched?.result ?? '—' }
}
</script>

<style scoped>
.wrt-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }

.wrt-header {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px; border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.wrt-title { flex: 1; font-size: 12px; font-weight: 700; color: var(--text); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wrt-die { font-family: var(--fm); font-size: 10px; font-weight: 700; color: #e8c44a; background: rgba(232,196,74,0.1); border: 1px solid rgba(232,196,74,0.3); border-radius: 4px; padding: 1px 6px; flex-shrink: 0; }
.wrt-roll-btn { padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 600; border: 1px solid var(--border); background: var(--bg); color: var(--text2); cursor: pointer; flex-shrink: 0; transition: all 0.1s; }
.wrt-roll-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-l); }
.wrt-roll-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.wrt-result {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; background: var(--accent-bg);
  border-bottom: 1px solid color-mix(in oklch, var(--accent) 30%, transparent);
  flex-shrink: 0;
}
.wrt-result-num { font-family: var(--fm); font-size: 16px; font-weight: 700; color: var(--accent-l); flex-shrink: 0; }
.wrt-result-text { font-size: 12px; color: var(--text); }

.wrt-rows { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 6px; }
.wrt-empty { padding: 12px; font-size: 11px; color: var(--text3); font-style: italic; text-align: center; }

.wrt-row {
  display: flex; align-items: baseline; gap: 6px;
  padding: 3px 6px; border-radius: 5px; transition: background 0.1s;
}
.wrt-row--hit { background: rgba(232,196,74,0.08); }
.wrt-range { font-family: var(--fm); font-size: 10px; font-weight: 700; color: var(--text3); min-width: 28px; flex-shrink: 0; }
.wrt-text { font-size: 11.5px; color: var(--text2); }
.wrt-row--hit .wrt-range { color: #e8c44a; }
.wrt-row--hit .wrt-text { color: var(--text); font-weight: 600; }
:deep(.entity-ref) { cursor: pointer; }
</style>
