<template>
  <div class="ws-root">
    <div class="ws-meta">
      <span v-if="session.sessionNumber" class="ws-tag">Session {{ session.sessionNumber }}</span>
      <span v-if="session.date" class="ws-tag">{{ session.date }}</span>
      <span v-if="session.mode" :class="['ws-tag', `ws-tag--${session.mode}`]">{{ session.mode }}</span>
      <span class="ws-spacer" />
      <NuxtLink class="ws-open" :to="`/campaign/${entity.campaignId}/sessions/${entity.id}`">Open board →</NuxtLink>
    </div>
    <div class="ws-body">
      <div class="ws-col">
        <div class="ws-label">Plan</div>
        <div v-for="p in plan" :key="p.id" class="ws-row" :class="{ 'ws-row--done': TOUCHED.has(p.status ?? '') }">
          <span class="ws-kind" :style="{ color: PANEL_KINDS[p.kind].color }">{{ PANEL_KINDS[p.kind].label }}</span>
          <span class="ws-text">{{ p.title || 'Untitled' }}</span>
          <span v-if="p.status" class="ws-status">{{ p.status }}</span>
        </div>
        <p v-if="!plan.length" class="ws-empty">Nothing planned on the board yet.</p>
      </div>
      <div class="ws-col">
        <div class="ws-label">Latest logs</div>
        <div v-for="l in logs" :key="l.id" class="ws-log" :style="{ '--log': LOG_TYPE_COLORS[(l.attrs.logType as LogType) ?? 'happened'] }">
          <div v-if="l.title" class="ws-log-title">{{ l.title }}</div>
          <div v-if="l.content" class="ws-log-text md-content" v-html="render(l.content)" />
        </div>
        <p v-if="!logs.length" class="ws-empty">Nothing logged yet.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The GM screen's session widget: a read-only summary of the session board
 * (SESSION_BOARD_PLAN.md). Planning and logging happen on the board itself.
 */
import type { Entity } from '~/composables/useEntities'
import type { SessionAttributes } from '~/types/entities'
import { getDb, type DbSessionPanel } from '~/composables/useDb'
import { useEntityMarkdown } from '~/composables/useEntityMarkdown'
import { useEntityRendering } from '~/composables/useEntityRendering'
import { LOG_TYPE_COLORS, PANEL_KINDS, logsInOrder, type LogType, type SessionBoardEdge } from '~/utils/sessionBoard'

const props = defineProps<{ entity: Entity }>()
// Sessions have a mode (planning/running/finished), not a status
const session = computed(() => (props.entity.attributes ?? {}) as SessionAttributes & { board?: { edges?: SessionBoardEdge[] } })

const TOUCHED = new Set(['played', 'continued', 'done', 'revealed', 'awarded', 'skipped'])
const PLAN_KINDS = new Set(['scene', 'beat', 'clue', 'encounter', 'reward'])

const panels = ref<DbSessionPanel[]>([])
async function load() {
  panels.value = await getDb().sessionPanels.where('session_id').equals(props.entity.id).toArray()
}
watch(() => [props.entity.id, props.entity.updatedAt], load, { immediate: true })

const plan = computed(() => panels.value.filter(p => PLAN_KINDS.has(p.kind)).sort((a, b) => a.y - b.y || a.x - b.x))
const logs = computed(() => logsInOrder(panels.value, session.value.board?.edges ?? []).map(o => o.log).slice(-5).reverse())

const { renderMarkdown } = useEntityMarkdown()
const { entityLookup } = useEntityRendering(() => props.entity.campaignId)
function render(content: string) {
  return renderMarkdown(content, { rich: true, entityLookup })
}
</script>

<style scoped>
.ws-root { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.ws-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 8px 12px 6px; flex-shrink: 0; border-bottom: 1px solid var(--border); }
.ws-spacer { flex: 1; }
.ws-open { font-size: 11.5px; font-weight: 600; color: var(--accent-l); text-decoration: none; }
.ws-open:hover { opacity: 0.8; }
.ws-tag {
  font-size: 9.5px; font-family: var(--fm); font-weight: 500;
  padding: 2px 7px; border-radius: 99px;
  background: var(--surface-hi); border: 1px solid var(--border);
  color: var(--text2); text-transform: uppercase; letter-spacing: 0.05em;
}
.ws-tag--planning { color: oklch(78% 0.16 75); border-color: oklch(78% 0.16 75/0.35); background: oklch(78% 0.16 75/0.08); }
.ws-tag--finished { color: var(--success); border-color: color-mix(in oklch, var(--success) 30%, transparent); background: color-mix(in oklch, var(--success) 8%, transparent); }
.ws-tag--running  { color: var(--accent); border-color: var(--accent-bg); background: var(--accent-bg); }

.ws-body { flex: 1; min-height: 0; display: flex; gap: 14px; padding: 8px 12px; overflow: hidden; }
.ws-col { flex: 1; min-width: 0; overflow-y: auto; }
.ws-label { font-size: 9.5px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text3); margin-bottom: 4px; }
.ws-row { display: flex; align-items: baseline; gap: 8px; padding: 2px 0; font-size: 12px; }
.ws-row--done .ws-text { opacity: 0.55; }
.ws-kind { width: 62px; flex-shrink: 0; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; }
.ws-text { flex: 1; min-width: 0; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ws-status { font-size: 10px; color: var(--text3); }
.ws-log { border-left: 2px solid var(--log); padding-left: 8px; margin-bottom: 7px; }
.ws-log-title { font-size: 12px; font-weight: 600; color: var(--text); }
.ws-log-text { font-size: 12px; color: var(--text2); line-height: 1.45; }
.ws-log-text :deep(p) { margin: 0 0 3px; }
.ws-empty { font-size: 11.5px; color: var(--text3); margin: 0; }
</style>
