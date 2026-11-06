<template>
    <div class="npc-card" :class="{ 'npc-card--compact': compact }">
        <!-- Accent stripe -->
        <div class="npc-card-stripe" :style="{ background: color }" />

        <!-- Portrait -->
        <div class="npc-card-portrait">
            <img
                v-if="attrs.portraitSource"
                :src="imageSrc(attrs.portraitSource, 'thumb') ?? undefined"
                class="npc-card-portrait-img"
            />
            <div
                v-else
                class="npc-card-portrait-fallback"
                :style="{ background: color + '18' }"
            >
                <OhVueIcon
                    name="gi-person"
                    :scale="compact ? 1.1 : 1.5"
                    :style="{ color: color + 'bb' }"
                />
            </div>
        </div>

        <!-- Content -->
        <div class="npc-card-content">
            <!-- Row 1: name + vitality -->
            <div class="npc-card-top">
                <span
                    class="npc-card-name"
                    :class="{ 'npc-card-name--dead': attrs.isAlive === false }"
                    >{{ name }}</span
                >
                <div class="npc-card-top-right">
                    <span v-if="attrs.isPlayerCharacter" class="npc-card-pc-badge">PC</span>
                    <span
                        v-if="attrs.level"
                        class="npc-card-level"
                        :style="{
                            color,
                            borderColor: color + '55',
                            background: color + '12',
                        }"
                    >
                        Lv&thinsp;{{ attrs.level }}
                    </span>
                    <span class="npc-card-vitality" :style="vitalityStyle">
                        {{ attrs.isAlive === false ? "☠ Dead" : "● Alive" }}
                    </span>
                </div>
            </div>

            <!-- Row 2: title · race · role -->
            <div v-if="identityLine" class="npc-card-identity">
                {{ identityLine }}
            </div>

            <!-- Divider -->
            <div v-if="attrs.status || hasTags" class="npc-card-divider" />

            <!-- Row 3: status text -->
            <div v-if="attrs.status" class="npc-card-status">
                {{ attrs.status }}
            </div>

            <!-- Row 4: tag pills -->
            <div v-if="hasTags" class="npc-card-tags">
                <span v-if="anyAttrs.faction" class="npc-tag">
                    <span class="npc-tag-key">Faction</span
                    >{{ anyAttrs.faction }}
                </span>
                <span v-if="anyAttrs.location" class="npc-tag">
                    <span class="npc-tag-key">Location</span
                    >{{ anyAttrs.location }}
                </span>
                <span v-if="anyAttrs.alignment" class="npc-tag">
                    <span class="npc-tag-key">Alignment</span
                    >{{ anyAttrs.alignment }}
                </span>
                <span v-if="anyAttrs.age" class="npc-tag">
                    <span class="npc-tag-key">Age</span>{{ anyAttrs.age }}
                </span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { imageSrc } from '~/rules/images'
import { npcClassLine, type NpcAttributes } from "~/types/entities";

const props = defineProps<{
    name: string;
    attrs: NpcAttributes & Record<string, any>;
    color?: string;
    compact?: boolean;
}>();

const color = computed(() => props.color ?? "#7cc44e");

const anyAttrs = computed(() => props.attrs as Record<string, any>);

const identityLine = computed(() => {
    const parts: string[] = [];
    if (props.attrs.title) parts.push(props.attrs.title);
    if (props.attrs.race) parts.push(props.attrs.race);
    if (npcClassLine(props.attrs)) parts.push(npcClassLine(props.attrs));
    return parts.join("  ·  ");
});

const vitalityStyle = computed(() => {
    const alive = props.attrs.isAlive !== false;
    return {
        color: alive ? "var(--success)" : "var(--danger)",
        borderColor: alive
            ? "var(--success-muted, #3a6b2a)"
            : "var(--danger-muted, #6b2a2a)",
        background: alive
            ? "var(--success-bg, #1a3a12)"
            : "var(--danger-bg, #3a1212)",
    };
});

const hasTags = computed(() => {
    const a = anyAttrs.value;
    return !!(a.faction || a.location || a.alignment || a.age);
});
</script>

<style scoped>
.npc-card {
    display: flex;
    align-items: stretch;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--r2);
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}

/* ── Accent stripe ───────────────────────────────────────── */
.npc-card-stripe {
    width: 4px;
    flex-shrink: 0;
    align-self: stretch;
}

/* ── Portrait ────────────────────────────────────────────── */
.npc-card-portrait {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    object-fit: cover;
    border: 1.5px solid rgba(124, 196, 78, 0.35);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    margin: 10px;
}
.npc-card--compact .npc-card-portrait {
    width: 44px;
}

.npc-card-portrait-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    display: block;
}

.npc-card-portrait-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* ── Content ─────────────────────────────────────────────── */
.npc-card-content {
    flex: 1;
    min-width: 0;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.npc-card--compact .npc-card-content {
    padding: 7px 10px;
    gap: 2px;
}

/* Row 1: name + vitality */
.npc-card-top {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
}

.npc-card-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
    letter-spacing: 0.01em;
}
.npc-card--compact .npc-card-name {
    font-size: 13px;
}

.npc-card-name--dead {
    text-decoration: line-through;
    opacity: 0.55;
}

.npc-card-top-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}

.npc-card-pc-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 2px 6px;
    border-radius: var(--r4);
    border: 1px solid rgba(100, 160, 255, 0.5);
    color: #6aa0ff;
    background: rgba(100, 160, 255, 0.1);
}

.npc-card-level {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 2px 6px;
    border-radius: var(--r4);
    border: 1px solid;
}

.npc-card-vitality {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 7px;
    border-radius: var(--r4);
    border: 1px solid;
}

/* Row 2: identity */
.npc-card-identity {
    font-size: 11px;
    font-style: italic;
    color: var(--text2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Divider */
.npc-card-divider {
    height: 1px;
    background: var(--border);
    margin: 3px 0;
}

/* Row 3: status */
.npc-card-status {
    font-size: 12px;
    color: var(--text2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Row 4: tags */
.npc-card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.npc-tag {
    display: inline-flex;
    align-items: center;
    gap: 0;
    font-size: 10px;
    color: var(--text2);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--r4);
    padding: 1px 7px 1px 5px;
    white-space: nowrap;
}

.npc-tag-key {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text3);
    margin-right: 4px;
}
</style>
