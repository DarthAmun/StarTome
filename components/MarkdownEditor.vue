<template>
    <div class="markdown-editor">
        <!-- ── Tab bar (also shown as mini-bar when showTabBar=false) ── -->
        <div v-if="showTabBar || !readonly" class="editor-tabbar">
            <template v-if="showTabBar">
                <div class="etab-spacer" />
                <div class="etab-group">
                    <button
                        class="etab"
                        :class="{ active: viewMode === 'edit' }"
                        @click="setViewMode('edit')"
                    >
                        Edit
                    </button>
                    <button
                        class="etab"
                        :class="{ active: viewMode === 'mixed' }"
                        @click="setViewMode('mixed')"
                    >
                        Mixed
                    </button>
                    <button
                        class="etab"
                        :class="{ active: viewMode === 'preview' }"
                        @click="setViewMode('preview')"
                    >
                        Preview
                    </button>
                </div>
            </template>
            <button v-if="!readonly" class="etab-btn tb-widget-ref-btn" :class="{ active: showWidgetRef }" title="Widget reference" @click="showWidgetRef = !showWidgetRef">?</button>
            <button class="etab-btn etab-print" title="Print / export as PDF (hidden blocks excluded)" @click="printView"><OhVueIcon name="md-print" scale="0.9" /></button>
        </div>

        <div v-if="showWidgetRef && !readonly" class="widget-ref-panel">
            <div v-for="w in WIDGETS" :key="w.type" class="widget-ref-row" @click="insertNotes(w.insert.prefix, w.insert.suffix)">
                <code class="widget-ref-code">{{ w.example }}</code>
                <span class="widget-ref-desc">{{ w.desc }}</span>
            </div>
        </div>

        <slot name="above-editor" />

        <!-- ── Editor body ── -->
        <div class="editor-body">
            <!-- Edit pane -->
            <div v-if="viewMode === 'edit'" class="edit-pane">
                <div v-if="!readonly" class="editor-toolbar">
                    <button
                        class="tb-btn"
                        title="Bold"
                        @click="insertNotes('**', '**')"
                    >
                        <strong>B</strong>
                    </button>
                    <button
                        class="tb-btn italic"
                        title="Italic"
                        @click="insertNotes('*', '*')"
                    >
                        <em>I</em>
                    </button>
                    <button
                        class="tb-btn"
                        title="Heading"
                        @click="insertNotes('## ', '')"
                    >
                        H₂
                    </button>
                    <button
                        class="tb-btn"
                        title="List"
                        @click="insertNotes('\n- ', '')"
                    >
                        —
                    </button>
                    <button
                        class="tb-btn"
                        title="Task"
                        @click="insertNotes('\n- [ ] ', '')"
                    >
                        ☐
                    </button>
                    <button
                        class="tb-btn"
                        title="Quote"
                        @click="insertNotes('\n> ', '')"
                    >
                        ❝
                    </button>
                    <div class="tb-divider" />
                    <button
                        v-for="w in WIDGETS" :key="w.type"
                        class="tb-btn"
                        :title="w.title"
                        @click="insertNotes(w.insert.prefix, w.insert.suffix)"
                    >
                        <OhVueIcon :name="w.icon" scale="0.85" />
                    </button>
                    <div class="tb-divider" />
                    <button
                        v-for="t in entityTypes"
                        :key="t.type"
                        class="tb-btn tb-entity"
                        :style="{ color: t.color }"
                        :title="`Link ${t.label}`"
                        @click="insertNotes(`{{${t.type}: `, '}}')"
                    >
                        {{ t.label.charAt(0) }}
                    </button>
                </div>
                <div class="editor-area-wrap">
                    <textarea
                        ref="editorRef"
                        v-model="draftContent"
                        class="editor-textarea"
                        spellcheck="true"
                        :readonly="readonly"
                        placeholder="Write here…"
                        @input="onNotesInput"
                        @keydown="onEditKeydown"
                    />
                    <div
                        v-if="
                            autocomplete.show && autocomplete.source === 'edit'
                        "
                        class="autocomplete-dropdown autocomplete-dropdown--abs"
                    >
                        <button
                            v-for="(item, idx) in autocomplete.items"
                            :key="`${item.type}:${item.name}`"
                            class="autocomplete-item"
                            :class="{
                                'autocomplete-item--active':
                                    autocomplete.cursorIdx === idx,
                            }"
                            @mousedown.prevent="applyAutocomplete(item)"
                        >
                            <span
                                class="autocomplete-dot"
                                :style="{
                                    background:
                                        localTypeColorMap[item.type] ?? '#888',
                                }"
                            />
                            <span class="autocomplete-name">{{
                                item.name
                            }}</span>
                            <span class="autocomplete-type">{{
                                item.type
                            }}</span>
                        </button>
                        <p
                            v-if="!autocomplete.items.length"
                            class="autocomplete-empty"
                        >
                            No matches — will link on save
                        </p>
                    </div>
                </div>
            </div>

            <!-- Preview pane -->
            <div v-else-if="viewMode === 'preview'" class="preview-pane">
                <div
                    class="markdown-body preview-body"
                    v-html="renderedContent"
                    @click="onPreviewClick"
                />
            </div>

            <!-- Mixed pane -->
            <div v-else class="mixed-pane">
                <div
                    v-for="(block, i) in editableBlocks"
                    :key="i"
                    class="mixed-block"
                    :class="{ 'mixed-block--active': activeBlock === i, 'mixed-block--hidden': isBlockRedacted(i) }"
                >
                    <template v-if="activeBlock === i && !readonly">
                        <textarea
                            v-model="editableBlocks[i]"
                            class="mixed-textarea"
                            :ref="
                                (el: any) => {
                                    if (el) mixedRefs[i] = el;
                                }
                            "
                            @input="onBlockInput(i)"
                            @blur="onBlockBlur"
                            @keydown="onMixedBlockKeydown($event, i)"
                        />
                    </template>
                    <div
                        v-else
                        class="mixed-preview markdown-body"
                        v-html="
                            block.trim()
                                ? renderBlock(block)
                                : '<span class=\'mixed-placeholder\'>Click to write…</span>'
                        "
                        @click="onMixedPreviewClick($event, i)"
                    />
                    <button
                        v-if="!readonly && activeBlock !== i"
                        class="mixed-redact-btn"
                        :class="{ 'mixed-redact-btn--active': isBlockRedacted(i) }"
                        :title="isBlockRedacted(i) ? 'Unmark as GM only' : 'Mark as GM only (hidden from players)'"
                        @click.stop="toggleBlockRedacted(i)"
                    ><OhVueIcon name="md-lock" scale="0.75" /></button>
                </div>
                <button
                    v-if="!readonly"
                    class="mixed-add-btn"
                    @click="addBlock"
                >
                    + paragraph
                </button>
            </div>
        </div>

        <slot name="below-content" />

        <!-- Mixed-mode autocomplete teleported to body to escape overflow:hidden parents -->
        <Teleport to="body">
            <div
                v-if="autocomplete.show && autocomplete.source === 'mixed-notes' && dropdownPos"
                class="autocomplete-dropdown autocomplete-dropdown--fixed"
                :style="{
                    top: dropdownPos.top + 'px',
                    left: dropdownPos.left + 'px',
                    transform: dropdownPos.above ? 'translateY(-100%)' : 'none',
                }"
            >
                <button
                    v-for="(item, idx) in autocomplete.items"
                    :key="`${item.type}:${item.name}`"
                    class="autocomplete-item"
                    :class="{ 'autocomplete-item--active': autocomplete.cursorIdx === idx }"
                    @mousedown.prevent="applyAutocomplete(item)"
                >
                    <span class="autocomplete-dot" :style="{ background: localTypeColorMap[item.type] ?? '#888' }" />
                    <span class="autocomplete-name">{{ item.name }}</span>
                    <span class="autocomplete-type">{{ item.type }}</span>
                </button>
                <p v-if="!autocomplete.items.length" class="autocomplete-empty">
                    No matches — will link on save
                </p>
            </div>
        </Teleport>
    </div>
</template>

<script lang="ts">
// Module-level: computed once per import, shared across all MarkdownEditor instances
import { giIconByName, iconToSvg } from '~/composables/useEntityRendering'

const _ci = (n: string, c: string) => { const i = giIconByName(n); return i ? iconToSvg(i, c) : '' }

const _clockSvgCache: Record<string, string> = {}
function _clockSvg(filled: number, total: number): string {
    const key = `${filled}/${total}`
    if (key in _clockSvgCache) return _clockSvgCache[key]
    const r = 5, size = 13, gap = 3
    const W = total * (size + gap) - gap
    const segs = Array.from({ length: total }, (_, i) =>
        `<circle cx="${i * (size + gap) + r + 1}" cy="${r + 1}" r="${r}"` +
        ` fill="${i < filled ? '#e8c44a' : 'none'}" stroke="#e8c44a" stroke-width="1.5"/>`
    ).join('')
    return _clockSvgCache[key] = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${size}" viewBox="0 0 ${W} ${size}"` +
        ` style="display:inline-block;vertical-align:middle;flex-shrink:0">${segs}</svg>`
}

const WIDGET_ICONS = {
    dice:   _ci('gi-dice-six-faces-six', 'currentColor'),
    table:  _ci('gi-scroll-unfurled',    'currentColor'),
    button: _ci('gi-broadsword',         'currentColor'),
    choose: _ci('gi-magic-hat',          'currentColor'),
}
</script>

<script setup lang="ts">
import { rulesQuery, rulesRefRoute } from '~/composables/useRules'
import { RULES_KINDS } from '~/types/rules'
import { lsKey } from '~/utils/appNamespace'
import { useEntities } from "~/composables/useEntities";
import { useEntityMarkdown } from "~/composables/useEntityMarkdown";
import { evaluateFormula } from "~/composables/useFormulaEvaluator";
import type { RandomTableAttributes } from "~/types/entities";
import { useEntityRendering, typeColorMap, typeIconHtml, ENCOUNTER_COLOR } from "~/composables/useEntityRendering";
import { useDiceRoll } from "~/composables/useDiceRoll";
import { getDb, dbApi } from "~/composables/useDb";
import { ENTITY_TYPE_CONFIG, ENTITY_TYPE_ROUTE } from "~/types/entities";
import type { EntityType } from "~/types/entities";

const { renderMarkdown } = useEntityMarkdown();

// ── Props / emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
    entityId: number;
    campaignId: number;
    content: string;
    readonly?: boolean;
    showTabBar?: boolean;
    initialViewMode?: "edit" | "mixed" | "preview";
}>();

const emit = defineEmits<{
    "update:content": [value: string];
    navigate: [type: string, name: string];
}>();

const store = useEntities();
const router = useRouter();
const { entityLookup, extraTypes: rulesExtraTypes, campaignEncounters, campaignGameId } = useEntityRendering(() => props.campaignId);

const dmCtx = useDmScreenContext()


// ── Entity types (for toolbar) ────────────────────────────────────────────────
const entityTypes = [
    ...Object.entries(ENTITY_TYPE_CONFIG).map(([type, cfg]) => ({
        type,
        label: cfg.plural,
        color: cfg.color,
    })),
    { type: "encounter", label: "Encounters", color: ENCOUNTER_COLOR },
];
// typeColorMap is imported from useEntityRendering; extend locally for snapshot
const localTypeColorMap: Record<string, string> = { ...typeColorMap, snapshot: "var(--gold)" };

// ── Post-processing ───────────────────────────────────────────────────────────
const HIDDEN_CALLOUT_TYPE = 'hidden'
const widgetColors = {
    button: ENTITY_TYPE_CONFIG.npc.color,
    choose: ENTITY_TYPE_CONFIG.session.color,
    clock:  ENTITY_TYPE_CONFIG['random-table'].color,
}
type WidgetClickResult = ((src: string) => string) | void
const WIDGETS = [
    {
        type: 'dice', icon: 'gi-dice-six-faces-six',
        title: 'Inline dice roll (e.g. ::dice[2d6+3])',
        insert: { prefix: '::dice[', suffix: ']' },
        example: '::dice[2d6+3]', desc: 'Click to roll a dice expression',
        renderHtml(args: string, _idx: number): string {
            const safe = esc(args.trim())
            return `<button class="inline-widget" data-widget="dice" data-expr="${safe}" title="Click to roll ${safe}">${WIDGET_ICONS.dice} ${safe}</button>`
        },
        onClick(btn: HTMLElement): WidgetClickResult { showWidgetResult(btn, String(evaluateFormula(btn.dataset.expr ?? 'd20'))) },
    },
    {
        type: 'table', icon: 'gi-scroll-unfurled',
        title: 'Random table widget (e.g. ::table[My Table])',
        insert: { prefix: '::table[', suffix: ']' },
        example: '::table[My Table]', desc: 'Click to roll on a random table by name',
        renderHtml(args: string, _idx: number): string {
            const safe = esc(args.trim())
            return `<button class="inline-widget" data-widget="table" data-table="${safe}" title="Click to roll on: ${safe}">${WIDGET_ICONS.table} ${safe}</button>`
        },
        onClick(btn: HTMLElement): WidgetClickResult { showWidgetResult(btn, rollOnTable(btn.dataset.table ?? '')) },
    },
    {
        type: 'button', icon: 'gi-broadsword',
        title: 'Named roll button (e.g. ::button[Fireball | 8d6])',
        insert: { prefix: '::button[', suffix: ' | d20]' },
        example: '::button[Fireball | 8d6]', desc: 'Named roll button — shows label and result',
        renderHtml(args: string, _idx: number): string {
            const [rawLabel, rawExpr] = args.split('|').map((s: string) => s.trim())
            const label = esc(rawLabel), expr = esc(rawExpr || rawLabel)
            return `<button class="inline-widget" data-widget="button" data-expr="${expr}" data-label="${label}" title="Roll: ${expr}">${WIDGET_ICONS.button} ${rawLabel}</button>`
        },
        onClick(btn: HTMLElement): WidgetClickResult { showWidgetResult(btn, `${btn.dataset.label ?? ''}: ${evaluateFormula(btn.dataset.expr ?? 'd20')}`) },
    },
    {
        type: 'choose', icon: 'gi-magic-hat',
        title: 'Random picker (e.g. ::choose[Goblin | Orc])',
        insert: { prefix: '::choose[opt1 | opt2 | ', suffix: ']' },
        example: '::choose[Orc | Goblin | Troll]', desc: 'Randomly pick one option',
        renderHtml(args: string, _idx: number): string {
            const opts = args.split('|').map((s: string) => s.trim()).filter(Boolean)
            return `<button class="inline-widget" data-widget="choose" data-options="${esc(opts.join('|'))}" title="Pick one of ${opts.length}">${WIDGET_ICONS.choose} Pick (${opts.length})</button>`
        },
        onClick(btn: HTMLElement): WidgetClickResult {
            const opts = (btn.dataset.options ?? '').split('|').filter(Boolean)
            if (opts.length) showWidgetResult(btn, opts[Math.floor(Math.random() * opts.length)])
        },
    },
    {
        type: 'clock', icon: 'gi-hourglass',
        title: 'Progress clock (e.g. ::clock[Hunt Clock | 0/6])',
        insert: { prefix: '::clock[', suffix: ' | 0/6]' },
        example: '::clock[Hunt Clock | 0/6]', desc: 'Progress clock — click to advance',
        renderHtml(args: string, idx: number): string {
            const [rawName, rawFrac] = args.split('|').map((s: string) => s.trim())
            const [filledS, totalS] = (rawFrac || '0/4').split('/')
            const filled = Math.max(0, parseInt(filledS) || 0)
            const total  = Math.min(Math.max(1, parseInt(totalS) || 4), 12)
            const clFilled = Math.min(filled, total)
            const safeName = esc(rawName)
            return `<button class="inline-widget" data-widget="clock" data-name="${safeName}" data-clock-idx="${idx}" data-filled="${clFilled}" data-total="${total}" title="${rawName}: ${clFilled}/${total} — click to advance">${_clockSvg(clFilled, total)} <span class="clock-label">${rawName}</span></button>`
        },
        onClick(btn: HTMLElement): WidgetClickResult {
            const idx    = parseInt(btn.dataset.clockIdx ?? '0')
            const name   = btn.dataset.name   ?? ''
            const filled = parseInt(btn.dataset.filled ?? '0')
            const total  = parseInt(btn.dataset.total  ?? '4')
            const next   = filled >= total ? 0 : filled + 1
            return (src: string) => {
                let count = 0
                return src.replace(/::clock\[[^\]]+\]/g, m => count++ === idx ? `::clock[${name} | ${next}/${total}]` : m)
            }
        },
    },
]
const WIDGET_BY_TYPE = Object.fromEntries(WIDGETS.map(w => [w.type, w]))

const CALLOUT_TYPES: Record<string, { color: string; icon: string }> = {
    note:      { color: "#5b8ee6", icon: _ci('gi-scroll-unfurled', '#5b8ee6') },
    info:      { color: "#5b8ee6", icon: _ci('gi-scroll-unfurled', '#5b8ee6') },
    tip:       { color: "#5aad6e", icon: _ci('gi-sparkles', '#5aad6e') },
    warning:   { color: "#e6a93b", icon: _ci('gi-lightning-bolt', '#e6a93b') },
    caution:   { color: "#e05a5a", icon: _ci('gi-lightning-bolt', '#e05a5a') },
    danger:    { color: "#e05a5a", icon: _ci('gi-crossed-swords', '#e05a5a') },
    important: { color: "#9b59d4", icon: _ci('gi-labels', '#9b59d4') },
    [HIDDEN_CALLOUT_TYPE]: { color: "#8b2030", icon: _ci('gi-all-seeing-eye', '#8b2030') },
};

function postProcessHtml(html: string): string {
    let out = html
        .replace(
            /<li>\s*\[ \]\s*/g,
            '<li class="task-item"><input type="checkbox"> ',
        )
        .replace(
            /<li>\s*\[x\]\s*/gi,
            '<li class="task-item task-item--done"><input type="checkbox" checked> ',
        );
    out = out.replace(
        /<blockquote>\s*<p>\[!([\w]+)\]([^<]*)(?:<br\s*\/?>)?\s*([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
        (_full, type, titleRaw, bodyRaw) => {
            const t = type.toLowerCase();
            const cfg = CALLOUT_TYPES[t] ?? { color: "#888", icon: "📌" };
            const displayTitle =
                titleRaw.trim() || t.charAt(0).toUpperCase() + t.slice(1);
            const body = bodyRaw.trim();
            return `<div class="callout callout--${t}" style="--callout-color:${cfg.color}">
<div class="callout-title">${cfg.icon} ${displayTitle}</div>
${body ? `<div class="callout-body">${body}</div>` : ""}
</div>`;
        },
    );
    // Inline widgets — registry-dispatched, single pass
    const typeCounts: Record<string, number> = {}
    out = out.replace(
        /::(dice|table|button|choose|clock)\[([^\]]+)\]/g,
        (_m, type, args) => {
            const def = WIDGET_BY_TYPE[type]
            if (!def) return ''
            const idx = typeCounts[type] ?? 0
            typeCounts[type] = idx + 1
            return def.renderHtml(args, idx)
        }
    )
    return out;
}

// ── Inline entry renderer ──────────────────────────────────────────────────────
function esc(s: string) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function buildEntryHtml(
    type: string,
    name: string,
    attrKey?: string,
): string | null {
    const ent = store.findByTypeAndName(type, name);
    if (!ent) return null;
    const attrs = (ent.attributes as any) ?? {};
    const color = typeColorMap[type] ?? "#888";

    if (attrKey) {
        const val = attrs[attrKey];
        if (!val)
            return `<span class="ie-attr-empty" title="no ${esc(attrKey)}">${esc(name)}</span>`;
        const imgKeys = [
            "portraitSource",
            "logoSource",
            "imageSource",
            "mapSource",
        ];
        if (imgKeys.includes(attrKey)) {
            return `<img class="ie-attr-img" src="${esc(val)}" alt="${esc(name)}" data-entity-type="${type}" data-entity-name="${esc(name)}" />`;
        }
        return `<span class="ie-attr-text">${esc(String(val))}</span>`;
    }

    const imgSrc: string | undefined =
        attrs.portraitSource || attrs.logoSource || attrs.imageSource;
    const portraitHtml = imgSrc
        ? `<img class="ie-portrait-img" src="${esc(imgSrc)}" alt="${esc(name)}" />`
        : `<div class="ie-portrait-icon" style="background:${color}18;color:${color}">${esc(name.charAt(0).toUpperCase())}</div>`;

    const metaParts: string[] = [];
    if (type === "npc") {
        if (attrs.title) metaParts.push(attrs.title);
        if (attrs.race) metaParts.push(attrs.race);
        if (attrs.role) metaParts.push(attrs.role);
    } else if (type === "location") {
        if (attrs.locationType) metaParts.push(attrs.locationType);
    } else if (type === "faction") {
        if (attrs.factionType) metaParts.push(attrs.factionType);
        if (attrs.size) metaParts.push(attrs.size);
    } else if (type === "event") {
        if (attrs.date) metaParts.push(attrs.date);
        if (attrs.significance) metaParts.push(attrs.significance);
    }
    const metaHtml = metaParts.length
        ? `<div class="ie-meta">${esc(metaParts.join(" · "))}</div>`
        : "";
    const isDead = attrs.isAlive === false;
    const status = attrs.status && type !== "quest" ? attrs.status : null;
    const deadHtml = isDead ? `<span class="ie-dead">☠</span>` : "";
    const statusHtml = status
        ? `<span class="ie-status">${esc(status)}</span>`
        : "";
    const nameCls = isDead ? "ie-name ie-name--dead" : "ie-name";

    return `<div class="ie ie--${type}" data-entity-type="${type}" data-entity-name="${esc(name)}" style="border-left-color:${color}"><div class="ie-portrait">${portraitHtml}</div><div class="ie-body"><div class="ie-name-row"><span class="${nameCls}">${esc(name)}</span>${deadHtml}${statusHtml}</div>${metaHtml}</div></div>`;
}

// ── Snapshot entry renderer ────────────────────────────────────────────────────
function buildSnapshotEntryHtml(
    type: string,
    name: string,
    snapshotLabel: string,
    attrKey?: string,
): string | null {
    const ent = store.findByTypeAndName(type, name);
    if (!ent) return null;
    const color = typeColorMap[type] ?? "#888";
    const snap = store.snapshots.find(
        (s) =>
            s.entityId === ent.id &&
            s.label.toLowerCase() === snapshotLabel.toLowerCase(),
    );
    const attrs = snap ? snap.attributes : ((ent.attributes as any) ?? {});
    const entityName = snap ? snap.name : ent.name;

    if (attrKey) {
        const val = attrs[attrKey];
        if (!val)
            return `<span class="ie-attr-empty" title="no ${esc(attrKey)} in snapshot '${esc(snapshotLabel)}'">${esc(entityName)}</span>`;
        const imgKeys = [
            "portraitSource",
            "logoSource",
            "imageSource",
            "mapSource",
        ];
        if (imgKeys.includes(attrKey)) {
            return `<img class="ie-attr-img" src="${esc(val)}" alt="${esc(entityName)}" data-entity-type="${type}" data-entity-name="${esc(name)}" data-snapshot-label="${esc(snapshotLabel)}" />`;
        }
        return `<span class="ie-attr-text" data-entity-type="${type}" data-entity-name="${esc(name)}" data-snapshot-label="${esc(snapshotLabel)}">${esc(String(val))}</span>`;
    }

    const imgSrc: string | undefined =
        attrs.portraitSource || attrs.logoSource || attrs.imageSource;
    const portraitHtml = imgSrc
        ? `<img class="ie-portrait-img" src="${esc(imgSrc)}" alt="${esc(entityName)}" />`
        : `<div class="ie-portrait-icon" style="background:${color}18;color:${color}">${esc(entityName.charAt(0).toUpperCase())}</div>`;

    const metaParts: string[] = [];
    if (type === "npc") {
        if (attrs.title) metaParts.push(attrs.title);
        if (attrs.race) metaParts.push(attrs.race);
        if (attrs.role) metaParts.push(attrs.role);
    } else if (type === "location") {
        if (attrs.locationType) metaParts.push(attrs.locationType);
    } else if (type === "faction") {
        if (attrs.factionType) metaParts.push(attrs.factionType);
        if (attrs.size) metaParts.push(attrs.size);
    } else if (type === "event") {
        if (attrs.date) metaParts.push(attrs.date);
        if (attrs.significance) metaParts.push(attrs.significance);
    }
    const metaHtml = metaParts.length
        ? `<div class="ie-meta">${esc(metaParts.join(" · "))}</div>`
        : "";
    const isDead = attrs.isAlive === false;
    const deadHtml = isDead ? `<span class="ie-dead">☠</span>` : "";
    const nameCls = isDead ? "ie-name ie-name--dead" : "ie-name";
    const badgeCls = snap
        ? "ie-snap-badge"
        : "ie-snap-badge ie-snap-badge--unloaded";
    const histBadge = `<span class="${badgeCls}">⏎ ${esc(snapshotLabel)}</span>`;

    return `<div class="ie ie--${type} ie--snap" data-entity-type="${type}" data-entity-name="${esc(name)}" data-snapshot-label="${esc(snapshotLabel)}" style="border-left-color:${color}"><div class="ie-portrait">${portraitHtml}</div><div class="ie-body"><div class="ie-name-row"><span class="${nameCls}">${esc(entityName)}</span>${deadHtml}${histBadge}</div>${metaHtml}</div></div>`;
}

// ── Markdown rendering ────────────────────────────────────────────────────────
const mdOpts = computed(() => ({
    rich: true,
    postProcess: postProcessHtml,
    entityLookup,
    extraTypes: rulesExtraTypes.value,
    allowTaskLists: true,
    allowLocalFileUris: true,
    entryRenderer: buildEntryHtml,
    snapshotRenderer: buildSnapshotEntryHtml,
}));

const renderedContent = computed(() => {
    if (!draftContent.value?.trim())
        return '<p class="md-empty">Nothing written yet…</p>';
    return renderMarkdown(draftContent.value, mdOpts.value);
});

function renderBlock(block: string): string {
    return block.trim() ? renderMarkdown(block, mdOpts.value) : "";
}

// ── Draft content (controlled) ────────────────────────────────────────────────
const showWidgetRef = ref(false)
const draftContent = ref(props.content);

watch(
    () => props.content,
    (val) => {
        if (val !== draftContent.value) {
            draftContent.value = val;
            if (viewMode.value === "mixed") syncBlocks();
        }
    },
);

// ── View mode ─────────────────────────────────────────────────────────────────
type ViewMode = "edit" | "mixed" | "preview";
const VM_KEY = lsKey("editor.viewmode");
const viewMode = ref<ViewMode>(props.initialViewMode ?? "mixed");
if (import.meta.client && props.showTabBar !== false) {
    const s = localStorage.getItem(VM_KEY);
    if (s === "edit" || s === "mixed" || s === "preview") viewMode.value = s;
}
function setViewMode(m: ViewMode) {
    viewMode.value = m;
    if (import.meta.client) localStorage.setItem(VM_KEY, m);
    if (m === "mixed") syncBlocks();
}

// ── Mixed mode ────────────────────────────────────────────────────────────────
const editableBlocks = ref<string[]>([""]);
const activeBlock = ref<number | null>(null);
const mixedRefs: Record<number, HTMLTextAreaElement> = {};

function syncBlocks() {
    const blocks = draftContent.value.split(/\n\n+/);
    editableBlocks.value = blocks.length > 0 ? blocks : [""];
    activeBlock.value = null;
    const len = editableBlocks.value.length;
    Object.keys(mixedRefs).forEach(k => { if (Number(k) >= len) delete mixedRefs[Number(k)] });
}

function activateBlock(i: number) {
    activeBlock.value = i;
    nextTick(() => {
        const el = mixedRefs[i];
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
    });
}

function onBlockInput(i: number) {
    const el = mixedRefs[i];
    if (el) {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    }
    draftContent.value = editableBlocks.value.join("\n\n");
    scheduleContentEmit();
    checkAutocomplete(el ?? null, editableBlocks.value[i], "mixed-notes", i);
}

function onBlockBlur() {
    autocomplete.value.show = false;
    while (
        editableBlocks.value.length > 1 &&
        !editableBlocks.value[editableBlocks.value.length - 1].trim()
    ) {
        editableBlocks.value.pop();
    }
    activeBlock.value = null;
}

function addBlock() {
    editableBlocks.value.push("");
    nextTick(() => activateBlock(editableBlocks.value.length - 1));
}

function printView() {
    if (!import.meta.client) return
    // Open a clean window — avoids the SPA's overflow:hidden/flex layout entirely
    const html = renderMarkdown(draftContent.value, mdOpts.value)
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(_buildPrintDoc(html))
    win.document.close()
    win.document.fonts.ready.then(() => { win.print(); win.close() })
}

function _buildPrintDoc(body: string): string {
    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Print</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=IM+Fell+English:ital@0;1&display=swap">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'IM Fell English', Georgia, serif; font-size: 12pt; color: #1a1a1a; line-height: 1.65; padding: 2cm 2.5cm; }
h1,h2,h3,h4,h5,h6 { font-family: 'Cinzel', Georgia, serif; font-weight: 700; color: #111; margin: 1.2em 0 0.4em; page-break-after: avoid; }
h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; } h4 { font-size: 11pt; }
p { margin: .5em 0; }
ul, ol { margin: .5em 0; padding-left: 1.6em; }
li { margin: .2em 0; }
strong { font-weight: 700; }
em { font-style: italic; }
code { font-family: 'Courier New', monospace; font-size: .88em; background: #f0f0f0; padding: 1px 4px; border-radius: 2px; }
pre { background: #f0f0f0; padding: .7em; border-radius: 4px; white-space: pre-wrap; margin: .5em 0; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #bbb; margin: .6em 0; padding-left: 1em; color: #555; }
hr { border: none; border-top: 1px solid #ccc; margin: 1em 0; }
table { border-collapse: collapse; width: 100%; margin: .6em 0; }
th, td { border: 1px solid #bbb; padding: 4px 9px; text-align: left; font-size: 11pt; }
th { background: #f0f0f0; font-weight: 700; }
.callout { border-left: 4px solid #888; background: #f7f7f7; border-radius: 0 4px 4px 0; margin: .8em 0; page-break-inside: avoid; }
.callout-title { font-weight: 700; font-size: 9pt; padding: 5px 12px; text-transform: uppercase; letter-spacing: .06em; color: #555; background: #efefef; display: flex; align-items: center; gap: 6px; }
.callout-body { padding: 5px 12px 8px; font-size: 11pt; }
.callout--hidden { display: none !important; }
.inline-widget { display: none !important; }
.task-item { list-style: none; margin-left: -1.6em; }
.task-item input { margin-right: 5px; }
.task-item--done { text-decoration: line-through; color: #888; }
.entity-ref { font-weight: 600; color: inherit; text-decoration: none; }
.roll-ref { font-family: 'Courier New', monospace; font-size: .9em; }
s, del { color: #888; }
</style>
</head>
<body>${body}</body></html>`
}

// ── DM-only (redaction) toggle ────────────────────────────────────────────────
function isBlockRedacted(i: number): boolean {
    return editableBlocks.value[i]?.trimStart().startsWith(`> [!${HIDDEN_CALLOUT_TYPE}]`) ?? false
}

function toggleBlockRedacted(i: number) {
    const block = editableBlocks.value[i]
    if (isBlockRedacted(i)) {
        const lines = block.split('\n')
        const inner = lines
            .slice(1)
            .map(l => l.startsWith('> ') ? l.slice(2) : l.startsWith('>') ? l.slice(1) : l)
            .join('\n')
            .trim()
        editableBlocks.value[i] = inner
    } else {
        const lines = block.split('\n')
        editableBlocks.value[i] = `> [!${HIDDEN_CALLOUT_TYPE}]\n` + lines.map(l => `> ${l}`).join('\n')
    }
    draftContent.value = editableBlocks.value.join('\n\n')
    scheduleContentEmit()
}

// ── Task list toggle ──────────────────────────────────────────────────────────
function toggleNthTask(text: string, n: number): string {
    let count = -1
    return text.replace(/^- \[([ x])\] /gim, (match, state) => {
        count++
        if (count === n) return state === ' ' ? '- [x] ' : '- [ ] '
        return match
    })
}

// ── Emit debounce ─────────────────────────────────────────────────────────────
// Flushed on unmount, so edits made just before navigating away are kept
const contentSave = useDebouncedSave(800);
function scheduleContentEmit() {
    contentSave.schedule(() => emit("update:content", draftContent.value));
}

// ── Edit mode input ───────────────────────────────────────────────────────────
const editorRef = ref<HTMLTextAreaElement | null>(null);

function onNotesInput() {
    scheduleContentEmit();
    checkAutocomplete(editorRef.value, draftContent.value, "edit");
}

// ── Insert helpers ────────────────────────────────────────────────────────────
function insertInto(
    el: HTMLTextAreaElement | null,
    draft: { value: string },
    before: string,
    after: string,
) {
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = draft.value.slice(start, end);
    draft.value =
        draft.value.slice(0, start) +
        before +
        selected +
        after +
        draft.value.slice(end);
    scheduleContentEmit();
    nextTick(() => {
        el.setSelectionRange(
            start + before.length,
            start + before.length + selected.length,
        );
        el.focus();
    });
}

function insertNotes(before: string, after: string) {
    insertInto(editorRef.value, draftContent, before, after);
}

// ── Tab indent/dedent ────────────────────────────────────────────────────────
function handleTabInTextarea(
    el: HTMLTextAreaElement | null,
    dedent: boolean,
) {
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (dedent) {
        const lineStart = draftContent.value.lastIndexOf("\n", start - 1) + 1;
        const lineContent = draftContent.value.slice(lineStart);
        if (lineContent.startsWith("\t")) {
            draftContent.value =
                draftContent.value.slice(0, lineStart) +
                draftContent.value.slice(lineStart + 1);
            nextTick(() =>
                el.setSelectionRange(
                    Math.max(lineStart, start - 1),
                    Math.max(lineStart, end - 1),
                ),
            );
        } else if (lineContent.startsWith("  ")) {
            draftContent.value =
                draftContent.value.slice(0, lineStart) +
                draftContent.value.slice(lineStart + 2);
            nextTick(() =>
                el.setSelectionRange(
                    Math.max(lineStart, start - 2),
                    Math.max(lineStart, end - 2),
                ),
            );
        }
    } else {
        draftContent.value =
            draftContent.value.slice(0, start) +
            "\t" +
            draftContent.value.slice(end);
        nextTick(() => el.setSelectionRange(start + 1, start + 1));
    }
}

// ── Autocomplete ──────────────────────────────────────────────────────────────
type AcSource = "edit" | "mixed-notes";
const autocomplete = ref({
    show: false,
    items: [] as any[],
    triggerStart: 0,
    source: "edit" as AcSource,
    mixedIdx: -1,
    cursorIdx: 0,
    mode: "entity" as "entity" | "snapshot",
});

const dropdownPos = ref<{ top: number; left: number; above: boolean } | null>(null);

watch(
    () => autocomplete.value.show && autocomplete.value.source === "mixed-notes"
        ? autocomplete.value.mixedIdx
        : null,
    (idx) => {
        if (idx === null) { dropdownPos.value = null; return; }
        const el = mixedRefs[idx];
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const above = window.innerHeight - rect.bottom < 180;
        dropdownPos.value = { top: above ? rect.top - 4 : rect.bottom + 4, left: rect.left, above };
    },
    { flush: "post" },
);

async function checkAutocomplete(
    el: HTMLTextAreaElement | null,
    text: string,
    source: AcSource,
    mixedIdx = -1,
) {
    if (!el) return;
    const pos = el.selectionStart;

    const snapMatch = text
        .slice(0, pos)
        .match(/\{\{(\w+):\s*([^@|}\n]+?)\s*@\s*([^}|]*)$/);
    if (snapMatch) {
        const [, partialType, entityName] = snapMatch;
        const partialLabel = snapMatch[3];
        const ent = store.findByTypeAndName(
            partialType.toLowerCase(),
            entityName.trim(),
        );
        if (ent) {
            const snaps = await getDb()
                .entitySnapshots.where("entity_id")
                .equals(ent.id)
                .toArray();
            const filtered = snaps.filter(
                (s) =>
                    !partialLabel.trim() ||
                    s.label
                        .toLowerCase()
                        .includes(partialLabel.trim().toLowerCase()),
            );
            const items = filtered
                .slice(0, 8)
                .map((s) => ({ type: "snapshot", name: s.label, id: s.id }));
            const atPos = snapMatch.index! + snapMatch[0].indexOf("@");
            autocomplete.value = {
                show: items.length > 0,
                items,
                triggerStart: atPos,
                source,
                mixedIdx,
                cursorIdx: 0,
                mode: "snapshot",
            };
            return;
        }
        autocomplete.value.show = false;
        return;
    }

    const match = text.slice(0, pos).match(/\{\{(\w+):\s*([^}@]*)$/);
    if (!match) {
        autocomplete.value.show = false;
        return;
    }
    const partialType = match[1].toLowerCase();
    if (partialType === "roll") {
        autocomplete.value.show = false;
        return;
    }
    const partialName = match[2];
    const campaignCandidates = store.entities
        .filter(
            (e) =>
                e.campaignId === props.campaignId &&
                (!partialType || e.type.startsWith(partialType)) &&
                (!partialName ||
                    e.name.toLowerCase().includes(partialName.toLowerCase())),
        )
        .map((e) => ({ type: e.type, name: e.name, id: e.id }));
    const encounterCandidates = "encounter".startsWith(partialType)
        ? campaignEncounters.value
              .filter(
                  (e) =>
                      !partialName ||
                      e.name.toLowerCase().includes(partialName.toLowerCase()),
              )
              .map((e) => ({ type: "encounter", name: e.name, id: e.id }))
        : [];
    let graphCandidates: { type: string; name: string; id: number }[] = [];
    if ("graph".startsWith(partialType)) {
        const graphs = await dbApi.graphLayout.list(props.campaignId);
        graphCandidates = graphs
            .filter(
                (g) =>
                    !partialName ||
                    (g.name ?? "Default").toLowerCase().includes(partialName.toLowerCase()),
            )
            .map((g) => ({ type: "graph", name: g.name ?? "Default", id: g.id! }));
    }
    // Compendium entries once the typed kind is unambiguous ({{spell: fir…)
    let rulesCandidates: { type: string; name: string; id: number }[] = [];
    const rulesKinds = RULES_KINDS.filter((k) => k.startsWith(partialType));
    if (partialType && rulesKinds.length === 1 && partialName.trim()) {
        const page = await rulesQuery({
            kind: rulesKinds[0],
            text: partialName.trim(),
            games: [campaignGameId.value],
            limit: 6,
        });
        rulesCandidates = page.items.map((e) => ({ type: e.kind, name: e.name, id: -1 }));
    }
    const candidates = [
        ...campaignCandidates,
        ...encounterCandidates,
        ...graphCandidates,
        ...rulesCandidates,
    ].slice(0, 8);
    autocomplete.value = {
        show: candidates.length > 0,
        items: candidates,
        triggerStart: pos - match[0].length,
        source,
        mixedIdx,
        cursorIdx: 0,
        mode: "entity",
    };
}

function applyAutocomplete(item: any) {
    const ac = autocomplete.value;
    let el: HTMLTextAreaElement | null;
    let getVal: () => string;
    let setVal: (s: string) => void;
    if (ac.source === "mixed-notes") {
        el = mixedRefs[ac.mixedIdx] ?? null;
        getVal = () => editableBlocks.value[ac.mixedIdx];
        setVal = (s) => {
            editableBlocks.value[ac.mixedIdx] = s;
            draftContent.value = editableBlocks.value.join("\n\n");
        };
    } else {
        el = editorRef.value;
        getVal = () => draftContent.value;
        setVal = (s) => {
            draftContent.value = s;
        };
    }
    if (!el) return;
    const pos = el.selectionStart;
    const before = getVal().slice(0, ac.triggerStart);
    const after = getVal().slice(pos);
    const replacement =
        ac.mode === "snapshot"
            ? `@ ${item.name}}}`
            : `{{${item.type}: ${item.name}}}`;
    setVal(`${before}${replacement}${after}`);
    scheduleContentEmit();
    autocomplete.value.show = false;
    nextTick(() => {
        const p = before.length + replacement.length;
        el!.setSelectionRange(p, p);
        el!.focus();
    });
}

function onAutocompleteKeydown(e: KeyboardEvent): boolean {
    if (!autocomplete.value.show) return false;
    const items = autocomplete.value.items;
    if (e.key === "Escape") {
        e.preventDefault();
        autocomplete.value.show = false;
        return true;
    }
    if (!items.length) return false;
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        autocomplete.value.cursorIdx =
            (autocomplete.value.cursorIdx + 1) % items.length;
        return true;
    }
    if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        autocomplete.value.cursorIdx =
            (autocomplete.value.cursorIdx - 1 + items.length) % items.length;
        return true;
    }
    if (e.key === "Enter") {
        e.preventDefault();
        applyAutocomplete(items[autocomplete.value.cursorIdx]);
        return true;
    }
    return false;
}

function onEditKeydown(e: KeyboardEvent) {
    if (onAutocompleteKeydown(e)) return;
    if (e.key === "Tab") {
        e.preventDefault();
        handleTabInTextarea(editorRef.value, e.shiftKey);
        return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        insertNotes("**", "**");
        return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        insertNotes("*", "*");
        return;
    }
}

function onMixedBlockKeydown(e: KeyboardEvent, i: number) {
    if (onAutocompleteKeydown(e)) return;
    if (e.key === "Escape") {
        e.preventDefault();
        onBlockBlur();
    }
}

// ── Inline widget helpers ─────────────────────────────────────────────────────
function showWidgetResult(btn: HTMLElement, text: string) {
    btn.parentElement?.querySelectorAll('.inline-widget-result').forEach(el => el.remove())
    const badge = document.createElement('span')
    badge.className = 'inline-widget-result'
    badge.textContent = text
    btn.after(badge)
    setTimeout(() => badge.classList.add('inline-widget-result--fade'), 2200)
    setTimeout(() => badge.remove(), 2800)
}

function rollOnTable(tableName: string): string {
    const ent = store.findByTypeAndName('random-table', tableName)
    if (!ent) return `(table "${tableName}" not found)`
    const attrs = (ent.attributes ?? {}) as RandomTableAttributes
    const rows = attrs.rows ?? []
    if (!rows.length) return '(empty table)'
    const sides = parseInt((attrs.die ?? 'd20').slice(1)) || 20
    const roll = Math.floor(Math.random() * sides) + 1
    const row = rows.find(r => roll >= r.min && roll <= r.max)
    return row ? `${roll}: ${row.result}` : `${roll}: (no match)`
}

function handleCheckboxToggle(
    e: MouseEvent,
    tgt: HTMLElement,
    getText: () => string,
    setText: (s: string) => void,
): boolean {
    if (tgt.tagName !== 'INPUT' || (tgt as HTMLInputElement).type !== 'checkbox') return false
    e.preventDefault()
    if (props.readonly) return true
    const container = e.currentTarget as HTMLElement
    const allBoxes = Array.from(container.querySelectorAll('input[type="checkbox"]'))
    const idx = allBoxes.indexOf(tgt)
    if (idx !== -1) {
        setText(toggleNthTask(getText(), idx))
        scheduleContentEmit()
    }
    return true
}

function handleWidgetClick(target: HTMLElement): ((src: string) => string) | null {
    const btn = target.closest('.inline-widget') as HTMLElement | null
    if (!btn) return null
    const def = WIDGET_BY_TYPE[btn.dataset.widget ?? '']
    if (!def) return null
    return def.onClick(btn) ?? (src => src)
}

function applyWidgetClick(target: HTMLElement, getSource: () => string, setSource: (s: string) => void): boolean {
    const replacer = handleWidgetClick(target)
    if (replacer === null) return false
    const cur = getSource()
    const next = replacer(cur)
    if (next !== cur) setSource(next)
    return true
}

// ── Preview click ─────────────────────────────────────────────────────────────
const { triggerRoll } = useDiceRoll();

async function onPreviewClick(e: MouseEvent) {
    const target = e.target as HTMLElement;

    if (applyWidgetClick(target, () => draftContent.value, s => { draftContent.value = s; scheduleContentEmit() })) return

    if (handleCheckboxToggle(e, target, () => draftContent.value, s => { draftContent.value = s })) return

    const rollEl = target.closest(".roll-ref") as HTMLElement | null;
    if (rollEl) {
        const roll = rollEl.dataset.roll;
        if (roll) triggerRoll(roll);
        return;
    }
    const entityEl = target.closest("[data-entity-type]") as HTMLElement | null;
    if (!entityEl) return;
    const type = entityEl.dataset.entityType;
    const name = entityEl.dataset.entityName;
    if (!type || !name) return;

    if (dmCtx?.onEntityClick(type!, name!)) return

    const snapshotLabel = entityEl.dataset.snapshotLabel;
    if (snapshotLabel) {
        const ent = store.findByTypeAndName(type, name);
        if (ent) {
            const snaps = await getDb()
                .entitySnapshots.where("entity_id")
                .equals(ent.id)
                .toArray();
            const snap = snaps.find(
                (s) => s.label.toLowerCase() === snapshotLabel.toLowerCase(),
            );
            const segment = ENTITY_TYPE_ROUTE[ent.type as EntityType];
            if (segment) {
                const q = snap ? `?snapshot=${snap.id}` : "";
                router.push(
                    `/campaign/${props.campaignId}/${segment}/${ent.id}${q}`,
                );
            }
        }
        return;
    }

    if (type === "encounter") {
        const enc = campaignEncounters.value.find(
            (e) => e.name.toLowerCase() === name.toLowerCase(),
        );
        if (enc) router.push(`/encounter/${enc.id}`);
        return;
    }
    if (type === "graph") {
        const graphs = await dbApi.graphLayout.list(props.campaignId);
        const g = graphs.find((gr) => (gr.name ?? "Default").toLowerCase() === name.toLowerCase());
        if (g?.id) router.push(`/campaign/${props.campaignId}/graphs?graph=${g.id}`);
        return;
    }
    const rulesRoute = await rulesRefRoute(type, name, campaignGameId.value);
    if (rulesRoute) {
        router.push(rulesRoute);
        return;
    }
    emit("navigate", type, name);
}

async function onMixedPreviewClick(e: MouseEvent, i: number) {
    const tgt = e.target as HTMLElement
    if (applyWidgetClick(tgt,
        () => editableBlocks.value[i],
        s => { editableBlocks.value[i] = s; draftContent.value = editableBlocks.value.join('\n\n'); scheduleContentEmit() }
    )) return
    if (handleCheckboxToggle(e, tgt,
        () => editableBlocks.value[i],
        s => { editableBlocks.value[i] = s; draftContent.value = editableBlocks.value.join('\n\n') }
    )) return
    const el = tgt.closest("[data-entity-type], .roll-ref");
    if (el) {
        onPreviewClick(e);
        return;
    }
    if (!props.readonly) activateBlock(i);
}

// ── Sync blocks on mount if in mixed mode ────────────────────────────────────
onMounted(() => {
    if (viewMode.value === "mixed") syncBlocks();
});

onUnmounted(() => {
    Object.keys(mixedRefs).forEach(k => delete mixedRefs[Number(k)]);
});
</script>

<style scoped>
.markdown-editor {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

/* ── Tab bar ─────────────────────────────────────────────────────────────── */
.editor-tabbar {
    display: flex;
    align-items: center;
    padding: 5px 10px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    gap: 6px;
    background: var(--bg2);
}
.etab-spacer {
    flex: 1;
}
.etab-print, .etab-btn {
    padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border);
    background: var(--bg); color: var(--text3); font-size: 13px; cursor: pointer;
    transition: all 0.12s; align-self: center;
}
.etab-print:hover, .etab-btn:hover { border-color: var(--border-hi); color: var(--text); }
.etab-btn.active { color: var(--gold); border-color: var(--gold); background: color-mix(in oklch, var(--gold) 12%, transparent); }
.etab-group {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--r1);
    overflow: hidden;
    background: var(--bg);
}
.etab {
    padding: 3px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text3);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
}
.etab + .etab {
    border-left: 1px solid var(--border);
}
.etab:hover:not(:disabled) {
    color: var(--text2);
    background: var(--surface-hi);
}
.etab.active {
    background: var(--accent-bg);
    color: var(--accent-l);
}
.etab:disabled {
    opacity: 0.35;
    cursor: default;
}

/* ── Body ────────────────────────────────────────────────────────────────── */
.editor-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* ── Edit pane ───────────────────────────────────────────────────────────── */
.edit-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
}

.editor-toolbar {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
    background: var(--bg2);
}

.tb-btn {
    padding: 3px 8px;
    border-radius: var(--r1);
    background: transparent;
    border: 1px solid transparent;
    color: var(--text3);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s;
}
.tb-btn:hover {
    background: var(--surface-hi);
    border-color: var(--border);
    color: var(--text);
}
.tb-btn.italic {
    font-style: italic;
}
.tb-entity {
    font-weight: 700;
    font-size: 11px;
}

.tb-divider {
    width: 1px;
    height: 16px;
    background: var(--border-hi);
    margin: 0 3px;
}

/* ── Widget reference panel ──────────────────────────────────────── */
.tb-widget-ref-btn { font-size: 11px; font-weight: 700; color: var(--gold); }
.tb-widget-ref-btn.active { color: var(--gold); border-color: var(--gold); background: color-mix(in oklch, var(--gold) 12%, transparent); }
.widget-ref-panel {
    border-top: 1px solid var(--border);
    background: var(--bg2);
    padding: 6px 10px;
    display: flex; flex-direction: column; gap: 4px;
}
.widget-ref-row {
    display: flex; align-items: baseline; gap: 10px;
    cursor: pointer; padding: 3px 4px; border-radius: 3px;
    transition: background 0.1s;
}
.widget-ref-row:hover { background: var(--accent-bg); }
.widget-ref-code {
    font-family: var(--font-mono, monospace); font-size: 11px;
    color: var(--gold); white-space: nowrap; flex-shrink: 0;
}
.widget-ref-desc {
    font-size: 11px; color: var(--text-dim); }

/* ── Inline widgets ───────────────────────────────────────────────── */
:deep([data-widget="dice"])   { --widget-color: var(--gold); }
:deep([data-widget="table"])  { --widget-color: var(--accent); --widget-color-text: var(--accent-l); }
:deep([data-widget="button"]) { --widget-color: v-bind('widgetColors.button'); }
:deep([data-widget="choose"]) { --widget-color: v-bind('widgetColors.choose'); }
:deep([data-widget="clock"])  { --widget-color: v-bind('widgetColors.clock'); gap: 6px; }
:deep(.inline-widget) {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 4px;
    border: 1px solid; cursor: pointer; font-size: 0.85em;
    font-family: inherit; vertical-align: middle;
    transition: all 0.12s; margin: 0 2px;
    position: relative;
    border-color: color-mix(in oklch, var(--widget-color, #888) 50%, transparent);
    background: color-mix(in oklch, var(--widget-color, #888) 8%, transparent);
    color: var(--widget-color-text, var(--widget-color, #888));
}
:deep(.inline-widget:hover) {
    background: color-mix(in oklch, var(--widget-color, #888) 18%, transparent);
    border-color: var(--widget-color-text, var(--widget-color, #888));
}
:deep(.clock-label) { font-size: 0.85em; }

:deep(.inline-widget-result) {
    display: inline-block; margin-left: 6px;
    padding: 2px 8px; border-radius: 4px;
    background: var(--gold); color: #1a1208;
    font-size: 0.82em; font-weight: 700;
    vertical-align: middle;
    animation: widget-pop 0.15s ease-out;
    transition: opacity 0.6s ease;
}
:deep(.inline-widget-result--fade) { opacity: 0; }

@keyframes widget-pop {
    from { transform: scale(0.7); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
}

.editor-area-wrap {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    min-height: 0;
}

.editor-textarea {
    flex: 1;
    min-height: 0;
    width: 100%;
    padding: 18px 22px;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    overflow-y: auto;
    color: var(--text);
    font-family: var(--fm);
    font-size: 13px;
    line-height: 1.75;
    caret-color: var(--accent);
}
.editor-textarea::placeholder {
    color: var(--text3);
}

/* ── Autocomplete ────────────────────────────────────────────────────────── */
.autocomplete-dropdown {
    background: var(--surface-solid);
    border: 1px solid var(--border-hi);
    border-radius: var(--r2);
    width: 280px;
    overflow: hidden;
    box-shadow: var(--sh-md);
}
.autocomplete-dropdown--abs {
    position: absolute;
    bottom: 8px;
    left: 22px;
    z-index: var(--z-sidebar);
}
.autocomplete-dropdown--fixed {
    position: fixed;
    z-index: var(--z-top);
}
.autocomplete-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    width: 100%;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text);
    transition: background 0.1s;
    text-align: left;
    font-size: 13px;
}
.autocomplete-item:hover,
.autocomplete-item--active {
    background: var(--surface-hi);
}
.autocomplete-item--active {
    border-left: 2px solid var(--accent);
    padding-left: 10px;
}
.autocomplete-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}
.autocomplete-name {
    flex: 1;
}
.autocomplete-type {
    font-size: 10px;
    color: var(--text3);
}
.autocomplete-empty {
    font-size: 12px;
    color: var(--text3);
    padding: 8px 12px;
    font-style: italic;
    margin: 0;
}

/* ── Preview pane ────────────────────────────────────────────────────────── */
.preview-pane {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.preview-body {
    padding: 20px 26px;
    flex: 1;
}

/* ── Mixed pane ──────────────────────────────────────────────────────────── */
.mixed-pane {
    flex: 1;
    overflow-y: auto;
    padding: 10px 18px 40px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
}

.mixed-block {
    position: relative;
    border-radius: var(--r1);
    border: 1px solid transparent;
    transition:
        border-color 0.12s,
        background 0.12s;
}
.mixed-block:hover:not(.mixed-block--active) {
    border-color: var(--border);
    background: var(--bg2);
}
.mixed-block--active {
    border-color: var(--accent);
    background: var(--accent-bg);
}
/* Hidden block: let the callout fill the block */
.mixed-block--hidden:not(.mixed-block--active) {
    border-color: transparent !important;
    background: transparent;
}
.mixed-block--hidden:not(.mixed-block--active) .mixed-preview {
    padding: 0;
}
.mixed-block--hidden:not(.mixed-block--active) :deep(.callout--hidden) {
    margin: 4px !important;
}
/* Reserve space in callout-title for the lock button */
.mixed-block--hidden:not(.mixed-block--active) :deep(.callout-title) {
    padding-right: 34px;
}

/* DM-only toggle button */
.mixed-redact-btn {
    position: absolute; top: 4px; right: 4px;
    padding: 1px 5px; border-radius: 4px; font-size: 10px;
    border: 1px solid transparent; background: none; cursor: pointer;
    opacity: 0; transition: opacity 0.1s, border-color 0.1s;
    z-index: 2;
}
.mixed-block:hover .mixed-redact-btn { opacity: 0.6; }
/* On hidden blocks the button sits inside the callout-title row */
.mixed-block--hidden .mixed-redact-btn {
    top: 6px; right: 10px;
    opacity: 0.8 !important;
}
.mixed-redact-btn:hover { opacity: 1 !important; border-color: #8b2030; background: oklch(54% 0.24 22 / 0.1); }
.mixed-redact-btn--active { opacity: 0.9 !important; color: #e87a7a; border-color: #8b2030 !important; background: oklch(54% 0.24 22 / 0.12) !important; }

.mixed-preview {
    padding: 5px 10px;
    cursor: text;
    min-height: 30px;
}

.mixed-textarea {
    width: 100%;
    padding: 5px 10px;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    color: var(--text);
    font-family: var(--fm);
    font-size: 13px;
    line-height: 1.75;
    caret-color: var(--accent);
    min-height: 30px;
    overflow: hidden;
    display: block;
}

.mixed-add-btn {
    align-self: flex-start;
    margin-top: 8px;
    padding: 4px 12px;
    border-radius: var(--r4);
    border: 1px dashed var(--border-hi);
    background: transparent;
    color: var(--text3);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s;
}
.mixed-add-btn:hover {
    color: var(--text2);
    border-color: var(--border-hi);
    background: var(--bg2);
}
</style>

<style>
/* ── Markdown body (global) ──────────────────────────────────────────────── */
.markdown-body {
    color: var(--ink);
    font-family: "DM Sans", system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.8;
}
.markdown-body h1,
.markdown-body h2,
.markdown-body h3 {
    color: var(--gold);
    margin: 1.2em 0 0.4em;
}
.markdown-body h1 {
    font-size: 1.5em;
}
.markdown-body h2 {
    font-size: 1.25em;
}
.markdown-body h3 {
    font-size: 1.05em;
}
.markdown-body p {
    margin: 0.55em 0;
}
.markdown-body ul {
    list-style: none;
    padding-left: 1.4em;
    margin: 0.4em 0;
}
.markdown-body ul > li {
    position: relative;
}
.markdown-body ul > li::before {
    content: "✦";
    position: absolute;
    left: -1.2em;
    top: 1.46em;
    transform: translateY(-50%);
    color: var(--gold);
    font-size: 0.55em;
    line-height: 1;
}
.markdown-body ol {
    list-style: decimal;
    padding-left: 1.6em;
    margin: 0.4em 0;
}
.markdown-body li {
    margin: 0.2em 0;
}
.markdown-body strong {
    color: #e8d4a0;
}
.markdown-body em {
    color: #b0b8d0;
    font-style: italic;
}
.markdown-body a {
    color: var(--gold);
    text-decoration: underline;
    text-decoration-color: rgba(184, 134, 11, 0.4);
    text-underline-offset: 3px;
}
.markdown-body a:hover {
    text-decoration-color: var(--gold);
}
.markdown-body blockquote {
    border-left: 3px solid var(--gold);
    padding-left: 1em;
    margin: 0.8em 0;
    color: #9090b0;
    font-style: italic;
}
.markdown-body code {
    background: var(--parch-dark);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    color: var(--gold);
}
.markdown-body hr {
    border-color: var(--parch-line);
    margin: 1.4em 0;
}
.markdown-body table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    font-size: 14px;
}
.markdown-body th {
    background: rgba(184, 134, 11, 0.1);
    border: 1px solid var(--parch-line);
    padding: 6px 11px;
    text-align: left;
    font-weight: 600;
    color: var(--gold);
}
.markdown-body td {
    border: 1px solid var(--parch-line);
    padding: 5px 11px;
}
.markdown-body tr:nth-child(even) td {
    background: rgba(255, 255, 255, 0.02);
}
.markdown-body .task-item {
    list-style: none;
    margin-left: -1.2em;
}
.markdown-body .task-item::before {
    display: none;
}
.markdown-body .task-item input[type="checkbox"] {
    margin-right: 7px;
    accent-color: var(--gold);
    width: 13px;
    height: 13px;
    vertical-align: middle;
    cursor: pointer;
}
.markdown-body .task-item--done {
    color: var(--ink-ghost);
    text-decoration: line-through;
}
.markdown-body mark {
    background: rgba(235, 189, 52, 0.2);
    color: var(--ink);
    padding: 1px 4px;
    border-radius: 3px;
}
.markdown-body s,
.markdown-body del {
    color: var(--ink-ghost);
}
.callout {
    border-left: 4px solid var(--callout-color, var(--gold));
    background: color-mix(
        in srgb,
        var(--callout-color, var(--gold)) 10%,
        transparent
    );
    border-radius: 0 6px 6px 0;
    margin: 1em 0;
    overflow: hidden;
}
.callout-title {
    font-weight: 700;
    color: var(--callout-color, var(--gold));
    font-size: 11px;
    padding: 6px 14px;
    background: color-mix(
        in srgb,
        var(--callout-color, var(--gold)) 16%,
        transparent
    );
    display: flex;
    align-items: center;
    gap: 6px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}
.callout-body {
    color: var(--ink);
    font-size: 14px;
    line-height: 1.7;
    padding: 7px 14px 9px;
}
.callout-body p {
    margin: 0.25em 0;
}
.entity-ref {
    cursor: pointer;
    border-radius: 3px;
    padding: 1px 4px;
    font-weight: 600;
    transition: background 0.12s;
    display: inline;
}
.entity-ref:hover {
    filter: brightness(1.2);
}
.entity-ref em {
    font-size: 0.85em;
    font-style: normal;
    opacity: 0.75;
    margin-left: 3px;
}
.entity-ref--note {
    color: #7ba8e8;
    background: rgba(91, 141, 217, 0.15);
}
.entity-ref--npc {
    color: #7dd89a;
    background: rgba(93, 184, 122, 0.15);
}
.entity-ref--item {
    color: var(--gold);
    background: rgba(201, 151, 58, 0.15);
}
.entity-ref--location {
    color: #b98ee8;
    background: rgba(155, 109, 217, 0.15);
}
.entity-ref--faction {
    color: #e87a7a;
    background: rgba(217, 91, 91, 0.15);
}
.entity-ref--encounter {
    color: #e8a87a;
    background: rgba(217, 141, 91, 0.15);
}
.entity-ref--graph {
    color: #7cc44e;
    background: rgba(100, 180, 60, 0.15);
}
.entity-ref-avatar {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    object-fit: cover;
    vertical-align: middle;
    margin-right: 3px;
    margin-top: -2px;
    border: 1px solid rgba(255, 255, 255, 0.2);
}
.entity-ref-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    vertical-align: middle;
    margin-right: 4px;
    margin-top: -1px;
    flex-shrink: 0;
}
.roll-ref {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: rgba(184, 134, 11, 0.1);
    border: 1px solid rgba(184, 134, 11, 0.35);
    border-radius: 5px;
    padding: 1px 8px;
    color: var(--gold);
    cursor: pointer;
    font-family: "JetBrains Mono", monospace;
    font-size: 0.88em;
    transition: all 0.12s;
    white-space: nowrap;
}
.roll-ref:hover {
    background: rgba(184, 134, 11, 0.22);
    border-color: var(--gold);
}
.mixed-preview.markdown-body {
    padding: 0;
    font-size: 14px;
}
.mixed-placeholder {
    color: var(--text3);
    font-style: italic;
    font-size: 13px;
}
.md-empty {
    color: var(--text3);
    font-style: italic;
    padding: 20px 0 0;
    margin: 0;
    font-size: 14px;
}

/* ── Inline entry cards ({{type: name | entry}}) ──────────────────────────── */
.ie {
    display: inline-flex;
    align-items: stretch;
    background: var(--bg2, #1c1912);
    border: 1px solid var(--border, rgba(120, 100, 60, 0.3));
    border-left: 3px solid;
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    margin: 3px 0;
    max-width: 320px;
    vertical-align: middle;
    transition: filter 0.12s;
    font-style: normal;
    text-decoration: none;
}
.ie:hover {
    filter: brightness(1.15);
}
.ie-portrait {
    width: 52px;
    flex-shrink: 0;
    border-right: 1px solid var(--border, rgba(120, 100, 60, 0.2));
    overflow: hidden;
}
.ie-portrait-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    display: block;
}
.ie-portrait-icon {
    width: 100%;
    height: 100%;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
    font-weight: 700;
}
.ie-body {
    padding: 6px 10px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    min-width: 0;
}
.ie-name-row {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
}
.ie-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--ink, #d4c5a9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ie-name--dead {
    text-decoration: line-through;
    opacity: 0.5;
}
.ie-dead {
    font-size: 11px;
}
.ie-status {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(200, 150, 60, 0.15);
    color: var(--gold, #c9973a);
    border: 1px solid rgba(200, 150, 60, 0.3);
    white-space: nowrap;
}
.ie-meta {
    font-size: 11px;
    font-style: italic;
    color: var(--ink-ghost, #8a7a65);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ie-attr-img {
    display: block;
    max-width: 280px;
    max-height: 200px;
    border-radius: 6px;
    object-fit: cover;
    cursor: pointer;
    margin: 3px 0;
}
.ie-attr-text {
    font-style: italic;
    color: var(--ink, #d4c5a9);
}
.ie-attr-empty {
    font-style: italic;
    opacity: 0.5;
    font-size: 12px;
}
.ie-snap-badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
    background: rgba(184, 134, 11, 0.12);
    color: var(--gold, #c9973a);
    border: 1px solid rgba(184, 134, 11, 0.3);
}
.ie-snap-badge--unloaded {
    opacity: 0.6;
    border-style: dashed;
}

/* ── DM-only (hidden) callout ── */
.callout--hidden {
    --callout-color: #8b2030;
}
.callout--hidden .callout-title::after {
    content: ' — GM only';
    font-size: 10px;
    opacity: 0.6;
    font-style: normal;
    font-weight: 400;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

/* Print button opens a clean new window — no @media print overrides needed here */
</style>
