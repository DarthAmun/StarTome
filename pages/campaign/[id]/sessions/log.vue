<template>
    <div class="sv-log">
        <div v-if="!logSessions.length" class="sv-empty">
            <OhVueIcon name="gi-book-aura" scale="2.5" style="opacity:0.1" />
            <span>No sessions recorded yet.</span>
        </div>
        <div v-for="sess in logSessions" :key="sess.id" class="slog-chapter">
            <div class="slog-header" @click="toggleExpand(sess.id)">
                <span class="slog-num">{{ attrsOf(sess).sessionNumber ? 'Session ' + attrsOf(sess).sessionNumber : '—' }}</span>
                <span class="slog-title">{{ sess.name }}</span>
                <span class="slog-spacer" />
                <span v-if="attrsOf(sess).date" class="slog-date">{{ formatSessionDate(attrsOf(sess).date!) }}</span>
                <span
                    v-if="attrsOf(sess).mode"
                    class="slog-status"
                    :style="{ color: sessionStatusColor(attrsOf(sess).mode), borderColor: sessionStatusColor(attrsOf(sess).mode) + '55' }"
                >{{ attrsOf(sess).mode }}</span>
                <button class="slog-open" @click.stop="openEntry(sess)">Open →</button>
            </div>
            <div class="slog-body" :class="{ 'slog-body--expanded': expandedIds.has(sess.id) }">
                <template v-if="logsOf(sess).length">
                    <div
                        v-for="{ log, attachedTo } in logsOf(sess)"
                        :key="log.id"
                        class="slog-entry"
                        :style="{ '--log': LOG_TYPE_COLORS[logTypeOf(log)] }"
                    >
                        <div class="slog-entry-head">
                            <span class="slog-entry-type">{{ logTypeOf(log) }}</span>
                            <span v-if="attachedTo.length" class="slog-entry-anchor">↳ {{ attachedTo.map(p => p.title || PANEL_KINDS[p.kind].label).join(', ') }}</span>
                            <span v-if="log.attrs.playersShouldKnow" class="slog-entry-flag" title="Players should know">players should know</span>
                        </div>
                        <div v-if="log.title" class="slog-entry-title">{{ log.title }}</div>
                        <div v-if="log.content" class="slog-content" v-html="render(log.content)" />
                    </div>
                </template>
                <div v-else class="slog-no-notes">Nothing logged for this session.</div>

                <div v-if="expandedIds.has(sess.id) && planOf(sess).length" class="slog-plan">
                    <div class="slog-plan-label">Plan</div>
                    <div v-for="p in planOf(sess)" :key="p.id" class="slog-plan-row">
                        <span class="slog-plan-kind" :style="{ color: PANEL_KINDS[p.kind].color }">{{ PANEL_KINDS[p.kind].label }}</span>
                        <span class="slog-plan-title" :class="{ 'slog-plan-title--skipped': p.status === 'skipped' }">{{ p.title || 'Untitled' }}</span>
                        <span v-if="p.status" class="slog-plan-status">{{ p.status }}</span>
                    </div>
                </div>
                <div v-if="!expandedIds.has(sess.id) && (logsOf(sess).length || planOf(sess).length)" class="slog-fade" />
            </div>
            <button
                v-if="logsOf(sess).length || planOf(sess).length"
                class="slog-expand-btn"
                @click="toggleExpand(sess.id)"
            >{{ expandedIds.has(sess.id) ? '▲ Collapse' : '▼ Read more' }}</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useEntityMarkdown } from '~/composables/useEntityMarkdown'
import { useEntities, type Entity } from '~/composables/useEntities'
import { useEntityRendering } from '~/composables/useEntityRendering'
import { getDb, type DbSessionPanel } from '~/composables/useDb'
import { LOG_TYPE_COLORS, PANEL_KINDS, logsInOrder, type LogType, type SessionBoardEdge } from '~/utils/sessionBoard'
import type { SessionAttributes } from '~/types/entities'

const route = useRoute()
const router = useRouter()
const store = useEntities()

const campaignId = computed(() => Number(route.params.id))

const { renderMarkdown } = useEntityMarkdown()
const { entityLookup } = useEntityRendering(campaignId)

const attrsOf = (s: Entity) => (s.attributes ?? {}) as SessionAttributes & { board?: { edges?: SessionBoardEdge[] } }

const logSessions = computed(() => {
    const sessions = store.byType.session ?? []
    return [...sessions].sort((a, b) => {
        const na = parseInt(attrsOf(a).sessionNumber ?? '', 10)
        const nb = parseInt(attrsOf(b).sessionNumber ?? '', 10)
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb
        return a.id - b.id
    })
})

// Every board of the campaign, by session
const panelsBySession = ref(new Map<number, DbSessionPanel[]>())
async function loadPanels() {
    const rows = await getDb().sessionPanels.where('campaign_id').equals(campaignId.value).toArray()
    const map = new Map<number, DbSessionPanel[]>()
    for (const p of rows) {
        if (p.session_id == null) continue
        if (!map.has(p.session_id)) map.set(p.session_id, [])
        map.get(p.session_id)!.push(p)
    }
    panelsBySession.value = map
}

function logsOf(s: Entity) {
    return logsInOrder(panelsBySession.value.get(s.id) ?? [], attrsOf(s).board?.edges ?? [])
}

const PLAN_KINDS = new Set(['scene', 'beat', 'clue', 'encounter', 'reward'])
function planOf(s: Entity) {
    return (panelsBySession.value.get(s.id) ?? [])
        .filter(p => PLAN_KINDS.has(p.kind))
        .sort((a, b) => a.y - b.y || a.x - b.x)
}

const logTypeOf = (p: DbSessionPanel) => ((p.attrs.logType as LogType) ?? 'happened')

const expandedIds = ref<Set<number>>(new Set())

function toggleExpand(id: number) {
    const s = new Set(expandedIds.value)
    s.has(id) ? s.delete(id) : s.add(id)
    expandedIds.value = s
}

function render(content: string): string {
    return renderMarkdown(content || '', { rich: true, entityLookup })
}

function sessionStatusColor(mode: string | undefined): string {
    return ({ planning: '#6b9fe8', running: 'var(--success)', finished: '#b87de8' } as any)[mode ?? ''] ?? 'var(--text3)'
}

function formatSessionDate(dateStr: string): string {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
    return d.toLocaleDateString('en-US', opts)
}

function openEntry(sess: Entity) {
    router.push(`/campaign/${campaignId.value}/sessions/${sess.id}`)
}

onMounted(async () => {
    await Promise.all([store.loadAll(campaignId.value), loadPanels()])
})
</script>

<style scoped>
.sv-log {
    flex: 1;
    overflow-y: auto;
    padding: 20px 28px 40px;
}

.sv-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text3);
    font-size: 13px;
    font-style: italic;
    padding: 60px 0;
}

.slog-chapter {
    max-width: 720px;
    margin: 0 auto 8px;
    border: 1px solid var(--border);
    border-radius: var(--r2);
    background: var(--surface);
    overflow: hidden;
}

.slog-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 10px 14px;
    cursor: pointer;
    user-select: none;
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
}
.slog-header:hover { background: var(--surface-hi); }

.slog-num {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text3);
    flex-shrink: 0;
}
.slog-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}
.slog-spacer { flex: 1; min-width: 8px; }
.slog-date {
    font-size: 10px;
    letter-spacing: 0.07em;
    color: var(--text3);
    flex-shrink: 0;
}
.slog-status {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: var(--r4);
    border: 1px solid;
    flex-shrink: 0;
}
.slog-open {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent-l);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: opacity 0.12s;
}
.slog-open:hover { opacity: 0.75; }

.slog-body {
    position: relative;
    max-height: 110px;
    overflow: hidden;
    transition: max-height 0.3s ease;
    padding: 12px 14px 0;
}
.slog-body--expanded { max-height: 3000px; }

.slog-fade {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 50px;
    background: linear-gradient(transparent, var(--surface));
    pointer-events: none;
}

.slog-content {
    font-size: 13px;
    line-height: 1.7;
    color: var(--text2);
    padding-bottom: 12px;
}
.slog-content :deep(p) { margin: 0 0 0.5em; }
.slog-content :deep(h1), .slog-content :deep(h2), .slog-content :deep(h3) {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: var(--text3); margin: 0.8em 0 0.3em;
}
.slog-content :deep(ul), .slog-content :deep(ol) { padding-left: 1.4em; margin: 0 0 0.5em; }
.slog-content :deep(li) { margin-bottom: 0.15em; }
.slog-content :deep(strong) { color: var(--text); font-weight: 600; }
.slog-content :deep(blockquote) {
    border-left: 2px solid var(--border-hi); padding-left: 10px;
    color: var(--text3); font-style: italic; margin: 0.4em 0;
}
.slog-content :deep(hr) { border: none; border-top: 1px solid var(--border); margin: 0.7em 0; }

.slog-no-notes { font-size: 12px; color: var(--text3); font-style: italic; padding: 12px 0; }

.slog-expand-btn {
    display: block;
    width: 100%;
    padding: 6px 14px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text3);
    background: var(--bg2);
    border: none;
    border-top: 1px solid var(--border);
    cursor: pointer;
    text-align: center;
    transition: color 0.12s, background 0.12s;
}
.slog-expand-btn:hover { color: var(--accent-l); background: var(--accent-bg); }

.slog-entry { border-left: 3px solid var(--log); padding: 2px 0 2px 10px; margin-bottom: 12px; }
.slog-entry-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.slog-entry-type { font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--log); }
.slog-entry-anchor { font-size: 11px; color: var(--text3); }
.slog-entry-flag { font-size: 9.5px; color: var(--text2); border: 1px solid var(--border-hi); border-radius: 99px; padding: 0 6px; }
.slog-entry-title { font-size: 13.5px; font-weight: 600; color: var(--text); margin: 2px 0; }
.slog-entry .slog-content { padding-bottom: 0; }
.slog-plan { border-top: 1px dashed var(--border); padding: 10px 0 12px; }
.slog-plan-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text3); margin-bottom: 6px; }
.slog-plan-row { display: flex; gap: 10px; align-items: baseline; font-size: 12.5px; padding: 2px 0; }
.slog-plan-kind { width: 74px; flex-shrink: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
.slog-plan-title { color: var(--text2); }
.slog-plan-title--skipped { text-decoration: line-through; opacity: 0.6; }
.slog-plan-status { margin-left: auto; font-size: 10.5px; color: var(--text3); }
</style>
