<template>
    <aside class="spe" :style="{ '--kind': accent }">
        <header class="spe-head">
            <OhVueIcon :name="cfg.icon" scale="0.85" class="spe-icon" />
            <span class="spe-kind">{{ cfg.label }}</span>
            <span class="spe-spacer" />
            <button class="spe-close" title="Close" @click="$emit('close')"><OhVueIcon name="md-close" scale="0.85" /></button>
        </header>

        <div class="spe-fields">
            <input
                v-if="!isLinkKind"
                class="spe-title"
                :value="panel.title"
                :placeholder="titlePlaceholder"
                @input="board.updatePanel(panel.id, { title: ($event.target as HTMLInputElement).value })"
            />

            <!-- Encounter: which one -->
            <label v-if="panel.kind === 'encounter'" class="spe-field">
                <span class="spe-label">Encounter</span>
                <select class="spe-select" :value="panel.attrs.encounterId ?? ''" @change="pickEncounter(($event.target as HTMLSelectElement).value)">
                    <option value="">— pick an encounter —</option>
                    <option v-for="e in encounters" :key="e.id" :value="e.id">{{ e.name }}</option>
                </select>
            </label>

            <!-- Entity / random table: which entry -->
            <div v-if="panel.kind === 'entity' || panel.kind === 'random-table'" class="spe-field">
                <span class="spe-label">{{ panel.kind === 'entity' ? 'Entry' : 'Random table' }}</span>
                <div v-if="panel.title" class="spe-picked">
                    <span class="spe-picked-type">{{ panel.attrs.entityType ?? 'random-table' }}</span>
                    <span class="spe-picked-name">{{ panel.title }}</span>
                    <button class="spe-mini" @click="$emit('navigate', String(panel.attrs.entityType ?? 'random-table'), panel.title)">Open</button>
                </div>
                <input v-model="entryQuery" class="spe-input" :placeholder="panel.title ? 'Pick another…' : 'Search entries…'" />
                <div v-if="entryQuery" class="spe-results">
                    <button v-for="e in entryResults" :key="e.id" class="spe-result" @click="pickEntry(e)">
                        <span class="spe-picked-type" :style="{ color: typeColor(e.type) }">{{ e.type }}</span>
                        {{ e.name }}
                    </button>
                    <p v-if="!entryResults.length" class="spe-empty">No matches</p>
                </div>
            </div>

            <!-- Status -->
            <div v-if="cfg.statuses" class="spe-field">
                <span class="spe-label">Status</span>
                <div class="spe-seg">
                    <button
                        v-for="s in cfg.statuses"
                        :key="s"
                        :class="{ on: panel.status === s }"
                        @click="board.updatePanel(panel.id, { status: s })"
                    >{{ s }}</button>
                </div>
            </div>

            <!-- Log -->
            <template v-if="panel.kind === 'log'">
                <div class="spe-field">
                    <span class="spe-label">Type</span>
                    <div class="spe-seg">
                        <button
                            v-for="t in LOG_TYPES"
                            :key="t"
                            :class="{ on: (panel.attrs.logType ?? 'happened') === t }"
                            :style="(panel.attrs.logType ?? 'happened') === t ? { color: LOG_TYPE_COLORS[t], borderColor: LOG_TYPE_COLORS[t] } : {}"
                            @click="board.updateAttrs(panel.id, { logType: t })"
                        >{{ t }}</button>
                    </div>
                </div>
                <label class="spe-check">
                    <input type="checkbox" :checked="!!panel.attrs.playersShouldKnow" @change="board.updateAttrs(panel.id, { playersShouldKnow: ($event.target as HTMLInputElement).checked })" />
                    Players should know (comes up in the next session's recap)
                </label>
                <div v-if="attachedTo.length" class="spe-note">
                    Attached to: {{ attachedTo.map(p => p.title || 'untitled').join(', ') }}
                </div>
                <div v-else class="spe-note">Not attached: counts as improvised play. Connect it to a panel to attach it.</div>
            </template>

            <!-- Reward -->
            <label v-if="panel.kind === 'reward'" class="spe-field">
                <span class="spe-label">XP</span>
                <input
                    class="spe-input spe-input--num"
                    type="number"
                    min="0"
                    :value="panel.attrs.xp ?? ''"
                    @input="board.updateAttrs(panel.id, { xp: numberOrNull(($event.target as HTMLInputElement).value) })"
                />
            </label>

            <!-- Tags -->
            <label v-if="panel.kind !== 'frame'" class="spe-field">
                <span class="spe-label">Tags</span>
                <input
                    class="spe-input"
                    :value="(panel.tags ?? []).join(', ')"
                    placeholder="comma, separated"
                    @change="board.updatePanel(panel.id, { tags: parseTags(($event.target as HTMLInputElement).value) })"
                />
            </label>
        </div>

        <div v-if="cfg.hasContent" class="spe-editor">
            <MarkdownEditor
                :key="panel.id"
                :entity-id="sessionId"
                :campaign-id="campaignId"
                :content="panel.content"
                :show-tab-bar="true"
                initial-view-mode="mixed"
                @update:content="(v: string) => board.updatePanel(panel.id, { content: v })"
                @navigate="(t: string, n: string) => $emit('navigate', t, n)"
            >
                <template #below-content>
                    <LinkBar
                        :entity-id="sessionId"
                        :campaign-id="campaignId"
                        entity-type="panel"
                        :content="panel.content"
                        @navigate="(t: string, n: string) => $emit('navigate', t, n)"
                    />
                </template>
            </MarkdownEditor>
        </div>
        <div v-else-if="panel.kind === 'random-table' && tableRows.length" class="spe-table">
            <div class="spe-label">{{ tableDie }}</div>
            <div v-for="(r, i) in tableRows" :key="i" class="spe-table-row">
                <span class="spe-table-range">{{ r.min === r.max ? r.min : `${r.min}–${r.max}` }}</span>
                <span>{{ r.result }}</span>
            </div>
        </div>
    </aside>
</template>

<script setup lang="ts">
import { PANEL_KINDS, LOG_TYPES, LOG_TYPE_COLORS, type LogType } from '~/utils/sessionBoard'
import type { SessionPanel, useSessionBoard } from '~/composables/useSessionBoard'
import { useEntities, type Entity } from '~/composables/useEntities'
import { typeColorMap } from '~/composables/useEntityRendering'
import type { RandomTableAttributes } from '~/types/entities'

const props = defineProps<{
    panel: SessionPanel
    board: ReturnType<typeof useSessionBoard>
    sessionId: number
    campaignId: number
    encounters: { id: number; name: string }[]
}>()
defineEmits<{ close: []; navigate: [type: string, name: string] }>()

const store = useEntities()
const cfg = computed(() => PANEL_KINDS[props.panel.kind])
const accent = computed(() => (props.panel.kind === 'log' ? LOG_TYPE_COLORS[(props.panel.attrs.logType as LogType) ?? 'happened'] : cfg.value.color))
const isLinkKind = computed(() => ['encounter', 'entity', 'random-table'].includes(props.panel.kind))

const titlePlaceholder = computed(() => ({
    scene: 'Scene title', beat: 'One line: what could happen', clue: 'The clue or secret', log: 'What happened (headline)',
    note: 'Note title', reward: 'Reward title', frame: 'Group title',
} as Record<string, string>)[props.panel.kind] ?? 'Title')

function typeColor(t: string) { return typeColorMap[t] ?? 'var(--text3)' }

// ── Pickers ──────────────────────────────────────────────────────────────
function pickEncounter(value: string) {
    const enc = props.encounters.find(e => String(e.id) === value)
    props.board.updatePanel(props.panel.id, {
        title: enc?.name ?? '',
        attrs: { ...props.panel.attrs, encounterId: enc?.id ?? null },
    })
}

const entryQuery = ref('')
watch(() => props.panel.id, () => { entryQuery.value = '' })
const entryResults = computed(() => {
    const q = entryQuery.value.trim().toLowerCase()
    if (!q) return []
    return store.entities
        .filter(e => (props.panel.kind === 'random-table' ? e.type === 'random-table' : e.type !== 'session' && e.type !== 'random-table'))
        .filter(e => e.name.toLowerCase().includes(q))
        .slice(0, 12)
})
function pickEntry(e: Entity) {
    entryQuery.value = ''
    props.board.updatePanel(props.panel.id, { title: e.name, attrs: { ...props.panel.attrs, entityId: e.id, entityType: e.type } })
}

// ── Log ─────────────────────────────────────────────────────────────────
const attachedTo = computed(() => {
    const uid = props.panel.uid
    const other = props.board.edges.value
        .filter(e => e.kind === 'attach' && (e.source === uid || e.target === uid))
        .map(e => (e.source === uid ? e.target : e.source))
    return other.map(u => props.board.byUid.value.get(u)).filter((p): p is SessionPanel => !!p)
})

// ── Random table preview ────────────────────────────────────────────────
const tableEntity = computed(() => (typeof props.panel.attrs.entityId === 'number' ? store.entities.find(e => e.id === props.panel.attrs.entityId) : undefined))
const tableRows = computed(() => ((tableEntity.value?.attributes ?? {}) as RandomTableAttributes).rows ?? [])
const tableDie = computed(() => ((tableEntity.value?.attributes ?? {}) as RandomTableAttributes).die ?? '')

function numberOrNull(v: string) { const n = Number(v); return v === '' || isNaN(n) ? null : n }
function parseTags(v: string) { return [...new Set(v.split(',').map(t => t.trim()).filter(Boolean))] }
</script>

<style scoped>
.spe {
    --kind: var(--accent);
    width: 440px;
    max-width: 48vw;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--border);
    background: var(--bg2);
}
.spe-head {
    display: flex; align-items: center; gap: 7px; padding: 8px 12px;
    border-bottom: 1px solid var(--border); border-top: 3px solid var(--kind);
}
.spe-icon { color: var(--kind); }
.spe-kind { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--kind); }
.spe-spacer { flex: 1; }
.spe-close { background: none; border: none; color: var(--text3); cursor: pointer; display: flex; padding: 2px; border-radius: 4px; }
.spe-close:hover { color: var(--text); background: var(--surface-hi); }

.spe-fields { padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid var(--border); flex-shrink: 0; max-height: 45vh; overflow-y: auto; }
.spe-title {
    font-family: var(--fh); font-size: 17px; font-weight: 600; color: var(--text);
    background: transparent; border: none; border-bottom: 1px solid var(--border); padding: 4px 0; outline: none;
}
.spe-title:focus { border-bottom-color: var(--kind); }
.spe-field { display: flex; flex-direction: column; gap: 4px; }
.spe-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); }
.spe-input, .spe-select {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--r1);
    color: var(--text); font-size: 13px; padding: 5px 8px; outline: none;
}
.spe-input:focus, .spe-select:focus { border-color: var(--kind); }
.spe-input--num { width: 110px; }
.spe-seg { display: flex; flex-wrap: wrap; gap: 4px; }
.spe-seg button {
    font-size: 11.5px; padding: 3px 9px; border-radius: 99px; cursor: pointer;
    background: var(--surface); border: 1px solid var(--border); color: var(--text2);
}
.spe-seg button.on { border-color: var(--kind); color: var(--text); background: color-mix(in oklch, var(--kind) 14%, transparent); }
.spe-check { display: flex; gap: 7px; align-items: center; font-size: 12.5px; color: var(--text2); cursor: pointer; }
.spe-note { font-size: 11.5px; color: var(--text3); }
.spe-picked { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.spe-picked-type { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); }
.spe-picked-name { color: var(--text); font-weight: 600; }
.spe-mini { margin-left: auto; font-size: 11px; padding: 2px 8px; border-radius: var(--r1); background: var(--surface); border: 1px solid var(--border); color: var(--text2); cursor: pointer; }
.spe-results { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--r1); max-height: 200px; overflow-y: auto; background: var(--surface-solid); }
.spe-result { display: flex; gap: 8px; align-items: center; text-align: left; padding: 5px 8px; font-size: 13px; color: var(--text); background: none; border: none; cursor: pointer; }
.spe-result:hover { background: var(--surface-hi); }
.spe-empty { font-size: 12px; color: var(--text3); padding: 6px 8px; margin: 0; }

.spe-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.spe-table { padding: 10px 12px; overflow-y: auto; font-size: 12.5px; color: var(--text2); display: flex; flex-direction: column; gap: 3px; }
.spe-table-row { display: flex; gap: 10px; }
.spe-table-range { width: 46px; flex-shrink: 0; color: var(--text3); font-variant-numeric: tabular-nums; }
</style>
