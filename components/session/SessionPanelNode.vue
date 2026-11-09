<template>
    <NodeToolbar :is-visible="selected" :position="Position.Top">
        <div class="sp-toolbar">
            <button class="sp-tb-btn" title="Edit (double-click)" @click="data.onOpen()">
                <OhVueIcon name="md-edit" scale="0.7" /> Edit
            </button>
            <template v-if="cfg.statuses">
                <div class="sp-tb-sep" />
                <button
                    v-for="s in cfg.statuses"
                    :key="s"
                    class="sp-tb-btn"
                    :class="{ 'sp-tb-btn--on': panel.status === s }"
                    @click="data.onStatus(s)"
                >{{ s }}</button>
            </template>
            <template v-if="panel.kind === 'log'">
                <div class="sp-tb-sep" />
                <button
                    class="sp-tb-btn"
                    :class="{ 'sp-tb-btn--on': !!panel.attrs.playersShouldKnow }"
                    title="Players should know: comes up in the next session's recap"
                    @click="data.onToggleShouldKnow()"
                >
                    <OhVueIcon name="fa-eye" scale="0.65" /> Players
                </button>
            </template>
            <div class="sp-tb-sep" />
            <button v-if="panel.kind !== 'frame'" class="sp-tb-btn" title="Move to the campaign drawer" @click="data.onToDrawer()">
                <OhVueIcon name="md-folder" scale="0.7" /> Drawer
            </button>
            <button class="sp-tb-btn sp-tb-btn--danger" title="Delete panel" @click="data.onDelete()">
                <OhVueIcon name="md-delete" scale="0.7" />
            </button>
        </div>
    </NodeToolbar>

    <div
        class="sp-node"
        :class="[`sp-node--${panel.kind}`, `sp-status--${panel.status ?? 'none'}`, { 'sp-node--selected': selected }]"
        :style="{ '--kind': accent, width: cfg.width + 'px' }"
    >
        <Handle id="l" type="source" :position="Position.Left" class="sp-handle" />
        <Handle id="r" type="source" :position="Position.Right" class="sp-handle" />
        <Handle id="t" type="source" :position="Position.Top" class="sp-handle" />
        <Handle id="b" type="source" :position="Position.Bottom" class="sp-handle" />

        <div class="sp-head">
            <OhVueIcon :name="cfg.icon" scale="0.75" class="sp-kind-icon" />
            <span class="sp-kind">{{ kindLabel }}</span>
            <span class="sp-spacer" />
            <span v-if="panel.kind === 'log' && panel.attrs.playersShouldKnow" class="sp-flag" title="Players should know">
                <OhVueIcon name="fa-eye" scale="0.6" />
            </span>
            <span v-if="panel.status && cfg.statuses" class="sp-status">{{ panel.status }}</span>
            <span v-if="panel.kind === 'log' && logTime" class="sp-time" :title="logTimeFull">{{ logTime }}</span>
        </div>

        <!-- Entity card: portrait and name -->
        <div v-if="panel.kind === 'entity'" class="sp-entity">
            <img v-if="info.imageUrl" :src="info.imageUrl" class="sp-portrait" />
            <div v-else class="sp-portrait sp-portrait--empty"><OhVueIcon :name="info.icon || 'gi-person'" scale="1" /></div>
            <div class="sp-entity-body">
                <div class="sp-title">{{ panel.title || 'Pick an entry…' }}</div>
                <div v-if="info.sub" class="sp-sub">{{ info.sub }}</div>
                <div v-if="info.missing" class="sp-missing">Entry no longer exists</div>
            </div>
        </div>

        <template v-else>
            <div class="sp-title" :class="{ 'sp-title--empty': !panel.title }">{{ panel.title || placeholder }}</div>
            <div v-if="info.sub" class="sp-sub">{{ info.sub }}</div>
            <div v-if="info.missing" class="sp-missing">{{ info.missing }}</div>
            <div v-if="panel.kind === 'reward' && panel.attrs.xp" class="sp-reward">{{ panel.attrs.xp }} XP</div>
            <div
                v-if="previewHtml && panel.kind !== 'beat'"
                class="sp-preview md-content"
                v-html="previewHtml"
            />
        </template>

        <div v-if="panel.tags?.length" class="sp-tags">
            <span v-for="t in panel.tags" :key="t" class="sp-tag">{{ t }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { NodeToolbar } from '@vue-flow/node-toolbar'
import { PANEL_KINDS, LOG_TYPE_COLORS, type LogType } from '~/utils/sessionBoard'
import type { SessionPanel } from '~/composables/useSessionBoard'

export interface PanelNodeInfo {
    sub?: string
    imageUrl?: string | null
    icon?: string
    missing?: string
}

const props = defineProps<{
    selected?: boolean
    data: {
        panel: SessionPanel
        previewHtml: string
        info: PanelNodeInfo
        onOpen: () => void
        onStatus: (s: string) => void
        onToggleShouldKnow: () => void
        onToDrawer: () => void
        onDelete: () => void
    }
}>()

const panel = computed(() => props.data.panel)
const cfg = computed(() => PANEL_KINDS[panel.value.kind])
const info = computed(() => props.data.info ?? {})
const previewHtml = computed(() => props.data.previewHtml)

const logType = computed(() => (panel.value.attrs.logType as LogType | undefined) ?? 'happened')
const accent = computed(() => (panel.value.kind === 'log' ? LOG_TYPE_COLORS[logType.value] : cfg.value.color))
const kindLabel = computed(() => (panel.value.kind === 'log' ? `Log · ${logType.value}` : cfg.value.label))

const placeholder = computed(() => ({
    scene: 'Untitled scene', beat: 'New beat', clue: 'New clue', encounter: 'Pick an encounter…', log: 'What happened?',
    note: 'Note', entity: '', 'random-table': 'Pick a random table…', reward: 'Reward', frame: 'Group',
} as Record<string, string>)[panel.value.kind])

const logDate = computed(() => {
    const at = panel.value.attrs.at
    if (typeof at !== 'string') return null
    const d = new Date(at)
    return isNaN(d.getTime()) ? null : d
})
const logTime = computed(() => logDate.value?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '')
const logTimeFull = computed(() => logDate.value?.toLocaleString() ?? '')
</script>

<style scoped>
.sp-node {
    --kind: var(--accent);
    border-radius: var(--r2);
    border: 1.5px solid color-mix(in oklch, var(--kind) 35%, var(--border));
    border-top: 3px solid var(--kind);
    background: var(--surface-solid);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
    padding: 8px 10px 10px;
    position: relative;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.sp-node--selected { border-color: var(--kind); box-shadow: 0 0 0 2px color-mix(in oklch, var(--kind) 30%, transparent); }
.sp-node--log { background: color-mix(in oklch, var(--kind) 9%, var(--surface-solid)); border-style: dashed; border-top-style: solid; }
.sp-node--beat { padding-bottom: 8px; }
.sp-status--played, .sp-status--done, .sp-status--revealed, .sp-status--awarded { opacity: 0.78; }
.sp-status--skipped { opacity: 0.5; }
.sp-status--skipped .sp-title { text-decoration: line-through; }

.sp-head { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; min-width: 0; }
.sp-kind-icon { color: var(--kind); flex-shrink: 0; }
.sp-kind { font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--kind); white-space: nowrap; }
.sp-spacer { flex: 1; }
.sp-status {
    font-size: 9.5px; padding: 1px 6px; border-radius: 99px; text-transform: lowercase;
    border: 1px solid color-mix(in oklch, var(--kind) 45%, transparent); color: var(--text2);
}
.sp-time { font-size: 9.5px; color: var(--text3); font-variant-numeric: tabular-nums; opacity: 0; transition: opacity 0.12s; }
.sp-node:hover .sp-time { opacity: 1; }
.sp-flag { color: var(--kind); display: flex; }

.sp-title { font-family: var(--fh); font-size: 13.5px; font-weight: 600; color: var(--text); line-height: 1.25; word-break: break-word; }
.sp-title--empty { color: var(--text3); font-style: italic; font-family: var(--fu); font-weight: 400; }
.sp-sub { font-size: 11px; color: var(--text2); margin-top: 2px; }
.sp-missing { font-size: 11px; color: var(--danger); margin-top: 2px; }
.sp-reward { font-size: 12px; font-weight: 600; color: var(--kind); margin-top: 3px; }

.sp-preview {
    margin-top: 6px; font-size: 11.5px; color: var(--text2); line-height: 1.45;
    max-height: 120px; overflow: hidden;
    -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent);
    mask-image: linear-gradient(to bottom, #000 70%, transparent);
    pointer-events: none;
}
.sp-preview :deep(p) { margin: 0 0 4px; }
.sp-preview :deep(h1), .sp-preview :deep(h2), .sp-preview :deep(h3), .sp-preview :deep(h4) { font-size: 12px; margin: 4px 0 2px; }
.sp-preview :deep(ul), .sp-preview :deep(ol) { margin: 0 0 4px; padding-left: 16px; }
.sp-preview :deep(blockquote) { margin: 0 0 4px; padding-left: 8px; border-left: 2px solid var(--border-hi); }

.sp-entity { display: flex; gap: 8px; align-items: center; }
.sp-portrait { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1.5px solid color-mix(in oklch, var(--kind) 45%, transparent); }
.sp-portrait--empty { display: flex; align-items: center; justify-content: center; color: var(--kind); background: var(--bg2); }
.sp-entity-body { min-width: 0; }

.sp-tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 6px; }
.sp-tag { font-size: 9.5px; padding: 0 5px; border-radius: 99px; background: var(--bg2); color: var(--text3); }

.sp-handle { width: 8px; height: 8px; background: var(--kind); border: 1.5px solid var(--surface-solid); opacity: 0; transition: opacity 0.12s; }
.sp-node:hover .sp-handle, .sp-node--selected .sp-handle { opacity: 1; }

.sp-toolbar {
    display: flex; align-items: center; gap: 2px; padding: 3px;
    background: var(--surface-hi); border: 1px solid var(--border-hi); border-radius: var(--r1);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}
.sp-tb-btn {
    display: flex; align-items: center; gap: 4px; padding: 3px 7px; border-radius: 4px;
    font-size: 11px; color: var(--text2); background: transparent; border: none; cursor: pointer; white-space: nowrap;
}
.sp-tb-btn:hover { background: var(--bg2); color: var(--text); }
.sp-tb-btn--on { background: var(--accent-bg); color: var(--accent-l); }
.sp-tb-btn--danger:hover { color: var(--danger); background: var(--danger-bg); }
.sp-tb-sep { width: 1px; height: 16px; background: var(--border-hi); margin: 0 2px; }
</style>
