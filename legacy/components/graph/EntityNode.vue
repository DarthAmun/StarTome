<template>
    <NodeToolbar :is-visible="selected && !data.playerView" :position="Position.Top">
        <div class="en-toolbar">
            <button class="en-tb-btn" @click="data.onOpen?.()">
                <OhVueIcon name="md-openinnew" scale="0.7" />
                Open
            </button>
            <div class="en-tb-sep" />
            <button
                class="en-tb-btn"
                :class="{ 'en-tb-btn--active': data.playerHidden }"
                :title="data.playerHidden ? 'Show to players' : 'Hide from players'"
                @click="data.onTogglePlayerHide?.()"
            >
                <OhVueIcon :name="data.playerHidden ? 'md-visibilityoff' : 'md-visibility'" scale="0.7" />
                {{ data.playerHidden ? 'Hidden' : 'Players' }}
            </button>
            <div class="en-tb-sep" />
            <button class="en-tb-btn en-tb-btn--danger" @click="data.onRemove?.()">Remove</button>
        </div>
    </NodeToolbar>

    <div
        class="en-node"
        :class="[`en-node--${data.type}`, { 'en-node--selected': selected }]"
        :style="selected ? { borderColor: data.color, boxShadow: `0 0 0 2px ${data.color}44` } : {}"
    >
        <Handle id="top" type="target" :position="Position.Top" class="en-handle" />
        <Handle id="bottom" type="source" :position="Position.Bottom" class="en-handle" />

        <!-- NPC: portrait on left, content on right -->
        <div v-if="data.type === 'npc'" class="en-inner en-inner--row">
            <div class="en-portrait" :style="{ borderColor: data.color + '66' }">
                <img v-if="data.imageUrl" :src="data.imageUrl" class="en-portrait-img" />
                <span v-else class="en-portrait-initial" :style="{ color: data.color }">
                    {{ data.name.charAt(0).toUpperCase() }}
                </span>
            </div>
            <div class="en-body">
                <div class="en-badge" :style="{ color: data.color, borderColor: data.color + '44', background: data.color + '11' }">{{ data.type }}</div>
                <div class="en-name">{{ data.name }}</div>
                <div v-if="keyAttrs.length" class="en-attrs">
                    <div v-for="[k, v] in keyAttrs" :key="k" class="en-attr">
                        <span class="en-attr-key">{{ formatKey(k) }}</span>
                        <span class="en-attr-val">{{ v }}</span>
                        <button
                            v-if="!data.playerView"
                            class="en-attr-vis"
                            :class="{ 'en-attr-vis--hidden': isAttrHidden(k) }"
                            :title="isAttrHidden(k) ? 'Show to players' : 'Hide from players'"
                            @click.stop="data.onToggleAttrHidden?.(k)"
                        >
                            <OhVueIcon :name="isAttrHidden(k) ? 'md-visibilityoff' : 'md-visibility'" scale="0.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- All other types: image on top, content below -->
        <div v-else class="en-inner">
            <div v-if="data.imageUrl" class="en-image" :style="{ borderColor: data.color + '66' }">
                <img :src="data.imageUrl" class="en-image-img" />
            </div>
            <div class="en-body">
                <div class="en-badge" :style="{ color: data.color, borderColor: data.color + '44', background: data.color + '11' }">{{ data.type }}</div>
                <div class="en-name">{{ data.name }}</div>
                <div v-if="keyAttrs.length" class="en-attrs">
                    <div v-for="[k, v] in keyAttrs" :key="k" class="en-attr">
                        <span class="en-attr-key">{{ formatKey(k) }}</span>
                        <span class="en-attr-val">{{ v }}</span>
                        <button
                            v-if="!data.playerView"
                            class="en-attr-vis"
                            :class="{ 'en-attr-vis--hidden': isAttrHidden(k) }"
                            :title="isAttrHidden(k) ? 'Show to players' : 'Hide from players'"
                            @click.stop="data.onToggleAttrHidden?.(k)"
                        >
                            <OhVueIcon :name="isAttrHidden(k) ? 'md-visibilityoff' : 'md-visibility'" scale="0.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { NodeToolbar } from '@vue-flow/node-toolbar'

const props = defineProps<{
    selected: boolean
    data: {
        entityId: number
        name: string
        type: string
        color: string
        imageUrl: string
        attributes: Record<string, any>
        playerHidden: boolean
        playerHiddenAttrs: string[]
        playerView: boolean
        onOpen?: () => void
        onTogglePlayerHide?: () => void
        onToggleAttrHidden?: (key: string) => void
        onRemove?: () => void
    }
}>()

const EXCLUDED_SUFFIXES = ['Source', 'source', 'Type', 'type', 'Content', 'content']

const keyAttrs = computed(() => {
    const attrs = props.data.attributes ?? {}
    const hidden = props.data.playerHiddenAttrs ?? []
    return Object.entries(attrs)
        .filter(([k, v]) =>
            k !== '_playerHidden' &&
            typeof v === 'string' && v.length > 0 &&
            !EXCLUDED_SUFFIXES.some(s => k.endsWith(s)) &&
            (!props.data.playerView || !hidden.includes(k))
        )
        .slice(0, 4)
})

function isAttrHidden(key: string): boolean {
    return (props.data.playerHiddenAttrs ?? []).includes(key)
}

function formatKey(key: string): string {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim()
}
</script>

<style scoped>
.en-node {
    width: 200px;
    border-radius: var(--r2);
    border: 1.5px solid var(--border);
    background: var(--surface);
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    transition: border-color 0.15s, box-shadow 0.15s;
    position: relative;
    cursor: pointer;
}
.en-node--npc { width: 240px; }
.en-node--selected .en-handle { opacity: 1; }

.en-inner {
    border-radius: var(--r2);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.en-inner--row {
    flex-direction: row;
    min-height: 110px;
}

/* ── NodeToolbar ── */
.en-toolbar {
    display: flex;
    align-items: center;
    gap: 3px;
    background: var(--surface-solid, var(--bg));
    border: 1px solid var(--border-hi);
    border-radius: 10px;
    padding: 5px 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.32), 0 1px 4px rgba(0,0,0,0.2);
    white-space: nowrap;
}
.en-tb-sep {
    width: 1px;
    height: 14px;
    background: var(--border);
    margin: 0 2px;
    flex-shrink: 0;
}
.en-tb-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text2);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background 0.1s, color 0.1s;
    letter-spacing: 0.01em;
}
.en-tb-btn:hover { background: var(--surface-hi); color: var(--text); }
.en-tb-btn--active { color: var(--accent); }
.en-tb-btn--active:hover { background: var(--accent-bg); }
.en-tb-btn--danger:hover { color: var(--danger); background: var(--danger-bg, #3a1a1a); }

/* ── Handles ── */
.en-handle {
    width: 20px !important;
    height: 10px !important;
    border-radius: 5px !important;
    background: var(--accent) !important;
    border: 2px solid var(--bg) !important;
    opacity: 0.35;
    transition: opacity 0.15s;
}

/* ── Image (top, non-NPC) ── */
.en-image {
    width: 100%;
    height: 80px;
    border-bottom: 1px solid;
    background: var(--bg2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.en-image-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

/* ── Portrait (left side, NPC) ── */
.en-portrait {
    width: 80px;
    flex-shrink: 0;
    border-right: 1px solid;
    background: var(--bg2);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}
.en-portrait-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    display: block;
}
.en-portrait-initial {
    font-size: 26px;
    font-weight: 700;
    opacity: 0.6;
}

/* ── Body ── */
.en-body {
    padding: 8px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
}
.en-badge {
    display: inline-block;
    align-self: flex-start;
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    border: 1px solid;
    border-radius: var(--r4);
    padding: 1px 6px;
    margin-bottom: 2px;
}
.en-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.en-attrs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 4px;
}
.en-attr {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    line-height: 1.3;
    min-width: 0;
}
.en-attr-key { color: var(--text3); flex-shrink: 0; }
.en-attr-val {
    color: var(--text2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
}

/* ── Attribute visibility toggle ── */
.en-attr-vis {
    display: none;
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 1px 2px;
    cursor: pointer;
    color: var(--text3);
    border-radius: 3px;
    line-height: 1;
    transition: color 0.12s, background 0.12s;
}
.en-attr:hover .en-attr-vis { display: flex; align-items: center; }
.en-attr-vis:hover { color: var(--text2); background: var(--surface-hi); }
.en-attr-vis--hidden { display: flex !important; align-items: center; color: var(--accent); }
.en-attr-vis--hidden:hover { color: var(--text2); }
</style>
