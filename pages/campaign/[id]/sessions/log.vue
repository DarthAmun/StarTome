<template>
    <div class="sv-log">
        <div v-if="!logSessions.length" class="sv-empty">
            <OhVueIcon name="gi-book-aura" scale="2.5" style="opacity:0.1" />
            <span>No sessions recorded yet.</span>
        </div>
        <div v-for="sess in logSessions" :key="sess.id" class="slog-chapter">
            <div class="slog-header" @click="toggleExpand(sess.id)">
                <span class="slog-num">{{ (sess.attributes as any)?.sessionNumber ? 'Session ' + (sess.attributes as any).sessionNumber : '—' }}</span>
                <span class="slog-title">{{ sess.name }}</span>
                <span class="slog-spacer" />
                <span v-if="(sess.attributes as any)?.date" class="slog-date">{{ formatSessionDate((sess.attributes as any).date) }}</span>
                <span
                    v-if="(sess.attributes as any)?.mode"
                    class="slog-status"
                    :style="{ color: sessionStatusColor((sess.attributes as any)?.mode), borderColor: sessionStatusColor((sess.attributes as any)?.mode) + '55' }"
                >{{ (sess.attributes as any).mode }}</span>
                <button class="slog-open" @click.stop="openEntry(sess)">Open →</button>
            </div>
            <div class="slog-body" :class="{ 'slog-body--expanded': expandedIds.has(sess.id) }">
                <div
                    v-if="(sess.attributes as any)?.scriptContent"
                    class="slog-content"
                    v-html="renderSessionNotes((sess.attributes as any).scriptContent)"
                />
                <div v-else class="slog-no-notes">No script recorded for this session.</div>
                <div v-if="!expandedIds.has(sess.id) && (sess.attributes as any)?.scriptContent" class="slog-fade" />
            </div>
            <button
                v-if="(sess.attributes as any)?.scriptContent"
                class="slog-expand-btn"
                @click="toggleExpand(sess.id)"
            >{{ expandedIds.has(sess.id) ? '▲ Collapse' : '▼ Read more' }}</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useEntityMarkdown } from '~/composables/useEntityMarkdown'
import { useEntities } from '~/composables/useEntities'

const route = useRoute()
const router = useRouter()
const store = useEntities()

const campaignId = computed(() => Number(route.params.id))

const { renderMarkdown } = useEntityMarkdown()
const notesStore = useEntities()

const SESSION_TYPE_COLORS: Record<string, string> = {
    npc: '#7cc44e', location: '#a87de8', faction: '#e05555',
    quest: '#e8924a', event: '#4ab8e8', note: '#6b9fe8', session: '#b87de8',
}

function sessionEntityLookup(type: string, name: string) {
    const ent = notesStore.findByTypeAndName(type, name)
    if (!ent) return null
    return { color: SESSION_TYPE_COLORS[ent.type] ?? '#888' }
}

const logSessions = computed(() => {
    const sessions = store.byType.session ?? []
    return [...sessions].sort((a, b) => {
        const na = parseInt((a.attributes as any)?.sessionNumber ?? '', 10)
        const nb = parseInt((b.attributes as any)?.sessionNumber ?? '', 10)
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb
        return a.id - b.id
    })
})

const expandedIds = ref<Set<number>>(new Set())

function toggleExpand(id: number) {
    const s = new Set(expandedIds.value)
    s.has(id) ? s.delete(id) : s.add(id)
    expandedIds.value = s
}

function renderSessionNotes(content: string): string {
    return renderMarkdown(content || '', { rich: true, entityLookup: sessionEntityLookup })
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

function openEntry(sess: any) {
    router.push(`/campaign/${campaignId.value}/sessions/${sess.id}`)
}

onMounted(async () => {
    await store.loadAll(campaignId.value)
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
</style>
