<template>
    <div class="hnp" :class="{ 'hnp--open': open }">
        <div class="hnp-header">
            <span class="hnp-title">Hidden Nodes</span>
            <button class="hnp-close" @click="$emit('close')">
                <OhVueIcon name="md-close" scale="0.8" />
            </button>
        </div>
        <div class="hnp-body">
            <div v-if="!hiddenEntities.length" class="hnp-empty">
                No hidden nodes
            </div>
            <div v-for="entity in hiddenEntities" :key="entity.id" class="hnp-row">
                <div class="hnp-icon" :style="{ color: typeColor(entity.type) }">
                    <OhVueIcon :name="typeIcon(entity.type)" scale="0.75" />
                </div>
                <div class="hnp-name">{{ entity.name }}</div>
                <button class="hnp-show-btn" @click="$emit('show-node', entity.id!)">
                    Show
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ENTITY_TYPE_CONFIG } from '~/types/entities'
import type { Entity } from '~/composables/useEntities'

defineProps<{
    open: boolean
    hiddenEntities: Entity[]
}>()

defineEmits<{
    close: []
    'show-node': [entityId: number]
}>()

function typeColor(type: string): string {
    return (ENTITY_TYPE_CONFIG as any)[type]?.color ?? 'var(--text3)'
}

function typeIcon(type: string): string {
    return (ENTITY_TYPE_CONFIG as any)[type]?.defaultIcon ?? 'gi-scroll-unfurled'
}
</script>

<style scoped>
.hnp {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 260px;
    background: var(--surface);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.2s ease;
    z-index: 10;
    box-shadow: -4px 0 16px rgba(0,0,0,0.18);
}
.hnp--open { transform: translateX(0); }

.hnp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg2);
}

.hnp-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text3);
}

.hnp-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: var(--r1);
    background: transparent;
    border: 1px solid transparent;
    color: var(--text3);
    cursor: pointer;
    transition: all 0.12s;
}
.hnp-close:hover { border-color: var(--border); color: var(--text2); }

.hnp-body {
    flex: 1;
    overflow-y: auto;
    padding: 6px 0;
}

.hnp-empty {
    padding: 16px 12px;
    font-size: 12px;
    color: var(--text3);
    font-style: italic;
}

.hnp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    transition: background 0.1s;
}
.hnp-row:hover { background: var(--surface-hi); }

.hnp-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
}

.hnp-name {
    flex: 1;
    font-size: 12px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}

.hnp-show-btn {
    font-size: 10px;
    font-weight: 600;
    color: var(--accent-l);
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--r1);
    padding: 2px 8px;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.12s;
}
.hnp-show-btn:hover { border-color: var(--accent); background: var(--accent-bg); }
</style>
